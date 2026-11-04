# 📱 Acervo Normativo de Desenvolvimento Mobile

<div align="center">

[![Category](https://img.shields.io/badge/Category-Mobile%20Engineering-4F46E5?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Standards-OWASP%20MASVS%20%7C%20HIG%20%7C%20Material%203-10B981?style=for-the-badge)](../../README.md)
[![Stacks](https://img.shields.io/badge/Stacks-SwiftUI%20%7C%20Compose%20%7C%20Flutter%20%7C%20Expo-7C3AED?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Biblioteca canônica de engenharia móvel, padrões arquiteturais reativos, resiliência offline-first, segurança defensiva e ergonomia para iOS e Android.</b>
</p>

</div>

---

## 📂 Guias Disponíveis nesta Categoria

```text
guides/mobile/
├── README.md                                         ──> Portal e visão geral do ecossistema mobile
├── guia-desenvolvimento-mobile-conceito-producao.md   ──> ⭐ Guia Mestre: UDF, arquitetura proporcional, 4 sintaxes e release
├── guia-arquitetura-mobile-offline-first.md          ──> Clean Architecture, Repositórios, Outbox Pattern e Background Sync
├── guia-seguranca-privacidade-mobile-masvs.md        ──> OWASP MASVS v2/MASTG, Keychain/Keystore, Biometria e SSL Pinning
└── guia-design-ergonomia-acessibilidade-mobile.md   ──> Thumb Zone, Touch Targets (48dp/44pt), Dynamic Type e Safe Areas
```

---

## 🗺️ Matriz de Decisão entre Stacks Tecnológicas

```mermaid
graph TD
    Start([🚀 Novo Projeto Mobile]) --> Target{Qual o foco principal do produto?}

    Target -->|Experiência Nativa Apple Exclusiva| Swift[Swift + SwiftUI<br/>- Integração profunda com iOS/iPadOS<br/>- Acesso instantâneo a APIs Apple<br/>- Guia: guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md]
    Target -->|Experiência Nativa Android Exclusiva| Kotlin[Kotlin + Jetpack Compose<br/>- Padrão oficial moderno Google<br/>- Integração nativa profunda com Android<br/>- Guia: guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md]
    Target -->|Multiplataforma com UI Pixel-Perfect| Flutter[Flutter + Dart<br/>- Motor gráfico próprio Impeller<br/>- Paridade visual 100% idêntica<br/>- Guia: guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md]
    Target -->|Multiplataforma com Equipe React/TS| Expo[React Native + Expo<br/>- Componentes nativos reais do SO<br/>- Nova Arquitetura e ecossistema TypeScript<br/>- Guia: guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md]

    Swift --> Offline[Aplicar Padrão Offline-First & Outbox<br/>guides/mobile/guia-arquitetura-mobile-offline-first.md]
    Kotlin --> Offline
    Flutter --> Offline
    Expo --> Offline

    Offline --> Security[Blindar com OWASP MASVS<br/>guides/mobile/guia-seguranca-privacidade-mobile-masvs.md]
    Security --> Testing[Implantar Suíte de Testes Mobile<br/>guides/testing/mobile/README.md]
    Testing --> Done([✅ Aplicativo Mobile Pronto para Produção])
```

---

## 📋 Resumo dos Guias da Categoria

| Guia | Foco Temático | Tópicos Principais |
| :--- | :--- | :--- |
| [`guia-desenvolvimento-mobile-conceito-producao.md`](guia-desenvolvimento-mobile-conceito-producao.md) | **Guia Mestre (Conceito à Produção)** | Fluxo Unidirecional de Dados (UDF), progressão nó a nó nas 4 stacks (React Native, Kotlin/Hilt, Swift/SwiftData, Flutter/Impeller), profiling e checklist de lançamento. |
| [`guia-arquitetura-mobile-offline-first.md`](guia-arquitetura-mobile-offline-first.md) | **Arquitetura & Resiliência** | Clean Architecture Mobile, State Hoisting, Repositórios como Single Source of Truth, Local Outbox Pattern, resolução de conflitos e Background Sync (WorkManager/BGTaskScheduler). |
| [`guia-seguranca-privacidade-mobile-masvs.md`](guia-seguranca-privacidade-mobile-masvs.md) | **Segurança Defensiva (MASVS v2)** | As 7 categorias do OWASP MASVS v2 (Storage, Crypto, Auth, Network, Platform, Code, Resilience), Hardware Keystore/Keychain, biometria e defesa anti-tampering/Root. |
| [`guia-design-ergonomia-acessibilidade-mobile.md`](guia-design-ergonomia-acessibilidade-mobile.md) | **Design, Ergonomia & A11y** | Lei de Fitts e Thumb Zone, alvos de toque mínimos ($48\text{ dp}$ / $44\text{ pt}$), Safe Areas, Dynamic Type, Reduce Motion, contraste WCAG 2.2 AA e leitores de tela nas 4 stacks. |

---

## 🧪 Suíte de Testes Mobile Complementar

Para a estratégia e implementação prática da pirâmide de testes móveis (Testes Unitários, Testes de Componentes/Widgets e E2E em dispositivos reais), consulte a suíte complementar em:
👉 **[`guides/testing/mobile/README.md`](../testing/mobile/README.md)**
