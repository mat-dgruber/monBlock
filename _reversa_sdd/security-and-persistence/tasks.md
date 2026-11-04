# Unit: `security-and-persistence`, Tarefas de Implementação

## Pré-requisitos
- [x] Entitlement `com.apple.security.device.camera` e `NSCameraUsageDescription` configurados no `Info.plist`

## Tarefas

- [ ] T-SEC-01, Implementar `NSString (MD5)` e integração `SAMKeychain` (`service = "com.cisdem.keychain"`) com fallback em `NSUserDefaults`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100020a74`–`0x100022400`, `0x100012e2c`
  - Critério de pronto: Calcular hash MD5 de 32 caracteres hexadecimais e persistir/consultar no Keychain.
  - Confiança: 🟢

- [ ] T-SEC-02, Implementar `ACPreferences` e `ACMonitorItemsMgr` com `NSSecureCoding` e persistência espelhada em `com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10000b318`–`0x10000df00`, `0x100011bb4`–`0x100013620`
  - Critério de pronto: Salvar e restaurar todo o grafo de configuração e recuperar automaticamente se um dos dois arquivos for deletado.
  - Confiança: 🟢

- [ ] T-SEC-03, Implementar `ACFailedAttempt`, `ACFailedAttemptsManager` e captura fotográfica `ACCameraShot` (`AVCaptureSession`).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10001f070`–`0x100020800`, `0x1000279fc`–`0x100028400`
  - Critério de pronto: Capturar snapshot da câmera quando `recordFailedAttempt == YES` e armazenar em `FailedAttempts`.
  - Confiança: 🟢

- [ ] T-SEC-04, Implementar `ACPasswordLockoutPanel` (bloqueio de 10 minutos após 5 falhas consecutivas) e logger `ACLog` (rotação de 10 arquivos).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100018cb4`, `0x100037be0`
  - Critério de pronto: Exibir contagem regressiva de lockout e gravar logs em `~/Library/Application Support/Cisdem AppCrypt/log/`.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-SEC-01, Testar auto-recuperação apagando `~/Library/Application Support/com.apple.sdev/csdv.dsc` e verificando restauração a partir de `com.app.cadlvq/dgh.xvc`.
- [ ] TT-SEC-02, Testar 5 erros consecutivos de senha verificando acionamento do `ACPasswordLockoutPanel`.

## Ordem Sugerida
1. `T-SEC-01` (MD5 + Keychain) → 2. `T-SEC-02` (`ACPreferences` + `ACMonitorItemsMgr`) → 3. `T-SEC-03` (`ACFailedAttemptsManager` + `ACCameraShot`) → 4. `T-SEC-04` (`ACPasswordLockoutPanel` + `ACLog`).

## Lacunas Pendentes (🔴)
Nenhuma lacuna bloqueante registrada nesta unidade, dentro do escopo da análise estática (sem teste dinâmico; TT-SEC pendentes). `configure.ascfg` não foi decodificado. Ver `../gaps.md` e `../rea-evidence-dossier.md` (limites).
