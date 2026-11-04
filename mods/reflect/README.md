# 🧠 Mod: Reflect

O **Reflect** transforma as suas correções e preferências expressadas no chat em regras permanentes gravadas automaticamente em arquivos de diretrizes (`CLAUDE.md`, `AGENTS.md` ou `.agents/rules/`).

---

## 📌 Como Funciona

- O hook `UserPromptSubmit` intercepta instruções do usuário como:
  - *“Não use npm aqui, usamos sempre pnpm”*
  - *“Neste repositório usamos Vitest para testes unitários”*
  - *“Regra: sempre escreva comentários em TypeScript idiomático”*
- Sintetiza a convenção de forma determinística e armazena em `.cache/reflect-rules.json`.
- Injeta um `systemMessage` para que o modelo assimile a preferência imediatamente no próximo turno.

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/reflect-status` ou `$reflect-status`: Lista todas as regras capturadas prontas para revisão e inclusão nas diretrizes permanentes.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/reflect

# Ou no Claude Code:
claude --plugin-dir ./mods/reflect
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de `.cache/reflect-rules.json`.
- **`write`**: Gravação de convenções em `.cache/reflect-rules.json`.
- **`run`**: Node.js via `${CLAUDE_PLUGIN_ROOT}/bin/reflect.js`.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências

- **Repositório Original:** [BayramAnnakov/claude-reflect](https://github.com/BayramAnnakov/claude-reflect)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/reflect/plugin.json)
