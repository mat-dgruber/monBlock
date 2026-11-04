---
description: "Silencia por um período o alerta de cache de prompt frio do Cache Tax"
argument-hint: "[duração, ex: 60m ou off]"
---

# /keepwarm

Silencia ou reativa o alerta de cache frio do mod **Cache Tax**. Não mantém o cache aquecido: nenhuma requisição é enviada e o cache expira no TTL normal.

```bash
# Exemplos de uso:
# /keepwarm 60m    (Silencia o alerta pela próxima hora)
# /keepwarm 90m    (Silencia o alerta por 90 minutos)
# /keepwarm off    (Volta a exibir o alerta)
```

O comando registra o período em `.cache/cache-tax-state.json`.
