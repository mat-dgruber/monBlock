# 🎬 Mod: Replay Theater

O **Replay Theater** registra passo a passo cada edição realizada durante a sessão e renderiza um auditor visual de diffs no terminal.

---

## 📌 Como Funciona

- O hook `PostToolUse` intercepta ferramentas de escrita (`Edit`, `Write`, `MultiEdit`, `replace_file_content`, `write_to_file`).
- Registra cada arquivo modificado no histórico cumulativo da sessão em `.cache/replay-history.json`.
- O comando de auditoria executa o diff com sintaxe colorida (`git diff --color=always`) destacando adições em verde e remoções em vermelho.

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/replay` ou `$replay`: Dispara o visualizador e auditor de diffs dos arquivos editados recentemente.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/replay-theater

# Ou no Claude Code:
claude --plugin-dir ./mods/replay-theater
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de `.cache/replay-history.json`.
- **`write`**: Gravação de registros em `.cache/replay-history.json`.
- **`run`**: Execução de `git diff` e `git status` via subprocesso local.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências

- **Referência Oficial:** [awesome-claude-code-mods (karanb192)](https://github.com/karanb192/awesome-claude-code-mods)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/replay-theater/plugin.json)
