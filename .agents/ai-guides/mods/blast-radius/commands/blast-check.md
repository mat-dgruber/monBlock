---
description: "Analisa o raio de impacto e destruição de um comando crítico antes da execução"
argument-hint: "[comando, ex: rm -rf dist]"
---

# /blast-check

Executa uma análise de raio de impacto (Blast Radius) sobre um comando ou caminho para estimar arquivos afetados e risco operacional.

```bash
# Exemplos:
# /blast-check rm -rf dist
# /blast-check git branch -D feature
# $blast-check rm -rf node_modules
```

O comando aciona o motor do mod **Blast Radius**, exibindo a contagem de arquivos no alvo, espaço em disco e riscos potenciais.
