# Dicionário de Dados Binário (Objective-C Runtime & Persistência) — Cisdem AppCrypt v7.11.0

> Extraído diretamente da seção `(__DATA_CONST, __objc_classlist)` do executável Mach-O `arm64` pelo agente **Archaeologist** (leitura estática, sem teste dinâmico).
>
> **Aviso de conflito (agenda):** `ACScheduleGroup`/`ACScheduleUnit` (`scheduleGroupToAll`, `scheduleGroup`, `useSelfSchedule`; `0x100009730`) não foram reconciliados com `ACSchedule`/`ACScheduleHelper` (`generalSchedules`, `schedules`, `enableCustomSchedule`; `0x100009b70`) de `schedule-engine/`. Ver `gaps.md` e TT-SCH-03.

---

## 1. `ACPreferences` (Tamanho: `104 bytes`, `NSSecureCoding`)

Serializado em `~/Library/Application Support/com.apple.sdev/csdv.dsc` (primário) e `~/Library/Application Support/com.app.cadlvq/dgh.xvc` (backup).

| Offset | Ivar / Propriedade | Tipo ObjC / C | Obrigatoriedade | Papel / Valor Padrão | Confiança |
|---|---|---|---|---|---|
| `+8` | `_securityData` (`securityData`) | `NSData *` | Opcional | Bookmark Security-Scoped (`ACGrantAccessApplicationsFolderData`) para acesso à pasta `/Applications`. | 🟢 CONFIRMADO |
| `+16` | `_grantMonitorSelf` (`grantMonitorSelf`) | `BOOL` (`1B`) | Obrigatório | Indica se a permissão de monitorar a pasta `/Applications` foi concedida. | 🟢 CONFIRMADO |
| `+17` | `_monitorSelf` (`monitorSelf`) | `BOOL` (`1B`) | Obrigatório | Habilita autodefesa (`ACMonitorAppSelf` + backup `tgz.gz`). | 🟢 CONFIRMADO |
| `+18` | `_capturePhotoWhenFailedAttempt` | `BOOL` (`1B`) | Obrigatório | Se `YES`, aciona webcam via `ACCapturePhoto` ao errar senha (` OFF` por padrão). | 🟢 CONFIRMADO |
| `+19` | `_enableWebBlock` (`enableWebBlock`) | `BOOL` (`1B`) | Obrigatório | Chave mestra do bloqueio de websites (`YES` por padrão). | 🟢 CONFIRMADO |
| `+20` | `_enableAppBlock` (`enableAppBlock`) | `BOOL` (`1B`) | Obrigatório | Chave mestra do bloqueio de aplicativos (`YES` por padrão). | 🟢 CONFIRMADO |
| `+21` | `_enableSchedule` (`enableSchedule`) | `BOOL` (`1B`) | Obrigatório | Chave mestra do agendamento global (`YES` por padrão). | 🟢 CONFIRMADO |
| `+24` | `_monitorItemsMgr` (`monitorItemsMgr`) | `ACMonitorItemsMgr *` | Obrigatório | Grafo contendo todas as listas de apps e sites bloqueados/permitidos. | 🟢 CONFIRMADO |
| `+32` | `_usedSecretCodes` (`usedSecretCodes`) | `NSMutableArray *` | Obrigatório | Lista de códigos únicos de recuperação (`one-time secret codes`) já consumidos para impedir reuso. | 🟢 CONFIRMADO |
| `+40` | `_customRedirectionURLString` | `NSString *` | Opcional | URL customizada de redirecionamento quando um site é bloqueado. | 🟢 CONFIRMADO |
| `+48` | `_enableScheduleWeb` | `BOOL` (`1B`) | Obrigatório | Habilita agendamento para bloqueio web. | 🟢 CONFIRMADO |
| `+49` | `_enableScheduleApp` | `BOOL` (`1B`) | Obrigatório | Habilita agendamento para bloqueio de apps. | 🟢 CONFIRMADO |
| `+56` | `_scheduleGroupToAll` | `ACScheduleGroup *` | Obrigatório | Grupo de agendamento global padrão (ex.: `00:00 - 23:59, Every Day`). | 🟢 CONFIRMADO |
| `+64` | `_authorityRetainInterval` | `double` (`8B`) | Obrigatório | Minutos antes de relockar um app desativado (`enableAutoLockDeactivated`). | 🟢 CONFIRMADO |
| `+72` | `firstLaunch` | `BOOL` (`1B`) | Obrigatório | Flag de primeira execução (`ACFirstLaunchKey`). | 🟢 CONFIRMADO |
| `+73` | `canAutomaticallyStartWithSystem` | `BOOL` (`1B`) | Obrigatório | Capacidade de iniciar no login. | 🟢 CONFIRMADO |
| `+74` | `automaticallyStartWithSystem` | `BOOL` (`1B`) | Obrigatório | Controla criação do LaunchAgent `com.cisdem.appencrypt.plist`. | 🟢 CONFIRMADO |
| `+75` | `showStatusOnMenuBar` | `BOOL` (`1B`) | Obrigatório | Exibe ou oculta o `NSStatusItem` na barra de menus do macOS. | 🟢 CONFIRMADO |
| `+76` | `customLockingScreenBg` | `BOOL` (`1B`) | Obrigatório | Se `YES`, usa imagem de fundo customizada na tela de bloqueio. | 🟢 CONFIRMADO |
| `+77` | `enableAutoLockLeavingMac` | `BOOL` (`1B`) | Obrigatório | Habilita auto-lock por ociosidade física (`HIDIdleTime`). | 🟢 CONFIRMADO |
| `+78` | `enableAutoLockDeactivated` | `BOOL` (`1B`) | Obrigatório | Habilita auto-lock após o app perder foco por `authorityRetainInterval` min. | 🟢 CONFIRMADO |
| `+79` | `_customRedirection` | `BOOL` (`1B`) | Obrigatório | Se `YES`, redireciona sites bloqueados para `_customRedirectionURLString`; se `NO`, usa `https://www.cisdem.com/blocked-website.html`. | 🟢 CONFIRMADO |
| `+80` | `computerNoActivityInterval` | `double` (`8B`) | Obrigatório | Minutos de ociosidade do Mac (`HIDIdleTime`) para relockar apps (padrão inicial: `5.0`). | 🟢 CONFIRMADO |
| `+88` | `customLockingScreenBgURL` | `NSURL *` | Opcional | URL de arquivo da imagem customizada de bloqueio. | 🟢 CONFIRMADO |
| `+96` | `customLockingScreenBgPath` | `NSString *` | Opcional | Caminho POSIX da imagem customizada de bloqueio. | 🟢 CONFIRMADO |

---

## 2. `ACMonitorItemsMgr` (Tamanho: `89 bytes`, `NSSecureCoding`)

Armazena todas as coleções de regras de bloqueio/permissão de aplicativos e websites.

| Offset | Ivar / Propriedade | Tipo ObjC / C | Papel no Domínio | Confiança |
|---|---|---|---|---|
| `+8` | `_blackMonitorApps` | `NSMutableArray<ACMonitorItem *> *` | Lista de aplicativos bloqueados quando `_appBlackRule == YES` (Modo Blocklist). | 🟢 CONFIRMADO |
| `+16` | `_whiteMonitorApps` | `NSMutableArray<ACMonitorItem *> *` | Lista de aplicativos permitidos quando `_appBlackRule == NO` (Modo Allowlist). | 🟢 CONFIRMADO |
| `+24` | `_monitorWebsites` (`monitorWebsites`) | `NSMutableArray<ACMonitorItem *> *` | Lista principal de websites e palavras-chave monitorados. | 🟢 CONFIRMADO |
| `+32` | `_selectedAppsIndexes` | `NSMutableIndexSet *` | Índices selecionados na tabela de apps da UI. | 🟢 CONFIRMADO |
| `+40` | `_selectedWebsitesIndexes` | `NSMutableIndexSet *` | Índices selecionados na tabela de sites da UI. | 🟢 CONFIRMADO |
| `+48` | `_blackRule` (`blackRule`) | `BOOL` (`1B`) | Modo da lista web (`YES` = Blocklist, `NO` = Allowlist). | 🟢 CONFIRMADO |
| `+49` | `_appBlackRule` (`appBlackRule`) | `BOOL` (`1B`) | Modo da lista de apps (`YES` = Blocklist, `NO` = Allowlist). | 🟢 CONFIRMADO |
| `+56` | `_blackWebsiteLists` | `NSMutableArray<ACMonitorItem *> *` | Armazenamento interno da lista de sites bloqueados. | 🟢 CONFIRMADO |
| `+64` | `_writeWebsiteLists` | `NSMutableArray<ACMonitorItem *> *` | Armazenamento interno da lista de sites permitidos (nota: typo `_writeWebsiteLists` no binário para `whiteWebsiteLists`). | 🟢 CONFIRMADO |
| `+72` | `_blackWebsites` (`blackWebsites`) | `NSMutableArray<ACMonitorItem *> *` | Exceções globais **"Always Block"** (sempre bloquear, mesmo em modo Allowlist ou fora de horário). | 🟢 CONFIRMADO |
| `+80` | `_whiteWebsites` (`whiteWebsites`) | `NSMutableArray<ACMonitorItem *> *` | Exceções globais **"Always Allow"** (sempre permitir, mesmo quando `_blockAll == YES`). | 🟢 CONFIRMADO |
| `+88` | `_blockAll` (`blockAll`) | `BOOL` (`1B`) | Chave **"Block all websites"** (bloqueia toda a web exceto `_whiteWebsites`). | 🟢 CONFIRMADO |

---

## 3. `ACMonitorItem` (Tamanho: `88 bytes`, `NSSecureCoding`)

Representa tanto um aplicativo monitorado quanto uma regra de website/keyword.

| Offset | Ivar / Propriedade | Tipo ObjC / C | Papel no Domínio | Confiança |
|---|---|---|---|---|
| `+8` | `_url` (`url`) | `NSURL *` | URL do bundle `.app` (`file:///Applications/...`) ou URL do website (`https://...`). | 🟢 CONFIRMADO |
| `+16` | `_appBundle` (`appBundle`) | `NSBundle *` | Instância `NSBundle` quando o item representa um aplicativo macOS. | 🟢 CONFIRMADO |
| `+24` | `_securityData` | `NSData *` | Bookmark de acesso seguro ao arquivo do app. | 🟢 CONFIRMADO |
| `+32` | `_scheduleGroup` (`scheduleGroup`) | `ACScheduleGroup *` | Agendamento individual deste item (usado quando `_useSelfSchedule == YES`). | 🟢 CONFIRMADO |
| `+40` | `_description` (`description`) | `NSString *` | Descrição textual do item. | 🟢 CONFIRMADO |
| `+48` | `_keyword` | `NSString *` | Campo legado/interno de palavra-chave. | 🟢 CONFIRMADO |
| `+56` | `_empty` (`isEmptyItem`) | `BOOL` (`1B`) | Indica item sentinela vazio (`+MonitorItemEmpty`). | 🟢 CONFIRMADO |
| `+64` | `_urlString` (`urlString`) | `NSString *` | Representação textual normalizada da URL ou domínio. | 🟢 CONFIRMADO |
| `+72` | `_useSelfSchedule` (`useSelfSchedule`) | `BOOL` (`1B`) | Se `YES`, ignora o `scheduleGroupToAll` global e aplica `_scheduleGroup` próprio. | 🟢 CONFIRMADO |
| `+80` | `_keyWord` (`keyWord`) | `NSString *` | Palavra(s)-chave para bloqueio web (suporta múltiplas palavras separadas por vírgula com lógica AND). | 🟢 CONFIRMADO |

---

## 4. `ACRunningApp` (Tamanho: `80 bytes`)

Estado em tempo de execução para cada aplicativo aberto na sessão do macOS.

| Offset | Ivar / Propriedade | Tipo ObjC / C | Papel no Runtime | Confiança |
|---|---|---|---|---|
| `+8` | `_runningApplication` (`runningApp`) | `NSRunningApplication *` | Referência ao objeto nativo do AppKit. | 🟢 CONFIRMADO |
| `+16` | `_notRespondActiveNotification` | `BOOL` (`1B`) | Guard flag para evitar recursão ao ocultar/ativar o app programaticamente (`-hideWithoutNotification` / `-activateWithoutNotification`). | 🟢 CONFIRMADO |
| `+24` | `_mskWndCtrls` | `NSMutableArray<ACMaskWndControl *> *` | Janelas de máscara borrada atualmente sobrepostas às janelas deste processo. | 🟢 CONFIRMADO |
| `+32` | `_monitorBrowser` (`monitorBrowser`) | `ACMonitorBrowser *` | Instância polimórfica do monitor de navegador (apenas se `webBrowserApp == YES`). | 🟢 CONFIRMADO |
| `+40` | `_resignTimer` (`resignTimer`) | `NSTimer *` | Timer disparado quando o app perde foco para revogar `granted` após `authorityRetainInterval`. | 🟢 CONFIRMADO |
| `+48` | `_mskWndTimer` (`mskWndTimer`) | `NSTimer *` | Timer de atualização/manutenção das janelas de máscara. | 🟢 CONFIRMADO |
| `+56` | `granted` | `BOOL` (`1B`) | `YES` se o usuário já digitou a senha mestra correta para este app na sessão atual. | 🟢 CONFIRMADO |
| `+64` | `_hiddenTimer` (`hiddenTimer`) | `NSTimer *` | Timer para forçar `[NSRunningApplication hide]` repetidamente caso o app tente reaparecer sem senha. | 🟢 CONFIRMADO |
| `+72` | `_terminateTimer` (`terminateTimer`) | `NSTimer *` | Timer para encerrar o processo caso permaneça não autorizado. | 🟢 CONFIRMADO |

---

## 5. `ACScheduleUnit` (Tamanho: `37 bytes`, `NSSecureCoding`)

| Offset | Ivar / Propriedade | Tipo ObjC / C | Papel no Domínio | Confiança |
|---|---|---|---|---|
| `+8` | `_startTimer` (`startTimer`) | `NSDate *` | Hora/minuto inicial da janela de agendamento. | 🟢 CONFIRMADO |
| `+16` | `_endTimer` (`endTimer`) | `NSDate *` | Hora/minuto final da janela de agendamento. | 🟢 CONFIRMADO |
| `+24` | `_repeatMask` (`repeatMask`) | `uint64_t` (`Q`) | Bitmask dos dias da semana habilitados (Seg a Dom). | 🟢 CONFIRMADO |
| `+32` | `_profile` (`profile`) | `int32_t` (`i`) | Perfil rápido (`Every Day`, `Working Day`, `Weekend`, `Custom`). | 🟢 CONFIRMADO |
| `+36` | `editing` | `BOOL` (`1B`) | Estado transiente de edição na UI. | 🟢 CONFIRMADO |

---

## 6. `ACBrowserAuthInfo` (`64 bytes`) & `ACBrowserAuthManager` (`56 bytes`)

| Classe | Offset | Ivar | Tipo | Descrição | Confiança |
|---|---|---|---|---|---|
| `ACBrowserAuthInfo` | `+8` | `_isRunning` | `BOOL` | Se o navegador está em execução no momento. | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+9` | `_isDefault` | `BOOL` | Se é o navegador padrão do sistema (`LSCopyDefaultApplicationURLForURL`). | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+16` | `_browserName` | `NSString *` | Nome amigável (ex.: `"Google Chrome"`, `"Arc"`, `"Dia"`). | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+24` | `_bundleID` | `NSString *` | Bundle Identifier do navegador. | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+32` | `_icon` | `NSImage *` | Ícone do bundle do navegador. | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+40` | `_iconLetter` | `NSString *` | Inicial de fallback caso o ícone não esteja disponível. | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+48` | `_iconColorHex` | `NSString *` | Cor temática hexadecimal (`#39c4ff`, `#fbc02d`, `#0b62a8`, etc.). | 🟢 CONFIRMADO |
| `ACBrowserAuthInfo` | `+56` | `_state` | `int64_t` (`q`) | Estado TCC Automation (`Granted`, `Denied`, `NotDetermined`). | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+8` | `_authCache` | `NSMutableDictionary *` | Cache em memória espelhado em `NSUserDefaults` (`AC_BrowserAuthCache`). | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+16` | `_globalHeartbeatTimer` | `NSTimer *` | Timer periódico global que revalida permissões TCC dos navegadores. | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+24` | `_highFreqTimer` | `NSTimer *` | Timer rápido ativado quando o usuário clica em "Authorize". | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+32` | `_highFreqBundleID` | `NSString *` | Bundle ID alvo do polling de alta frequência atual. | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+40` | `_highFreqTickCount` | `int64_t` (`q`) | Contador de ticks para timeout do polling rápido. | 🟢 CONFIRMADO |
| `ACBrowserAuthManager` | `+48` | `_browserList` | `NSDictionary *` | Mapa estático dos 10 navegadores suportados. | 🟢 CONFIRMADO |

---

## 7. `ACWindowInfo` (`64 bytes`) & `ACLogRecord` (`56 bytes`, `NSSecureCoding`)

| Classe | Offset | Ivar | Tipo | Descrição | Confiança |
|---|---|---|---|---|---|
| `ACWindowInfo` | `+8` | `_ownerProcessID` | `int32_t` (`i`) | `kCGWindowOwnerPID` do processo dono da janela. | 🟢 CONFIRMADO |
| `ACWindowInfo` | `+16` | `_frameOnScreen` | `CGRect` (`32B`) | Coordenadas `kCGWindowBounds` na tela para posicionar a máscara de blur. | 🟢 CONFIRMADO |
| `ACWindowInfo` | `+48` | `_wndID` | `uint32_t` (`I`) | `kCGWindowNumber` no WindowServer. | 🟢 CONFIRMADO |
| `ACWindowInfo` | `+56` | `_windowName` | `NSString *` | `kCGWindowName` (título da janela). | 🟢 CONFIRMADO |
| `ACLogRecord` | `+8` | `_title` | `NSString *` | Nome do aplicativo bloqueado que sofreu tentativa falha de acesso. | 🟢 CONFIRMADO |
| `ACLogRecord` | `+16` | `_message` | `NSString *` | Descrição do evento de falha. | 🟢 CONFIRMADO |
| `ACLogRecord` | `+24` | `_imageData` | `NSData *` | Imagem JPEG/PNG capturada pela webcam (`ACCapturePhoto`). | 🟢 CONFIRMADO |
| `ACLogRecord` | `+32` | `_creationDate` | `NSDate *` | Data/hora exata da tentativa falha (`MMMM dd, yyyy HH:mm:ss`). | 🟢 CONFIRMADO |
| `ACLogRecord` | `+40` | `_readed` / `readed` | `BOOL` (`1B`) | Indica se o administrador já visualizou o alerta no log. | 🟢 CONFIRMADO |
| `ACLogRecord` | `+48` | `sceneImage` | `NSImage *` | Imagem desserializada em cache para exibição na `ACErrorLogWindowCtr`. | 🟢 CONFIRMADO |
