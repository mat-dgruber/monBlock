# 🌐 Suíte de Guias de Testes Frontend & UI

<div align="center">

[![Category](https://img.shields.io/badge/Category-Frontend%20Testing-EC4899?style=for-the-badge)](../../../README.md)
[![E2E & Unit](https://img.shields.io/badge/Stack-Playwright%20%7C%20Signals%20%7C%20axe--core-10B981?style=for-the-badge)](test-writing-standards.md)

<p align="center">
  <b>Padrões de engenharia para testes de componentes, reatividade com Signals, testes de acessibilidade com axe-core e testes E2E com Playwright.</b>
</p>

</div>

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto ou do app frontend, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). Ativam com `package.json`; o runner (Angular/Karma, Vitest ou Jest) é detectado pelo agente no `do`. Os 4 guias abaixo são o conteúdo normativo que cada heurística referencia.

```yaml heuristics
guide: testing-frontend
version: 4
requires: []
heuristics:
  - id: TESTF-01
    title: Script npm "test" definido no package.json
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node "! python3 \"$AI_GUIDES_RUNTIME/templates/testing/npm_script.py\" test"
    do: |
      agent: Adicione em package.json → scripts o comando "test" do runner do projeto: Angular CLI → "ng test";
      Vitest → "vitest"; Jest → "jest". Não altere outros scripts.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node "python3 "$AI_GUIDES_RUNTIME/templates/testing/npm_script.py" test"

  - id: TESTF-02
    title: Script "test:ci" headless de disparo único com cobertura
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node "! python3 \"$AI_GUIDES_RUNTIME/templates/testing/npm_script.py\" test:ci"
    do: |
      agent: Adicione em package.json → scripts: Angular com builder `@angular/build:unit-test` no angular.json (Vitest,
      padrão desde o Angular 21) → "test:ci": "ng test --watch=false --coverage" (nunca `vitest run` direto: sem o
      builder os componentes não compilam); Angular/Karma → "ng test --watch=false --browsers=ChromeHeadless --code-coverage";
      Vitest → "vitest run --coverage"; Jest → "jest --ci --coverage". Cobertura com Vitest exige `@vitest/coverage-v8`
      nas devDependencies: instale se faltar. Rode o `test:ci` uma vez e reporte o resultado. Não altere outros scripts.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node "python3 "$AI_GUIDES_RUNTIME/templates/testing/npm_script.py" test:ci"
    depends_on: [TESTF-01]

  - id: TESTF-03
    title: Script "typecheck" (tsc --noEmit) antes da suíte
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node "test -f tsconfig.json && ! python3 \"$AI_GUIDES_RUNTIME/templates/testing/npm_script.py\" typecheck"
    do: |
      agent: Adicione em package.json → scripts: "typecheck": "tsc --noEmit" (ou "tsc -p tsconfig.app.json --noEmit" se o
      projeto tiver múltiplos tsconfig). Não altere outros scripts.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node "python3 "$AI_GUIDES_RUNTIME/templates/testing/npm_script.py" typecheck"

  - id: TESTF-04
    title: Threshold de cobertura ≥ 80% configurado no runner
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node "! grep -qsE 'coverageThreshold|thresholds|check: *\\{' angular.json karma.conf.js karma.conf.cjs vitest.config.ts vitest.config.js vitest.config.mts vite.config.ts jest.config.ts jest.config.js jest.config.cjs package.json"
    do: |
      agent: Meça a cobertura atual antes de impor o piso (`npm run test:ci` ou o runner do projeto, com cobertura).
      Configure o threshold (statements, lines, branches, functions) no runner: builder `@angular/build:unit-test` →
      `coverageThresholds` nas options do alvo test do angular.json (um vitest.config avulso não é lido); Karma →
      coverageReporter.check.global em karma.conf.js; Vitest → test.coverage.thresholds no vitest/vite config; Jest → coverageThreshold.global em jest.config
      ou package.json. O valor: 80 se a métrica já é ≥ 80%. Abaixo disso, nunca 80: use a métrica atual arredondada para
      baixo (catraca: o CI de hoje continua verde e a cobertura não pode cair) e registre no relatório
      `⚠️ TESTF-04: cobertura atual X%, threshold = X (meta 80%)`. Threshold que o projeto já tinha nunca desce. Metas por
      camada em test-execution-guide.md.
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node "grep -qsE 'coverageThreshold|thresholds|check: *\\{' angular.json karma.conf.js karma.conf.cjs vitest.config.ts vitest.config.js vitest.config.mts vite.config.ts jest.config.ts jest.config.js jest.config.cjs package.json"
    depends_on: [TESTF-02]

  - id: TESTF-05
    title: Playwright E2E configurado (playwright.config.ts + e2e/)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node "! ls playwright.config.* >/dev/null 2>&1"
    do: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node 'npm install --save-dev @playwright/test
        cp "$AI_GUIDES_RUNTIME/templates/testing/playwright.config.ts" playwright.config.ts
        mkdir -p e2e && { test -n "$(ls -A e2e)" || touch e2e/.gitkeep; }'
    verify: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --all node "ls playwright.config.* >/dev/null 2>&1 && grep -q '@playwright/test' package.json"
    optional: true

  - id: TESTF-06
    title: Makefile com alvos test, test-cov e test-e2e
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node true && ! grep -qs '^test-e2e:' Makefile
    do: |
      # shortcut: monorepo com vários apps node usa o primeiro; mais de um → o agente acrescenta os outros à mão
      d=$(sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" node --list | head -n 1); c=; [ "$d" = . ] || c="cd $d && "
      if ! test -f Makefile && [ -z "$c" ]; then cp "$AI_GUIDES_RUNTIME/templates/Makefile.frontend.template" Makefile
      else
        grep -qs '^test:' Makefile || printf '\n# ai-guides: suíte de testes (guides/testing/frontend)\ntest: ## Executar testes unitários e de componente\n\t%snpm test\n' "$c" >> Makefile
        grep -qs '^test-cov:' Makefile || printf '\ntest-cov: ## Executar testes com cobertura (headless)\n\t%snpm run test:ci\n' "$c" >> Makefile
        printf '\ntest-e2e: ## Executar testes End-to-End com Playwright\n\t%snpx playwright test\n' "$c" >> Makefile
      fi
    verify: "grep -qs '^test-e2e:' Makefile"
    optional: true

  - id: TESTF-07
    title: CI executa typecheck, suíte headless e E2E (GitHub Actions)
    when: |
      test -d .github/workflows && sh "$AI_GUIDES_RUNTIME/templates/in_each.sh" --any node true && ! grep -qs 'test:ci' .github/workflows/*.yml .github/workflows/*.yaml
    do: 'cp "$AI_GUIDES_RUNTIME/templates/testing/frontend-ci.yml" .github/workflows/tests-frontend.yml'
    verify: "grep -qs 'test:ci' .github/workflows/*.yml .github/workflows/*.yaml"
    depends_on: [TESTF-02]
    optional: true

  - id: TESTF-08
    title: AGENTS.md referencia os padrões de testes frontend
    when: "! grep -q 'testing/frontend' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md, na seção de guias normativos, a linha:
      "- **Suíte de Testes Frontend:** Siga `.agents/ai-guides/guides/testing/frontend/README.md` (AAA, specs co-localizadas,
      Signals/HTTP/Guards, cobertura ≥ 80%, E2E Playwright)." Se AGENTS.md não existir, aplique antes o guia harness-commit-memoria.
    verify: "grep -q 'testing/frontend' AGENTS.md"
```

---

## 📂 Guias Disponíveis no Diretório

```text
guides/testing/frontend/
├── test-writing-standards.md      ──> Padrões para componentes, Signals, mocks HTTP e a11y
├── test-execution-guide.md        ──> Execução de testes unitários (Karma/Vitest) e E2E (Playwright)
├── troubleshooting.md             ──> Resolução de flaky tests, timing issues e problemas de DOM
└── test-modernization-plan.md     ──> Plano de migração de testes legados para stacks modernas
```

---

## 📋 Detalhamento dos Guias

> ⚙️ Este README carrega as heurísticas `TESTF-01..08` (slug `testing-frontend`), aplicadas pelo `/setup` via `setup-testing-frontend`. Os guias abaixo são o conteúdo normativo referenciado por elas.


| Guia Técnico | Descrição & Propósito |
| :--- | :--- |
| [`test-writing-standards.md`](test-writing-standards.md) | Padrões de escrita para testes unitários de componentes, diretivas e pipes; testes de reatividade com Signals; interceptação de requisições HTTP (`HttpTestingController`); e testes automatizados de acessibilidade com `axe-core`. |
| [`test-execution-guide.md`](test-execution-guide.md) | Comandos e fluxos de execução: execução headless em CI/CD, modo watch interativo para desenvolvimento, execução de testes E2E com Playwright e geração de relatórios de cobertura. |
| [`troubleshooting.md`](troubleshooting.md) | Guia de diagnóstico para problemas comuns no frontend: testes intermitentes (*flaky tests*), erros de sincronização assíncrona (`fakeAsync`, `tick`), vazamento de listeners de eventos e falhas de renderização de template. |
| [`test-modernization-plan.md`](test-modernization-plan.md) | Roteiro para modernização de suítes frontend legadas, migrando testes baseados em polling para validação reativa determinística e integrando verificações de acessibilidade contínuas. |
