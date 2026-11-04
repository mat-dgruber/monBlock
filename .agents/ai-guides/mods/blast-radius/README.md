# 🛡️ Mod: Blast Radius

O **Blast Radius** foi desenvolvido para agir como um escudo preventivo contra comandos destrutivos no terminal (`rm -rf`, `git push --force`, `git reset --hard`, `git clean -fdx`, `drop database`).

---

## 📌 Como Funciona

1. **Interceptação PreToolUse:** O hook intercepta qualquer chamada da ferramenta `Bash` antes que ela seja despachada para o sistema.
2. **Cálculo de Impacto Real:** Se detectar padrões destrutivos, calcula a contagem real de arquivos afetados, tamanho total em disco e se o alvo aponta para caminhos críticos (como `/` ou `$HOME`).
3. **Confirmação Interativa:** Emite `permissionDecision: "ask"`, fazendo com que o Claude Code ou o OpenClaude pause o turno e solicite confirmação explícita do usuário.
4. **Resolução Dinâmica:** Utiliza `${CLAUDE_PLUGIN_ROOT}/bin/blast-radius.js` para garantir independência do diretório de execução.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/blast-radius

# Ou no Claude Code:
claude --plugin-dir ./mods/blast-radius
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Apenas metadados do diretório alvo a ser deletado (`statSync`, `readdirSync`) para estimar contagem e tamanho.
- **`write`**: Nenhuma gravação em disco.
- **`run`**: Nenhum comando externo invocado.
- **`network`**: Zero tráfego de rede.

---

## 🔗 Referências

- **Catálogo Oficial:** [awesome-claude-code-mods (karanb192)](https://github.com/karanb192/awesome-claude-code-mods)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/blast-radius/plugin.json)
