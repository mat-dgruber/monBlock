import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateChallengeToken } from '../../src/domain/partner-guard.js';
import { MacOSPlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import { TripleStateStore } from '../../src/storage/state-store.js';
import { MonBlockDaemon } from '../../src/daemon/monblockd.js';

describe('MonBlockDaemon & MacOSPlatformEnforcer (MOD-03)', () => {
  let tmpDir: string;
  let hostsPath: string;
  let chromiumPlistPath: string;
  let firefoxPoliciesPath: string;
  let executedCommands: Array<{ cmd: string; args: string[] }>;
  let store: TripleStateStore;
  let enforcer: MacOSPlatformEnforcer;
  let daemon: MonBlockDaemon;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-daemon-'));
    hostsPath = path.join(tmpDir, 'hosts');
    chromiumPlistPath = path.join(tmpDir, 'com.google.Chrome.plist');
    firefoxPoliciesPath = path.join(tmpDir, 'policies.json');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    executedCommands = [];
    store = new TripleStateStore({
      primaryPath: path.join(tmpDir, 'vault-a.json'),
      keychainPath: path.join(tmpDir, 'vault-b.json'),
      sealPath: path.join(tmpDir, 'vault-c.seal'),
      integrityKey: 'daemon-test-integrity-key',
    });

    enforcer = new MacOSPlatformEnforcer({
      hostsPath,
      chromiumPlistPath,
      firefoxPoliciesPath,
      commandExecutor: async (cmd, args) => {
        executedCommands.push({ cmd, args });
      },
    });

    daemon = new MonBlockDaemon({ store, enforcer });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET_STATE deve retornar estado sanitizado sem jamais expor passwordHash ou hmacSecret', async () => {
    // Arrange
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerStrongPassword!123',
      hmacSecret: 'super-secret-hmac-key-999',
      telegramChatId: '123456789',
    });

    // Act
    const response = await daemon.handleCommand({ type: 'GET_STATE' });

    // Assert
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('super-secret-hmac-key-999');
    expect(serialized).not.toContain('scrypt$');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('hmacSecret');
    if (response.status === 200 && 'state' in response) {
      expect(response.state.paired).toBe(true);
      expect(response.state.rules.enabledCategories).toContain('adult');
    }
  });

  it('PAIR_PARTNER deve realizar pareamento inicial gerando 5 códigos de recuperação e bloquear re-pareamento sem senha do Ajudante (403)', async () => {
    // Arrange & Act 1 — Primeiro pareamento livre
    const firstPair = await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'InitialPartnerPass!99',
      hmacSecret: 'hmac-secret-v1',
    });

    // Assert 1
    expect(firstPair.status).toBe(200);
    if (firstPair.status === 200 && 'recoveryCodes' in firstPair) {
      expect(firstPair.recoveryCodes).toHaveLength(5);
    }

    // Act 2 — Tentativa de sobrescrever Ajudante sem autorização
    const unauthorizedRepair = await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'AttackerPassword!00',
      hmacSecret: 'attacker-secret',
    });

    // Assert 2
    expect(unauthorizedRepair.status).toBe(403);
    if ('type' in unauthorizedRepair) {
      expect(unauthorizedRepair.type).toContain('problems/403');
    }
  });

  it('MUTATE_RULES deve permitir adição Append-Only sem senha e rejeitar remoção ou allowlist sem autorização com 403 Problem Details', async () => {
    // Arrange
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: 'hmac-secret-ratchet',
    });

    // Act 1 — Adição Append-Only (ativar categoria gambling + adicionar domínio e keyword)
    const addResult = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult', 'gambling'],
        blockedDomains: ['apostas-vip.com'],
        allowlistDomains: [],
        keywords: ['roleta'],
        lockIncognito: true,
      },
    });

    // Assert 1
    expect(addResult.status).toBe(200);
    const hostsContent = fs.readFileSync(hostsPath, 'utf8');
    expect(hostsContent).toContain('0.0.0.0 bet365.com');
    expect(hostsContent).toContain('0.0.0.0 apostas-vip.com');
    expect(fs.existsSync(chromiumPlistPath)).toBe(true);
    expect(fs.existsSync(firefoxPoliciesPath)).toBe(true);

    // Act 2 — Tentativa de desativar categoria adult ou adicionar allowlist sem autorização do Ajudante
    const removeAttempt = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['gambling'],
        blockedDomains: ['apostas-vip.com'],
        allowlistDomains: [],
        keywords: ['roleta'],
        lockIncognito: true,
      },
    });

    // Assert 2
    expect(removeAttempt.status).toBe(403);
    if ('detail' in removeAttempt) {
      expect(removeAttempt.detail).toMatch(/adult/i);
    }

    // Act 3 — Desativação de gambling autorizada com senha do Ajudante
    const authorizedRemove = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      partnerPassword: 'PartnerPassword#2026',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: [],
        allowlistDomains: ['educacao.org'],
        keywords: [],
        lockIncognito: true,
      },
    });

    // Assert 3
    expect(authorizedRemove.status).toBe(200);
  });

  it('VERIFY_OFFLINE_TOKEN deve aceitar token válido, criar TemporaryGrant, impedir replay (anti-replay) e REVOKE_GRANTS_ON_SLEEP deve limpar concessões', async () => {
    // Arrange
    const secret = 'offline-hmac-secret-777';
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: secret,
    });
    const challengeCode = 'MB-9001-A1';
    const token15m = generateChallengeToken(secret, challengeCode, '15m');

    // Act 1 — Consumo inédito do token
    const verifyOk = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode,
      token: token15m,
      target: 'instagram.com',
      nowMs: 1_700_000_000_000,
    });

    // Assert 1
    expect(verifyOk.status).toBe(200);
    if (verifyOk.status === 200 && 'grant' in verifyOk) {
      expect(verifyOk.grant.target).toBe('instagram.com');
      expect(verifyOk.grant.expiresAtMs).toBe(1_700_000_000_000 + 15 * 60_000);
    }

    // Act 2 — Tentativa de Replay com o mesmo token
    const replayAttempt = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode,
      token: token15m,
      target: 'instagram.com',
      nowMs: 1_700_000_010_000,
    });

    // Assert 2
    expect(replayAttempt.status).toBe(403);

    // Act 3 — Evento de sleep do SO revoga todas as concessões temporárias (RN-APP-04)
    const sleepRevoke = await daemon.handleCommand({
      type: 'REVOKE_GRANTS_ON_SLEEP',
    });
    expect(sleepRevoke.status).toBe(200);

    const stateAfterSleep = await daemon.handleCommand({ type: 'GET_STATE' });
    if (stateAfterSleep.status === 200 && 'state' in stateAfterSleep) {
      expect(stateAfterSleep.state.temporaryGrants).toEqual([]);
    }
  });

  it('VERIFY_RECOVERY_CODE deve consumir 1 código de emergência single-use e rejeitar reutilização', async () => {
    // Arrange
    const pairRes = await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: 'hmac-recovery-test',
    });
    expect(pairRes.status).toBe(200);
    const codes =
      pairRes.status === 200 && 'recoveryCodes' in pairRes ? pairRes.recoveryCodes : [];
    const firstCode = codes[0]!;

    // Act 1 — Usa o primeiro código de recuperação
    const firstUse = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: firstCode,
      nowMs: 1_700_000_000_000,
    });

    // Assert 1
    expect(firstUse.status).toBe(200);
    if (firstUse.status === 200 && 'remainingCodes' in firstUse) {
      expect(firstUse.remainingCodes).toBe(4);
    }

    // Act 2 — Tenta reutilizar o mesmo código já consumido
    const secondUse = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: firstCode,
      nowMs: 1_700_000_005_000,
    });

    // Assert 2
    expect(secondUse.status).toBe(403);
  });

  it('UNINSTALL_AUTHORIZED deve negar desinstalação sem prova criptográfica (403) e restaurar estado limpo quando autorizado por senha, token PERMANENT ou Cooldown de 72h', async () => {
    // Arrange
    const secret = 'uninstall-secret-key';
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'MasterUninstallPass!1',
      hmacSecret: secret,
    });
    await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: ['badsite.com'],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });
    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 badsite.com');

    // Act 1 — Tentativa de desinstalação sem prova válida
    const deniedUninstall = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      password: 'WrongPassword',
    });

    // Assert 1
    expect(deniedUninstall.status).toBe(403);
    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 badsite.com');

    // Act 2 — Inicia Cooldown de 72h, verifica bloqueio em 71h e aprova desinstalação após 72h
    const startMs = 1_700_000_000_000;
    const cooldownStart = await daemon.handleCommand({
      type: 'TRIGGER_EMERGENCY_COOLDOWN',
      nowMs: startMs,
    });
    expect(cooldownStart.status).toBe(200);

    const before72h = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      nowMs: startMs + 71 * 3600 * 1000,
    });
    expect(before72h.status).toBe(403);

    const after72h = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      nowMs: startMs + 72 * 3600 * 1000,
    });

    // Assert 2
    expect(after72h.status).toBe(200);
    if (after72h.status === 200 && 'uninstalled' in after72h) {
      expect(after72h.uninstalled).toBe(true);
    }
    const restoredHosts = fs.readFileSync(hostsPath, 'utf8');
    expect(restoredHosts).toBe('127.0.0.1 localhost\n');
    expect(restoredHosts).not.toContain('MONBLOCK');
  });

  it('MacOSPlatformEnforcer.protectCriticalPaths deve aplicar chmod 0600 e chflags uchg via executor injetável', async () => {
    // Arrange
    const targetFile = path.join(tmpDir, 'critical.seal');
    fs.writeFileSync(targetFile, 'seal-data', 'utf8');

    // Act
    const protectedList = await enforcer.protectCriticalPaths([targetFile]);

    // Assert
    expect(protectedList).toEqual([targetFile]);
    expect(executedCommands).toContainEqual({ cmd: 'chmod', args: ['0600', targetFile] });
    expect(executedCommands).toContainEqual({ cmd: 'chflags', args: ['uchg', targetFile] });
  });

  it('MUTATE_RULES deve rejeitar lote acima de 100 domínios com 400 Problem Details (RN-WEB-04) e UNINSTALL_AUTHORIZED deve aceitar UNLOCK-PERMANENT-*', async () => {
    // Arrange
    const secret = 'boundary-secret-key';
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerBoundaryPass!9',
      hmacSecret: secret,
    });
    const overLimitDomains = Array.from({ length: 101 }, (_, i) => `site-${i}.com`);

    // Act 1 — Lote com 101 domínios (limite = 100)
    const batchError = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: overLimitDomains,
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });

    // Assert 1
    expect(batchError.status).toBe(400);

    // Act 2 — Tentativa de desinstalar usando apenas token de 15m (deve falhar com 403)
    const challenge = 'MB-7777-Z9';
    const token15m = generateChallengeToken(secret, challenge, '15m');
    const uninstallWith15m = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      challengeCode: challenge,
      token: token15m,
    });
    expect(uninstallWith15m.status).toBe(403);

    // Act 3 — Desinstalação autorizada com token UNLOCK-PERMANENT-*
    const tokenPerm = generateChallengeToken(secret, challenge, 'permanent');
    const uninstallWithPerm = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      challengeCode: challenge,
      token: tokenPerm,
    });
    expect(uninstallWithPerm.status).toBe(200);
  });
});
