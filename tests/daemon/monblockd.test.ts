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
  let currentNow: number;

  beforeEach(() => {
    currentNow = 1_700_000_000_000;
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

    daemon = new MonBlockDaemon({ store, enforcer, nowFn: () => currentNow });
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
      expect(response.state.partner.telegramChatId).toBe('*****6789');
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
    currentNow = 1_700_000_000_000;
    const verifyOk = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode,
      token: token15m,
      target: 'instagram.com',
    });

    // Assert 1
    expect(verifyOk.status).toBe(200);
    if (verifyOk.status === 200 && 'grant' in verifyOk) {
      expect(verifyOk.grant.target).toBe('instagram.com');
      expect(verifyOk.grant.expiresAtMs).toBe(1_700_000_000_000 + 15 * 60_000);
    }

    // Act 2 — Tentativa de Replay com o mesmo token
    currentNow = 1_700_000_010_000;
    const replayAttempt = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode,
      token: token15m,
      target: 'instagram.com',
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
    currentNow = 1_700_000_000_000;
    const firstUse = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: firstCode,
    });

    // Assert 1
    expect(firstUse.status).toBe(200);
    if (firstUse.status === 200 && 'remainingCodes' in firstUse) {
      expect(firstUse.remainingCodes).toBe(4);
    }

    // Act 2 — Tenta reutilizar o mesmo código já consumido
    currentNow = 1_700_000_005_000;
    const secondUse = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: firstCode,
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
    currentNow = startMs;
    const cooldownStart = await daemon.handleCommand({
      type: 'TRIGGER_EMERGENCY_COOLDOWN',
    });
    expect(cooldownStart.status).toBe(200);

    currentNow = startMs + 71 * 3600 * 1000;
    const before72h = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
    });
    expect(before72h.status).toBe(403);

    currentNow = startMs + 72 * 3600 * 1000;
    const after72h = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
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

  it('deve acionar Fail-Closed (tamperLockdown) no MonBlockDaemon quando todos os 3 cofres são deletados após pareamento', async () => {
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: 'hmac-tamper-test',
    });

    // Deleta os 3 cofres do disco após pareamento ativo
    fs.unlinkSync(path.join(tmpDir, 'vault-a.json'));
    fs.unlinkSync(path.join(tmpDir, 'vault-b.json'));
    fs.unlinkSync(path.join(tmpDir, 'vault-c.seal'));

    const res = await daemon.handleCommand({ type: 'GET_STATE' });
    expect(res.status).toBe(200);
    if (res.status === 200 && 'state' in res) {
      expect(res.state.paired).toBe(true);
      expect(res.state.tamperLockdown).toBe(true);
      expect(res.state.rules.enabledCategories).toContain('adult');
      expect(res.state.rules.lockIncognito).toBe(true);
    }
  });

  it('MUTATE_RULES deve rejeitar token temporário UNLOCK-15M-* ao tentar remover regra permanente (403) e aceitar UNLOCK-PERMANENT-*', async () => {
    const secret = 'mutate-perm-secret';
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: secret,
    });
    await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult', 'gambling'],
        blockedDomains: ['bet-custom.com'],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });

    const challenge15m = 'MB-1500-A1';
    const token15m = generateChallengeToken(secret, challenge15m, '15m');

    // Tentativa de remover gambling e bet-custom.com usando token temporário de 15m -> deve ser 403
    const reject15m = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      challengeCode: challenge15m,
      token: token15m,
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: [],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });
    expect(reject15m.status).toBe(403);

    // Usando token UNLOCK-PERMANENT-* -> deve ser 200
    const challengePerm = 'MB-9999-P1';
    const tokenPerm = generateChallengeToken(secret, challengePerm, 'permanent');
    const acceptPerm = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      challengeCode: challengePerm,
      token: tokenPerm,
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: [],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });
    expect(acceptPerm.status).toBe(200);
  });

  it('deve liberar efetivamente o domínio no /etc/hosts durante TemporaryGrant e rebloquear automaticamente após expiração via nowFn', async () => {
    const secret = 'grant-ttl-secret';
    await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
      hmacSecret: secret,
    });
    await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: ['instagram.com', 'tiktok.com'],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });

    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 instagram.com');
    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 tiktok.com');

    // Concede 15m para instagram.com
    const challenge = 'MB-3333-G1';
    const token15m = generateChallengeToken(secret, challenge, '15m');
    const grantRes = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode: challenge,
      token: token15m,
      target: 'instagram.com',
    });
    expect(grantRes.status).toBe(200);

    // Durante o grant, instagram.com deve ter saído do /etc/hosts, mas tiktok.com continua bloqueado
    const hostsDuringGrant = fs.readFileSync(hostsPath, 'utf8');
    expect(hostsDuringGrant).not.toContain('0.0.0.0 instagram.com');
    expect(hostsDuringGrant).toContain('0.0.0.0 tiktok.com');

    // Avança o relógio além dos 15 minutos e executa um comando
    currentNow += 16 * 60_000;
    const stateAfterExpiry = await daemon.handleCommand({ type: 'GET_STATE' });
    expect(stateAfterExpiry.status).toBe(200);
    if (stateAfterExpiry.status === 200 && 'state' in stateAfterExpiry) {
      expect(stateAfterExpiry.state.temporaryGrants).toEqual([]);
    }

    // instagram.com deve voltar a ser bloqueado automaticamente no /etc/hosts
    const hostsAfterExpiry = fs.readFileSync(hostsPath, 'utf8');
    expect(hostsAfterExpiry).toContain('0.0.0.0 instagram.com');
  });

  it('PAIR_PARTNER gera hmacSecret seguro quando omitido e MUTATE_RULES permite crescer acima de 100 domínios em múltiplos lotes e normaliza allowlistDomains', async () => {
    const pairRes = await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: 'PartnerPassword#2026',
    });
    expect(pairRes.status).toBe(200);

    const batch1 = Array.from({ length: 60 }, (_, i) => `https://www.lote1-${i}.com/path`);
    const res1 = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: batch1,
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
    });
    expect(res1.status).toBe(200);

    const batch2 = [
      ...Array.from({ length: 60 }, (_, i) => `lote1-${i}.com`),
      ...Array.from({ length: 60 }, (_, i) => `lote2-${i}.com`),
    ];
    const res2 = await daemon.handleCommand({
      type: 'MUTATE_RULES',
      partnerPassword: 'PartnerPassword#2026',
      rules: {
        enabledCategories: ['adult'],
        blockedDomains: batch2,
        allowlistDomains: ['https://www.PortalEducativo.org.br/cursos'],
        keywords: [],
        lockIncognito: true,
      },
    });
    expect(res2.status).toBe(200);
    if (res2.status === 200 && 'rules' in res2) {
      expect(res2.rules.blockedDomains).toHaveLength(120);
      expect(res2.rules.allowlistDomains).toEqual(['portaleducativo.org.br']);
    }
  });

  it('INITIATE_PAIRING e CHECK_PAIRING_STATUS devem permitir pareamento remoto via Telegram sem expor códigos na resposta', async () => {
    // Arrange: Mock do TelegramPartnerClient
    let sentInvitation = false;
    let sentEmergencyKit = false;
    let emergencyCodesSentToTelegram: string[] = [];
    const mockUpdates: Array<{ update_id: number; message: { message_id: number; chat: { id: number }; text: string } }> = [];

    const mockTelegramClient = {
      sendPairingInvitation: async () => {
        sentInvitation = true;
        return { ok: true, status: 200 };
      },
      sendEmergencyKit: async (params: { codes: string[] }) => {
        sentEmergencyKit = true;
        emergencyCodesSentToTelegram = params.codes;
        return { ok: true, status: 200 };
      },
      pollUpdates: async () => {
        return { ok: true, updates: [...mockUpdates] };
      },
      deleteMessage: async () => {
        return { ok: true };
      },
      extractPasswordFromUpdate: (update: any, expectedChatId?: string) => {
        if (String(update?.message?.chat?.id) !== String(expectedChatId)) {
          return { valid: false, error: 'Chat não autorizado' };
        }
        const text = update?.message?.text ?? '';
        if (text.startsWith('/senha ')) {
          return { valid: true, password: text.replace('/senha ', '').trim(), messageId: 99 };
        }
        return { valid: false, error: 'Comando inválido' };
      },
    } as any;

    const daemonWithTelegram = new MonBlockDaemon({
      store,
      enforcer,
      nowFn: () => currentNow,
      telegramClient: mockTelegramClient,
    });

    // Act 1: Iniciar pareamento
    const initRes = await daemonWithTelegram.handleCommand({
      type: 'INITIATE_PAIRING',
      partnerName: 'Carlos Ajudante',
      telegramChatId: '88776655',
    });
    expect(initRes.status).toBe(200);
    expect(sentInvitation).toBe(true);

    // Act 2: Checar status antes da resposta do Ajudante (deve estar pending)
    const check1 = await daemonWithTelegram.handleCommand({
      type: 'CHECK_PAIRING_STATUS',
    });
    expect(check1.status).toBe(200);
    if ('pending' in check1) {
      expect(check1.pending).toBe(true);
      expect(check1.paired).toBe(false);
      expect(check1.partnerName).toBe('Carlos Ajudante');
    }

    // Act 3: Ajudante envia mensagem no Telegram: "/senha SenhaDoCarlos2026"
    mockUpdates.push({
      update_id: 1,
      message: {
        message_id: 99,
        chat: { id: 88776655 },
        text: '/senha SenhaDoCarlos2026',
      },
    });

    // Act 4: Checar status novamente (agora deve processar e concluir o pareamento)
    const check2 = await daemonWithTelegram.handleCommand({
      type: 'CHECK_PAIRING_STATUS',
    });
    expect(check2.status).toBe(200);
    if ('paired' in check2 && 'pending' in check2) {
      expect(check2.paired).toBe(true);
      expect(check2.pending).toBe(false);
      // Invariante de Segurança: a resposta NÃO expõe recoveryCodes para o cliente!
      expect('recoveryCodes' in check2).toBe(false);
    }
    expect(sentEmergencyKit).toBe(true);
    expect(emergencyCodesSentToTelegram).toHaveLength(5);
    expect(emergencyCodesSentToTelegram[0]).toMatch(/^REC-[0-9A-F]{6}-[0-9A-F]{6}$/);

    // Act 5: Verificar que a senha do Carlos funciona no daemon
    const stateRes = await daemonWithTelegram.handleCommand({ type: 'GET_STATE' });
    expect(stateRes.status).toBe(200);
    if ('state' in stateRes) {
      expect(stateRes.state.paired).toBe(true);
      expect(stateRes.state.partner.remainingRecoveryCodes).toBe(5);
    }

    // Act 6: Testar CANCEL_PAIRING
    const cancelRes = await daemonWithTelegram.handleCommand({ type: 'CANCEL_PAIRING' });
    expect(cancelRes.status).toBe(200);
  });
});
