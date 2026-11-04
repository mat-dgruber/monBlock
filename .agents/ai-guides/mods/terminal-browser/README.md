# 🌐 Mod: Terminal Browser

O **Terminal Browser** permite visualizar e testar páginas web, APIs locais e interfaces frontend diretamente pelo terminal ou com o navegador padrão do sistema.

---

## 📌 Como Funciona

- O launcher sanitiza a URL fornecida para impedir injeção de parâmetros ou acessos maliciosos.
- Realiza uma verificação inteligente de disponibilidade de ferramentas:
  1. Utiliza `terminal-browser` nativo se disponível (split TUI);
  2. Faz fallback para navegadores de terminal como `w3m` ou `lynx`;
  3. Caso nenhum esteja disponível, despacha a URL com segurança para o navegador padrão do sistema operacional (`open` no macOS, `xdg-open` no Linux, `start` no Windows).

---

## 🎮 Comandos (Dual Trigger: `/` ou `$`)

- `/browser` ou `$browser`: Abre `http://localhost:3000` por padrão.
- `/browser https://minha-url.com` ou `$browser https://minha-url.com`: Abre a URL especificada.

---

## 💻 Instalação & Teste

```bash
# Testar localmente no OpenClaude:
openclaude --plugin-dir /Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/terminal-browser

# Ou no Claude Code:
claude --plugin-dir ./mods/terminal-browser
```

---

## 🔒 Auditoria de Footprint (Permissões)

- **`read`**: Nenhuma leitura de arquivo do usuário.
- **`write`**: Nenhuma gravação no disco.
- **`run`**: Execução de `command -v` e disparo do navegador local via `${CLAUDE_PLUGIN_ROOT}/bin/browser-launcher.js`.
- **`network`**: Acesso HTTP/HTTPS iniciado pelo navegador cliente.

---

## 🔗 Referências

- **Repositório Original:** [zenbu-labs/terminal-browser](https://github.com/zenbu-labs/terminal-browser)
- **Portal de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)
- **Manifesto Validado:** [`plugin.json`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/terminal-browser/plugin.json)
