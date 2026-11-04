# Matriz de Permissões (TCC macOS, Entitlements e Controle de Acesso) — Cisdem AppCrypt v7.11.0

> Extraída pelo agente **Detective** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Permissões do Sistema Operacional (macOS TCC & Sandbox/Hardened Runtime)

| Permissão macOS / TCC | API / Entitlement Utilizado | Obrigatória? | O que acontece se for negada? | Confiança |
|---|---|---|---|---|
| **Automation (AppleEvents)** (`Privacy_Automation`) | Entitlement `com.apple.security.automation.apple-events` + `AEDeterminePermissionToAutomateTarget` | **Sim (para Web Block)** e **Fallback (para App Quit)** | O AppCrypt não consegue ler as URLs das abas nem redirecioná-las; exibe `ACBrowserAuthPanel` / `ACPermissionAlertHelper` redirecionando para `x-apple.systempreferences:com.apple.preference.security?Privacy_Automation`. | 🟢 CONFIRMADO |
| **Camera** (`Privacy_Camera`) | Entitlement `com.apple.security.device.camera` + `NSCameraUsageDescription` + `AVCaptureDevice` | **Opcional** (apenas se `capturePhotoWhenFailedAttempt == YES`) | Exibe `ACCameraAuthorityWndCtrl` (`AC_CA_Note`). O bloqueio de apps continua funcionando, mas os registros `ACLogRecord` são salvos sem foto. | 🟢 CONFIRMADO |
| **Screen Recording** (`Privacy_ScreenCapture`) | `CGWindowListCreateImage` / `CGDisplayStreamCreate` | **Opcional** (para captura real da janela sob o blur) | Sem Screen Recording, `CGWindowListCopyWindowInfo` ainda retorna os `CGRect` das janelas para posicionar a máscara (`ACMaskWindow`), mas a imagem capturada atrás do blur contém apenas o papel de parede ou usa `customLockingScreenBg`. | 🟢 CONFIRMADO |
| **Acesso à Pasta `/Applications`** | `NSOpenPanel` + Security-Scoped Bookmark (`ACGrantAccessApplicationsFolderData` / `_securityData`) | **Condicional** (para `grantMonitorSelf`) | Solicita autorização via `-[ACPreferences grantMonitorSelfWithCompleteHandler:]` (`0x10001176c`). | 🟢 CONFIRMADO |

---

## 2. Matriz de Controle de Acesso por Estado de Autenticação do Usuário

| Operação / Recurso | Usuário Não Autenticado (Sem Senha Mestra) | Usuário Autenticado na Janela Principal (`ACMainWndCtrl.granted == YES`) | Sessão de App Desbloqueada (`ACRunningApp.granted == YES`) | Confiança |
|---|---|---|---|---|
| Abrir janela principal do AppCrypt (`ACMainWndCtrl`) | ❌ Bloqueado por `ACPWDInputWndCtrl` | ✅ Permitido (até fechar a janela ou expirar `resignKeyTimer`) | N/A | 🟢 CONFIRMADO |
| Alternar Web Block / App Lock / Schedule pelo Menu Bar | ❌ Exige senha mestra | ✅ Permitido | N/A | 🟢 CONFIRMADO |
| Encerrar o AppCrypt pelo menu (`Quit`) | ❌ Exige senha mestra (`Terminate requested, type: 1`) | ✅ Permitido | N/A | 🟢 CONFIRMADO |
| Abrir aplicativo na Blocklist (`_blackMonitorApps`) | ❌ Janela mascarada + ocultada + exige senha | ✅ Exige senha no 1º acesso da sessão | ✅ Permitido até desativar/dormir/fechar | 🟢 CONFIRMADO |
| Acessar `Activity Monitor`, `Terminal` ou `System Settings` | ❌ Bloqueado por padrão (`defaultMonitorAppNames`) | ✅ Permitido | ✅ Permitido enquanto `granted == YES` | 🟢 CONFIRMADO |
| Navegar em site bloqueado (`websiteIsBlock == YES`) | ❌ Redirecionado para `blocked-website.html` | ❌ Redirecionado (a menos que desative o Web Block ou remova a regra) | N/A | 🟢 CONFIRMADO |

---

## 3. Matriz de Funcionalidades por Nível de Licença (`ACProductInfo` / `ASIAPHelper`)

| Funcionalidade | Free / Trial Expirado (`registered == NO`) | Licenciado / Assinante (`registered == YES`) | Evidência no Binário | Confiança |
|---|---|---|---|---|
| Quantidade de Apps Bloqueados (Blacklist) | Máximo **1 app** (`AC_IAP_Info`) | Ilimitado (`AC_IAP_Limit1`) | `Localizable.strings:394-396` | 🟢 CONFIRMADO |
| Quantidade de Websites Bloqueados | Máximo **1 website** (`AC_IAP_Info`) | Ilimitado (`AC_IAP_Limit2`) | `Localizable.strings:394-397` | 🟢 CONFIRMADO |
| Modo Allowlist de Aplicativos | ❌ Bloqueado (`AC_IAP_Limit2_5`) | ✅ Permitido | `Localizable.strings:401` | 🟢 CONFIRMADO |
| Modo "Block All Websites" (`blockAll`) | ❌ Bloqueado (`AC_IAP_Limit3`) | ✅ Permitido | `Localizable.strings:398` | 🟢 CONFIRMADO |
| Exceções Globais (`Always Block` / `Always Allow`) | ❌ Bloqueado (`AC_IAP_Limit4`) | ✅ Permitido | `Localizable.strings:399` | 🟢 CONFIRMADO |
| Importar / Exportar Configuração (`.acconf`) | ❌ Bloqueado (`AC_IAP_Limit5`) | ✅ Permitido | `Localizable.strings:400` | 🟢 CONFIRMADO |
