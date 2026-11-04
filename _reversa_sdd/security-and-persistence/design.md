# Unit: `security-and-persistence`, Design Técnico

## Interface

| Símbolo Objective-C | Assinatura | Retorno | Observação |
|---|---|---|---|
| `+[ACPreferences sharedPreference]` | `()` | `ACPreferences *` | Carrega grafo do arquivo primário ou backup (`0x100011bb4`) |
| `-[ACPreferences savePreference]` | `()` | `BOOL` | Arquiva em `csdv.dsc` e espelha em `dgh.xvc` (`0x100012c08`) |
| `-[ACPreferences password]` / `-setPassword:` | `()` / `(NSString *)` | `NSString *` / `void` | Lê/grava hash MD5 via `SAMKeychain` (`0x100012e2c`) |
| `+[ACMonitorItemsMgr sharedMonitorItemsMgr]` | `()` | `ACMonitorItemsMgr *` | Singleton referenciado por `ACPreferences.monitorItemsMgr` (`0x10000b318`) |
| `-[ACFailedAttemptsManager addFailedAttemptWithApp:]` | `(ACRunningApp *app)` | `void` | Dispara `ACCameraShot` e persiste `ACFailedAttempt` (`0x10001fa50`) |
| `-[ACCameraShot takePhotoWithCompleteHandler:]` | `(void(^)(NSImage *))` | `void` | Captura frame da webcam via `AVFoundation` (`0x100027b40`) |

## Fluxo Principal
1. **Inicialização (`+[ACPreferences sharedPreference]`):**
   - Resolve o caminho primário `~/Library/Application Support/com.apple.sdev/csdv.dsc` (`+preferenceFilePath`, `0x100011c48`) e o caminho de backup `~/Library/Application Support/com.app.cadlvq/dgh.xvc` (`+preferenceBackFilePath`, `0x100011d8c`).
   - Se o arquivo primário não existir mas o backup existir, copia o backup para o caminho primário.
   - Desserializa o grafo `ACPreferences` via `NSKeyedUnarchiver`, restaurando todas as flags de preferências e o objeto `ACMonitorItemsMgr` (com suas 5 listas de regras).
2. **Gravação (`-[ACPreferences savePreference]`):**
   - Codifica `self` com `NSKeyedArchiver`, grava atomicamente em `com.apple.sdev/csdv.dsc` e copia para `com.app.cadlvq/dgh.xvc`.
3. **Verificação de Senha (`ACPasswordPanel`):**
   - Calcula `-[inputString md5String]` (`CC_MD5` de 16 bytes formatado em 32 caracteres hexadecimais minúsculos) e compara com `[[ACPreferences sharedPreference] password]`.
   - Em caso de falha: incrementa o contador de erros consecutivos; se `recordFailedAttempt == YES` e a falha ocorreu no desbloqueio de um aplicativo, chama `-[ACFailedAttemptsManager addFailedAttemptWithApp:]`, que aciona `ACCameraShot` (`AVCaptureSession`) para fotografar o usuário e salva o registro em `~/Library/Application Support/Cisdem AppCrypt/FailedAttempts`.

## Fluxos Alternativos
- **Keychain Indisponível ou Negado:** Se `SAMKeychain` falhar ao gravar/ler o item no Keychain (`ACSavePInKeychain == NO`), `ACPreferences` utiliza `NSUserDefaults` para armazenar o hash MD5.
- **Permissão de Câmera Negada:** Se o usuário negar `NSCameraUsageDescription`, `ACCameraShot` conclui com imagem padrão/nula e o `ACFailedAttempt` é registrado apenas com o timestamp e ícone do aplicativo.

## Dependências
- Frameworks do sistema: `Foundation` (`NSKeyedArchiver`, `NSKeyedUnarchiver`), `Security` (`SecItemCopyMatching`, `SecItemAdd`, `SecItemUpdate`), `AVFoundation` (`AVCaptureSession`, `AVCaptureDevice`), `libSystem.B.dylib` (`CC_MD5`).

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---|---|---|
| Nomes de diretório/arquivo disfarçados (`com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`) simulando arquivos internos do sistema para dificultar remoção manual. | `ACPreferences:0x100011c48`; caminhos observados em disco (`rea-evidence-dossier.md`); fonte bruta de strings não preservada | 🟢 |
| Uso de `NSKeyedArchiver` com grafo único contendo tanto `ACPreferences` quanto `ACMonitorItemsMgr`. | `ACPreferences encodeWithCoder:0x100012598` | 🟢 |

## Estado Interno
- Chaves codificadas em `ACPreferences`:
  - `autoLaunch`, `notHideAppLockWindow`, `lockAppInterval`, `lockInactiveMinutes`, `lockSleep`, `recordFailedAttempt`, `customRedirection`, `customRedirectionURLString`, `passwordTips`, `shortcutEnable`, `shortcutKeyCode`, `shortcutModifierFlags`, `monitorItemsMgr`.
- Chaves codificadas em `ACMonitorItemsMgr`:
  - `monitorApps`, `monitorWebsites`, `whiteWebsites`, `blackWebsites`, `generalSchedules`, `blockAll`, `redirectionURL`.

## Observabilidade
- `ACLog` (`0x100037be0`): grava logs diários rotacionados em `~/Library/Application Support/Cisdem AppCrypt/log/YYYY-MM-DD HH-MM-SS.log` e mantém os 10 arquivos mais recentes (`-keepRecentLogFiles:10`).

## Riscos e Lacunas
- 🟢 Confirmado: O uso de MD5 sem salt (`CC_MD5`) para a senha mestra permite recuperação rápida offline por rainbow tables/hashcat caso um atacante local extraia o hash de `com.cisdem.keychain` ou `NSUserDefaults`.
- 🟢 Confirmado: Os arquivos `csdv.dsc` e `dgh.xvc` são `bplist00` não criptografados (apenas serializados via `NSKeyedArchiver`), permitindo leitura direta das listas de sites/apps bloqueados e da dica de senha (`passwordTips`) via `plutil -p`.
