# Spec — Daemon privilegiado `monblockd` como root (launchd)

- **Data:** 2026-11-05
- **Status:** v2 aprovada (2026-11-05), após spikes
- **Spikes:** `docs/ai/reports/2026-11-05-spikes-daemon-root.md`
- **ADRs:** implementa ADR-0001; revisa partes de ADR-0004 e ADR-0006; propõe **ADR-0007** (§11)
- **Plano:** `docs/ai/plans/2026-11-05-daemon-root.md`
- **Domínio:** `docs/domains/daemon_persistence/`

---

## 1. Problema

Hoje o `MonBlockDaemon` roda **dentro do processo main do Electron**, com o UID do usuário protegido (`src/main/main.ts:257-298`). Tudo que ele protege está ao alcance desse mesmo usuário:

| # | Defeito | Onde | Bypass concreto |
|---|---|---|---|
| P1 | Cofres apagáveis | `main.ts:268-277` (`userData/vaults`), `monblockd.ts:296` (`wasPaired` em memória), `state-store.ts:288` | `rm -rf ~/Library/Application\ Support/monBlock/vaults` + reabrir o app → estado limpo, sem Ajudante, pareamento novo com senha própria. |
| P2 | Relógio do sistema | `monblockd.ts:303` (expiração de concessão), `:780` (cooldown 72h), `nowFn = Date.now` | Adiantar o relógio 72h conclui o cooldown na hora; atrasar o relógio prolonga uma concessão temporária. |
| P3 | Bloqueio sem efeito | `main.ts:269-284` (`userData/enforcer`), `platform-enforcer.ts:157` (`execFile` engole erro de permissão) | Nada é gravado em `/etc/hosts`, `/Library/Managed Preferences` nem nas políticas do Firefox. Só a camada 3 (watcher de abas) bloqueia. |
| P4 | Segredos no alcance do usuário | ADR-0006: `vault.key` cifrada por `safeStorage` (Keychain de login) | O usuário lê o item do Keychain com a própria senha, decifra os cofres e obtém `hmacSecret` → gera tokens `UNLOCK-PERMANENT`. |
| P5 | Sem migração | ADR-0006 declarou "sem migração" | Instalações com cofres JSON antigos ou `MBV1.` precisam ir para o armazenamento root sem perder o Ajudante e sem abrir brecha. |
| P6 | Fail-Closed incompleto | `state-store.ts:288` aceita "nenhum cofre existe" como primeira execução | Decisão de produto pendente (§8). |

## 2. Objetivo e não-objetivos

**Objetivo:** mover estado, segredos, relógio e imposição para um processo `root` supervisionado pelo `launchd`, deixando o Electron como cliente sem privilégio via socket Unix.

**Não-objetivos (YAGNI nesta entrega):**
- Windows/Linux (o contrato `PlatformEnforcer` já existe; só macOS agora).
- SQLite (ADR-0001 §3.3): os 3 cofres continuam arquivos cifrados AES-256-GCM (`MBV1.`). Trocar formato não resolve nenhum P1–P6. A ADR-0007 registra o desvio.
- Endpoint Security / Network Extension / `pfctl`.
- Servidor remoto próprio (heartbeat externo). O único canal remoto é o Telegram já existente.
- Watcher de abas como root: AppleScript precisa da sessão GUI e da permissão TCC "Automação" do usuário. Ele continua no Electron (camada 3, best-effort).

## 3. Modelo de ameaça

### 3.1 Atores

| Ator | Capacidade | Em escopo? |
|---|---|---|
| **A1 — Usuário protegido em impulso, conta Standard** | Mata processos próprios, apaga arquivos do próprio `$HOME`, edita `userData`, lê o próprio Keychain, usa DevTools/UI. **Não** tem `sudo`. | **Sim — alvo principal. Deve ser impossível desbloquear sem o Ajudante.** |
| **A2 — Usuário protegido em impulso, conta Admin** | Tudo de A1 + `sudo`, `launchctl bootout`, `rm` em `/Library`, `chflags nouchg`, mudar relógio, desligar item em "Itens de Início". | **Parcial.** Não há como impedir root de desfazer root. Meta: **atrito alto + detecção + aviso ao Ajudante** (§3.3). |
| A3 — Outro usuário local da mesma máquina | Conecta em sockets acessíveis a todos. | Sim: não pode ler estado nem mandar comandos. |
| A4 — Malware rodando como o usuário | Igual a A1, automatizado. | Igual a A1; nada adicional. |
| A5 — Rede (Telegram MITM) | — | Fora: TLS do `fetch` já cobre. |

> **Recomendação de produto (decisão D2, §8):** o onboarding orienta o Ajudante a ser o único Admin da máquina e rebaixar a conta do usuário para Standard. Sem isso, o daemon root só eleva o atrito.

### 3.2 Superfícies e mitigação

| Superfície | Ameaça | Mitigação |
|---|---|---|
| Arquivos de estado | Apagar/editar (P1) | Diretórios `root:wheel 0700`; A1 recebe `EACCES`. Tombstone de pareamento (§7). |
| Segredos | Ler `hmacSecret`/chave (P4) | Chave dos cofres em arquivo `root:wheel 0600`; nunca sai do daemon; `toPublicState` continua sanitizando. |
| Relógio | Adiantar/atrasar (P2) | Relógio confiável assimétrico (§6). Mudar data no macOS já exige Admin; o relógio confiável cobre A2. |
| Socket IPC | A3 manda comandos; A1 força senha | Socket em diretório `root:monblock 0750`; limite de tamanho; schema estrito; **rate limit persistido de falhas de autenticação** (novo). |
| Processo daemon | `kill -9` | A1: `EPERM` (processo root). A2: `KeepAlive=true` relança; `bootout` é detectado (§3.3). |
| Binário do daemon | Trocar o código executado como root | Instalado pelo `.pkg` em caminho `root:wheel 0755`; assinado (Developer ID + hardened runtime). A1 não escreve lá. |
| `/etc/hosts` e políticas | Editar/apagar | `chflags uchg` + reaplicação periódica (60 s) e no boot, comparando SHA-256 do bloco gerenciado. |
| Electron (UI) | Cliente adulterado manda comando | Irrelevante: toda mutação que afrouxa exige credencial do Ajudante validada **no daemon**. A UI não é confiável. |

### 3.3 Detecção para A2 (Admin)

Sem servidor próprio, a detecção é "na volta":
- O daemon grava `lastHeartbeat` (tempo confiável) a cada 5 min no estado.
- No boot, se `agora − lastHeartbeat > 15 min` sem shutdown limpo registrado, envia ao Ajudante: "monBlock ficou inativo de X até Y".
- Bloco de `/etc/hosts` ou política divergente do esperado → reaplica e avisa o Ajudante (com debounce de 1 aviso/h).
- Desinstalação sem token permanente não tem como ser impedida para Admin; o próximo boot do daemon (se reinstalado) ou o silêncio do bot é o sinal. **Limite aceito e documentado.**

## 4. Arquitetura alvo

```text
UID 501 (usuário)                               UID 0 (root, launchd)
┌──────────────────────────────┐   socket Unix   ┌──────────────────────────────────────┐
│ Electron main                │  NDJSON 64 KiB  │ monblockd (Node SEA assinado)        │
│  - daemon-client.ts          │ ──────────────► │  - ipc-server.ts (schema, rate limit)│
│  - watcher de abas (camada 3)│                 │  - MonBlockDaemon (inalterado no core)│
│  - renderer (sandbox)        │ ◄────────────── │  - TripleStateStore (paths root)     │
└──────────────────────────────┘ PublicSanitized │  - TrustedClock                      │
                                     State       │  - MacOSPlatformEnforcer (paths reais)│
                                                 │  - TelegramPartnerClient             │
                                                 │  - block-server 127.0.0.1:49152      │
                                                 └──────────────────────────────────────┘
```

### 4.1 Layout em disco

| Caminho | Dono/modo | Conteúdo |
|---|---|---|
| `/Library/PrivilegedHelperTools/com.ccat.monblockd/monblockd` | `root:wheel 0755` | Binário Node SEA assinado |
| `/Library/LaunchDaemons/com.ccat.monblockd.plist` | `root:wheel 0644` | `RunAtLoad`, `KeepAlive`, `UserName=root`, `ProcessType=Background` |
| `/Library/Application Support/monBlock/` | `root:wheel 0700` | `state.primary` (cofre 1), `vault.key` (32 bytes aleatórios, `0600`), `config.json` (bot token, `0600`) |
| `/var/db/monblock/state.mirror` | `root:wheel 0600` | Cofre 2 (mesmo envelope `MBV1.`). Revisto na Fase 6: o System Keychain foi descartado (§7) |
| `/var/db/monblock/partner.seal` | `root:wheel 0600` | Cofre 3 |
| `/var/db/monblock/tombstone` | `root:wheel 0600` | Marcador "já pareado" (§7) |
| `/var/run/monblock/` | `root:monblock 0750` | Diretório do socket |
| `/var/run/monblock/monblockd.sock` | `root:monblock 0660` | Socket IPC |
| `/var/log/monblockd.log` | `root:wheel 0640` | Log sem PII (chatId mascarado) |

### 4.2 O que muda no código (reuso máximo)

- `MonBlockDaemon`, `partner-guard`, `rule-engine`, `state-store`, `platform-enforcer`, `telegram-client`: **mesmas classes**, só recebem paths/relógio/keychain diferentes por injeção (o padrão `nowFn` / `commandExecutor` / options já existe).
- `wasPaired` em memória (`monblockd.ts:218`) é substituído pela leitura do tombstone.
- `main.ts` deixa de instanciar `TripleStateStore`, `MacOSPlatformEnforcer`, `MonBlockDaemon`, `loadOrCreateVaultKey` e o `block-server`. Os `ipcMain.handle` passam a repassar para `daemon-client`.
- `safeStorage`/`vault.key` de usuário saem de uso após a migração (ADR-0006 vira "Substituída parcialmente por ADR-0007").

## 5. IPC

- **Transporte:** socket Unix `/var/run/monblock/monblockd.sock`, uma requisição por linha JSON (NDJSON), resposta idem com `id` de correlação.
- **Limites:** linha ≤ 64 KiB (fecha a conexão acima disso); timeout de leitura 5 s por conexão ociosa; máx. 8 conexões simultâneas.
- **Validação:** `type` precisa estar na união `DaemonCommand` existente; campos validados por tipo/tamanho antes de chegar ao `processCommand`. Erros em RFC 9457 (o `buildProblem` já existe).
- **Verificação do peer:**
  - Node não expõe `getpeereid`/`LOCAL_PEERCRED` sem addon nativo. A verificação é feita pelo **sistema de arquivos**: o diretório `0750 root:monblock` só deixa entrar quem está no grupo `monblock` (o usuário do console é adicionado pelo `postinstall` com `dseditgroup`). Permissão de busca em diretório é sempre respeitada pelo kernel, independentemente da semântica de permissão do próprio arquivo de socket.
  - Isso cobre A3. Contra A1/A4 a identidade do cliente **não importa**: o usuário controla todos os processos dele; a segurança está na credencial do Ajudante verificada pelo daemon.
  - `ponytail:` audit token (`LOCAL_PEERTOKEN`) + checagem de Team ID do cliente fica de fora; só compensa se surgir comando que dependa de "é a UI oficial". Exige addon N-API.
- **Rate limit de autenticação (novo):** falhas de senha/token/código de recuperação incrementam `authFailures` persistido; após 5 falhas, espera exponencial `min(2^(n-5) min, 24 h)` medida no relógio confiável. Sucesso zera.
- **Cliente (`daemon-client.ts`):** timeout de 5 s por chamada; reconexão com backoff exponencial + jitter (250 ms → 30 s); sem fila de mutações offline. Daemon inacessível → a UI mostra o estado "Proteção não verificada" e oferece "Reinstalar serviço". **Nunca há fallback para o daemon em processo** (seria bypass: `bootout` → app volta ao modo userland). Exceção só em desenvolvimento, com `MONBLOCK_DEV_INPROC=1` e `!app.isPackaged`.

## 6. Relógio confiável (P2)

Regra assimétrica: **o relógio só pode trabalhar a favor da restrição.**

| Uso | Regra | Efeito de mexer no relógio |
|---|---|---|
| Expiração de concessão temporária | `decorrido = max(Δmonotônico, Δparede)` | Adiantar só expira antes; atrasar não prolonga. |
| Cooldown 72h, rate limit, `lastHeartbeat` | `decorrido` vem do **tempo confiável** (abaixo) | Adiantar não acelera. |

**Tempo confiável:**
1. **Âncora de servidor:** cada resposta HTTPS do Telegram (`getUpdates` já é feito pelo daemon) traz o cabeçalho `Date`. O daemon guarda `(serverTimeMs, monotonicNs)` como âncora.
2. **Entre âncoras:** `agora ≈ serverTimeMs + (monotonicNs_atual − monotonicNs_âncora)`. `process.hrtime.bigint()` no macOS usa `mach_absolute_time`, que **para durante o sono** e **zera no reboot** — logo, offline, o tempo só avança enquanto a máquina está acordada. Isso é conservador (o cooldown nunca termina antes; pode demorar mais offline). Aceito.
3. **Reboot sem rede:** o daemon persiste `trustedNowMs` a cada 60 s; após reboot recomeça dele (perde, no máximo, o tempo desligado — de novo conservador). Na primeira âncora de servidor, corrige para frente.
4. **Âncora sempre vence (revisto na Fase 2):** a resposta vem por TLS do servidor, então a âncora substitui o valor atual mesmo que recue. Recuar só atrasa o cooldown (a favor da restrição); ignorar âncoras "velhas" impediria corrigir um relógio adiantado antes da instalação.

`ponytail:` NTP próprio ou Roughtime ficam de fora; o `Date` do Telegram já vem por TLS de um servidor que o daemon precisa contatar de qualquer forma.

Implementação: um módulo `src/daemon/trusted-clock.ts` com `nowForExpiry()` e `trustedNow()`; `MonBlockDaemon` recebe o relógio por injeção (substitui `nowFn`). Testes com relógios falsos.

## 7. Persistência root, segredos e tombstone (P1, P4)

- **Chave:** `vault.key` = 32 bytes de `crypto.randomBytes`, criada pelo daemon no primeiro boot, `0600 root`. Keychain não acrescenta proteção contra root/Admin, então não guarda a chave. `hmacSecret` continua dentro dos cofres cifrados; nunca cruza o IPC.
- **3 cofres:** mesmo `TripleStateStore` (`MBV1.`, HMAC, quórum, self-healing) com os caminhos da §4.1. **Revisto na Fase 6:** o cofre 2 fica em arquivo (`/var/db/monblock/state.mirror`), não no System Keychain. Sem addon nativo, o `security` só grava o segredo pelo argv (visível no `ps`, S5); `security -i` por stdin trunca a linha em ~4 KB sem erro e o prompt por stdin grava vazio (medido em 2026-11-05). O Keychain não protegia contra root/Admin; servia só para diversificar o local, e dois diretórios root (`/Library/Application Support/monBlock` e `/var/db/monblock`) cumprem esse papel.
- **Tombstone (`/var/db/monblock/tombstone`):** gravado no primeiro pareamento concluído. Conteúdo: `{ pairedAtMs, telegramChatId }`, cifrado (AES-256-GCM) com a mesma chave; ilegível conta como pareamento prévio. Substitui `wasPaired` em memória: `loadAndReconcile()` usa a existência do tombstone.
- **Gravação:** escrita atômica `.tmp` + `rename` (já existe). `ponytail:` `uchg` só no `/etc/hosts`; nos cofres ele só atrasaria um Admin (que tira a flag com um comando) e exigiria `nouchg`/`uchg` em cada gravação.

## 8. Decisões de produto pendentes

### D1 — Fail-Closed com cofres sumidos: aceitar novo pareamento?

Cenário: tombstone existe (houve Ajudante), mas 0 de 3 cofres está íntegro — sabotagem ou corrupção legítima (disco, bug, restauração de backup).

| Opção | Comportamento | Prós | Contras |
|---|---|---|---|
| **A. Recusar para sempre** | `tamperLockdown`; `INITIATE_PAIRING` → 423. Saída só reinstalando o macOS. | Bypass zero. | Corrupção legítima = máquina travada no modo restrito para sempre. Sem caminho de suporte. Viola o "sem brick" da ADR-0004. |
| **B. Re-pareamento com aprovação do Ajudante anterior ou espera de 72h** *(recomendada)* | `tamperLockdown` (regras restritivas, sem concessões). Novo pareamento só se: (1) o Ajudante anterior aprovar pelo Telegram (`chatId` recuperado do tombstone) **ou** (2) passar o cooldown de 72h no relógio confiável, com aviso ao Ajudante anterior a cada 6h e cancelamento com 1 clique. | Reusa a escada de recuperação da ADR-0004 (mesmo fluxo, mesmas 72h). Corrupção legítima se resolve em minutos (Ajudante aprova) ou 72h. Impulso não é atendido: 72h ≫ duração do impulso. | Se o tombstone também sumir (só Admin consegue), cai no caso "primeira execução" — limite de A2 aceito. 72h travado em caso de corrupção com Ajudante sumido. |
| C. Aceitar imediatamente (comportamento atual) | Estado limpo, novo pareamento livre. | Simples. | É o bypass P1. |

### D2 — Conta do usuário protegido

Recomendar (onboarding) que o Ajudante seja o único Admin e o usuário vire Standard? **Recomendado: sim, como passo opcional fortemente sugerido**, com texto honesto: "se você mantiver acesso de administrador, o monBlock só dificulta e avisa o seu Ajudante; não consegue impedir".

### D3 — Empacotamento: `.pkg` vs `SMAppService`

| Critério | `.pkg` + `/Library/LaunchDaemons` *(recomendada)* | `SMAppService.daemon` (macOS 13+) |
|---|---|---|
| Onde vive o binário root | `/Library/PrivilegedHelperTools` (`root:wheel`) | Dentro do `.app`; precisa que o `.app` seja `root`-owned para A1 não trocar o código |
| Desativação pelo usuário | Admin via `launchctl` | Interruptor em Ajustes > Itens de Início (Admin) — **mais fácil de achar em impulso** |
| Instalação | Instalador clássico (pede senha Admin uma vez) | Arrasta pra `/Applications` + aprova em Ajustes |
| Código extra | `pkgbuild`/`productbuild` + `postinstall` shell | Ponte Swift/ObjC para chamar `SMAppService` a partir do Electron (addon nativo) |
| ADR-0001 | Já prevê `.pkg` | Desvio |

Recomendação: `.pkg`. Ambos mostram o item em "Itens de Início" (BTM no macOS 13+); o `.pkg` não exige addon nativo e instala o app inteiro como `root:wheel`.

### D4 — Daemon inacessível

UI em "Proteção não verificada", sem fallback em processo (ver §5). Confirmação de que essa é a experiência desejada.

## 9. Imposição no sistema (P3)

| Alvo | Caminho | Notas / risco a validar no spike |
|---|---|---|
| hosts | `/etc/hosts` | Só o bloco entre `# BEGIN monBlock` e `# END monBlock` é gerenciado; linhas do usuário preservadas. `uchg` após escrever. `dscacheutil -flushcache` + `killall -HUP mDNSResponder`. |
| Chrome / Brave / Edge | **Perfil `.mobileconfig`** com os payloads `com.google.Chrome`, `com.brave.Browser` e `com.microsoft.Edge`, instalado no onboarding (aprovação do usuário em Ajustes; remover exige Admin). Reforço: escrita direta em `/Library/Managed Preferences/` reaplicada no boot e a cada 60 s. | S1: plist escrito à mão sem MDM tende a ser removido. Como o perfil só muda quando o usuário aprova de novo, ele contém a lista **de categorias** (estável) e domínios customizados ficam só no hosts. 🟡 medir `chrome://policy` após reboot na CI. |
| Firefox | `/Library/Preferences/org.mozilla.firefox.plist` (`EnterprisePoliciesEnabled = TRUE`, chaves aninhadas com `__`) | S2 🟢: documentado pela Mozilla, não toca no bundle. |
| Safari | — | Sem política de bloqueio por domínio; coberto só pelo hosts. |

`MacOSPlatformEnforcer` passa a **propagar** erro de `execFile` quando roda como root (hoje engole em `platform-enforcer.ts:157`), para o daemon saber que a imposição falhou e avisar.

## 10. Migração (P5)

Feita **uma vez**, iniciada pelo Electron (só ele tem a chave antiga no Keychain de login), executada pelo daemon.

1. Electron detecta `userData/vaults/` e o daemon acessível.
2. Electron lê e valida localmente:
   - `MBV1.` → decifra com a chave do `safeStorage`, valida HMAC.
   - JSON legado (envelope em texto puro, chave fixa conhecida) → valida HMAC com a chave antiga.
3. Envia `MIGRATE_LEGACY_STATE { format, state, migrationId }`.
4. Daemon aceita **só se** o armazenamento root estiver vazio **e** não houver tombstone; caso contrário, 409.
5. Tratamento, porque o payload vem do usuário (não confiável):
   - **Regras:** mescla só restritiva com o padrão Fail-Closed (`união` de categorias/domínios/palavras; `lockIncognito = true`; allowlist e concessões descartadas).
   - **`MBV1.`:** credenciais do Ajudante aceitas (o usuário já podia forjá-las em userland; a migração não piora nada) e o daemon avisa o `chatId` migrado que o monBlock passou para o modo protegido. **Revisto na Fase 7:** sem botões de confirmação, porque a mensagem vai ao chat do próprio payload (um payload forjado a mandaria a quem forjou).
   - **JSON legado:** HMAC com chave pública não prova nada → credenciais descartadas, só regras migram; o usuário pareia de novo.
6. Sucesso → Electron renomeia `vaults/` para `vaults.migrated-<data>/` e apaga `vault.key` do usuário. Idempotente por `migrationId` (repetição devolve o mesmo resultado).
7. Falha em qualquer passo → nada é apagado em userland; a UI mostra erro e tenta de novo no próximo boot.

## 11. ADR-0007 proposta

**"Daemon root distribuído por `.pkg` (Node SEA), IPC por socket com permissão de diretório, relógio confiável e tombstone de pareamento."** Registra: D1–D4 decididos; desvio de SQLite → arquivos `MBV1.`; ADR-0006 substituída na parte de chave (`safeStorage` → arquivo root); limite honesto contra Admin.

## 12. Rollback e desinstalação

- **Desinstalação autorizada:** `UNINSTALL_AUTHORIZED` exige token `UNLOCK-PERMANENT` (já existe). O daemon: remove o bloco do hosts, remove as políticas, `nouchg` + apaga cofres/tombstone/keychain, avisa o Ajudante, roda `/Library/PrivilegedHelperTools/com.ccat.monblockd/uninstall.sh` desacoplado (`launchctl bootout system/com.ccat.monblockd`, remove plist, binário, grupo `monblock`, `/Applications/monBlock.app`).
- **Desinstalação não autorizada (Admin):** não é impedível; coberta pela detecção da §3.3.
- **Rollback de release:** reinstalar o `.pkg` anterior. O estado tem `schemaVersion`; o daemon novo grava `state.primary.v<n>.bak` antes de migrar o schema e o daemon antigo recusa schema mais novo **mantendo** a última imposição aplicada (Fail-Closed, nunca libera). Migrações de schema só para frente.
- **Rollback de desenvolvimento:** `scripts/dev-uninstall.sh` (sudo) só em build não assinado — não vai no `.pkg`.

## 13. Estratégia de testes

| Nível | O quê | Como |
|---|---|---|
| Unitário (vitest, sem root) | `TrustedClock` (adiantar/atrasar/sono/reboot/âncora velha), rate limit, tombstone + D1, mescla restritiva da migração, bloco gerenciado do hosts (preserva linhas do usuário), validação NDJSON (tamanho, tipo, JSON inválido) | Relógios e `commandExecutor` falsos, `tmpdir` — padrão atual dos testes |
| Integração (vitest, sem root) — sockets em diretório curto (`sun_path` ≤ 104 bytes, achado do S4) | `ipc-server` + `daemon-client` reais num socket em `tmpdir`; reconexão; timeout; 8 conexões; daemon morto → UI "não verificada" | Processo filho com o entry do daemon apontado para paths temporários |
| E2E root (CI `macos-latest`, `sudo` sem senha) | Instala `.pkg` (`installer -allowUntrusted` em build de CI), confere `/etc/hosts`, `kill -9` → relançado em < 5 s, usuário Standard criado no runner recebe `EACCES` ao apagar cofres e ao `kill`, desinstala e confere hosts limpo | Script `tests/e2e/root/*.sh` |
| Manual (checklist) | Gatekeeper/notarização, aviso BTM, Managed Preferences após reboot, Firefox, migração com cofres reais | `docs/ai/reports/` no fim de cada fase |

Meta ≥ 80% nas unidades novas. Os 74 testes atuais continuam verdes (o core não muda de interface).

## 14. Critérios de aceite (BDD)

- **Dado** usuário Standard pareado, **quando** ele roda `rm -rf "/Library/Application Support/monBlock"`, **então** recebe `Permission denied` e o bloqueio segue igual.
- **Dado** usuário Admin pareado, **quando** apaga os 3 cofres e reinicia, **então** o daemon entra em `tamperLockdown`, recusa novo pareamento (D1-B) e avisa o Ajudante.
- **Dado** cooldown iniciado, **quando** o relógio é adiantado 72h, **então** `remainingHours` não muda.
- **Dado** concessão de 15 min, **quando** o relógio é atrasado 1h, **então** a concessão expira em ≤ 15 min reais.
- **Dado** categoria `adult` ativa, **quando** o daemon sobe, **então** `/etc/hosts` contém o bloco gerenciado e o arquivo tem `uchg`.
- **Dado** Electron fechado ou morto, **então** o bloqueio por hosts/políticas continua.
- **Dado** usuário de outra conta local, **quando** conecta no socket, **então** `EACCES`.
- **Dado** 5 senhas erradas, **quando** a 6ª chega em < 1 min, **então** 429 sem verificar a senha.
- **Dado** cofres `MBV1.` válidos em `userData`, **quando** o daemon é instalado, **então** regras e Ajudante migram, o Ajudante recebe a confirmação e `userData/vaults` vira `vaults.migrated-*`.
