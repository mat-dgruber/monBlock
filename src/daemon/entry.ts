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
import { MonBlockDaemon } from './monblockd.js';
import { TrustedClock } from './trusted-clock.js';
import { CHROMIUM_BUNDLE_IDS, MacOSPlatformEnforcer, checkBrowserProfileInstalled } from '../enforcers/platform-enforcer.js';
import { createMonBlockHttpServer } from '../server/block-server.js';
import { TripleStateStore } from '../storage/state-store.js';

export interface DaemonLayout {
  appSupportDir: string;
  dbDir: string;
  runDir: string;
  socketPath: string;
  hostsPath: string;
  chromiumPlistPaths: string[];
  firefoxPlistPath: string;
}

/** Layout da spec §4.1. `rootDir` só em desenvolvimento/CI. */
export function resolveLayout(rootDir = '/'): DaemonLayout {
  const r = (p: string) => path.join(rootDir, p);
  const runDir = r('var/run/monblock');
  return {
    appSupportDir: r('Library/Application Support/monBlock'),
    dbDir: r('var/db/monblock'),
    runDir,
    socketPath: path.join(runDir, 'monblockd.sock'),
    hostsPath: r('etc/hosts'),
    chromiumPlistPaths: CHROMIUM_BUNDLE_IDS.map((id) => r(`Library/Managed Preferences/${id}.plist`)),
    firefoxPlistPath: r('Library/Preferences/org.mozilla.firefox.plist'),
  };
}

/** Cria/corrige dono e modo; recusa link simbólico (alguém tentando redirecionar a escrita do root). */
function ensureDir(dir: string, mode: number, isRoot: boolean, gid = 0): void {
  fs.mkdirSync(dir, { recursive: true, mode });
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Diretório do daemon é link simbólico: ${dir}`);
  if (isRoot) fs.chownSync(dir, 0, gid);
  fs.chmodSync(dir, mode);
}

/** GID do grupo `monblock` (criado pelo postinstall). Ausente → socket fica só para root (Fail-Closed). */
function lookupMonblockGid(): number | undefined {
  try {
    const out = execFileSync('/usr/bin/dscl', ['.', '-read', '/Groups/monblock', 'PrimaryGroupID'], { encoding: 'utf8' });
    const gid = Number(out.match(/PrimaryGroupID:\s*(\d+)/)?.[1]);
    return Number.isInteger(gid) ? gid : undefined;
  } catch {
    return undefined;
  }
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
  if (isRoot && gid === undefined) {
    console.error('[monblockd] grupo monblock ausente: socket acessível só ao root até reinstalar.');
  }
  ensureDir(layout.runDir, gid === undefined && isRoot ? 0o700 : 0o750, isRoot, gid ?? 0);
  fs.mkdirSync(path.dirname(layout.hostsPath), { recursive: true });

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
  const enforcer = new MacOSPlatformEnforcer({
    hostsPath: layout.hostsPath,
    chromiumPlistPaths: layout.chromiumPlistPaths,
    firefoxPlistPath: layout.firefoxPlistPath,
    flushDns: isRoot,
  });
  const daemon = new MonBlockDaemon({
    store,
    enforcer,
    clock: new TrustedClock(),
    onUninstalled: options.onUninstalled,
    checkBrowserProfile: () => checkBrowserProfileInstalled(),
  });

  const tick = async (): Promise<void> => {
    try {
      await daemon.tick();
    } catch (err) {
      console.error('[monblockd] falha no watchdog:', (err as Error).message);
    }
  };
  await tick(); // regras aplicadas antes de aceitar conexões

  let ipc: IpcServer;
  try {
    ipc = await createIpcServer({ socketPath: layout.socketPath, handle: (cmd) => daemon.handleCommand(cmd) });
  } catch (err) {
    throw new Error(`Falha ao abrir o socket ${layout.socketPath}: ${(err as Error).message}`);
  }
  if (isRoot) fs.chownSync(layout.socketPath, 0, gid ?? 0);

  const blockServer =
    options.blockServerPort === null ? null : createMonBlockHttpServer({ designDir: options.designDir });
  blockServer?.on('error', (err) => {
    console.error('[monblockd] página de bloqueio indisponível:', (err as NodeJS.ErrnoException).code ?? err);
  });
  blockServer?.listen(options.blockServerPort ?? 49152, '127.0.0.1');

  const timer = setInterval(() => void tick(), options.tickMs ?? 60_000);

  return {
    daemon,
    layout,
    close: async () => {
      clearInterval(timer);
      await daemon.shutdown();
      await ipc.close();
      await new Promise<void>((resolve) => (blockServer ? blockServer.close(() => resolve()) : resolve()));
    },
  };
}

export async function main(): Promise<void> {
  const isRoot = process.getuid?.() === 0;
  const rootDir = process.env.MONBLOCK_DEV_ROOT_DIR;
  if (!isRoot && !rootDir) {
    console.error('[monblockd] precisa rodar como root (launchd) ou com MONBLOCK_DEV_ROOT_DIR em desenvolvimento.');
    process.exit(1);
  }
  process.umask(0o077);
  const { isSea } = await import('node:sea');
  const running = await startDaemon({
    rootDir,
    isRoot,
    designDir: isSea() ? path.join(path.dirname(process.execPath), 'design') : undefined,
    // Desacoplado e fora do grupo de processos: o `bootout` do job não pode matar o desinstalador.
    onUninstalled: () => {
      if (!isRoot || rootDir) return console.error('[monblockd] desinstalação autorizada (modo dev: nada removido).');
      // 2 s de folga para a resposta 200 sair pelo socket antes do `bootout` derrubar o daemon.
      spawn('/bin/sh', ['-c', 'sleep 2; exec /bin/sh "$0"', path.join(HELPER_DIR, 'uninstall.sh')], {
        detached: true,
        stdio: 'ignore',
      }).unref();
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
