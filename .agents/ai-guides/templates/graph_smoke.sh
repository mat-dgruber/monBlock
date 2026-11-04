#!/usr/bin/env sh
# graph_smoke.sh: prova que o Graphify responde com nós reais — exit 0 de `graphify query` não basta
# ("No matching nodes found." também sai 0). Consulta o rótulo do primeiro nó de graphify-out/graph.json e
# exige ao menos uma linha NODE na resposta (imprime até 5). Rode na raiz do projeto.
# Fonte canônica: templates/graph_smoke.sh — GRAPH-09 e smoke test do G6.
set -u
PATH="$HOME/.local/bin:$PATH"
alvo=$(python3 -c "import json; print(json.load(open('graphify-out/graph.json'))['nodes'][0]['label'])" 2>/dev/null) ||
  { echo "❌ graphify-out/graph.json ausente ou sem nós"; exit 1; }
graphify query "$alvo" 2>&1 | grep -m5 '^NODE' || { echo "❌ graphify query \"$alvo\" não devolveu nós"; exit 1; }
