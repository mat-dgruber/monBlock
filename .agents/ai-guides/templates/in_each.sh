#!/usr/bin/env sh
# in_each.sh --any|--all <alvo> <comando…>
#
# Roda o comando (via `sh -c`) na raiz de CADA subprojeto <alvo> detectado por detect_stack.sh
# — resolve monorepos, em que o backend/frontend vive em apps/web, services/api etc.
#   --any  exit 0 se o comando sair 0 em ALGUM subprojeto   (uso em `when`:  "algum precisa")
#   --all  exit 0 se o comando sair 0 em TODOS              (uso em `verify`: "todos conformes")
# Sem nenhum subprojeto do alvo, sai 1 nos dois modos (nada a fazer / nada a provar).
# Fonte canônica: templates/in_each.sh — usado nos `when`/`verify` das heurísticas dos guias.
set -u

modo=${1:?uso: in_each.sh --any|--all <alvo> <comando…>}
alvo=${2:?alvo ausente}
shift 2
cmd=$*
raiz=$(pwd)
base=${AI_GUIDES_RUNTIME:-$raiz/.agents/ai-guides}

dirs=$(sh "$base/templates/detect_stack.sh" "$alvo" --list 2>/dev/null) || exit 1
[ -n "$dirs" ] || exit 1

achou=1
for d in $dirs; do
  if (cd "$raiz/$d" 2>/dev/null && sh -c "$cmd"); then
    [ "$modo" = "--any" ] && exit 0
    achou=0
  else
    [ "$modo" = "--all" ] && { echo "falhou em $d" >&2; exit 1; }
  fi
done
[ "$modo" = "--all" ] && exit $achou
exit 1
