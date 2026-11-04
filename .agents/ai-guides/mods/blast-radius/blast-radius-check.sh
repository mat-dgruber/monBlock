#!/usr/bin/env bash
# Blast Radius - Script de Inspeção e Cálculo de Impacto
# Chamado em tempo de execução para inspecionar comandos arriscados

COMMAND="$1"

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Detecta padrões potencialmente destrutivos
if echo "$COMMAND" | grep -qE "(rm\s+-rf|git\s+push\s+.*--force|git\s+clean\s+-fd|drop\s+database)"; then
  echo "⚠️ [BLAST RADIUS DETECTADO]"
  echo "Comando sob análise: $COMMAND"
  
  # Se for um rm -rf em diretório relativo, lista os arquivos que seriam afetados
  TARGET_DIR=$(echo "$COMMAND" | sed -n -E 's/.*rm\s+-rf\s+([^ ]+).*/\1/p')
  
  if [ -n "$TARGET_DIR" ] && [ -d "$TARGET_DIR" ]; then
    FILE_COUNT=$(find "$TARGET_DIR" -type f | wc -l | tr -d ' ')
    TOTAL_SIZE=$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)
    
    echo "📊 Impacto Estimado:"
    echo "   - Total de arquivos que serão DELETADOS: $FILE_COUNT"
    echo "   - Espaço total em disco: $TOTAL_SIZE"
    echo "   - Primeiros arquivos afetados:"
    find "$TARGET_DIR" -type f | head -n 5 | sed 's/^/     ❌ /'
    
    # Código de saída 1 indica para o Claude Code abrir o painel de confirmação
    exit 1
  fi
fi

exit 0
