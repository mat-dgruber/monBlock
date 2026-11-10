# Plano de Implementação: Atualização Constante e Notificações Nativas no macOS

**Data:** 2026-11-09  
**Status:** Em Execução  
**Referência da Spec:** `docs/ai/specs/2026-11-09-atualizacao-e-notificacoes-design.md`  
**Governança:** Padrão canônico em `docs/ai/plans/`, Clean Code, TDD e arquitetura Zero-Trust.

---

## 1. Escopo e Objetivos

Materializar os subsistemas aprovados na especificação técnica:
1. **Notificações Nativas (`src/main/notifications.ts`):** Envio seguro e com throttle anti-spam (60s) via `Notification` do Electron para eventos do sistema (updates, Ajudante, cooldown).
2. **In-App Updater (`src/main/updater.ts`):** Verificação SemVer via GitHub Releases HTTPS, download atômico com validação criptográfica SHA-256 e acionamento seguro do instalador `.pkg` via `shell.openPath()`.
3. **Ponte Segura Preload (`src/preload/`):** Exposição tipada e congelada dos novos métodos IPC sem vazamento de módulos Node.
4. **Interface e UX (`src/renderer/`):** Indicador visual no campinho de versão da sidebar e modal acessível `<dialog id="updateDialog">` com barra de progresso.
5. **Suíte de Testes Automatizados AAA:** Testes unitários para `notifications`, `updater`, `preload` e UI.

---

## 2. Restrições Técnicas & Invariantes

- **Invariante de Bloqueio:** O processo de update nunca interrompe ou altera as regras de bloqueio do daemon root `/var/run/monblock/`.
- **Zero Vazamento IPC:** O Renderer opera sob `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`. Todas as chamadas de rede para update residem no processo Main.
- **Integridade Criptográfica:** O `.pkg` baixado só é disponibilizado para execução se o hash SHA-256 coincidir exatamente com o checksum oficial da release.

---

## 3. Matriz de Alternativas

| Alternativa | Prós | Contras | Decisão |
| :--- | :--- | :--- | :--- |
| **A: Download Assistido de `.pkg` via Releases HTTPS (Selecionada)** | Atualiza app e daemon root atomicamente; zero dependências externas; sem risco de corrupção do app em voo. | Exige confirmação de admin pelo usuário via instalador oficial do macOS. | **Adotada** por alinhamento estrito à arquitetura Privileged Helper do monBlock. |
| **B: Squirrel.Mac / electron-updater** | Atualização automática sem pedir senha. | Atualiza apenas o executável do app em userland; não atualiza o daemon root, quebrando compatibilidade. | **Rejeitada** por incompatibilidade com componentes root. |
| **C: Notificações no Renderer (HTML/CSS banners)** | Funciona em qualquer plataforma sem permissão de OS. | Invisível com a janela fechada na barra de menus (Tray). | **Descartada** para eventos prioritários que exigem atenção fora do app. |

---

## 4. Fases de Execução

### Fase 1: Módulo de Notificações Nativas (`src/main/notifications.ts`)
- Implementar `AppNotificationManager` com verificação de `Notification.isSupported()`, mapa de throttle temporal (`THROTTLE_MS = 60_000`) e suporte a som/silencioso.
- Criar suíte de testes unitários AAA em `tests/main/notifications.test.ts`.

### Fase 2: Módulo do Updater (`src/main/updater.ts`)
- Implementar `compareSemver(v1, v2)` resiliente.
- Implementar `checkForAppUpdates(currentVersion, repo)` com timeout de 10s e tratamento de rate-limit (HTTP 403).
- Implementar `downloadAppUpdatePkg(pkgUrl, expectedSha256, onProgress)` baixando para arquivo temporário, validando hash SHA-256 via stream `crypto.createHash` e renomeando com segurança.
- Criar suíte de testes unitários AAA em `tests/main/updater.test.ts`.

### Fase 3: Integração no Processo Main (`src/main/main.ts`)
- Registrar canais IPC:
  - `monblock:check-updates`
  - `monblock:download-update`
- Conectar respostas de liberação do Ajudante ao `AppNotificationManager`.

### Fase 4: Ponte Preload (`src/preload/preload.ts` e `preload-bridge.cjs`)
- Adicionar contratos tipados em `MonBlockPreloadApi`.
- Atualizar a validação estrita de métodos em `tests/ui/desktop-ui.test.ts`.

### Fase 5: Interface do Usuário & Estilização (`src/renderer/`)
- Adicionar indicador de update disponível no elemento `#appVersionInfo`.
- Criar `<dialog id="updateDialog">` com notas de versão e barra de progresso em `src/renderer/index.html`.
- Adicionar estilos temáticos em `src/renderer/renderer.css`.
- Integrar handlers e eventos em `src/renderer/renderer-init.js`.

### Fase 6: Validação Final e Build
- Executar `npm run build` e rodar a suíte de testes completa (`tests/`).

---

## 4. Reversibilidade e Rollback

- Se o download falhar ou for interrompido, o arquivo temporário é purgado imediatamente de `/tmp`.
- Se o usuário rejeitar a atualização, o modal fecha e o app continua em execução sem qualquer efeito colateral.
