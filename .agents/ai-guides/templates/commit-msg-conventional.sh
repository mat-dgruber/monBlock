#!/bin/sh
# ai-guides: valida Conventional Commits (semver-versioning-guide.md §4). Merges e reverts são aceitos.
MSG="$(head -n1 "$1")"
case "$MSG" in
  Merge*|Revert*|fixup!*|squash!*) exit 0 ;;
esac
if ! printf '%s\n' "$MSG" | grep -Eq '^(feat|fix|perf|refactor|docs|style|chore|test|build|ci|revert)(\([a-z0-9._/-]+\))?!?: .+'; then
  echo "commit-msg: use Conventional Commits — ex.: 'feat(api): adicionar endpoint de login'" >&2
  echo "  tipos: feat fix perf refactor docs style chore test build ci revert; '!' ou 'BREAKING CHANGE:' para MAJOR" >&2
  exit 1
fi
