<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-05 | Matheus Diniz  | Criação da ADR 0007 a partir da spec do daemon root (v2, após spikes).
================================================================================
-->

# ADR 0007: Daemon Root Distribuído por `.pkg` (Node SEA), IPC por Socket com Permissão de Diretório, Relógio Confiável e Tombstone de Pareamento

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-05) |
| **Decisores** | Matheus Diniz |
| **Tags** | `security`, `daemon`, `ipc`, `packaging`, `macos` |
| **Impacto Sistêmico** | Alto (`monblockd`, `main.ts`, `state-store.ts`, `platform-enforcer.ts`, instalador) |
| **ADRs Relacionadas** | Implementa ADR-0001; substitui parcialmente ADR-0006 (chave via `safeStorage`); revisa ADR-0002 (camada 2) e ADR-0004 (re-pareamento) |

## Contexto

Em userland o usuário protegido controla arquivos, Keychain de login, relógio e processo do Electron. O review de 2026-11-05 mostrou seis bypasses que só um processo root resolve: cofres apagáveis com `wasPaired` só em memória, `Date.now()` manipulável, imposição gravada em `userData`, `hmacSecret` decifrável pelo usuário, falta de migração e re-pareamento livre após perda dos cofres. Detalhes em `docs/ai/specs/2026-11-05-daemon-root-design.md`.

## 2. Decisão de Arquitetura

1. **Empacotamento:** `.pkg` instala o app e o daemon como `root:wheel`. Daemon em `/Library/PrivilegedHelperTools/com.ccat.monblockd/monblockd` (Node SEA, um binário por arquitetura unido por `lipo`, hardened runtime + `com.apple.security.cs.allow-jit`), plist em `/Library/LaunchDaemons` com `KeepAlive`. `SMAppService` foi descartado: exige addon nativo e expõe um interruptor fácil em Ajustes.
2. **IPC:** socket Unix NDJSON em `/var/run/monblock/` (`root:monblock 0750`, socket `0660`). O kernel do macOS respeita as permissões do diretório e do socket (spike S4). Sem `getpeereid`/audit token: a identidade do cliente não protege contra o próprio usuário; a segurança está na credencial do Ajudante validada no daemon, agora com rate limit persistido.
3. **Relógio confiável assimétrico:** concessões expiram por `max(Δmonotônico, Δparede)`; cooldown, rate limit e heartbeat usam o cabeçalho `Date` do Telegram como âncora + tempo monotônico.
4. **Persistência:** os 3 cofres `MBV1.` continuam (SQLite da ADR-0001 descartado: não resolve nenhum bypass). Chave em arquivo `root 0600`. Cofre 2 em `/var/db/monblock/state.mirror` (revisto na Fase 6: sem addon nativo, o `security` expõe o segredo no argv ou trunca em ~4 KB por stdin; o Keychain não protegia contra root). Tombstone cifrado substitui `wasPaired`.
5. **Re-pareamento após perda dos cofres (D1-B):** só com aprovação do Ajudante anterior pelo Telegram ou após 72h no relógio confiável, com avisos.
6. **Navegadores (revisa ADR-0002):** Chromium via perfil `.mobileconfig` (o macOS remove plists não-MDM em `/Library/Managed Preferences`, spike S1); Firefox via `/Library/Preferences/org.mozilla.firefox.plist`.
7. **Sem fallback** para o daemon em processo quando o socket cai (só em dev, com `MONBLOCK_DEV_INPROC=1`).
8. **Migração única** dos cofres de userland: mescla só restritiva; credenciais apenas de `MBV1.` com confirmação do Ajudante.

## Consequências

- **Positivas:** usuário Standard não apaga cofres, não lê segredos, não mata o daemon e não acelera o cooldown; bloqueio por hosts vale para o sistema todo.
- **Negativas:** instalador privilegiado; binário de ~236 MB universal; RSS estimado `< 120 MB` (a meta de 50 MB da ADR-0001 deixa de valer); perfil de navegador precisa de aprovação do usuário.
- **Limite conhecido:** usuário **Admin** consegue desfazer root. A resposta é atrito + detecção na volta (heartbeat, verificação de hosts) + aviso ao Ajudante; o onboarding recomenda que o Ajudante seja o único Admin (D2).
- **Aceito:** na migração, quem tem a chave antiga pode forjar um `MBV1.` com Ajudante próprio. É um evento único e não piora o estado atual.
