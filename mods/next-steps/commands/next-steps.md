---
description: "Exibe e gerencia sugestões preditivas de próximos passos e comandos para a sessão ativa"
argument-hint: "[--status | --clear | help]"
---

# /next-steps

Exibe as sugestões de próximos passos geradas automaticamente para a sessão atual após cada turno.

```bash
# Exemplos de uso:
# /next-steps          (Mostra as sugestões ativas no terminal)
# /next-steps --status (Retorna o status do mod em formato estruturado)
```

## Como Funciona

- Ao final de cada turno (`turn.complete` / `TurnComplete`), o mod analisa o contexto da conversa e sugere até 3 opções de comandos ou próximos prompts.
- Teclas rápidas: pressione `1`, `2` ou `3` para carregar a sugestão como rascunho na barra de prompt. Pressione `Tab` para aceitar a sugestão fantasma (*ghost text*), ou `0` para dispensar.
