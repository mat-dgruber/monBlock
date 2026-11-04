# 🚀 Template Starter Mod

Este diretório contém o boilerplate canônico e funcional para desenvolver novos mods para o **Claude Code (2.1.287+)** e o **OpenClaude**.

---

## 📂 Arquivos Incluídos

- [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/plugin.json): Manifesto oficial validado pelo `PluginManifestSchema` que registra os hooks e comandos.
- [`mod.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/mod.json): Manifesto conceitual sincronizado com as diretrizes de design do repositório.
- [`bin/mod-hook.js`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/bin/mod-hook.js): Processador de eventos que lê `stdin` em formato JSON e responde com decisões de aprovação ou bloqueio via `stdout`.
- [`bin/mod-status.js`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/bin/mod-status.js): Visualizador de status e telemetria no terminal.
- [`commands/mod-status.md`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/commands/mod-status.md): Declaração do comando de barra com suporte a chamada dual (`/mod-status` e `$mod-status`).

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/mod-status` ou `$mod-status`: Exibe a tabela de telemetria e bloqueios preventivos no terminal.

---

## 🧪 Como Testar Este Mod

Para carregar este mod em uma sessão efêmera de teste:

```bash
# No OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod

# No Claude Code:
claude --plugin-dir ./mods/template-starter-mod
```

1. Inspecione os hooks ativos digitando `/hooks` no terminal.
2. Execute `/mod-status` ou `$mod-status` para ver o relatório de execução.
3. Se o assistente invocar ferramentas, os hooks registrarão as chamadas automaticamente.

---

## 🔧 Como Criar Seu Próprio Mod a Partir Deste Template

1. Copie esta pasta com o nome do seu novo mod:
   ```bash
   cp -r ./mods/template-starter-mod ./mods/meu-novo-mod
   ```
2. Altere o campo `name` e a descrição em `plugin.json` e `mod.json`.
3. Adicione sua lógica de inspeção em `bin/mod-hook.js`.
4. Valide a conformidade antes de instalar:
   ```bash
   claude plugin validate ./mods/meu-novo-mod
   ```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de estado em `.cache/mod-starter-state.json`.
- **`write`**: Gravação de contadores em `.cache/mod-starter-state.json`.
- **`run`**: Execução de Node.js via `${CLAUDE_PLUGIN_ROOT}`.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências Oficiais

- **Guia Oficial da Anthropic:** [Getting started with Claude Code mods (claude.dev)](https://claude.dev/blog/getting-started-with-claude-code-mods/)
- **Catálogo no GitHub:** [awesome-claude-code-mods (karanb192)](https://github.com/karanb192/awesome-claude-code-mods)
- **Portal de Verificação:** [mods.aidojo.si](https://mods.aidojo.si/)
