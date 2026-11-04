# Unit: `security-and-persistence` — Requisitos Operacionais

## Visão Geral
Subsistema responsável pela autenticação por senha mestra (hash MD5 em Keychain/UserDefaults), persistência ofuscada do grafo de configuração (`ACPreferences` e `ACMonitorItemsMgr` via `NSKeyedArchiver` em diretórios camuflados), auditoria de tentativas falhas de senha com captura fotográfica via webcam (`ACFailedAttemptsManager`, `ACCameraShot`, `ACFailedAttempt`), proteção anti-força bruta (`ACPasswordLockoutPanel`) e log operacional (`ACLog`).

## Responsabilidades
- Armazenar e validar a senha mestra do usuário usando hash MD5 (`NSString+MD5`) no macOS Keychain (`SAMKeychain`, serviço `"com.cisdem.keychain"`) com fallback em `NSUserDefaults`.
- Serializar e desserializar `ACPreferences` e `ACMonitorItemsMgr` via `NSKeyedArchiver` (`NSSecureCoding`) nos arquivos camuflados `~/Library/Application Support/com.apple.sdev/csdv.dsc` (primário) e `~/Library/Application Support/com.app.cadlvq/dgh.xvc` (espelho de backup).
- Registrar tentativas incorretas de desbloqueio de aplicativos (`ACFailedAttempt`) e capturar fotos do intruso pela câmera FaceTime (`ACCameraShot` via `AVCaptureSession`).
- Bloquear novas tentativas de senha por 10 minutos após 5 falhas consecutivas (`ACPasswordLockoutPanel`).

## Regras de Negócio
- **Validação de Senha no Cadastro (`ACFirstSetPasswdSheetController`, `0x100017894`):** A senha deve ter pelo menos 4 caracteres e ser diferente da dica de senha (`passwordTips`). 🟢 CONFIRMADO
- **Hash e Armazenamento da Senha (`ACPreferences`, `0x100011bb4`):** A senha nunca é salva em texto puro; é convertida via `-[NSString md5String]` (`CC_MD5`) e gravada no Keychain sob `service = "com.cisdem.keychain"`. 🟢 CONFIRMADO
- **Persistência Dupla Camuflada (`ACPreferences`, `0x100011c48`–`0x100012050`):**
  - Arquivo primário: `~/Library/Application Support/com.apple.sdev/csdv.dsc`
  - Arquivo espelho: `~/Library/Application Support/com.app.cadlvq/dgh.xvc`
  - Se o arquivo primário for removido pelo usuário na tentativa de burlar o bloqueio, o AppCrypt restaura automaticamente os dados a partir do espelho `dgh.xvc`. 🟢 CONFIRMADO
- **Rate Limiting Anti-Brute-Force (`ACPasswordPanel`, `0x100028c14`):** Após 5 tentativas incorretas seguidas, exibe `ACPasswordLockoutPanel` bloqueando o campo de senha por 10 minutos. 🟢 CONFIRMADO

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| RF-SEC-01 | Validar e persistir hash MD5 da senha mestra no Keychain (`com.cisdem.keychain`) com fallback em `NSUserDefaults`. | Must | Autenticar senha correta e rejeitar senha incorreta mesmo após reinicialização do macOS. |
| RF-SEC-02 | Persistir `ACPreferences` (incluindo `ACMonitorItemsMgr`) em `com.apple.sdev/csdv.dsc` e espelhar em `com.app.cadlvq/dgh.xvc`. | Must | Preservar listas de apps/sites bloqueados mesmo se `~/Library/Application Support/Cisdem AppCrypt` ou um dos arquivos camuflados for apagado. |
| RF-SEC-03 | Registrar `ACFailedAttempt` com ícone do app, timestamp e foto da câmera (`AVCapturePhotoOutput` / `AVCaptureStillImageOutput`) quando `recordFailedAttempt == YES`. | Should | Exibir histórico de tentativas falhas com foto no painel `ACFailedAttemptCtr`. |
| RF-SEC-04 | Aplicar lockout de 10 minutos após 5 falhas consecutivas de senha (`ACPasswordLockoutPanel`). | Should | Impedir submissão de novas senhas até o término da contagem regressiva. |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|---|---|---|---|
| Segurança de Desserialização | Uso de `NSSecureCoding` (`supportsSecureCoding == YES`) em todas as classes de modelo (`ACPreferences`, `ACMonitorItemsMgr`, `ACMonitorItem`, `ACSchedule`, `ACFailedAttempt`). | `supportsSecureCoding` (fonte bruta não preservada; revalidar; `ACSchedule` pertence ao modelo não reconciliado, ver `schedule-engine/requirements.md`) | 🟡 |
| Resiliência a Tampering | Redundância de persistência em dois diretórios ocultos fora da pasta nominal do aplicativo. | `ACPreferences:0x100011c48`; arquivos primário e espelho observados em disco (`rea-evidence-dossier.md`) | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o usuário cadastrou aplicativos e sites bloqueados no AppCrypt
Quando um usuário mal-intencionado apaga "~/Library/Application Support/Cisdem AppCrypt" e reinicia o app
Então o AppCrypt carrega "com.apple.sdev/csdv.dsc" (ou "com.app.cadlvq/dgh.xvc") e mantém todos os bloqueios e a senha intactos

Dado que "Record failed attempts with camera" está habilitado
Quando alguém erra a senha ao tentar abrir um aplicativo bloqueado
Então o AppCrypt captura um snapshot JPEG da câmera frontal e registra um item em ACFailedAttemptsManager
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|---|---|---|
| Autenticação por senha + Persistência dupla `NSKeyedArchiver` | Must | Sem persistência resistente a remoção o controle de acesso é trivialmente contornado |
| Lockout anti-força bruta após 5 tentativas | Should | Mitiga adivinhação manual de senhas curtas |
| Captura de foto via `ACCameraShot` em tentativas falhas | Could | Auditoria visual de intrusos |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---|---|---|
| `Contents/MacOS/Cisdem AppCrypt` | `ACPreferences` (`0x100011bb4`–`0x100013620`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACMonitorItemsMgr` (`0x10000b318`–`0x10000df00`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACFailedAttemptsManager` (`0x10001f73c`–`0x100020800`) & `ACCameraShot` (`0x1000279fc`–`0x100028400`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `SAMKeychain` / `SAMKeychainQuery` (`0x100020a74`–`0x100022400`) | 🟢 |
