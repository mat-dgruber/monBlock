# 🦀 Mod: Savvy Progress

O **Savvy Progress** adiciona telemetria em tempo real das atividades de subagentes, progresso percentual de tarefas e rastreamento de invocações de ferramentas.

---

## 📌 Como Funciona

- Escuta os ciclos de vida `SubagentStart`, `SubagentStop` e `PreToolUse`.
- Mantém o status agregado de cada subagente em execução em `.cache/savvy-telemetry.json`.
- Renderiza barras de progresso visuais com blocos Unicode (`[██████░░░░] 60%`) e contadores de chamadas.

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/agents-info` ou `$agents-info`: Abre o painel formatado de telemetria e status de subagentes.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/savvy-progress

# Ou no Claude Code:
claude --plugin-dir ./mods/savvy-progress
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de `.cache/savvy-telemetry.json`.
- **`write`**: Gravação de telemetria em `.cache/savvy-telemetry.json`.
- **`run`**: Node.js via `${CLAUDE_PLUGIN_ROOT}/bin/savvy-tracker.js` e `${CLAUDE_PLUGIN_ROOT}/bin/savvy-panel.js`.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências

- **Repositório Original:** [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/savvy-progress/plugin.json)
