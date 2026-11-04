# Dossiê Forense `/reverse-engineer-anything` (REA v6.8.0) — Cisdem AppCrypt v7.11.0

> Evidências formais geradas pelo motor **REA (`rea-agents@6.8.0`)** sobre o pacote `/Applications/Cisdem AppCrypt.app`, seus binários Mach-O universais, frameworks proprietários embutidos (`ASBaseService`, `ASBaseServiceHelper`, `ASFoundation2`, `ASIAPHelper`, `MASShortcut`), catálogos de assets (`Assets.car`), arquivos de interface compilados (`.nib`) e arquivos de persistência camuflados (`csdv.dsc`, `configure.ascfg`, `com.cisdem.appencrypt.plist`).

---

## 1. Índice de Evidências Criptográficas REA (`evidence_id` & SHA-256)

| Evidence ID (`rea@6.8.0`) | Operação REA | Alvo Inspecionado | SHA-256 do Artefato | Autoridade / Confiança |
|---|---|---|---|---|
| `ev_4f96aab7a5582bc57aec097b86117ffe83b0fe5928dd43725daafe1d89ec7103` | `inspect_desktop_application` | `/Applications/Cisdem AppCrypt.app` (`inode 108081286`) | `295604e5f68b1f052300bf188b5ff49782d7eba505bbbf288edc661140cec896` (snapshot) | `shipped-artifact` / `observed` |
| `ev_e16dec95bfcbc08c24b44f131b6fd0a3d71e0096976b017e9f3b596bedf3543b` | `inspect_macho` | `Contents/MacOS/Cisdem AppCrypt` (`5.837.984 bytes`) | `755e457cfbf1648ccf2cb0a5b8b4d7caae2dc1b22cf4faaa56e426528215da87` | `shipped-artifact` / `observed` |
| `ev_308ab0ecb551cbaba2bff58b1b32db7a92aa56440c0c135462c2e2b05679a9ed` | `inspect_signature` | `/Applications/Cisdem AppCrypt.app` (`Team ID: 5HGV8EX6BQ`) | `755e457cfbf1648ccf2cb0a5b8b4d7caae2dc1b22cf4faaa56e426528215da87` (SHA do executável principal; `cdhash: 88e161b2184abae6665995c74b430b897151fe6d`) | `shipped-artifact` / `observed` |
| `ev_a52ab07e1a61962d23817fb0f12040f76875e1431c4fcedc70cea55fa2cff94f` | `trace_dylib_resolution` | Grafo `@rpath` e dylibs de `Cisdem AppCrypt.app` (6 binários Mach-O) | `755e457cfbf1648ccf2cb0a5b8b4d7caae2dc1b22cf4faaa56e426528215da87` (SHA do executável principal, não hash agregado dos 6 binários) | `shipped-artifact` / `observed` |
| `ev_5e2fc0c4a36cc292b05f73759864636bdd04d3c1e6ed1af3c4fe6f5d7c49b58a` | `inspect_macho` | `Contents/Frameworks/ASBaseService.framework/Versions/A/ASBaseServiceHelper` | `c656542394c33ab77419ccdab78f64a29908f75287d845795cb55125a21def73` | `shipped-artifact` / `observed` |
| `ev_bb3da9d6a38b22f0ef15ea1e43c8d8574eaa5ca8974f7b8a4db968fc7fde236b` | `inspect_macho` | `Contents/Frameworks/ASBaseService.framework/Versions/A/ASBaseService` | `9f7d70b012dfa76eba7a560f9ad1476dffcc24c54b78cc23004cc362d8e9ba4d` | `shipped-artifact` / `observed` |
| `ev_1b739924aeec66b00d3b1c2a1ce05a31a3763c25e7e7c0b68ee6cd9a151b62cb` | `inspect_macho` | `Contents/Frameworks/ASFoundation2.framework/Versions/A/ASFoundation2` | `fb945e37607afa9cd95aaa86753b81ae525aaef494731c80b31ae52323f8d50f` | `shipped-artifact` / `observed` |
| `ev_48d754461703df6d3b9d4a37bf22552d62083f9031aff2be2a9d786fa74a3ff3` | `inspect_macho` | `Contents/Frameworks/ASIAPHelper.framework/Versions/A/ASIAPHelper` | `75d94fcf26a84c8334362cf60d48aacfe787a1c3489d1de47d769eef13126bc9` | `shipped-artifact` / `observed` |
| `ev_68c6a113d49e34e2e1e4ab02b39c2906c2cd877b0db6693e90514c456df6ba8c` | `inspect_native_dispatch_metadata` | Tabelas de despacho Objective-C e metadados Swift 5 de `Cisdem AppCrypt` | `755e457cfbf1648ccf2cb0a5b8b4d7caae2dc1b22cf4faaa56e426528215da87` | `shipped-artifact` / `observed` |
| `ev_54f480785cb162470ea9eea0a4e79eaa7e0ee9f52df16e7d43a4bb19785641b2` | `inspect_plist` | `Contents/Info.plist` (`com.cisdem.appencrypt`, build `7110`) | `d12361aeb2e29abdda6c440565cc1f28b5196b36e3f1ffd4db12f58dcaa661dc` | `shipped-artifact` / `observed` |
| `ev_f093822c68bf23eb4595fd21cf49bf08c85e7836219bb3623171848f7614fa48` | `inspect_plist` | `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` | `c586a301b4c9c9de957eb2b6df8ba0c3541c741af45bd29378fe0ece24f6073f` | `local-state` / `observed` |
| `ev_877d1031cac40e3d3b64eb97590de57f462bc553e7d3bf30b343053aeafbfdd0` | `inspect_asset_catalog` | `Contents/Resources/Assets.car` (141 records) + `ASBaseService/.../Assets.car` (9 records) | `12f543381cb7a64bd344be92ae8e6302cb94f8dfcd3b40d8779ccf4ff1e527b3` (hash de input principal; não é hash agregado dos dois catálogos) | `shipped-artifact` / `observed` |
| `ev_bf242f8551cda0973d04fc39162e8578d4735e9086237f41b0c22be7e3cc9a77` | `decode_interface_builder` | 43 arquivos `.nib` compilados em `Contents/Resources` e `ASBaseService.framework` | Hashes por `.nib` não identificados neste dossiê; não há hash agregado rastreável | `shipped-artifact` / `observed` |
| `ev_271a71912f29ff44f1ef9c72acfa256da704d99c6ceb8e0bcd3ec117e52e911d` | `inspect_keyed_archive` | `~/Library/Application Support/com.apple.sdev/csdv.dsc` (1.693 objetos `NSKeyedArchiver`) | `4832d04c939bff836d7a6b54f73a17f260af9d351499d9d413ad9230ebd5bba2` | `local-state` / `observed` |
| `ev_0f5416fa15bcd5dbee439462e44235ab7f123b629633d0368f6a5ba6d38fce17` | `inspect_byte_entropy` | `Contents/MacOS/Cisdem AppCrypt` (`5.837.984 bytes`, entropia global `5.9193`) | `755e457cfbf1648ccf2cb0a5b8b4d7caae2dc1b22cf4faaa56e426528215da87` | `shipped-artifact` / `observed` |
| `ev_29a734257e9ea3b548e1c5e30275ba0d410a477da5885edc5d842c99e40439ba` | `inspect_byte_entropy` | `~/Library/Application Support/Cisdem AppCrypt/configure.ascfg` (`376 bytes`, entropia `5.7487`) | `3f18ce4f79bf13b611f3778997dde102d7b458f75593889459c6a3c46cbf3a30` | `local-state` / `observed` |

---

## 2. Descobertas Estruturais Exclusivas do REA (`rea@6.8.0`)

### 2.1. Topologia Completa de Binários e Frameworks Internos (`trace_dylib_resolution` — `ev_a52ab07e1a61962d23817fb0f12040f76875e1431c4fcedc70cea55fa2cff94f`)
O `trace_dylib_resolution` provou que o bundle `/Applications/Cisdem AppCrypt.app` contém **6 imagens Mach-O universais (`x86_64` + `arm64`)**, divididas em **2 executáveis (`MH_EXECUTE`)** e **4 dynamic libraries/frameworks (`MH_DYLIB`)**:

1. **`Contents/MacOS/Cisdem AppCrypt` (`UUID: F632874F-19F8-3EFE-BB8F-976EEDD9640E`):**
   - Compilado com `LD 1266.8`, `DTSDKName = macosx26.4` (`DTXcode = 2641`), `minimum_os = 11.0`.
   - Possui **Hibridismo Objective-C + Swift 5**: além das seções Objective-C (`__objc_methlist` com `71.700 bytes`, `__objc_const` com `166.448 bytes`, `__objc_classlist` com `2.800 bytes` = 350 ponteiros de classes/metaclasses), contém seções Swift 5 completas (`__swift5_typeref`, `__swift5_fieldmd`, `__swift5_reflstr`, `__swift5_types`, `__swift5_proto`, `__swift5_capture`) e vincula `libswiftNetwork.dylib`, `libswiftDispatch.dylib`, `libswiftFoundation.dylib` e `libswiftCore.dylib`.
   - Vincula 4 frameworks `@rpath` empacotados em `Contents/Frameworks/`:
     - `@rpath/ASFoundation2.framework/Versions/A/ASFoundation2` (`UUID: F946D26D-FC65-38FB-909D-F658370818BD`) — biblioteca base compartilhada dos produtos Cisdem/Enol (`AS*`).
     - `@rpath/ASBaseService.framework/Versions/A/ASBaseService` (`UUID: 101BE142-AECF-3D2D-9B11-5B0516B258D7`) — serviço comercial de ativação, registro de licença (`configure.ascfg`), verificação de atualizações e janelas `ASRegstierWndCtrMac.nib` / `ASUpdateWindowControl.nib`.
     - `@rpath/ASIAPHelper.framework/Versions/A/ASIAPHelper` (`UUID: 378795A1-0CA5-343F-95D2-D9B648FD7A48`) — helper de compras/assinaturas (In-App Purchase / StoreKit / Paddle bridge).
     - `@rpath/MASShortcut.framework/Versions/A/MASShortcut` (`v2.4.0`) — captura e registro de atalhos globais de teclado (`RegisterEventHotKey`).
2. **`Contents/Frameworks/ASBaseService.framework/Versions/A/ASBaseServiceHelper` (`UUID: 26E95862-1364-30B2-9A98-C4A5EBB63AB6` — `ev_5e2fc0c4a36cc292b05f73759864636bdd04d3c1e6ed1af3c4fe6f5d7c49b58a`):**
   - Segundo executável (`MH_EXECUTE`, `67.664 bytes` na fatia `arm64`) embutido dentro de `ASBaseService.framework`.
   - Importa `_GetNextProcess` e `_ProcessInformationCopyDictionary` de `ApplicationServices.framework`, além de `NSWorkspace`, atuando como utilitário auxiliar de ciclo de vida/relançamento do `ASBaseService`.

---

### 2.2. Assinatura Digital, Hardened Runtime e Entitlements (`inspect_signature` — `ev_308ab0ecb551cbaba2bff58b1b32db7a92aa56440c0c135462c2e2b05679a9ed`)
- **Autoridade Certificadora:**
  - `Developer ID Application: ENOL INTERNATIONAL CO., LIMITED (5HGV8EX6BQ)`
  - `Developer ID Certification Authority` → `Apple Root CA`
- **Hardened Runtime:** Ativo (`flags = 0x10000(runtime)`).
- **Entitlements Confirmados no Binário:**
  - `com.apple.security.automation.apple-events = true`
  - `com.apple.security.device.camera = true`
  - `com.apple.security.temporary-exception.apple-events`:
    1. `com.google.Chrome`
    2. `org.mozilla.firefox`
    3. `com.apple.Safari`
    4. `com.microsoft.edgemac`
    5. `com.operasoftware.Opera`
    6. `com.brave.Browser`
    7. `com.operasoftware.OperaGX`
    8. `company.thebrowser.Browser` (Arc)
    9. `org.ecosia.browser`
    10. `company.thebrowser.dia` (Dia)

---

### 2.3. Reconstrução do Grafo `NSKeyedArchiver` Real em Disco (`inspect_keyed_archive` — `ev_271a71912f29ff44f1ef9c72acfa256da704d99c6ceb8e0bcd3ec117e52e911d`)
A referência anterior a uma segunda evidência não consta do índice; pendente localizar e validar seu registro bruto. Não é usada para sustentar as observações abaixo.
A inspeção direta do arquivo camuflado `/Users/matheus.diniz_1/Library/Application Support/com.apple.sdev/csdv.dsc` (`SHA-256: 4832d04c939bff836d7a6b54f73a17f260af9d351499d9d413ad9230ebd5bba2`) revelou, na inspeção estática desta cópia local, **1.693 nós (`UID 0` a `UID 1692`)** serializados pelo aplicativo:

1. **Objeto Raiz `UID 1` (`ACPreferences`, `class_id = 1692`):**
   ```json
   {
     "enableAppBlock": true,
     "enableWebBlock": true,
     "enableSchedule": true,
     "enableScheduleApp": true,
     "enableScheduleWeb": true,
     "enableAutoLockDeactivated": false,
     "enableAutoLockLeavingMac": false,
     "authorityRetainInterval": 180,
     "computerNoActivityInterval": 300,
     "capturePhotoWhenFailedAttempt": false,
     "monitorSelf": false,
     "showStatusOnMenuBar": true,
     "customRedirection": true,
     "customRedirectionURLString": { "UID": 0 },
     "customLockingScreenBg": false,
     "customLockingScreenBgURL": { "UID": 0 },
     "ACOpenMainWndShutCutKey": { "UID": 2 },
     "ACActivateWebBlockShutcutKey": { "UID": 3 },
     "ACGrantAccessApplicationsFolderData": { "UID": 0 },
     "scheduleGroupToAll": { "UID": 1685 },
     "monitorItemsMgr": { "UID": 4 }
   }
   ```
2. **Objeto `UID 4` (`ACMonitorItemsMgr`, `class_id = 1684`):**
   ```json
   {
     "monitorApps": { "UID": 5 },
     "whiteMonitorApps": { "UID": 7 },
     "monitorWebsites": { "UID": 8 },
     "blackWebsites": { "UID": 1682 },
     "whiteWebsites": { "UID": 1683 },
     "_blackWebsiteLists": { "UID": 1680 },
     "_writeWebsiteLists": { "UID": 1681 },
     "blockAll": false,
     "blackRule": true,
     "appBlackRule": true,
     "selectedAppsIndexes": { "UID": 1677 },
     "selectedWebsitesIndexes": { "UID": 1679 }
   }
   ```
3. **Objetos `ACMonitorItem` (`class_id = 17`, ex.: `UID 9`, `UID 18`... — 420 itens em `monitorWebsites`):**
   ```json
   {
     "url": { "UID": 10 },
     "keyWord": { "UID": 0 },
     "scheduleGroup": { "UID": 13 },
     "useSelfSchedule": false,
     "_securityData": { "UID": 0 }
   }
   ```
4. **Objetos de Agenda Global (`UID 1685` `ACScheduleGroup` → `UID 1687` `ACScheduleUnit`):**
   ```json
   {
     "startTimer": { "UID": 1688, "NS.time": 7200 },
     "endTimer": { "UID": 1690, "NS.time": 93599 },
     "repeatMask": 127,
     "profile": 0
   }
   ```
   - `repeatMask = 127` (`0b1111111` = todos os 7 dias da semana ativos).
   - `startTimer = 7200` (`00:00:00` local) até `endTimer = 93599` (`23:59:59` local), representando bloqueio 24 horas por dia.

---

### 2.4. Decodificação de Interface Builder (`.nib`) (`decode_interface_builder` — `ev_bf242f8551cda0973d04fc39162e8578d4735e9086237f41b0c22be7e3cc9a77`)
O REA decodificou **43 arquivos `.nib` compilados** distribuídos entre `Contents/Resources/` e `ASBaseService.framework`, comprovando a separação das janelas nativas:
- **Núcleo de Bloqueio de Apps e Tela:** `ACMaskWndControl.nib` (28 objetos), `ACScreenMskWndCtrl.nib` (6 objetos), `ACPWDInputWndCtrl.nib` (58 objetos, 14 conexões), `ACAppManagerViewCtr.nib` (45 objetos), `ACAppItemCollection.nib` (37 objetos).
- **Núcleo de Bloqueio Web:** `ACWebManagerViewCtr.nib` (136 objetos, 53 conexões), `ACWebsiteWndCtrl.nib` (104 objetos), `ACWebListCtr.nib` (101 objetos), `ACQuickAddWebCtr.nib` (56 objetos), `ACImportURLsProcessViewCtrl.nib` (21 objetos), `ACExceptionWndCtr.nib` (14 objetos).
- **Núcleo de Agendamento:** `ACScheduleMgrWndControl.nib` (37 objetos), `ACScheduleViewCtrl.nib` (36 objetos), `ACScheduleUnitViewItem.nib` (88 objetos, 49 conexões).
- **Segurança, Câmera e Autodefesa:** `ACSetupPWDWndCtrl.nib` (102 objetos), `ACResetPasswordWndCtrl.nib` (56 objetos), `ACCameraAuthorityWndCtrl.nib` (31 objetos), `ACPhotoDetailViewCtrl.nib` (18 objetos), `ACAlertRemoveDefAppWndCtrl.nib` (36 objetos).
- **Preferências e Assinatura:** `ACPreferencesWndCtrl.nib` (226 objetos, 77 conexões), `ACSettingManagerWindowCtr.nib` (176 objetos, 80 conexões), `CMSubscriptionWndCtr.nib` (123 objetos).

---

### 2.5. Perfil de Entropia de Bytes (`inspect_byte_entropy` — `ev_0f5416fa15bcd5dbee439462e44235ab7f123b629633d0368f6a5ba6d38fce17`)
- A entropia global de **`5.9193 bits/byte`** do executável universal `Contents/MacOS/Cisdem AppCrypt` (`5.837.984 bytes`; `x86_64` em `offset 16384..2973920`, `arm64` em `offset 2981888..5837984`) afasta apenas empacotamento/criptografia **integral óbvia** pelo limiar de `7.2`. Não exclui ofuscação parcial nem prova legibilidade integral de tabelas Objective-C/Swift.
- O arquivo `~/Library/Application Support/Cisdem AppCrypt/configure.ascfg` (`376 bytes`, `SHA-256: 3f18ce4f79bf13b611f3778997dde102d7b458f75593889459c6a3c46cbf3a30`) possui entropia de **`5.7487 bits/byte`**, contendo os metadados codificados de trial/ativação gerenciados pelo `ASBaseService.framework`.

## 3. Limites e pendências desta evidência
- A inspeção é **estática**, não uma prova de comportamento em runtime; a relação entre `ACSchedule`/`ACScheduleHelper` (`0x100009b70`) e o snapshot `ACScheduleGroup`/`ACScheduleUnit` (`0x100009730`) permanece não reconciliada (ver [`schedule-engine/requirements.md`](schedule-engine/requirements.md) e [`code-analysis.md`](code-analysis.md)).
- Metadados Swift foram truncados por budgets de inspeção, hierarquias NIB estão incompletas e imports podem ter sofrido stripping; não inferir cobertura integral.
- O grafo `NSKeyedArchiver` foi lido, não instanciado nem testado em execução. Configurações de `~/Library` dependem da conta e não são atributos do pacote distribuído.
- Os hashes reproduzidos são textualmente coerentes com os registros disponíveis, mas **não foram revalidados nesta auditoria**. Saídas brutas de ferramentas podem não estar retidas; sua ausência impede verificação independente de alguns detalhes. Pendentes revalidação dos inputs e retenção das saídas originais, sem inventar hashes.
