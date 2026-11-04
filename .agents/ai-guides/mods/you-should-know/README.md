# 🔔 Mod: You Should Know

O **You Should Know** atua como um agente observador em segundo plano que alerta sobre riscos não óbvios, efeitos colaterais e possíveis quebras de arquitetura.

---

## 📌 Como Funciona

- O hook `PreToolUse` analisa chamadas de ferramentas de escrita e execução de comandos.
- Detecta automaticamente riscos críticos como:
  - Edição de arquivos de segredos e credenciais (`.env`).
  - Publicação de pacotes em registros (`npm publish`, `pnpm publish`).
  - Execução de comandos de migração de banco de dados sem verificação de backup prévio.
- Emite avisos visuais destacados sem bloquear desnecessariamente o fluxo de trabalho do usuário.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/you-should-know

# Ou no Claude Code:
claude --plugin-dir ./mods/you-should-know
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Apenas metadados do payload da ferramenta recebido via `stdin`.
- **`write`**: Zero gravação em disco.
- **`run`**: Node.js via `${CLAUDE_PLUGIN_ROOT}/bin/risk-advisor.js`.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências

- **Referência Oficial:** [Getting started with Claude Code mods (Anthropic)](https://claude.dev/blog/getting-started-with-claude-code-mods/)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/you-should-know/plugin.json)
