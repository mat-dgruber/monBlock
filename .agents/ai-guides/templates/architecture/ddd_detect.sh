#!/usr/bin/env sh
# ddd_detect.sh <adotado|declarado|uow|use_cases|adr-estilo>
#
# Gate das heurísticas do guia ddd-pragmatico. Regra de ouro: a DECLARAÇÃO decide, a detecção SUGERE.
#   adotado   exit 0 se o manifesto docs/ai/setup-manifest.yaml tem `backend_style: enxuto`. A declaração do
#             manifesto tem precedência: com `backend_style` declarado (purista, indefinido, nao-se-aplica…) só o
#             valor `enxuto` adota, mesmo que exista ADR com `ddd-pragmatico` (ex.: ADR Substituída). Só SEM
#             `backend_style` no manifesto uma ADR vigente em docs/adr/ ou docs/adrs/ contendo `ddd-pragmatico` adota.
#             Não é vigente (nem aqui nem em adr-estilo) a ADR de dívida (*debito*) nem a de status Rejeitada,
#             Substituída, Obsoleta, Depreciada (ou Rejected, Superseded, Deprecated).
#   declarado exit 0 se o manifesto tem a chave `backend_style` (qualquer valor: enxuto ou purista).
#   uow       exit 0 se há `class …UnitOfWork` em *.py fora dos excluídos (só detecta código).
#   use_cases exit 0 se há use_cases.py ou *.py dentro de um pacote use_cases/ fora dos excluídos (só detecta código).
#   Excluídos (as mesmas listas do check_ddd_pragmatico.py: mude os dois juntos): tests/, alembic/, migrations/,
#             scripts/, seeds/, test_*.py, *_test.py, conftest.py, seed*.py.
#   adr-estilo imprime `enxuto` (ADR com ddd-pragmatico, ou DDD + "vertical slic") ou `purista` (hexagonal,
#             ports and adapters, clean architecture) ou nada; o enxuto vence o empate. Sempre exit 0.
# O manifesto e os ADRs são procurados no cwd E na raiz git (o in_each.sh roda o comando dentro de cada
# subprojeto). Com git, considera também arquivos novos ainda não versionados (mas não os ignorados);
# sem git, usa find podando .venv venv node_modules vendor dist build .git .agents __pycache__ .tox site-packages.
# Fonte canônica: templates/architecture/ddd_detect.sh — usado nos `when`/`verify` das heurísticas do guia.
set -u

modo=${1:?uso: ddd_detect.sh adotado|declarado|uow|use_cases|adr-estilo}
PRUNE='-name node_modules -o -name .venv -o -name venv -o -name vendor -o -name dist -o -name build -o -name .git -o -name .agents -o -name __pycache__ -o -name .tox -o -name site-packages'
PODADO='(^|/)(\.venv|venv|node_modules|vendor|dist|build|\.git|\.agents|__pycache__|\.tox|site-packages)/'
EXCLUIDO='(^|/)((tests|alembic|migrations|scripts|seeds)/|test_[^/]*\.py$|[^/]*_test\.py$|conftest\.py$|seed[^/]*\.py$)'
UOW_RE='class [A-Za-z_]*UnitOfWork'
MANIFESTO='docs/ai/setup-manifest.yaml'

raiz_git=$(git rev-parse --show-toplevel 2>/dev/null) || raiz_git=

manifestos() {  # manifestos existentes: cwd e raiz git, normalizados (sem CR) um após o outro
  for m in "./$MANIFESTO" ${raiz_git:+"$raiz_git/$MANIFESTO"}; do
    [ -f "$m" ] && tr -d '\r' < "$m"
  done
}

manifesto_tem() { manifestos | grep -Eq "$1"; }  # $1 = regex ERE por linha

adr_arquivos() {  # ADRs vigentes (docs/adr e docs/adrs, no cwd e na raiz git): sem a de dívida e sem status inativo
  for b in . ${raiz_git:+"$raiz_git"}; do
    find "$b/docs/adr" "$b/docs/adrs" -type f 2>/dev/null
  done | while IFS= read -r f; do
    case "${f##*/}" in *debito*) continue ;; esac
    tr -d '\r' < "$f" | grep -Ei '^[[:space:]|#*_-]*status' |
      grep -Eiq 'rejeitad|substitu|obsolet|depreciad|rejected|superseded|deprecated' || printf '%s\n' "$f"
  done
}

adr_casa() {  # $1 = regex; ao menos um ADR o contém (sem distinção de caixa)
  adr_arquivos | while IFS= read -r f; do tr -d '\r' < "$f" | grep -Eiq "$1" && echo "$f"; done | grep -q .
}

adr_casa_todos() {  # $1 $2 = regex; ao menos um ADR contém os dois
  adr_arquivos | while IFS= read -r f; do
    t=$(tr -d '\r' < "$f")
    printf '%s\n' "$t" | grep -Eiq "$1" && printf '%s\n' "$t" | grep -Eiq "$2" && echo "$f"
  done | grep -q .
}

arquivos() {  # arquivos do projeto sob o cwd (com git: versionados + novos não ignorados)
  if [ -n "$raiz_git" ]; then
    git -c core.quotepath=false ls-files --cached --others --exclude-standard 2>/dev/null |
      while IFS= read -r f; do [ -e "$f" ] && printf '%s\n' "$f"; done   # o índice lista arquivo já removido
  else
    find . \( $PRUNE \) -prune -o -type f -print 2>/dev/null | sed 's#^\./##'
  fi | grep -Ev "$PODADO"
}

arquivos_py_com_uow() {
  if [ -n "$raiz_git" ]; then
    git -c core.quotepath=false grep --untracked -lE "$UOW_RE" -- '*.py' 2>/dev/null
  else
    find . \( $PRUNE \) -prune -o -type f -name '*.py' -print 2>/dev/null |
      while IFS= read -r f; do grep -Eq "$UOW_RE" "$f" 2>/dev/null && printf '%s\n' "$f"; done
  fi | grep -Ev "$PODADO" | grep -Ev "$EXCLUIDO"
}

case "$modo" in
  adotado)
    # a declaração do manifesto decide; a ADR só vale quando não há `backend_style`
    if manifesto_tem '^[[:space:]]*backend_style:'; then
      manifesto_tem '^[[:space:]]*backend_style:[[:space:]]*["'"'"']?enxuto["'"'"']?[[:space:]]*(#.*)?$'
      exit $?
    fi
    adr_casa 'ddd-pragmatico' && exit 0
    exit 1 ;;
  declarado)
    manifesto_tem '^[[:space:]]*backend_style:' ;;
  uow)
    arquivos_py_com_uow | grep -q . ;;
  use_cases)
    arquivos | grep -Ev "$EXCLUIDO" | grep -Eq '(^|/)use_cases(\.py|/.*\.py)$' ;;
  adr-estilo)
    if adr_casa 'ddd-pragmatico' || adr_casa_todos 'ddd' 'vertical slic'; then echo enxuto
    elif adr_casa 'hexagonal|ports and adapters|clean architecture'; then echo purista
    fi
    exit 0 ;;
  *)
    echo "modo desconhecido: $modo" >&2; exit 2 ;;
esac
