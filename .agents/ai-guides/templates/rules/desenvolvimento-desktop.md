# Checklist de Engenharia e Desenvolvimento Desktop (`.agents/rules/desenvolvimento-desktop.md`)

<!-- Fonte canônica: templates/rules/desenvolvimento-desktop.md (guides/desktop/guia-desenvolvimento-desktop-conceito-producao.md) — instalado por DSK-01 -->

Regra always-on: aplique este checklist em code review, auditoria de arquitetura e aprovação de PRs de aplicações desktop (Electron, Tauri 2 e Flutter Desktop). Guia completo em `.agents/ai-guides/guides/desktop/guia-desenvolvimento-desktop-conceito-producao.md`.

## Checklist Canônico de Engenharia Desktop

### A. Segurança Defensiva Zero-Trust (Electron)
- [ ] A tríade de segurança está explicitamente declarada em toda `BrowserWindow`: `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`?
- [ ] A tag `<webview>` está terminantemente desabilitada (`webviewTag: false`)?
- [ ] O `preload.js` expõe métodos mapeados via `contextBridge.exposeInMainWorld`, sem vazar o objeto `ipcRenderer` crú?
- [ ] O Content Security Policy (CSP) impede execução de scripts inline (`unsafe-inline`) e `eval()` (`unsafe-eval`)?
- [ ] Todas as aberturas de janelas e links externos são interceptadas e validadas por `setWindowOpenHandler` e `will-navigate` abrindo no navegador padrão do SO via `shell.openExternal`?
- [ ] Deep links customizados (`meuapp://`) são validados contra injeção de parâmetros maliciosos e argumentos de CLI?

### B. Arquitetura Multi-Processo, Performance e Inicialização
- [ ] A janela principal é criada oculta (`show: false`) com cor de fundo combinada com o tema, tornando-se visível apenas no evento `ready-to-show` para eliminar o "white flash"?
- [ ] O loop do Main Process permanece livre de operações síncronas bloqueantes (I/O em disco, compressão pesada ou parsing de JSON massivo)?
- [ ] O banco de dados local SQLite (`better-sqlite3`) opera isolado em um `utilityProcess` ou Worker Thread dedicado com Write-Ahead Logging (`journal_mode = WAL`)?
- [ ] A aplicação utiliza `app.requestSingleInstanceLock()` para garantir instância única e despachar deep links para a janela já aberta sem concorrência destrutiva?
- [ ] Todos os listeners de IPC registrados na interface React/Vue possuem desinscrição explícita no unmount do componente para impedir vazamento de memória acumulativo?

### C. Integração Nativa e Ergonomia por Sistema Operacional
- [ ] **macOS:** O evento `window-all-closed` não finaliza o aplicativo (`process.platform !== 'darwin'`), mantendo-o residente no Dock até comando explícito de Quit?
- [ ] **macOS:** A barra de título utiliza `titleBarStyle: 'hiddenInset'` preservando os botões semáforo (Traffic Lights) nativos perfeitamente alinhados?
- [ ] **macOS:** Ícones de Menu Bar utilizam Template Images (`trayTemplate.png`) com alternância automática entre Dark e Light mode?
- [ ] **Windows:** O `app.setAppUserModelId()` é chamado antes do `app.whenReady()` para exibição correta e estável de notificações no Action Center?
- [ ] **Windows:** Suporte nativo a materiais Fluent Design (Mica/Acrylic) quando operando em Windows 11?
- [ ] **Linux:** Compatibilidade com ambientes de desktop variados (GNOME, KDE) e integração de bandeja via `libappindicator`?
- [ ] **Acessibilidade:** Respeito absoluto a `@media (prefers-reduced-motion)` e `@media (prefers-reduced-transparency)` com degradação suave de efeitos translúcidos e transições?
- [ ] **Teclado:** Navegação fluida por Tab sem armadilhas de teclado e indicadores visíveis de foco (`:focus-visible`)?
