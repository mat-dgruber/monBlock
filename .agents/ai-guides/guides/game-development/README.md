# 🎮 Acervo Normativo de Desenvolvimento e Arquitetura de Jogos

<div align="center">

[![Category](https://img.shields.io/badge/Category-Game%20Development-059669?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Standards-Fixed%20Timestep%20%7C%20PBR%20%7C%20Authoritative%20Server-10B981?style=for-the-badge)](../../README.md)
[![Engines](https://img.shields.io/badge/Engines-Godot%204%20%7C%20Unity%20%7C%20Unreal-7C3AED?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Biblioteca canônica de engenharia de jogos em tempo real, física geométrica, pipelines gráficos/PBR, arquitetura de simulação desacoplada, segurança anti-cheat, ergonomia/HUD e infraestrutura para servidores multiplayer.</b>
</p>

</div>

---

## 📂 Guias Disponíveis nesta Categoria

```text
guides/game-development/
├── README.md                                                     ──> Portal e visão geral do ecossistema de jogos
├── guia-desenvolvimento-jogos-arquitetura-producao.md             ──> ⭐ Guia Mestre: Game Loop, física/CCD, shaders PBR, multiplayer UDP e Godot 4
├── guia-arquitetura-jogos-estado-persistencia-netcode.md          ──> Separação Resource vs Node, Save/Load atômico versionado e Netcode UDP Autoritativo
├── guia-seguranca-defensiva-anti-cheat-multiplayer.md             ──> Autoridade de servidor, sanitização cinemática, anti-speedhack, economia e proteção de binários
└── guia-game-design-hud-ergonomia-acessibilidade.md               ──> Game Feel (Coyote Time/Input Buffer), HUD diegética, ergonomia multiplataforma e A11y em jogos
```

---

## 🗺️ Matriz de Decisão Arquitetural em Jogos

```mermaid
graph TD
    Start([🚀 Novo Projeto de Jogo]) --> Genre{Qual a natureza e escopo da simulação?}

    Genre -->|2D / 2.5D Indie ou Multiplataforma Leve| Godot[Godot Engine 4 + GDScript 2.0 / C#<br/>- Arquitetura baseada em Nós e Recursos (.tres)<br/>- Suporte a Antigravity & Claude Code<br/>- Guia: guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md]
    Genre -->|3D Comercial / Mobile / Consoles| Unity[Unity 6 + C#<br/>- Componentes modulares e ScriptableObjects<br/>- DOTS / Entities para simulações densas<br/>- Guia: guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md]
    Genre -->|3D AAA / Gráficos de Alta Fidelidade| Unreal[Unreal Engine 5 + C++ / Blueprints<br/>- Nanite, Lumen e Chaos Physics<br/>- Networking autoritativo nativo de alta escala<br/>- Guia: guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md]

    Godot --> Arch[Arquitetura Desacoplada, Save Atômico & Netcode<br/>guides/game-development/guia-arquitetura-jogos-estado-persistencia-netcode.md]
    Unity --> Arch
    Unreal --> Arch

    Arch --> Security[Blindagem Anti-Cheat, Economia & Autoridade de Servidor<br/>guides/game-development/guia-seguranca-defensiva-anti-cheat-multiplayer.md]
    Security --> UX[Polimento de Game Feel, HUD Diegética & Acessibilidade<br/>guides/game-development/guia-game-design-hud-ergonomia-acessibilidade.md]
    UX --> Testing[Implantar Suíte de Testes de Jogos<br/>guides/testing/games/README.md]
    Testing --> Done([✅ Jogo Governado e Pronto para Produção])
```

---

## 📋 Resumo dos Guias da Categoria

| Guia | Foco Temático | Tópicos Principais |
| :--- | :--- | :--- |
| [`guia-desenvolvimento-jogos-arquitetura-producao.md`](guia-desenvolvimento-jogos-arquitetura-producao.md) | **Guia Mestre (Conceito à Produção)** | Ciclo de vida do Game Loop (passo fixo vs variável), separação Resource vs Node, matemática afim e quaternions, física/colisão (GJK/EPA/CCD), IA (FSM/Behavior Trees), shaders PBR, multiplayer UDP autoritativo, concorrência server-side e Godot 4. |
| [`guia-arquitetura-jogos-estado-persistencia-netcode.md`](guia-arquitetura-jogos-estado-persistencia-netcode.md) | **Arquitetura, Persistência & Netcode** | Clean Architecture aplicada a engines (`Resource`/`ScriptableObject` puro vs `Node`/View), protocolo de Save/Load atômico (`.tmp` $\rightarrow$ `.sav` + `.bak`) com SHA-256 e migração de schema, e tríade do Netcode (Client Prediction, Server Reconciliation, Entity Interpolation, Lag Compensation). |
| [`guia-seguranca-defensiva-anti-cheat-multiplayer.md`](guia-seguranca-defensiva-anti-cheat-multiplayer.md) | **Segurança Defensiva & Anti-Cheat** | Modelo GAME-SEC, contrato Intenção $\rightarrow$ Validação $\rightarrow$ Efeito no servidor, sanitização de `NaN`/`Inf`, validação cinemática anti-speedhack/anti-noclip, Fog of War server-side, transações econômicas anti-dupe e zero segredos em binários `.pck`/clientes. |
| [`guia-game-design-hud-ergonomia-acessibilidade.md`](guia-game-design-hud-ergonomia-acessibilidade.md) | **Game Design, HUD & Acessibilidade** | Preservação do Estado de Flow, zonas foveal vs. periférica, taxonomia de HUD (Diegética, Espacial, Meta, Não-Diegética), *Coyote Time*, *Input Buffering*, ergonomia para Gamepad/Touch/Mouse e acessibilidade universal (daltonismo, remapeamento e redução de *screen shake*). |

---

## 🧪 Suíte de Testes de Jogos Complementar

Para a estratégia e implementação prática da pirâmide de testes de jogos (Testes Unitários de `Resource`/Simulação, Testes de Cena/Física e Testes E2E Headless/Multiplayer), consulte a suíte complementar em:
👉 **[`guides/testing/games/README.md`](../testing/games/README.md)**
