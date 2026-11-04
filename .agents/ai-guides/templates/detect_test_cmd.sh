#!/usr/bin/env sh
# detect_test_cmd.sh: imprime o comando que roda a suíte de testes JÁ EXISTENTE do projeto no diretório atual
# (make test > pytest > pest/phpunit > go > cargo > npm run test:ci > npm test). Exit 1 se o projeto não tem suíte.
# Uso no G6 do /setup: cmd=$(sh detect_test_cmd.sh) && sh -c "$cmd"
# Fonte canônica: templates/detect_test_cmd.sh.

if grep -qs '^test:' Makefile; then
  echo "make test"
elif grep -qsE '(^|[^a-z0-9_-])pytest([^a-z0-9_-]|$)' pyproject.toml setup.cfg pytest.ini tox.ini requirements*.txt || { test -f pyproject.toml && test -d tests; }; then
  # o runner do gerenciador que o projeto já usa — nunca cria .venv/uv.lock num projeto Poetry ou pip
  if test -f poetry.lock; then echo "poetry run pytest"
  elif test -f uv.lock; then echo "uv run pytest"
  else echo "python3 -m pytest"
  fi
elif grep -qs '"pestphp/pest"' composer.json; then
  echo "./vendor/bin/pest"
elif grep -qs '"phpunit/phpunit"' composer.json; then
  echo "./vendor/bin/phpunit"
elif test -f go.mod; then
  echo "go test ./..."
elif test -f Cargo.toml; then
  echo "cargo test"
elif grep -qs '"test:ci"[[:space:]]*:' package.json; then
  echo "npm run test:ci"
elif grep -qs '"test"[[:space:]]*:' package.json && ! grep -qs 'no test specified' package.json; then
  echo "npm test"
else
  exit 1
fi
