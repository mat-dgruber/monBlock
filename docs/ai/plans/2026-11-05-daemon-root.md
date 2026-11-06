# Plano — Daemon root `monblockd`

- **Data:** 2026-11-05
- **Spec:** `docs/ai/specs/2026-11-05-daemon-root-design.md`
- **Status:** v2 aprovada (2026-11-05), após spikes
- **Pré-requisito:** decisões D1–D4 da spec §8 confirmadas. O plano assume as recomendações (D1-B, D2 sim, D3 `.pkg`, D4 sem fallback).

## Objetivo

Tirar estado, segredos, relógio e imposição do processo Electron (UID do usuário) e levá-los para o `monblockd` como root sob `launchd`. Isso fecha os bypasses P1–P6 da spec §1: apagar cofres, mexer no relógio, bloqueio sem efeito no sistema, `hmacSecret` legível, falta de migração e re-pareamento livre.

## Restrições

- macOS 13+ (BTM/Itens de Início); só Apple Silicon e Intel com Node 24 SEA (um binário por arquitetura, unidos por `lipo -create`).
- Sem dependência **de runtime** nova (`postject` entra só como `devDependency` de build); sem addon nativo (sem `getpeereid`/audit token).
- Daemon: `< 120 MB` RSS (S3: um script trivial já usa 44 MB), `< 1%` CPU em repouso, boot com regras reaplicadas em `< 1 s`.
- IPC: ≤ 64 KiB por mensagem, 5 s de timeout, ≤ 8 conexões; comandos serializados pela `commandQueue` existente (sem corrida em disco entre conexões).
- Segredos de assinatura/notarização só via `op run --` ou segredos da CI.
- Contra conta Admin: só atrito + detecção (spec §3.1). Não prometer mais que isso na UI.

## Pontos cegos tratados (crítica)

| Achado | Tratamento |
|---|---|
| Telegram fora do ar → aprovação do D1 impossível | O caminho alternativo de 72h não depende do Telegram; o relógio offline só avança acordado (conservador). |
| Durante a migração, A1 pode forjar um `MBV1.` com um Ajudante próprio (ele tem a chave) | Aceito: é um evento único, igual ao risco atual em userland. Depois da migração o root protege. Registrado na ADR-0007. |
| Electron e daemon fazendo `getUpdates` com o mesmo bot → 409 do Telegram | Na Fase 6 o polling sai do Electron por completo. |
| Disco cheio no meio do `save` | Escrita atômica por cofre + quórum 2 de 3; falha no `save` → resposta 503 e a mutação não é confirmada. |
| Daemon velho lendo schema novo após rollback | Recusa e mantém a última imposição (Fail-Closed), spec §12. |

Regras de execução: TDD (teste vermelho → verde) em cada fase com lógica; um commit Conventional por fase; `npm run typecheck && npm test` verdes antes de cada commit; `graphify update .` após mudanças estruturais. Cada fase deixa o app funcionando: o modo em processo continua sendo o padrão até a Fase 6 trocar.

---

## Fase 0 — Spikes (sem código de produção)

Validar o que a spec marcou com 🟡 antes de escrever código que depende disso.

| Spike | Pergunta | Saída |
|---|---|---|
| S1 | Plist escrito à mão em `/Library/Managed Preferences/` sobrevive ao reboot no macOS 15/26? Chrome/Brave/Edge o aplicam? | sim/não + alternativa |
| S2 | Firefox: `org.mozilla.firefox.plist` em `/Library/Preferences` vs `distribution/policies.json` — qual aplica sem quebrar a assinatura? | caminho escolhido |
| S3 | Node SEA (Node 22) com `codesign --options runtime` + notarização roda como LaunchDaemon? Tamanho final? | receita de build |
| S4 | Socket em diretório `0750 root:monblock`: um usuário fora do grupo recebe `EACCES` no `connect`? | confirmação |
| S5 | `security add-generic-password` no System Keychain como root: limite de tamanho do payload `MBV1.`? | limite |

**Pronto:** `docs/ai/reports/2026-11-05-spikes-daemon-root.md` com respostas. Uma resposta "não" em S1–S3 → atualizar a spec, rodar `/plan-criticize` e pedir aprovação de novo antes da Fase 1.

## Fase 1 — ADR-0007 e docs de domínio

- `docs/adrs/0007-daemon-root-pkg-ipc-relogio-confiavel.md` (MADR, conteúdo da spec §11).
- ADR-0006 → status "Substituída parcialmente por ADR-0007"; ADR-0001 → nota sobre o desvio de SQLite.
- `docs/domains/daemon_persistence/{business-rules,tech-design}.md`: RN de tombstone, relógio, rate limit, migração.

**Pronto:** commit `docs(adr): registrar adr-0007 do daemon root`.

## Fase 2 — `TrustedClock` (resolve P2, ainda em userland)

- **Novo:** `src/daemon/trusted-clock.ts` — `nowForExpiry()`, `trustedNow()`, `ingestServerDate(header)`, `snapshot()/restore()` para persistir `trustedNowMs`. Dependências injetáveis: `wallNow`, `monoNowNs`.
- **Alterar:** `monblockd.ts` — `MonBlockDaemonOptions.clock` substitui `nowFn` (manter `nowFn` como atalho de teste que constrói um relógio falso, para não reescrever os testes atuais). Expiração de concessões usa `nowForExpiry`; cooldown usa `trustedNow`.
- **Alterar:** `telegram-client.ts` — expor o cabeçalho `Date` da resposta para `ingestServerDate`.
- **Testes:** `tests/daemon/trusted-clock.test.ts` — adiantar 72h não conclui o cooldown; atrasar 1h não prolonga a concessão; âncora retrocedendo > 5 min é ignorada; restore após "reboot" não regride.

**Pronto:** testes novos e os 74 atuais verdes; commit `feat(daemon): relógio confiável assimétrico`.

## Fase 3 — Tombstone, D1 e rate limit (resolve P1/P6 na lógica)

- **Alterar:** `state-store.ts` — `TripleStateStoreOptions.tombstonePath`; `writeTombstone()`, `readTombstone()`; `loadAndReconcile` usa o tombstone no lugar de `expectPaired`.
- **Alterar:** `monblockd.ts` — remover `wasPaired`; gravar o tombstone no `PAIR_PARTNER`; em `tamperLockdown` com tombstone, `INITIATE_PAIRING` exige aprovação do Ajudante anterior (Telegram) **ou** cooldown 72h concluído (reusar `evaluateEmergencyCooldown`); campo `authFailures` + bloqueio exponencial em `checkPartnerAuth`.
- **Alterar:** `MonBlockPersistentState` — `authFailures`, `authLockedUntilMs`, `lastHeartbeatMs`, `schemaVersion` (padrões em `createDefaultPersistentState`; cofres sem os campos leem como 0/null).
- **Testes:** cofres apagados com tombstone → 423 no pareamento; aprovação do Ajudante anterior libera; 72h libera; 6ª tentativa em < 1 min → 429 sem chamar `verifyPartnerPassword`.

**Pronto:** commit `fix(daemon): persistir pareamento em tombstone e limitar tentativas`.

> **Execução (2026-11-05):** a "aprovação do Ajudante anterior" é o próprio `INITIATE_PAIRING` com o mesmo `chatId` do tombstone: só ele responde `/senha` daquele chat. `PAIR_PARTNER` (sem Telegram) e troca de Ajudante exigem as 72h. Um novo pareamento zera o cooldown, para que um cooldown antigo não autorize desinstalação depois. Tombstone ilegível conta como pareamento prévio sem chatId. Ficaram para a Fase 6, onde serão usados: `lastHeartbeatMs`, `schemaVersion` e o aviso ao Ajudante anterior a cada 6h (precisa do timer do daemon).

## Fase 4 — Imposição em caminhos reais (P3)

- **Alterar:** `hosts-enforcer.ts` — bloco gerenciado `# BEGIN/END monBlock`, merge que preserva linhas do usuário; `nouchg` → escrita atômica → `uchg`; flush de DNS.
- **Alterar:** `platform-enforcer.ts` — gerador do perfil `.mobileconfig` (categorias → payloads Chrome/Brave/Edge) + escrita direta em `/Library/Managed Preferences/` como reforço (S1); Firefox via `/Library/Preferences/org.mozilla.firefox.plist` com `EnterprisePoliciesEnabled` (S2), substituindo o `policies.json`; executor padrão **propaga** erro quando `process.getuid() === 0` (hoje engole); `verifyApplied()` compara o SHA-256 do bloco/arquivos.
- **Testes:** merge do hosts (linhas do usuário intactas, bloco substituído, idempotente); erro do executor sobe quando root; `verifyApplied` detecta divergência. Tudo em `tmpdir` com executor falso.

**Pronto:** commit `feat(enforcer): aplicar bloqueio em /etc/hosts e políticas do sistema`.

> **Execução (2026-11-05):** hosts e políticas só são regravados quando o conteúdo muda (o watchdog de 60 s não gera escrita nem flush de DNS à toa). `generateBrowserMobileconfig` gera o perfil com UUIDs estáveis (validado com `plutil -lint`); a instalação do perfil é na Fase 8. O `main.ts` continua apontando para `userData/enforcer` até a Fase 6 ligar os caminhos reais (`/etc/hosts`, `/Library/Managed Preferences/<bundleId>.plist`, `/Library/Preferences/org.mozilla.firefox.plist`). `generateFirefoxPoliciesJson` foi removido.

## Fase 5 — Servidor e cliente IPC

- **Novo:** `src/daemon/ipc-server.ts` — `net.createServer` no path recebido; NDJSON; linha ≤ 64 KiB; 5 s de ociosidade; ≤ 8 conexões; validação por `type` antes de `daemon.handleCommand`; erros RFC 9457 com `buildProblem`.
- **Novo:** `src/main/daemon-client.ts` — `call(cmd)` com timeout de 5 s, reconexão com backoff + jitter (250 ms → 30 s), evento `status: 'online' | 'offline'`.
- **Testes de integração:** servidor + cliente reais em socket temporário num diretório curto (`sun_path` ≤ 104 bytes): ida e volta; payload > 64 KiB fecha; JSON inválido → 400; servidor morto → cliente `offline` e reconecta quando volta; nona conexão recusada.

**Pronto:** commit `feat(ipc): socket unix entre electron e monblockd`.

## Fase 6 — Entry root e corte do Electron

- **Novo:** `src/daemon/entry.ts` — exige `getuid() === 0` (sai com erro caso contrário, exceto `MONBLOCK_DEV_ROOT_DIR` em build de dev); `umask 077`; cria/valida dono e modo dos diretórios da spec §4.1; carrega `vault.key` (cria se não existir), `config.json`; instancia store/enforcer/clock/telegram/daemon/`block-server`; aplica regras no boot; timers: reaplicar + `verifyApplied` a cada 60 s, heartbeat a cada 5 min, persistir `trustedNowMs` a cada 60 s; detecção de inatividade (§3.3); `SIGTERM` → grava shutdown limpo e fecha o socket.
- **Novo:** adaptador do System Keychain para o cofre 2 (`/usr/bin/security -i` com comandos por stdin; segredo nunca no argv), injetado no `TripleStateStore` (o store hoje só lê arquivos: introduzir uma interface mínima `VaultIO { read(); write() }` com 2 implementações, arquivo e keychain).
- **Alterar:** `main.ts` — remover store/enforcer/daemon/`loadOrCreateVaultKey`/`block-server`; `ipcMain.handle` → `daemonClient.call`; estado "Proteção não verificada" na UI quando offline; `MONBLOCK_DEV_INPROC=1` + `!app.isPackaged` mantém o modo antigo só em dev.
- **Alterar:** renderer — estado offline + botão "Reinstalar serviço" (abre o `.pkg`).
- **Testes:** entry com `MONBLOCK_DEV_ROOT_DIR` em `tmpdir` sobe, responde `GET_STATE` pelo socket e aplica as regras no executor falso; a UI mostra "não verificada" com o daemon parado.

**Pronto:** commit `feat(daemon): rodar monblockd como processo root separado`.

## Fase 7 — Migração (P5)

- **Alterar:** `monblockd.ts` — comando `MIGRATE_LEGACY_STATE` (spec §10): só com store vazio e sem tombstone; mescla restritiva; credenciais só de `MBV1.`; confirmação ao Ajudante pelo Telegram; idempotente por `migrationId`.
- **Novo em `main.ts`:** detecção de `userData/vaults`, leitura com a chave antiga (`safeStorage`) ou com a chave fixa legada, envio, renomeação para `vaults.migrated-<data>` em caso de sucesso.
- **Testes:** `MBV1.` migra tudo; JSON legado migra só regras; tentar afrouxar (allowlist, `lockIncognito:false`) é ignorado; segunda chamada com o mesmo `migrationId` → mesma resposta; store não vazio → 409; "Não reconheço" descarta o pareamento.

**Pronto:** commit `feat(storage): migrar cofres de userland para o daemon root`.

## Fase 8 — Empacotamento e desinstalação

- **Novo:** `packaging/macos/com.ccat.monblockd.plist`, `packaging/macos/scripts/{preinstall,postinstall}` (cria o grupo `monblock`, adiciona o usuário do console, `launchctl bootstrap system`), `packaging/macos/uninstall.sh`, `scripts/build-daemon-sea.sh` (SEA por arquitetura, entitlement `com.apple.security.cs.allow-jit`, `lipo -create`), `packaging/macos/monblock-browsers.mobileconfig` (gerado a partir das categorias), `scripts/build-pkg.sh` (`pkgbuild` + `productbuild`).
- **Alterar:** `UNINSTALL_AUTHORIZED` → limpeza completa + disparo desacoplado do `uninstall.sh` (spec §12).
- **CI:** job macOS que gera o `.pkg` sem assinatura; assinatura e notarização com segredos do GitHub (Developer ID e notarytool via `op` localmente, nunca no repositório).
- **Testes:** `shellcheck` nos scripts; teste unitário da sequência de limpeza com executor falso.

**Pronto:** commit `build(pkg): instalador macos do monblockd`.

## Fase 9 — E2E root e checklist manual

- `tests/e2e/root/install.sh`, `kill.sh`, `standard-user.sh`, `uninstall.sh` rodando no `macos-latest` (sudo sem senha): critérios BDD da spec §14 que não dependem do Telegram.
- Checklist manual (Gatekeeper, BTM, reboot com Managed Preferences, Firefox, migração com cofres reais) → `docs/ai/reports/2026-11-05-e2e-daemon-root.md`.

**Pronto:** E2E verde na CI + checklist preenchido; CHANGELOG `0.2.0` (MINOR: novo modo de instalação; o contrato do IPC é interno).

---

## Riscos e rollback por fase

| Fase | Risco | Rollback |
|---|---|---|
| 2–4 | Regressão no core | Fases independentes, em processo; `git revert` do commit da fase. |
| 4 | Política de navegador limpa pelo macOS (S1) | Hosts continua; reaplicação a cada 60 s; alternativa `.mobileconfig` fica documentada. |
| 6 | Daemon não sobe → app sem proteção | UI mostra "não verificada"; `.pkg` anterior reinstalável; em dev, `MONBLOCK_DEV_INPROC`. |
| 7 | Migração perde o Ajudante | Nada em userland é apagado antes do sucesso; `vaults.migrated-*` fica no disco. |
| 8 | `postinstall` falha no meio | Script idempotente; `preinstall` faz `bootout` de instalação anterior. |

## Fora deste plano (follow-ups)

- Página de bloqueio na porta 80/443 (hoje é 49152, que o redirecionamento do hosts não alcança).
- Bot token do Telegram: hoje vem de env; definir provisionamento no `config.json` root.
- Watcher de abas como LaunchAgent com `KeepAlive`.
- Audit token + checagem de Team ID no socket (addon N-API).
