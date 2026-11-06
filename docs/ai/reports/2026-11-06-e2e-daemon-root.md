# Relatório — E2E e checklist manual do daemon root (Fase 9)

- **Data:** 2026-11-06
- **Plano:** `docs/ai/plans/2026-11-05-daemon-root.md` (Fase 9)
- **Branch:** `claude/plan-daemon-root-5adf07`
- **Status:** E2E automatizado **verde na CI** (run 42211839711 falhou no passo 5 por bug do roteiro, corrigido em `78482ca`; run 42212580701 em `e96a66f`: 7/7 passos). Checklist manual pendente.

## 1. O que já foi verificado nesta sessão (sem root)

| Verificação | Como | Resultado |
|---|---|---|
| Suíte unitária e de integração | `npm test` | 127/127 |
| Daemon real por socket (modo dev) | `dist/daemon/entry.js` com `MONBLOCK_DEV_ROOT_DIR` | `GET_STATE` 200, hosts aplicado, `SIGTERM` limpo |
| Binário SEA, fatia arm64 | `build/.../monblockd` no modo dev | socket + hosts + página de bloqueio; RSS 54 MB |
| Binário SEA, fatia x86_64 (Rosetta) | `arch -x86_64` | socket + hosts (após entitlement extra) |
| Migração `MBV1.` → root | cofres reais + daemon dev + `migrateLegacyVaults` | Ajudante e regras migrados; allowlist descartada |
| Scripts do instalador e E2E | `sh -n` + `shellcheck` 0.11 | sem avisos |
| `nc -U` como sonda de permissão | daemon dev, diretório `000` | 0 conectando, 1 negado |
| Electron sem daemon | `npx electron .` 8 s | sem erro no log (tela não conferida) |

## 2. E2E automatizado (`tests/e2e/root/run.sh`)

Roda como root num runner descartável. Critérios BDD da spec §14 cobertos:

| Passo | Prova |
|---|---|
| 1. Instalação | `installer` + `launchctl print` em `state = running` + socket respondendo |
| 2. Permissões | donos/modos de `Application Support`, `/var/db/monblock`, `/var/run/monblock`, socket, `vault.key`, binário; nenhum `._*` instalado |
| 3. Imposição | bloco do monBlock e `uchg` em `/etc/hosts`; plist do Firefox |
| 4. `kill -9` | launchd relança com PID novo e socket de volta em ≤ 20 s |
| 5. Usuário Standard | `rm` dos cofres, `kill` do daemon, escrita no hosts e conexão ao socket negados (com controle positivo do `nc` como root); informa se o usuário do console entrou no grupo `monblock` |
| 6. Desinstalação autorizada | senha errada → 403; certa → 200; hosts limpo, job descarregado, arquivos removidos |
| 7. Cofres apagados por Admin | `tamperLockdown` e novo pareamento → 423 (D1-B) |

Resultado na CI (`macos-latest`, `e96a66f`): todos os passos passaram; o usuário do console do runner (`runner`) entrou no grupo `monblock` pelo `postinstall`, e nenhum `._*` foi instalado (a dúvida da Fase 8 se resolveu). Ainda falta confirmar, no checklist, se a entrada no grupo vale para o Electron sem novo login.

Não cobre (fica no checklist): Telegram (sem bot token na CI), Gatekeeper/notarização (sem Developer ID), reboot, navegadores reais.

## 3. Checklist manual (máquina de teste, não a de uso diário)

Marcar com data e resultado. Qualquer "não" vira issue antes do release.

- [ ] **Gatekeeper/notarização:** `.pkg` assinado com Developer ID Installer e binário com Developer ID Application + `notarytool`; abrir o `.pkg` baixado pela web não mostra aviso de desenvolvedor não identificado.
- [ ] **Itens de Início (BTM):** após instalar, Ajustes > Geral > Itens de Início lista o monBlock; desligar ali exige senha de Admin.
- [ ] **Perfil dos navegadores:** o `postinstall` abre o `.mobileconfig`; após aprovar em Ajustes, `chrome://policy` mostra `URLBlocklist` e `DnsOverHttpsMode=off`; **continua após reiniciar** (spike S1).
- [ ] **Remover o perfil** como usuário Standard pede senha de Admin.
- [ ] **Firefox:** `about:policies` mostra `WebsiteFilter` e `DNSOverHTTPS` bloqueado.
- [ ] **Safari:** domínio da categoria `adult` não abre (só hosts).
- [ ] **Grupo `monblock` sem novo login:** logo após instalar, o Electron conecta (estado "Proteção ativa", não "Proteção não verificada"). Se exigir logout, documentar no instalador.
- [ ] **Migração com cofres reais** de uma instalação 0.1.0: Ajudante mantido, aviso chega no Telegram, `userData/vaults` vira `vaults.migrated-*`.
- [ ] **Relógio:** iniciar o cooldown, adiantar a data do sistema 3 dias (Admin) → o app continua mostrando ~72h.
- [ ] **Inatividade:** `sudo launchctl bootout system/com.ccat.monblockd`, esperar 20 min, `bootstrap` de novo → Ajudante recebe "monBlock ficou inativo".
- [ ] **Adulteração:** apagar o bloco do `/etc/hosts` como Admin → volta em ≤ 60 s e o Ajudante recebe o aviso (no máximo 1 por hora).
- [ ] **Mac Intel real** (não Rosetta): daemon sobe com a fatia x86_64.
- [ ] **Desinstalação pelo app** com token `UNLOCK-PERMANENT`: hosts limpo, perfil removido, nada em `/Library/PrivilegedHelperTools`.

## 4. Pendências conhecidas (fora desta entrega)

- Empacotar o app Electron (`/Applications/monBlock.app`) com o `monblockd.pkg` dentro, para o botão "Reinstalar serviço".
- Aviso ao Ajudante anterior a cada 6h durante o cooldown de re-pareamento (D1-B).
- Provisionar o bot token do Telegram no `config.json` root.
- Página de bloqueio na porta 80/443 (hoje 49152, que o redirecionamento do hosts não alcança).
- Revogação de concessões no sono vinda do daemon (hoje vem do `powerMonitor` do Electron).
