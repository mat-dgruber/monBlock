/**
 * @file entry.ts
 * @description Ponto de entrada do `monblockd` como root sob `launchd` (ADR-0007, spec §4.1).
 *
 * Sobe store/enforcer/relógio/daemon com os caminhos do sistema, o socket IPC, a página de
 * bloqueio e o watchdog de 60 s. Em desenvolvimento roda sem root com
 * `MONBLOCK_DEV_ROOT_DIR=<dir curto>`: o mesmo layout, prefixado pelo diretório.
 */

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIpcServer, type IpcServer } from './ipc-server.js';
import { pipeAclHook } from './pipe-acl.js';
import { MonBlockDaemon } from './monblockd.js';
import { TrustedClock } from './trusted-clock.js';
import {
  CHROMIUM_BUNDLE_IDS,
  checkBrowserProfileInstalled,
  createPlatformEnforcer,
} from '../enforcers/platform-enforcer.js';
import { createMonBlockHttpServer, UnblockRequestError } from '../server/block-server.js';
import { TripleStateStore } from '../storage/state-store.js';
import { maskBotToken } from './telegram-client.js';

export interface DaemonLayout {
  appSupportDir: string;
  dbDir: string;
  runDir: string;
  socketPath: string;
  hostsPath: string;
  chromiumPlistPaths: string[];
  firefoxPlistPath: string;
}

/**
 * Layout de diretórios e arquivos por SO (ADR-0007 / ADR-0013). `rootDir` só em desenvolvimento/CI.
 * No Windows sem `rootDir`, os caminhos vêm de %ProgramData% e %SystemRoot% (W15): `path.join("/", …)`
 * gerava `\ProgramData\…`, relativo ao drive corrente. darwin/linux usam `path.posix` explícito.
 */
export function resolveLayout(
  rootDir?: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): DaemonLayout {
  if (platform === 'win32') {
    const w = path.win32;
    const dataDir = rootDir
      ? w.join(rootDir, 'ProgramData', 'monBlock')
      : w.join(env.ProgramData ?? 'C:\\ProgramData', 'monBlock');
    const systemRoot = rootDir ? w.join(rootDir, 'Windows') : (env.SystemRoot ?? 'C:\\Windows');
    // Só em dev/CI (com rootDir): outro nome de pipe, para não colidir com o serviço instalado na máquina.
    const devPipe = env.MONBLOCK_DEV_PIPE_NAME;
    const pipeName = rootDir && devPipe && /^[A-Za-z0-9._-]{1,64}$/.test(devPipe) ? devPipe : 'monblockd';
    return {
      appSupportDir: dataDir,
      dbDir: w.join(dataDir, 'db'),
      runDir: w.join(dataDir, 'run'),
      socketPath: `\\\\.\\pipe\\${pipeName}`,
      hostsPath: w.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts'),
      chromiumPlistPaths: [],
      firefoxPlistPath: '',
    };
  }

  const r = (p: string) => path.posix.join(rootDir ?? '/', p);
  if (platform === 'linux') {
    const runDir = r('run/monblock');
    return {
      appSupportDir: r('etc/monblock'),
      dbDir: r('var/lib/monblock'),
      runDir,
      socketPath: path.posix.join(runDir, 'monblockd.sock'),
      hostsPath: r('etc/hosts'),
      chromiumPlistPaths: [
        r('etc/opt/chrome/policies/managed/monblock.json'),
        r('etc/chromium/policies/managed/monblock.json'),
        r('etc/brave/policies/managed/monblock.json'),
        r('etc/opt/edge/policies/managed/monblock.json'),
        r('etc/vivaldi/policies/managed/monblock.json'),
      ],
      firefoxPlistPath: r('etc/firefox/policies/policies.json'),
    };
  }

  const runDir = r('var/run/monblock');
  return {
    appSupportDir: r('Library/Application Support/monBlock'),
    dbDir: r('var/db/monblock'),
    runDir,
    socketPath: path.posix.join(runDir, 'monblockd.sock'),
    hostsPath: r('etc/hosts'),
    chromiumPlistPaths: CHROMIUM_BUNDLE_IDS.map((id) => r(`Library/Managed Preferences/${id}.plist`)),
    firefoxPlistPath: r('Library/Preferences/org.mozilla.firefox.plist'),
  };
}

type ExecFn = (file: string, args: string[], options: { encoding: 'utf8'; timeout?: number; windowsHide?: boolean }) => string;

/**
 * O processo pode mexer no sistema? POSIX: uid 0. Windows: SID de integridade System (S-1-16-16384,
 * o serviço) ou High (S-1-16-12288, admin elevado), lido do `whoami /groups` por caminho absoluto (W1).
 * Qualquer erro → `false` (fail-closed).
 */
export function isPrivileged(
  platform: NodeJS.Platform = process.platform,
  execFn: ExecFn = execFileSync as unknown as ExecFn,
  env: NodeJS.ProcessEnv = process.env,
  getuid: (() => number) | undefined = process.getuid
): boolean {
  if (platform !== 'win32') return getuid?.() === 0;
  try {
    const whoami = path.win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe');
    const out = execFn(whoami, ['/groups'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return /S-1-16-(16384|12288)\b/.test(out);
  } catch {
    return false;
  }
}

/** O `profiles` só existe no macOS; em outro SO acusaria "perfil ausente" o tempo todo. */
export function shouldCheckBrowserProfile(platform: NodeJS.Platform, privileged: boolean): boolean {
  return platform === 'darwin' && privileged;
}

/** Users, Everyone e Authenticated Users: nenhum pode ter ACE no DATA_DIR (cofre e estado). */
const FORBIDDEN_DATA_DIR_SIDS = ['S-1-5-32-545', 'S-1-1-0', 'S-1-5-11'];

/**
 * W20: o `umask` não vale no Windows, então a ACL do DATA_DIR é conferida no boot. Lê por SID
 * (a saída do `icacls` é localizada), corrige com `icacls` e relê. `failed` = não abrir o cofre.
 */
export function ensureDataDirAcl(dir: string, execFn: ExecFn = execFileSync as unknown as ExecFn): 'ok' | 'fixed' | 'failed' {
  const readSids = (): string[] => {
    const literal = dir.replace(/'/g, "''");
    // .NET direto e não `Get-Acl`: o módulo Microsoft.PowerShell.Security não carrega quando o
    // powershell.exe herda o PSModulePath do PowerShell 7 (visto na validação da F2).
    const script =
      `[IO.DirectoryInfo]::new('${literal}').GetAccessControl().GetAccessRules($true, $true, ` +
      `[Security.Principal.SecurityIdentifier]) | ForEach-Object { $_.IdentityReference.Value }`;
    const out = execFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  };
  const insecure = (sids: string[]) => sids.some((s) => FORBIDDEN_DATA_DIR_SIDS.includes(s));
  try {
    if (!insecure(readSids())) return 'ok';
    execFn(
      'icacls',
      [dir, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)(F)', '*S-1-5-32-544:(OI)(CI)(F)', '/remove:g', ...FORBIDDEN_DATA_DIR_SIDS.map((s) => `*${s}`)],
      { encoding: 'utf8', timeout: 10_000, windowsHide: true }
    );
    return insecure(readSids()) ? 'failed' : 'fixed';
  } catch {
    return 'failed';
  }
}

/** Cria/corrige dono e modo; recusa link simbólico (alguém tentando redirecionar a escrita do root). */
function ensureDir(dir: string, mode: number, isRoot: boolean, gid = 0): void {
  fs.mkdirSync(dir, { recursive: true, mode });
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Diretório do daemon é link simbólico: ${dir}`);
  if (isRoot && process.platform !== 'win32') fs.chownSync(dir, 0, gid);
  if (process.platform !== 'win32') fs.chmodSync(dir, mode);
}

/** GID do grupo `monblock` (criado pelo postinstall/postinst). Ausente → socket fica só para root (Fail-Closed). */
export function lookupMonblockGid(
  platform: NodeJS.Platform = process.platform,
  execFn: (file: string, args: string[], options: { encoding: 'utf8' }) => string = execFileSync
): number | undefined {
  if (platform === 'darwin') {
    try {
      const out = execFn('/usr/bin/dscl', ['.', '-read', '/Groups/monblock', 'PrimaryGroupID'], { encoding: 'utf8' });
      const gid = Number(out.match(/PrimaryGroupID:\s*(\d+)/)?.[1]);
      return Number.isInteger(gid) ? gid : undefined;
    } catch {
      return undefined;
    }
  }
  if (platform === 'linux') {
    try {
      const out = execFn('getent', ['group', 'monblock'], { encoding: 'utf8' });
      const parts = out.trim().split(':');
      const gid = Number(parts[2]);
      return Number.isInteger(gid) ? gid : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Chave dos cofres: 32 bytes aleatórios, `root 0600`. Nunca sai do daemon (spec §7). */
function loadOrCreateRootVaultKey(keyPath: string): string {
  try {
    return fs.readFileSync(keyPath, 'utf8').trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
  return key;
}

function loadConfig(configPath: string): { telegramBotToken?: string } {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { telegramBotToken?: unknown };
    return typeof cfg.telegramBotToken === 'string' ? { telegramBotToken: cfg.telegramBotToken } : {};
  } catch {
    return {};
  }
}

/** Instalado pelo `.pkg` ao lado do binário (packaging/macos). */
export const HELPER_DIR = '/Library/PrivilegedHelperTools/com.ccat.monblockd';

export interface StartDaemonOptions {
  rootDir?: string;
  isRoot: boolean;
  tickMs?: number;
  blockServerPort?: number | null;
  /** Pasta com `blocked-page.html`/`tokens.css`; no SEA fica em `HELPER_DIR/design`. */
  designDir?: string;
  /** Pasta com `pipe-acl.ps1` (Windows, W4): `INSTALL_DIR` no SEA, `packaging/windows` em dev. */
  helpersDir?: string;
  onUninstalled?: () => void;
}

export interface RunningDaemon {
  daemon: MonBlockDaemon;
  layout: DaemonLayout;
  close(): Promise<void>;
}

export async function startDaemon(options: StartDaemonOptions): Promise<RunningDaemon> {
  const { isRoot } = options;
  const layout = resolveLayout(options.rootDir);

  ensureDir(layout.appSupportDir, 0o700, isRoot);
  ensureDir(layout.dbDir, 0o700, isRoot);
  const gid = isRoot ? lookupMonblockGid() : undefined;
  // Grupo POSIX: no Windows o acesso ao pipe vem da DACL (W4), então não há o que avisar.
  if (isRoot && gid === undefined && process.platform !== 'win32') {
    console.error('[monblockd] grupo monblock ausente: socket acessível só ao root até reinstalar.');
  }
  ensureDir(layout.runDir, gid === undefined && isRoot ? 0o700 : 0o750, isRoot, gid ?? 0);
  fs.mkdirSync(path.dirname(layout.hostsPath), { recursive: true });
  // W20: sem ACL segura o cofre não é lido (fail-closed); o WinSW reinicia e o log registra.
  if (isRoot && process.platform === 'win32') {
    const acl = ensureDataDirAcl(layout.appSupportDir);
    if (acl === 'failed') throw new Error(`DATA_DIR com ACL insegura e não corrigível: ${layout.appSupportDir}`);
    if (acl === 'fixed') console.error('[monblockd] ACL do DATA_DIR estava aberta e foi restringida.');
  }

  const config = loadConfig(path.join(layout.appSupportDir, 'config.json'));
  if (config.telegramBotToken) process.env.MONBLOCK_TELEGRAM_BOT_TOKEN = config.telegramBotToken;

  // ponytail: cofre 2 é arquivo em outro diretório root, não o System Keychain — `security`
  // só aceita o segredo no argv (visível no `ps`) ou trunca em ~4 KB via `-i` (ver relatório de spikes).
  const store = new TripleStateStore({
    primaryPath: path.join(layout.appSupportDir, 'state.primary'),
    keychainPath: path.join(layout.dbDir, 'state.mirror'),
    sealPath: path.join(layout.dbDir, 'partner.seal'),
    tombstonePath: path.join(layout.dbDir, 'tombstone'),
    integrityKey: loadOrCreateRootVaultKey(path.join(layout.appSupportDir, 'vault.key')),
  });
  const enforcer = createPlatformEnforcer(process.platform, {
    hostsPath: layout.hostsPath,
    chromiumPlistPaths: layout.chromiumPlistPaths,
    firefoxPlistPath: layout.firefoxPlistPath,
    flushDns: isRoot,
    // Modo dev no Windows: nada de icacls/reg no sistema real; só o hosts sob o rootDir.
    ...(process.platform === 'win32' && !isRoot ? { commandExecutor: () => {}, registryReader: () => null } : {}),
  });
  // Criado depois do daemon; o watchdog só lê o status da DACL (W4).
  let ipc: IpcServer | undefined;
  const daemon = new MonBlockDaemon({
    store,
    enforcer,
    clock: new TrustedClock(),
    onUninstalled: options.onUninstalled,
    extraDrift: () => (ipc?.aclStatus() === 'failed' ? ['ipc:dacl'] : []),
    // Sem root o `profiles` não vê perfis de sistema e acusaria "ausente" por engano.
    checkBrowserProfile: shouldCheckBrowserProfile(process.platform, isRoot) ? () => checkBrowserProfileInstalled() : undefined,
  });

  const tick = async (): Promise<void> => {
    try {
      await daemon.tick();
    } catch (err) {
      console.error('[monblockd] falha no watchdog:', (err as Error).message);
    }
  };
  await tick(); // regras aplicadas antes de aceitar conexões

  try {
    ipc = await createIpcServer({
      socketPath: layout.socketPath,
      handle: async (cmd) => {
        const started = Date.now();
        try {
          return await daemon.handleCommand(cmd);
        } finally {
          // O cliente desiste em 5 s: registrar o que passa de 1 s ajuda a achar o gargalo (visto na F3).
          const ms = Date.now() - started;
          if (ms > 1000) console.error(`[monblockd] comando ${cmd.type} levou ${ms} ms`);
        }
      },
      secureListen:
        process.platform === 'win32' && options.helpersDir
          ? pipeAclHook(path.join(options.helpersDir, 'pipe-acl.ps1'))
          : undefined,
    });
  } catch (err) {
    throw new Error(`Falha ao abrir o socket ${layout.socketPath}: ${(err as Error).message}`);
  }
  if (isRoot && process.platform !== 'win32') fs.chownSync(layout.socketPath, 0, gid ?? 0);

  const blockServer =
    options.blockServerPort === null
      ? null
      : createMonBlockHttpServer({
          designDir: options.designDir,
          // A página fala com o daemon no mesmo processo: pedido e consulta passam pela fila serializada de comandos.
          onUnblockRequest: async (p) => {
            const res = await daemon.handleCommand({
              type: 'CREATE_UNBLOCK_REQUEST',
              domain: p.domain ?? '',
              reason: p.reason ?? '',
              durationMinutes: p.permanent ? 0 : p.durationMinutes,
              ruleLabel: p.ruleLabel,
              title: p.title,
            });
            if (res.status === 200 && 'request' in res) return { ...res.request };
            const status = [400, 403, 429, 503].includes(res.status) ? (res.status as 400 | 403 | 429 | 503) : 502;
            throw new UnblockRequestError(status, 'title' in res ? res.title : 'Pedido não enviado', 'detail' in res ? res.detail : 'Nada foi enviado.');
          },
          getUnblockRequest: async (requestId) => {
            const res = await daemon.handleCommand({ type: 'GET_UNBLOCK_REQUEST', requestId });
            return res.status === 200 && 'request' in res ? { ...res.request } : null;
          },
        });
  blockServer?.on('error', (err) => {
    console.error('[monblockd] página de bloqueio indisponível:', (err as NodeJS.ErrnoException).code ?? err);
  });
  blockServer?.listen(options.blockServerPort ?? 49152, '127.0.0.1');

  const timer = setInterval(() => void tick(), options.tickMs ?? 60_000);

  // Broker do Telegram (único leitor de getUpdates): só trabalha com bot e Ajudante pareado; sem isso fica ocioso.
  let polling = true;
  void (async () => {
    while (polling) {
      let wait = 0;
      try {
        const outcome = await daemon.pollTelegramOnce(25);
        wait = outcome === 'ok' ? 0 : outcome === 'idle' ? 5_000 : 15_000;
      } catch (err) {
        console.error('[monblockd] falha no ciclo do Telegram:', maskBotToken((err as Error).message));
        wait = 15_000;
      }
      if (wait > 0 && polling) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  })();

  return {
    daemon,
    layout,
    close: async () => {
      clearInterval(timer);
      polling = false;
      await daemon.shutdown();
      await ipc.close();
      await new Promise<void>((resolve) => (blockServer ? blockServer.close(() => resolve()) : resolve()));
    },
  };
}

export async function main(): Promise<void> {
  const isRoot = isPrivileged();
  const rootDir = process.env.MONBLOCK_DEV_ROOT_DIR;
  if (!isRoot && !rootDir) {
    console.error(
      '[monblockd] precisa rodar privilegiado (launchd/systemd como root, serviço do Windows como SYSTEM) ou com MONBLOCK_DEV_ROOT_DIR em desenvolvimento.'
    );
    process.exit(1);
  }
  process.umask(0o077);
  const { isSea } = await import('node:sea');
  const running = await startDaemon({
    rootDir,
    isRoot,
    designDir: isSea() ? path.join(path.dirname(process.execPath), 'design') : undefined,
    helpersDir: isSea()
      ? path.dirname(process.execPath)
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packaging/windows'),
    // Desacoplado e fora do grupo de processos: o `bootout` do job não pode matar o desinstalador.
    onUninstalled: () => {
      if (!isRoot || rootDir) return console.error('[monblockd] desinstalação autorizada (modo dev: nada removido).');
      // Windows: a remoção por tarefa agendada é o W12 (F4). Até lá, só registra; o /bin/sh daria ENOENT.
      if (process.platform === 'win32') {
        return console.error('[monblockd] desinstalação autorizada: remoção manual pendente (W12).');
      }
      // 2 s de folga para a resposta 200 sair pelo socket antes do `bootout` derrubar o daemon.
      spawn('/bin/sh', ['-c', 'sleep 2; exec /bin/sh "$0"', path.join(HELPER_DIR, 'uninstall.sh')], {
        detached: true,
        stdio: 'ignore',
      })
        .on('error', (err) => console.error('[monblockd] falha ao iniciar o desinstalador:', err.message))
        .unref();
    },
  });
  const stop = () => {
    void running.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[monblockd] falha ao iniciar:', (err as Error).message);
    process.exit(1);
  });
}
