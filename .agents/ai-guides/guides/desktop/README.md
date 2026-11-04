# 🖥️ Acervo Normativo de Desenvolvimento Desktop Multiplataforma

<div align="center">

[![Category](https://img.shields.io/badge/Category-Desktop%20Engineering-3B82F6?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Standards-Electron%20%7C%20Chromium%20Sandbox%20%7C%20Apple%20HIG%20%7C%20Windows%20Fluent-10B981?style=for-the-badge)](../../README.md)
[![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-6366F1?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Biblioteca canônica corporativa de engenharia de software desktop: arquitetura multi-processo, IPC tipado seguro, otimização de CPU/RAM, segurança defensiva zero-trust e integração com macOS, Windows e Linux.</b>
</p>

</div>

---

## 📂 Guias Disponíveis nesta Categoria

```text
guides/desktop/
├── README.md                                               ──> Portal, taxonomia e matriz de decisão entre stacks
├── guia-desenvolvimento-desktop-conceito-producao.md       ──> ⭐ Guia Mestre: ciclo de vida, IPC tipado, utilityProcess e release
├── guia-arquitetura-desktop-performance-resiliencia.md     ──> V8 Snapshots, better-sqlite3 em worker, offline sync e mitigação de leaks
├── guia-seguranca-defensiva-desktop-electron.md            ──> Tríade Zero-Trust (Sandbox, ContextIsolation), CSP e blindagem de Deep Links
└── guia-plataforma-os-ergonomia-desktop.md                 ──> Nuances de SO: macOS Traffic Lights/Dock, Windows Mica/AppUserModelID, Linux DEs
```

---

## 🗺️ Matriz de Decisão entre Stacks Tecnológicas Desktop

```mermaid
graph TD
    Start([🚀 Novo Projeto Desktop]) --> Target{Qual a prioridade arquitetural do produto?}

    Target -->|Maturidade npm, UI Rica e Ecossistema Extenso| Electron[Electron v30+<br/>- Bundled Chromium + Node.js<br/>- 100% de paridade visual multi-OS<br/>- Extensibilidade tipo VS Code e Slack<br/>- Guia: guides/desktop/guia-desenvolvimento-desktop-conceito-producao.md]
    Target -->|Instalador Mínimo, Baixo RAM e Core Rust| Tauri[Tauri 2<br/>- System WebView + Core Rust<br/>- Binário minúsculo < 10 MB<br/>- Pegada de memória < 50 MB<br/>- Guia: guides/desktop/README.md]
    Target -->|Multiplataforma Mobile + Desktop Simultâneo| Flutter[Flutter Desktop<br/>- Impeller Engine + Dart AOT<br/>- Renderização via GPU sem DOM<br/>- Guia: guides/desktop/README.md]
    Target -->|Acesso Total a APIs de Baixo Nível do SO| Native[Nativo por Plataforma<br/>- Swift/SwiftUI no macOS<br/>- C#/WPF/WinUI no Windows<br/>- C++/Qt no Linux<br/>- Guia: guides/desktop/README.md]

    Electron --> Perf[Aplicar Otimizações V8 & UtilityProcess<br/>guides/desktop/guia-arquitetura-desktop-performance-resiliencia.md]
    Tauri --> Perf
    Flutter --> Perf
    Native --> Perf

    Perf --> Security[Blindar com Segurança Zero-Trust & Sandbox<br/>guides/desktop/guia-seguranca-defensiva-desktop-electron.md]
    Security --> OS[Integrar Nuances Nativas: macOS / Windows / Linux<br/>guides/desktop/guia-plataforma-os-ergonomia-desktop.md]
    OS --> Testing[Implantar Suíte de Testes Desktop<br/>guides/testing/desktop/README.md]
    Testing --> Done([✅ Aplicação Desktop Pronta para Distribuição])
```

---

## 📋 Resumo dos Guias da Categoria

| Guia                                                                                                         | Foco Temático                         | Tópicos Principais                                                                                                                                                                                                                                                                                                                        |
| :----------------------------------------------------------------------------------------------------------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`guia-desenvolvimento-desktop-conceito-producao.md`](guia-desenvolvimento-desktop-conceito-producao.md)     | **Guia Mestre (Conceito à Produção)** | Arquitetura multi-processo (Main, Preload, Renderer, UtilityProcess), IPC tipado bidirecional, ciclo de vida de janelas, `requestSingleInstanceLock`, deep linking, empacotamento com `electron-builder` e checklist de release.                                                                                                          |
| [`guia-arquitetura-desktop-performance-resiliencia.md`](guia-arquitetura-desktop-performance-resiliencia.md) | **Arquitetura & Resiliência**         | Eliminação do white flash (`ready-to-show`), V8 Snapshots e Code Caching, isolamento de banco local SQLite (`better-sqlite3`) em `utilityProcess`, combate a vazamento de memória em SPAs long-running, crash reporting com Sentry/Crashpad e RFC 9457 Problem Details.                                                                   |
| [`guia-seguranca-defensiva-desktop-electron.md`](guia-seguranca-defensiva-desktop-electron.md)               | **Segurança Defensiva Zero-Trust**    | A tríade mandatória (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`), Content Security Policy (CSP), bloqueio de `<webview>`, controle estrito de novas janelas (`setWindowOpenHandler`), integridade de ASAR e proteção contra RCE via deep links maliciosos.                                                       |
| [`guia-plataforma-os-ergonomia-desktop.md`](guia-plataforma-os-ergonomia-desktop.md)                         | **Ergonomia & Nuances por SO**        | macOS (Dock lifecycle, Traffic Lights nativos, template images no menu bar, notarização com `notarytool`), Windows 11 (Mica/Acrylic, `AppUserModelID`, NSIS delta updates) e Linux (GNOME/KDE, Wayland vs X11, AppIndicator, D-Bus e AppImage/Flatpak). Acessibilidade vestibular (`prefers-reduced-motion`) e contraste perceptual APCA. |

---

## 🧪 Suíte de Testes Desktop Complementar

Para a estratégia e implementação prática da pirâmide de testes desktop (Testes Unitários de Main/Utility, Testes de Componentes Renderer e Testes E2E com Playwright Electron em runners multi-OS), consulte:  
👉 **[`guides/testing/desktop/README.md`](../testing/desktop/README.md)**
