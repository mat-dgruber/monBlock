#!/usr/bin/env bash
# migrate_skills.sh [--check]: migra as skills locais de .claude/skills e .gemini/skills (e as skills planas
# .agents/skills/<nome>.md deixadas por versões antigas do /setup) para o padrão canônico
# .agents/skills/<nome>/SKILL.md, troca as pastas por symlinks e registra tudo no git, sem perder nada.
# - <nome>.md vira <nome>/SKILL.md; pasta, README.md e arquivo que não é .md são movidos intactos;
#   symlink é recriado apontando para o mesmo alvo; .gitkeep/.DS_Store saem.
# - .claude/skills (ou .gemini/skills) que já é symlink para outra pasta do projeto (ex.: ../skills de um
#   plugin): .agents/skills passa a apontar para essa pasta, que não é reestruturada.
# - Mesmo nome com conteúdo diferente é conflito: exit 1 sem tocar no item.
# Roda na raiz do projeto (cwd das heurísticas).
# --check: exit 1 se faltar symlink, se houver skill plana em .agents/skills ou se o git registrar a deleção
# de uma skill cujo conteúdo não está em .agents/skills (deleções já presentes no baseline da Fase 4 —
# test_baseline.sh save — são do usuário e não contam). Fonte: templates/harness/migrate_skills.sh — HARNESS-04.
set -euo pipefail
# Git Bash (Windows): link simbólico de verdade ou erro; sem isso o ln -s copia a pasta (precisa do Modo de Desenvolvedor)
MSYS="${MSYS:+$MSYS }winsymlinks:nativestrict"; export MSYS

TAB="$(printf '\t')"
BASELINE="${AI_GUIDES_BASELINE:-${TMPDIR:-/tmp}/ai-guides-baseline-$(pwd | cksum | cut -d' ' -f1)}"  # = test_baseline.sh

destino() {  # caminho versionado de skill → onde o conteúdo tem de estar depois da migração
  local rel="${1#*/skills/}"
  case "$rel" in
    .gitkeep|.DS_Store) echo "" ;;
    */*) case "$1" in .agents/*) echo "" ;; *) echo ".agents/skills/$rel" ;; esac ;;
    README.md|readme.md) echo ".agents/skills/$rel" ;;
    *.md) echo ".agents/skills/${rel%.md}/SKILL.md" ;;
    *) echo ".agents/skills/$rel" ;;
  esac
}

if [ "${1:-}" = "--check" ]; then
  ok=0
  for h in .claude .gemini; do
    [ -L "$h/skills" ] || { echo "$h/skills não é symlink para .agents/skills" >&2; ok=1; }
  done
  [ -d .agents/skills ] || { echo ".agents/skills ausente" >&2; exit 1; }
  if [ ! -L .agents/skills ]; then
    for f in .agents/skills/*.md; do
      case "$(basename "$f")" in README.md|readme.md) continue ;; esac
      [ -e "$f" ] && { echo "skill plana: $f (deve ser ${f%.md}/SKILL.md)" >&2; ok=1; }
    done
  fi
  if git rev-parse --verify -q HEAD >/dev/null 2>&1; then
    perdidas="$({ git -c core.quotepath=off diff HEAD --relative --name-only --no-renames --diff-filter=D -- .claude/skills .gemini/skills .agents/skills 2>/dev/null || true; } |
      while IFS= read -r p; do
        grep -qxF "$p" "$BASELINE/delecoes-antes.txt" 2>/dev/null && continue
        d="$(destino "$p")"; [ -z "$d" ] || [ -e "$d" ] || [ -L "$d" ] || echo "$p"
      done)"
    [ -z "$perdidas" ] || { echo "skills removidas do git sem cópia em .agents/skills:${TAB}$perdidas" >&2; ok=1; }
  fi
  exit $ok
fi

mover() {  # origem destino — nunca sobrescreve; conteúdo idêntico já no destino: só remove a origem
  if [ -e "$2" ] || [ -L "$2" ]; then
    if diff -rq "$1" "$2" >/dev/null 2>&1; then rm -rf "$1"; return; fi
    echo "conflito: $1 e $2 existem com conteúdo diferente; resolva à mão" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$2")"
  if [ -L "$1" ]; then  # recria o link apontando para o mesmo alvo a partir da nova profundidade
    local alvo; alvo="$(readlink "$1")"
    case "$alvo" in
      /*) ln -s "$alvo" "$2" ;;
      *) ln -s "$(python3 -c 'import os,sys; print(os.path.relpath(os.path.join(os.path.dirname(sys.argv[1]), sys.argv[2]), os.path.dirname(sys.argv[3])))' "$1" "$alvo" "$2")" "$2" ;;
    esac
    rm "$1"
  else
    mv "$1" "$2"
  fi
}

# Harness que já aponta para uma pasta canônica do projeto: .agents/skills adota essa pasta
for h in .claude .gemini; do
  [ -L "$h/skills" ] && [ -d "$h/skills" ] || continue
  alvo="$(cd "$h/skills" && pwd -P)"
  atual="$(cd .agents/skills 2>/dev/null && pwd -P || true)"
  [ "$alvo" = "$atual" ] && continue
  if [ -n "$atual" ] && [ -n "$(ls -A .agents/skills)" ]; then
    echo "conflito: $h/skills aponta para $alvo, mas .agents/skills já tem outras skills; unifique à mão" >&2
    exit 1
  fi
  if [ -L .agents/skills ]; then rm .agents/skills; elif [ -d .agents/skills ]; then rmdir .agents/skills; fi
  mkdir -p .agents
  ln -s "$(readlink "$h/skills")" .agents/skills  # .claude/ e .agents/ são irmãos: o link relativo vale igual
done

mkdir -p .agents/skills
if [ ! -L .agents/skills ]; then
  for f in .agents/skills/*.md; do
    case "$(basename "$f")" in README.md|readme.md) continue ;; esac
    if [ -f "$f" ] || [ -L "$f" ]; then mover "$f" "${f%.md}/SKILL.md"; fi
  done
fi

for h in .claude .gemini; do
  dir="$h/skills"
  if [ -d "$dir" ] && [ ! -L "$dir" ]; then
    for item in "$dir"/* "$dir"/.[!.]*; do
      [ -e "$item" ] || [ -L "$item" ] || continue
      base="$(basename "$item")"
      case "$base" in
        .gitkeep|.DS_Store) rm -f "$item" ;;
        README.md|readme.md) mover "$item" ".agents/skills/$base" ;;
        *.md) if [ -d "$item" ]; then mover "$item" ".agents/skills/$base"; else mover "$item" ".agents/skills/${base%.md}/SKILL.md"; fi ;;
        *) mover "$item" ".agents/skills/$base" ;;
      esac
    done
    rmdir "$dir" || { echo "conflito: $dir ainda tem entradas que não foram migradas" >&2; exit 1; }
  fi
  mkdir -p "$h"
  ln -sfn ../.agents/skills "$dir"
done

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add -A -- .agents/skills .claude/skills .gemini/skills 2>/dev/null || true
fi
