# 💰 Mod: Cache Tax

O **Cache Tax** protege seu saldo e plano financeiro contra reenvios acidentais de histórico quando o cache de prompt da Anthropic expira por inatividade (*cold cache*).

---

## 📌 Como Funciona

- O cache de prompt da Anthropic oferece descontos de até 90% em tokens lidos repetidamente ($3.00/M base vs $0.30/M em cache read no Sonnet 3.5/3.7).
- Em planos por assinatura, o cache expira após cerca de **60 minutos de inatividade** (em chaves de API cruas, após 5 minutos por padrão).
- Ao retornar de uma pausa, o hook `UserPromptSubmit` calcula o tempo decorrido usando o estado persistido em `.cache/cache-tax-state.json`.
- Caso o cache tenha expirado, o mod exibe a estimativa monetária da perda do desconto e sugere estratégias como `/clear` ou `/keepwarm`.

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/keepwarm 90m` ou `$keepwarm 90m`: Silencia o alerta de cache frio pelos próximos 90 minutos (não envia requisições; o cache expira no TTL normal).
- `/keepwarm off` ou `$keepwarm off`: Volta a exibir o alerta de cache frio.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/cache-tax

# Ou no Claude Code:
claude --plugin-dir ./mods/cache-tax
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Leitura de `.cache/cache-tax-state.json`.
- **`write`**: Gravação de timestamp atômico em `.cache/cache-tax-state.json`.
- **`run`**: Node.js via `${CLAUDE_PLUGIN_ROOT}/bin/cache-check.js`.
- **`network`**: Zero tráfego de rede (cálculo puramente local).

---

## 🔗 Referências

- **Repositório Original:** [karanb192/cache-tax](https://github.com/karanb192/cache-tax)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/cache-tax/plugin.json)
