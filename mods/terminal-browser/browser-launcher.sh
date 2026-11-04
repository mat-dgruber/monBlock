#!/usr/bin/env bash
# Terminal Browser Launcher - Script de inicialização do sidecar local

PORT=9222
TARGET_URL="${1:-http://localhost:3000}"

echo "🌐 [TERMINAL BROWSER] Iniciando servidor do navegador in-terminal..."
echo "🔗 Endereço Alvo: $TARGET_URL"

# Verifica se o binário nativo está disponível no PATH
if ! command -v terminal-browser &> /dev/null; then
  echo "❌ Binário 'terminal-browser' não encontrado no sistema."
  echo "👉 Instale com: brew install terminal-browser ou curl -fsSL https://terminal-browser.sh/install | bash"
  exit 1
fi

# Inicia o daemon do navegador na porta local
terminal-browser --port $PORT --url "$TARGET_URL" &
PID=$!

echo "🚀 Terminal Browser ativo no processo PID $PID (Split TUI ativo)"
