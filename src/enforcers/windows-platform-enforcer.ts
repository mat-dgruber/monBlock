/**
 * @file windows-platform-enforcer.ts
 * @description Implementação Windows do contrato PlatformEnforcer (ADR-0013, ADR-0015, ADR-0016).
 *
 * Imposição de regras web via:
 * 1. Camada 1: %SystemRoot%\System32\drivers\etc\hosts com DACLs NTFS restritas (icacls)
 *    e descarga de cache DNS via `ipconfig /flushdns`.
 * 2. Camada 2: políticas multi-navegador em `HKLM\SOFTWARE\Policies` (Chrome, Edge, Brave,
 *    Chromium, Vivaldi, Firefox), gravadas por manifesto `.reg` + `reg import`.
 *
 * O `.reg` exige `HKEY_LOCAL_MACHINE\` por extenso: com `HKLM\` o `reg import` sai com código 0
 * e não grava nada (spike S0, P1). Cada lista é apagada (`[-chave]`) antes de recriada, senão
 * valores antigos (ex.: uma allowlist maior) continuam valendo (P3). O drift lê o Registro de
 * verdade (`reg query`), porque o código de saída do import não é confiável (W9/W10).
 */

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { POLICY_DOMAIN_LIMIT } from '../domain/categories.js';
import type { ProtectionRuleset } from '../storage/state-store.js';
import { applyAtomicHostsBlock, buildManagedHostsContent, rollbackHostsFromBackup } from './hosts-enforcer.js';
import {
  resolveEffectiveBlockedDomains,
  writeFileAtomically,
  writeIfChanged,
  type PlatformEnforcer,
} from './platform-enforcer.js';

const execFileAsync = promisify(execFile);

// MARK: - Chaves gerenciadas

/** Chaves de políticas Chromium no formato do `reg.exe` (CLI aceita `HKLM`). */
export const WINDOWS_CHROMIUM_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\Policies\\Google\\Chrome',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge',
  'HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave',
  'HKLM\\SOFTWARE\\Policies\\Chromium',
  'HKLM\\SOFTWARE\\Policies\\Vivaldi',
] as const;

/** Chave de políticas do Firefox no formato do `reg.exe`. */
export const WINDOWS_FIREFOX_REGISTRY_KEY = 'HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox';

/** No arquivo `.reg` a raiz precisa vir por extenso (S0, P1). */
const toRegFileKey = (cliKey: string): string => cliKey.replace(/^HKLM\\/, 'HKEY_LOCAL_MACHINE\\');
const toCliKey = (fileKey: string): string => fileKey.replace(/^HKEY_LOCAL_MACHINE\\/, 'HKLM\\');

export type RegValue = { type: 'REG_SZ'; data: string } | { type: 'REG_DWORD'; data: number };

/**
 * Uma chave gerenciada: valores que o monBlock grava. `exact` = a chave é toda nossa (listas):
 * qualquer valor extra é drift. Sem `exact` (raiz do navegador) valores alheios são ignorados.
 * `recreate` = apagar a chave (`[-…]`) antes de gravar; `deleteKey` é a chave apagada.
 */
export interface ManagedRegistryKey {
  key: string;
  values: Map<string, RegValue>;
  exact: boolean;
  deleteKey?: string;
}

const dword = (on: boolean): RegValue => ({ type: 'REG_DWORD', data: on ? 1 : 0 });
const list = (items: string[], fmt: (d: string) => string = (d) => d): Map<string, RegValue> =>
  new Map(items.map((d, i) => [String(i + 1), { type: 'REG_SZ', data: fmt(d) }]));

/** Modelo único do que deve estar no Registro: gera o `.reg` e é a referência do drift. */
export function buildManagedRegistry(params: {
  blockedDomains: string[];
  allowlistDomains: string[];
  lockIncognito: boolean;
}): ManagedRegistryKey[] {
  const keys: ManagedRegistryKey[] = [];
  for (const root of WINDOWS_CHROMIUM_REGISTRY_KEYS) {
    // O Edge não reconhece IncognitoModeAvailability (edge://policy mostra "Erro"); o dele é InPrivateModeAvailability.
    const incognitoPolicy = root.endsWith('\\Microsoft\\Edge') ? 'InPrivateModeAvailability' : 'IncognitoModeAvailability';
    keys.push({
      key: root,
      exact: false,
      values: new Map<string, RegValue>([
        ['DnsOverHttpsMode', { type: 'REG_SZ', data: 'off' }],
        [incognitoPolicy, dword(params.lockIncognito)],
      ]),
    });
    for (const name of ['URLBlocklist', 'URLAllowlist'] as const) {
      const items = name === 'URLBlocklist' ? params.blockedDomains : params.allowlistDomains;
      keys.push({ key: `${root}\\${name}`, exact: true, values: list(items), deleteKey: `${root}\\${name}` });
    }
  }
  const ff = WINDOWS_FIREFOX_REGISTRY_KEY;
  const pattern = (d: string) => `*://*.${d}/*`;
  keys.push(
    { key: ff, exact: false, values: new Map([['DisablePrivateBrowsing', dword(params.lockIncognito)]]) },
    {
      key: `${ff}\\DNSOverHTTPS`,
      exact: false,
      values: new Map([
        ['Enabled', dword(false)],
        ['Locked', dword(true)],
      ]),
    },
    // Block e Exceptions saem de uma só deleção do WebsiteFilter.
    { key: `${ff}\\WebsiteFilter\\Block`, exact: true, values: list(params.blockedDomains, pattern), deleteKey: `${ff}\\WebsiteFilter` },
    { key: `${ff}\\WebsiteFilter\\Exceptions`, exact: true, values: list(params.allowlistDomains, pattern) }
  );
  return keys;
}

const escapeRegString = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Manifesto `.reg` (Windows Registry Editor Version 5.00), CRLF, sem BOM (UTF-8 com BOM falha, S0/P2).
 */
export function generateWindowsRegistryManifest(params: {
  blockedDomains: string[];
  allowlistDomains: string[];
  lockIncognito: boolean;
}): string {
  const lines: string[] = ['Windows Registry Editor Version 5.00', ''];
  for (const k of buildManagedRegistry(params)) {
    if (k.deleteKey) lines.push(`[-${toRegFileKey(k.deleteKey)}]`, '');
    // Lista vazia: só a deleção; recriar a chave vazia não muda nada e confunde o drift.
    if (k.exact && k.values.size === 0) continue;
    lines.push(`[${toRegFileKey(k.key)}]`);
    for (const [name, v] of k.values) {
      const data = v.type === 'REG_DWORD' ? `dword:${v.data.toString(16).padStart(8, '0')}` : `"${escapeRegString(v.data)}"`;
      lines.push(`"${escapeRegString(name)}"=${data}`);
    }
    lines.push('');
  }
  return lines.join('\r\n');
}

/**
 * Lê a saída de `reg query <chave> /s`. Tipos e nomes de chave não são localizados (conferido em pt-BR);
 * o separador entre colunas são 4 espaços.
 */
export function parseRegQueryOutput(output: string): Map<string, Map<string, RegValue>> {
  const result = new Map<string, Map<string, RegValue>>();
  let current: Map<string, RegValue> | undefined;
  for (const raw of output.split(/\r?\n/)) {
    if (raw.startsWith('HKEY_')) {
      current = new Map();
      result.set(toCliKey(raw.trim()), current);
      continue;
    }
    const m = /^ {4}(.+?) {4}(REG_\w+)(?: {4}(.*))?$/.exec(raw);
    if (!m || !current) continue;
    const [, name, type, data = ''] = m;
    if (type === 'REG_DWORD') current.set(name, { type, data: Number.parseInt(data, 16) });
    else if (type === 'REG_SZ') current.set(name, { type, data });
  }
  return result;
}

// MARK: - Execução de comandos

export interface WindowsPlatformEnforcerOptions {
  hostsPath?: string;
  regFilePath?: string;
  flushDns?: boolean;
  commandExecutor?: (cmd: string, args: string[]) => Promise<void> | void;
  /**
   * Devolve a saída de `reg query <chave> /s`; `null` = Registro indisponível (fora do Windows),
   * e a checagem é pulada. Erro/timeout = drift (fail-closed).
   */
  registryReader?: (cliKey: string) => string | null;
}

/** No Windows, falha de comando **lança** (W10); fora dele não faz nada (dev/CI). */
export function defaultWindowsCommandExecutor(
  platform: NodeJS.Platform = process.platform
): (cmd: string, args: string[]) => Promise<void> {
  return async (cmd: string, args: string[]): Promise<void> => {
    if (platform !== 'win32') return;
    await execFileAsync(cmd, args, { timeout: 30_000, windowsHide: true });
  };
}

export function defaultWindowsRegistryReader(
  platform: NodeJS.Platform = process.platform
): (cliKey: string) => string | null {
  if (platform !== 'win32') return () => null;
  return (cliKey) =>
    execFileSync('reg', ['query', cliKey, '/s'], { encoding: 'utf8', timeout: 5_000, windowsHide: true });
}

const sameValue = (a: RegValue | undefined, b: RegValue): boolean => a?.type === b.type && a.data === b.data;

// MARK: - Enforcer

export class WindowsPlatformEnforcer implements PlatformEnforcer {
  private readonly hostsPath: string;
  private readonly regFilePath?: string;
  private readonly flushDns: boolean;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<void> | void;
  private readonly registryReader: (cliKey: string) => string | null;
  /** Passos do último `applyWebRules` que falharam; entram no drift (W10). Fora do contrato comum. */
  private lastApplyFailures: string[] = [];

  constructor(options: WindowsPlatformEnforcerOptions = {}) {
    const defaultHosts = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32\\drivers\\etc\\hosts');
    this.hostsPath = options.hostsPath ?? defaultHosts;
    this.regFilePath = options.regFilePath;
    this.flushDns = options.flushDns ?? this.hostsPath.toLowerCase().includes('drivers\\etc\\hosts');
    this.commandExecutor = options.commandExecutor ?? defaultWindowsCommandExecutor();
    this.registryReader = options.registryReader ?? defaultWindowsRegistryReader();
  }

  private get regTarget(): string {
    return this.regFilePath ?? `${this.hostsPath}.monblock.reg`;
  }

  private policyParams(rules: ProtectionRuleset, activeGrants: Array<{ target: string; expiresAtMs: number }>) {
    const { effectiveBlockedDomains, effectiveAllowlistDomains } = resolveEffectiveBlockedDomains(rules, activeGrants);
    return {
      blockedDomains: effectiveBlockedDomains,
      policy: {
        blockedDomains: effectiveBlockedDomains.slice(0, POLICY_DOMAIN_LIMIT),
        allowlistDomains: effectiveAllowlistDomains,
        lockIncognito: rules.lockIncognito,
      },
    };
  }

  public expectedArtifacts(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): { blockedDomains: string[]; registryExport: string } {
    const { blockedDomains, policy } = this.policyParams(rules, activeGrants);
    return { blockedDomains, registryExport: generateWindowsRegistryManifest(policy) };
  }

  /** Roda um passo sem interromper os seguintes; a falha vira drift no próximo `verifyApplied`. */
  private async step(failures: string[], id: string, fn: () => unknown): Promise<void> {
    const started = Date.now();
    try {
      await fn();
    } catch (err) {
      failures.push(id);
      console.error(`[monblockd] passo ${id} falhou:`, (err as Error).message);
    } finally {
      const ms = Date.now() - started;
      if (ms > 500) console.error(`[monblockd] passo ${id} levou ${ms} ms`);
    }
  }

  public async applyWebRules(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): Promise<{ hostsPath: string; registryExport: string; chromiumPlist: string; firefoxPlist: string }> {
    const expected = this.expectedArtifacts(rules, activeGrants);
    const failures: string[] = [];

    const current = fs.existsSync(this.hostsPath) ? fs.readFileSync(this.hostsPath, 'utf8') : '';
    if (buildManagedHostsContent(current, expected.blockedDomains).content !== current) {
      await this.step(failures, 'hosts', () => applyAtomicHostsBlock(this.hostsPath, expected.blockedDomains));
      // SYSTEM e Administradores com controle total; Usuários só leitura.
      await this.step(failures, 'hosts:acl', () =>
        this.commandExecutor('icacls', [this.hostsPath, '/grant:r', '*S-1-5-18:(F)', '*S-1-5-32-544:(F)', '*S-1-5-32-545:(R)'])
      );
      // Só quando o hosts mudou, e sem esperar: com o hosts grande o cliente DNS leva ~25 s para recarregar e o
      // `ipconfig /flushdns` fica preso esse tempo todo, travando a fila de comandos do daemon (visto como SYSTEM).
      if (this.flushDns) {
        const started = Date.now();
        void Promise.resolve()
          .then(() => this.commandExecutor('ipconfig', ['/flushdns']))
          .then(
            () => {
              const ms = Date.now() - started;
              if (ms > 500) console.error(`[monblockd] passo dns:flush levou ${ms} ms (em segundo plano)`);
            },
            (err: Error) => console.error('[monblockd] passo dns:flush falhou (em segundo plano):', err.message)
          );
      }
    }

    await this.step(failures, 'registry:import', async () => {
      writeIfChanged(this.regTarget, expected.registryExport);
      await this.commandExecutor('reg', ['import', this.regTarget]);
    });
    this.lastApplyFailures = failures;

    return {
      hostsPath: this.hostsPath,
      registryExport: expected.registryExport,
      chromiumPlist: expected.registryExport,
      firefoxPlist: expected.registryExport,
    };
  }

  /** Raízes consultadas (uma `reg query /s` por navegador) e as chaves que dependem de cada uma. */
  private registryDrift(policy: Parameters<typeof buildManagedRegistry>[0]): string[] {
    const managed = buildManagedRegistry(policy);
    const drift: string[] = [];
    for (const root of [...WINDOWS_CHROMIUM_REGISTRY_KEYS, WINDOWS_FIREFOX_REGISTRY_KEY]) {
      let parsed: Map<string, Map<string, RegValue>>;
      try {
        const out = this.registryReader(root);
        if (out === null) return []; // Registro indisponível (fora do Windows)
        parsed = parseRegQueryOutput(out);
      } catch {
        drift.push(`registry:${root}`);
        continue;
      }
      const ok = managed
        .filter((k) => k.key === root || k.key.startsWith(`${root}\\`))
        .every((k) => {
          const actual = parsed.get(k.key) ?? new Map<string, RegValue>();
          if (k.exact && actual.size !== k.values.size) return false;
          for (const [name, v] of k.values) if (!sameValue(actual.get(name), v)) return false;
          return true;
        });
      if (!ok) drift.push(`registry:${root}`);
    }
    return drift;
  }

  public verifyApplied(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): string[] {
    const { blockedDomains, policy } = this.policyParams(rules, activeGrants);
    const drift = [...this.lastApplyFailures];
    const hosts = fs.existsSync(this.hostsPath) ? fs.readFileSync(this.hostsPath, 'utf8') : '';
    if (buildManagedHostsContent(hosts, blockedDomains).content !== hosts) drift.push(this.hostsPath);
    for (const d of this.registryDrift(policy)) if (!drift.includes(d)) drift.push(d);
    return drift;
  }

  public async protectCriticalPaths(paths: string[]): Promise<string[]> {
    const protectedPaths: string[] = [];
    for (const target of paths) {
      // Remove herança e restringe permissões a SYSTEM e Administradores
      await this.commandExecutor('icacls', [target, '/inheritance:r', '/grant:r', '*S-1-5-18:(F)', '*S-1-5-32-544:(F)']);
      protectedPaths.push(target);
    }
    return protectedPaths;
  }

  public async restoreSystemCleanState(): Promise<void> {
    const restored = rollbackHostsFromBackup(this.hostsPath);
    if (!restored && fs.existsSync(this.hostsPath)) {
      const current = fs.readFileSync(this.hostsPath, 'utf8');
      const cleaned = current.replace(/# >>> MONBLOCK START >>>[\s\S]*?# <<< MONBLOCK END <<<\r?\n?/g, '').trimEnd();
      writeFileAtomically(this.hostsPath, cleaned ? `${cleaned}\n` : '');
    }

    // Melhor esforço: uma chave ausente não impede a limpeza das outras (o W12 completa na F4).
    const ignore = async (args: string[]) => {
      try {
        await this.commandExecutor('reg', args);
      } catch {
        // chave já ausente
      }
    };
    for (const rootKey of WINDOWS_CHROMIUM_REGISTRY_KEYS) {
      await ignore(['delete', `${rootKey}\\URLBlocklist`, '/f']);
      await ignore(['delete', `${rootKey}\\URLAllowlist`, '/f']);
    }
    await ignore(['delete', `${WINDOWS_FIREFOX_REGISTRY_KEY}\\WebsiteFilter`, '/f']);

    if (fs.existsSync(this.regTarget)) fs.rmSync(this.regTarget, { force: true });
  }
}
