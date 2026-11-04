# 🐍 Suíte de Guias de Testes Backend

<div align="center">

[![Category](https://img.shields.io/badge/Category-Backend%20Testing-3B82F6?style=for-the-badge)](../../../README.md)
[![Pattern](https://img.shields.io/badge/Pattern-AAA%20%7C%20In--Memory%20Fixtures-10B981?style=for-the-badge)](test-writing-standards.md)

<p align="center">
  <b>Padrões de engenharia para testes unitários, testes de integração, fixtures assíncronas em memória e execução determinística para Backend.</b>
</p>

</div>

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto ou do serviço backend, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). Heurísticas Python ativam com `pyproject.toml`/`requirements*.txt`; PHP com `composer.json`; demais stacks ficam ⏭️. Os 4 guias abaixo são o conteúdo normativo que cada heurística referencia.

```yaml heuristics
guide: testing-backend
version: 4
requires: []
heuristics:
  - id: TESTB-01
    title: Python — pytest configurado (testpaths, --strict-markers, markers unit/integration/e2e)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python "! grep -qs 'tool.pytest' pyproject.toml && ! test -f pytest.ini"
    do: |
      agent: Se pyproject.toml existir, adicione (ou complete, sem duplicar tabelas) a seção [tool.pytest.ini_options] com
      testpaths = ["tests"], addopts = "-v --strict-markers" e markers = ["unit: testes unitários", "integration: testes de
      integração", "e2e: testes ponta a ponta"]. Sem pyproject.toml, crie pytest.ini com [pytest] e as mesmas chaves.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all python "{ grep -qs 'tool.pytest' pyproject.toml && python3 \"$AI_GUIDES_RUNTIME/templates/testing/check_toml.py\" pyproject.toml; } || grep -qs '^\\[pytest\\]' pytest.ini"

  - id: TESTB-02
    title: Python — dependências de teste declaradas (pytest, pytest-cov, pytest-xdist)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python "! grep -qs 'pytest-cov' pyproject.toml requirements*.txt || ! grep -qs 'pytest-xdist' pyproject.toml requirements*.txt"
    do: |
      agent: Declare pytest, pytest-cov e pytest-xdist como dependências de desenvolvimento com o gerenciador do projeto:
      `uv add --dev pytest pytest-cov pytest-xdist` (uv.lock ou [tool.uv]), `poetry add --group dev ...` ([tool.poetry])
      ou as três linhas em requirements-dev.txt (pip). Não altere dependências de produção.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all python "grep -qs 'pytest-cov' pyproject.toml requirements*.txt && grep -qs 'pytest-xdist' pyproject.toml requirements*.txt"

  - id: TESTB-03
    title: Python — estrutura tests/{unit,integration,e2e} com conftest.py global
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python "! test -d tests/unit || ! test -d tests/integration || ! test -d tests/e2e || ! test -f tests/conftest.py"
    do: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all python 'mkdir -p tests/unit tests/integration tests/e2e
        for d in tests/unit tests/integration tests/e2e; do test -n "$(ls -A "$d")" || touch "$d/.gitkeep"; done
        test -f tests/conftest.py || printf "\"\"\"Fixtures globais da suíte (db_session, app client). Ver guides/testing/backend/test-writing-standards.md.\"\"\"\n" > tests/conftest.py'
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all python "test -d tests/unit && test -d tests/integration && test -d tests/e2e && test -f tests/conftest.py"

  - id: TESTB-04
    title: Python — cobertura mínima de 80% imposta (fail_under ≥ 80)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python "! grep -Eqs '^[[:space:]]*fail_under[[:space:]]*=[[:space:]]*(8[0-9]|9[0-9]|100)' pyproject.toml .coveragerc setup.cfg"
    do: |
      agent: Meça a cobertura atual antes de impor o piso: rode a suíte com cobertura pelo runner do projeto
      (ex.: `uv run pytest --cov --cov-report=term -q`) e leia o TOTAL. Se pyproject.toml existir, adicione (sem duplicar
      tabelas) [tool.coverage.report] com fail_under e show_missing = true, e [tool.coverage.run] com source apontando
      para o pacote do projeto (ex.: ["src"] ou ["app"]); sem pyproject.toml, use .coveragerc ([report] fail_under /
      show_missing = True). O valor: 80 se o TOTAL já é ≥ 80%. Abaixo disso, nunca 80: use o TOTAL arredondado para baixo
      (catraca: o CI de hoje continua verde e a cobertura não pode cair) e registre `⚠️ TESTB-04: cobertura atual X%,
      fail_under = X (meta 80%)`. fail_under que o projeto já tinha nunca desce. Suíte que nem roda: não mexa e registre
      o motivo no ⚠️.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all python "grep -Eqs '^[[:space:]]*fail_under[[:space:]]*=[[:space:]]*(8[0-9]|9[0-9]|100)' pyproject.toml .coveragerc setup.cfg"
    depends_on: [TESTB-02]
    optional: true

  - id: TESTB-05
    title: PHP — Pest instalado com tests/Pest.php (Unit e Feature)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any php "! grep -q 'pestphp/pest' composer.json"
    do: |
      agent: Instale o Pest como dependência de desenvolvimento (`composer require pestphp/pest --dev --with-all-dependencies`),
      inicialize a suíte (`./vendor/bin/pest --init`) e garanta os diretórios tests/Unit e tests/Feature.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all php "grep -q 'pestphp/pest' composer.json && test -f tests/Pest.php"

  - id: TESTB-06
    title: Makefile com alvos test e test-cov
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python true && ! grep -qs '^test-cov:' Makefile
    do: |
      if ! test -f Makefile; then cp "$AI_GUIDES_RUNTIME/templates/Makefile.api.template" Makefile
      else
        grep -qs '^test:' Makefile || printf '\n# ai-guides: suíte de testes (guides/testing/backend)\ntest: ## Executar testes unitários e de integração\n\tpytest tests/ -v\n' >> Makefile
        printf '\n# ai-guides: cobertura (guides/testing/backend)\ntest-cov: ## Executar testes com relatório de cobertura\n\tpytest tests/ --cov --cov-report=term-missing\n' >> Makefile
      fi
    verify: "grep -qs '^test-cov:' Makefile"
    optional: true

  - id: TESTB-07
    title: CI executa a suíte com cobertura (GitHub Actions)
    when: |
      test -d .github/workflows && sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any python true && ! grep -qs 'pytest' .github/workflows/*.yml .github/workflows/*.yaml
    do: 'cp "$AI_GUIDES_RUNTIME/templates/testing/pytest-ci.yml" .github/workflows/tests-backend.yml'
    verify: "grep -qs 'pytest' .github/workflows/*.yml .github/workflows/*.yaml"
    depends_on: [TESTB-02]
    optional: true

  - id: TESTB-08
    title: AGENTS.md referencia os padrões de testes backend
    when: "! grep -q 'testing/backend' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md, na seção de guias normativos, a linha:
      "- **Suíte de Testes:** Siga `.agents/ai-guides/guides/testing/backend/README.md` (pirâmide Unit/Integration/E2E,
      padrão AAA, cobertura ≥ 80%)." Se AGENTS.md não existir, aplique antes o guia harness-commit-memoria.
    verify: "grep -q 'testing/backend' AGENTS.md"
```

---

## 📂 Guias Disponíveis no Diretório

```text
guides/testing/backend/
├── test-writing-standards.md      ──> Padrões de escrita AAA, nomenclatura e estratégias de mock
├── test-execution-guide.md        ──> Comandos de execução, filtros, paralelismo e relatórios
├── troubleshooting.md             ──> Diagnóstico e resolução de falhas comuns em testes
└── test-modernization-plan.md     ──> Roteiro de modernização de testes legados
```

---

## 📋 Detalhamento dos Guias

> ⚙️ Este README carrega as heurísticas `TESTB-01..08` (slug `testing-backend`), aplicadas pelo `/setup` via `setup-testing-backend`. Os guias abaixo são o conteúdo normativo referenciado por elas.


| Guia Técnico | Descrição & Propósito |
| :--- | :--- |
| [`test-writing-standards.md`](test-writing-standards.md) | Padrões canônicos para escrita de testes backend: estrutura AAA (Arrange-Act-Assert), nomenclatura descritiva em pt-BR/EN-US, isolamento total de estado, injeção de dependências e uso defensivo de mocks/fakes. |
| [`test-execution-guide.md`](test-execution-guide.md) | Manual prático de execução da suíte de testes: execução paralela com `pytest-xdist`, filtros por markers (`@pytest.mark.unit`, `@pytest.mark.integration`), geração de cobertura e flags de depuração (`-vv`, `--pdb`, `-s`). |
| [`troubleshooting.md`](troubleshooting.md) | Catálogo de erros comuns e soluções rápidas: poluição de estado entre testes, deadlocks em conexões de banco de dados, falhas em loops assíncronos `asyncio`, e mocks não restaurados em teardown. |
| [`test-modernization-plan.md`](test-modernization-plan.md) | Estratégia passo a passo para refatoração e modernização de bases legadas de testes, migrando testes lentos contra bancos físicos para fixtures assíncronas em memória (SQLite in-memory / transações atômicas). |
