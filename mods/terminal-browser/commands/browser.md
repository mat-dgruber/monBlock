---
description: "Abre o navegador web no terminal ou no navegador padrão do sistema para inspecionar URLs e interfaces"
argument-hint: "[url, ex: http://localhost:3000]"
---

# /browser

Abre uma URL para visualização e testes rápidos sem precisar sair do fluxo do terminal.

```bash
# Exemplos:
# /browser
# /browser http://localhost:3000
# /browser https://github.com
```

Executa o launcher inteligente que prioriza `terminal-browser` (split TUI), navegadores de terminal (`w3m`, `lynx`) ou o navegador padrão do sistema.
