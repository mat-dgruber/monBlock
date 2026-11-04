#!/usr/bin/env sh
# test_baseline.sh save|check: prova que o /setup não quebrou a suíte de testes nem o lint que o projeto já tinha.
#   save  (início da Fase 4, antes de qualquer sub-skill): roda a suíte do projeto — a da raiz, se existir (é o
#         ponto de entrada que o projeto declara); senão, a de cada subprojeto de detect_stack.sh — e grava dir,
#         comando, exit code e log, mais as deleções que já existiam no git (lidas por migrate_skills.sh --check).
#         Roda também o lint do projeto: o `make lint` da raiz, se existir e não reescrever arquivo (--fix, format
#         sem --check); senão o Ruff de cada subprojeto Python que o declara ou configura (`ruff check --no-fix .`: nem o
#         `fix = true` da config reescreve arquivo).
#   check (G6): reexecuta os MESMOS comandos. Verde antes e vermelho agora → ❌ (exit 1). Vermelho antes: compara
#         os ids de teste que falharam (pytest FAILED/ERROR, jest FAIL) — id novo → ❌; senão ⚠️ "sem falha nova",
#         ou ⚠️ "baseline cego" se a suíte nem executou os testes (o G6 não prova ausência de regressão). O pytest
#         roda com --continue-on-collection-errors (acrescentado ao PYTEST_ADDOPTS): erro de coleta pré-existente
#         não esconde falha nova. Comando novo (ex.: `make test` criado pelo setup) roda e é reportado como novo;
#         falhando, ❌. Lint: verde antes e vermelho agora → ❌ (o setup ligou regra sobre violação que o código já
#         tinha, e o CI que passava quebraria); vermelho antes → ⚠️ com as violações antes → agora.
# As suítes rodam com CI=true e stdin fechado (runners saem do modo watch).
# Estado em $AI_GUIDES_BASELINE (padrão: $TMPDIR/ai-guides-baseline-<hash do projeto>), fora do repositório.
# Fonte canônica: templates/test_baseline.sh.
set -u

modo=${1:?uso: test_baseline.sh save|check}
R=${AI_GUIDES_RUNTIME:-$PWD/.agents/ai-guides}
B=${AI_GUIDES_BASELINE:-${TMPDIR:-/tmp}/ai-guides-baseline-$(pwd | cksum | cut -d' ' -f1)}
TAB=$(printf '\t')

suites() {  # dir<TAB>comando: a suíte da raiz, se houver; senão a de cada subprojeto
  if cmd=$(sh "$R/templates/detect_test_cmd.sh"); then printf '.\t%s\n' "$cmd"; return; fi
  for a in python node php go rust; do sh "$R/templates/detect_stack.sh" "$a" --list 2>/dev/null; done |
    sort -u | while IFS= read -r d; do
      cmd=$(cd "$d" && sh "$R/templates/detect_test_cmd.sh") && printf '%s\t%s\n' "$d" "$cmd"
    done
}
# lint que o projeto já roda (é o que o CI dele roda): o `make lint` da raiz, se existir e só ler; senão o Ruff de
# cada subprojeto Python que o declara ou configura. Nunca --fix: o baseline não pode mexer no código.
# ponytail: "pode reescrever" = --fix/--write/format/black/isort sem --check/--diff num comando do `make -n lint`, ou
# pre-commit/npm/yarn/pnpm/npx (não dá para ver o que rodam); falso positivo só troca o make lint pelo Ruff direto.
lints() {  # dir<TAB>comando
  if grep -qs '^lint:' Makefile && ! make -n lint 2>/dev/null | tr ';&' '\n\n' |
      grep -E -- '--fix|--write|format|black|isort|pre-commit|npm |yarn|pnpm|npx' | grep -qvE -- '--check|--diff'; then
    printf '.\tmake lint\n'; return
  fi
  sh "$R/templates/detect_stack.sh" python --list 2>/dev/null | while IFS= read -r d; do
    (cd "$d" && { grep -qsw ruff pyproject.toml requirements*.txt .pre-commit-config.yaml || test -f ruff.toml || test -f .ruff.toml; }) || continue
    if test -f "$d/uv.lock"; then r="uv run --frozen ruff"; elif test -f "$d/poetry.lock"; then r="poetry run ruff"; else r=ruff; fi
    printf '%s\t%s check --no-fix .\n' "$d" "$r"
  done
}
violacoes() { grep -oE 'Found [0-9]+ errors?' "$1" 2>/dev/null | grep -oE '[0-9]+' | tail -1; }
# stdin fechado: a suíte não consome a lista. O pytest segue depois de erro de coleta: sem isso, uma coleta já
# quebrada interrompe a suíte e um teste novo quebrado passa sem id (baseline cego).
roda() { (cd "$1" && CI=true PYTEST_ADDOPTS="${PYTEST_ADDOPTS:+$PYTEST_ADDOPTS }--continue-on-collection-errors" sh -c "$2") </dev/null >"$3" 2>&1; }
log() { printf '%s/%s.%s.log' "$B" "$(printf '%s' "$1" | tr '/ ' '__')" "$2"; }
# ids de teste: pytest `FAILED|ERROR <arquivo.py[::teste]>`, jest `FAIL <arquivo.[cm][jt]sx>` — não linha de cobertura nem log capturado
falhas() { grep -E '^(FAILED|ERROR) [^ ]+(::|\.py)|^FAIL +[^ ]+\.[cm]?[jt]sx?( |$)' "$1" 2>/dev/null | sed 's/ - .*//' | LC_ALL=C sort -u; }
cego() { grep -qE 'errors? during collection|no tests ran|Interrupted:' "$1" 2>/dev/null; }

case "$modo" in
  save)
    rm -rf "$B" && mkdir -p "$B" && : >"$B/baseline.tsv" && : >"$B/lint.tsv"
    git -c core.quotepath=off diff HEAD --relative --name-only --no-renames --diff-filter=D >"$B/delecoes-antes.txt" 2>/dev/null || :
    suites | while IFS="$TAB" read -r d cmd; do
      roda "$d" "$cmd" "$(log "$d" antes)"; rc=$?
      printf '%s\t%s\t%s\n' "$d" "$cmd" "$rc" >>"$B/baseline.tsv"
      if [ "$rc" = 0 ]; then echo "baseline $d: verde ($cmd)"; else echo "baseline $d: VERMELHO ($cmd)"; fi
    done
    lints | while IFS="$TAB" read -r d cmd; do
      roda "$d" "$cmd" "$(log "$d" lint-antes)"; rc=$?
      printf '%s\t%s\t%s\n' "$d" "$cmd" "$rc" >>"$B/lint.tsv"
      if [ "$rc" = 0 ]; then echo "lint $d: verde ($cmd)"; else echo "lint $d: VERMELHO ($cmd)"; fi
    done
    ;;
  check)
    [ -f "$B/baseline.tsv" ] || { echo "sem baseline em $B: rode 'test_baseline.sh save' no início da Fase 4"; exit 2; }
    falhou=0
    while IFS="$TAB" read -r d cmd rc; do
      roda "$d" "$cmd" "$(log "$d" depois)"; agora=$?
      if [ "$agora" = 0 ]; then echo "✅ $d: $cmd"
      elif [ "$rc" = 0 ]; then echo "❌ $d: $cmd passava antes do setup e agora falha (log: $(log "$d" depois))"; falhou=1
      else
        a=$(log "$d" antes); p=$(log "$d" depois)
        falhas "$a" >"$B/f.antes"; falhas "$p" >"$B/f.depois"
        novas=$(LC_ALL=C comm -13 "$B/f.antes" "$B/f.depois")
        if [ -n "$novas" ]; then
          echo "❌ $d: $cmd já falhava, mas tem falha nova desde o baseline (log: $p):"
          printf '%s\n' "$novas" | sed 's/^/   /'; falhou=1
        elif cego "$a"; then
          echo "⚠️ $d: $cmd já falhava e nem executou os testes (baseline cego: o G6 não prova ausência de regressão; conserte a coleta) — log: $a"
        elif [ -s "$B/f.depois" ]; then
          echo "⚠️ $d: $cmd já falhava antes do setup, sem falha nova ($(wc -l <"$B/f.depois" | tr -d ' ') falha(s) pré-existente(s))"
        else
          echo "⚠️ $d: $cmd já falhava antes do setup, sem ids de teste para comparar — compare $a × $p"
        fi
      fi
    done <"$B/baseline.tsv"
    test -f "$B/lint.tsv" || : >"$B/lint.tsv"   # baseline salvo por versão anterior, sem lint
    while IFS="$TAB" read -r d cmd rc; do
      roda "$d" "$cmd" "$(log "$d" lint-depois)"; agora=$?
      if [ "$agora" = 0 ]; then echo "✅ $d: $cmd"
      elif [ "$rc" = 0 ]; then
        echo "❌ $d: $cmd passava antes do setup e agora falha — regra de lint ligada sobre violação que o código já tinha (log: $(log "$d" lint-depois))"; falhou=1
      else
        a=$(violacoes "$(log "$d" lint-antes)"); p=$(violacoes "$(log "$d" lint-depois)")
        echo "⚠️ $d: $cmd já falhava antes do setup${a:+ ($a → ${p:-?} violações)}: regra nova não quebra lint que já estava vermelho"
      fi
    done <"$B/lint.tsv"
    cut -f1,2 "$B/baseline.tsv" >"$B/conhecidas.tsv"
    suites >"$B/agora.tsv"
    while IFS="$TAB" read -r d cmd; do
      grep -qxF "$d$TAB$cmd" "$B/conhecidas.tsv" && continue
      roda "$d" "$cmd" "$(log "$d" novo)"
      if [ $? = 0 ]; then echo "✅ $d: $cmd (comando novo, criado pelo setup)"
      else echo "❌ $d: $cmd (comando novo, criado pelo setup) falha (log: $(log "$d" novo))"; falhou=1
      fi
    done <"$B/agora.tsv"
    exit $falhou
    ;;
  *) echo "uso: test_baseline.sh save|check" >&2; exit 2 ;;
esac
