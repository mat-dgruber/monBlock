# ⚡ Mod: Next Steps

O **Next Steps** analisa o encerramento de cada turno da conversa e sugere até três próximos passos ou comandos prováveis imediatamente acima da caixa de digitação.

```
next:
  1: rodar testes automatizados
  2: revisar diff com /code-review
  3: commitar alterações com /commit-e-documentar
  0: dispensar
```

---

## 📌 Como Funciona

- **Turn Complete Hook:** Ao final de cada turno (`turn.complete`), cria um fork leve da sessão (`$.model.fork`). Como o fork compartilha o cache de prompt da sessão, o custo equivale a apenas uma resposta curta (~50-100 tokens de saída).
- **Integração de Skills & Slash Commands:** Consulta os comandos ativos da sessão (`$.command.list`), permitindo sugerir `/skill <argumentos>` ou ferramentas contextualizadas.
- **Interação na TUI:**
  - Pressionar `1`, `2` ou `3` a partir de uma caixa de entrada vazia insere o prompt sugerido como rascunho (`$.prompt.fill`) para que você revise antes de enviar.
  - A primeira sugestão aparece como texto fantasma (*ghost text* translúcido); pressionar `Tab` preenche o campo instantaneamente (`$.prompt.suggest`).
  - Pressionar `0` descarta as opções.
- **Segurança de Execução:** O mod **nunca submete** o prompt sozinho; a decisão de disparo permanece 100% sob o controle humano.

---

## ⚙️ Opções de Configuração

Configurações suportadas em `plugin.json` / `settings.json`:

| Opção | Padrão | Descrição |
| :--- | :---: | :--- |
| `minAnswerChars` | `80` | Pula sugestões após respostas mais curtas que este limite de caracteres. |
| `suggestSkills` | `true` | Informa a lista de skills e slash commands da sessão para gerar atalhos inteligentes. |

---

## 🎮 Comandos

- `/next-steps`: Exibe as sugestões ativas e status no terminal.
- `/next-steps --status`: Retorna o JSON de telemetria das sugestões.

---

## 💻 Instalação

### Instalação via Claude Plugins Community (Oficial Anthropic)
```bash
claude plugin marketplace add anthropics/claude-plugins-community
claude plugin install next-steps@claude-community
```

### Instalação Local na Suíte ai-guides
```bash
# Claude Code:
claude --plugin-dir ./mods/next-steps

# OpenClaude:
openclaude --plugin-dir ./mods/next-steps
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de estado local e lista de skills registradas.
- **`run`**: Execução local Node.js (`hooks/register.tsx` e `bin/next-steps.js`).
- **`ui`**: Elementos de UI em terminal na banda superior da caixa de prompt (`AbovePrompt`).
- **`network`**: Zero tráfego externo não autorizado; todas as chamadas ocorrem via runtime interno de IA.
