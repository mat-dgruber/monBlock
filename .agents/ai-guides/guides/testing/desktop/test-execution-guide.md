# 🚀 Guia de Execução de Testes Desktop

> **Fonte Normativa:** `guides/testing/desktop/test-execution-guide.md`  
> **Escopo:** Execução local, modo headless, runners multi-OS e matriz de CI/CD.

---

## 1. Execução Local Rápida (Desenvolvimento Contínuo)

Durante o desenvolvimento diário, priorize testes unitários de execução sub-segundo:

```bash
# Executa todos os testes unitários de Main, Utility e Renderer
npm run test:unit

# Modo interativo com Hot-Module-Replacement de testes via Vitest
npm run test:unit -- --watch

# Executa testes com medição de cobertura de código
npm run test:coverage
```

---

## 2. Execução E2E Local com Playwright Electron

Para validar a integração completa com o motor Chromium e APIs do sistema operacional:

```bash
# 1. Compila os bundles (main, preload e renderer)
npm run build

# 2. Executa a suíte ponta a ponta
npm run test:e2e

# 3. Execução em modo depuração com Playwright Inspector
npx playwright test --debug
```

---

## 3. Execução Headless no Linux com Xvfb

Diferente de testes em navegadores que possuem modo `--headless` nativo, o Electron tradicionalmente inicializa um servidor gráfico completo. Em ambientes de servidor Linux (Docker, agentes de CI ou WSL):

```bash
# Instala o Virtual Framebuffer (se em máquina local ou container Debian/Ubuntu)
sudo apt-get install -y xvfb libasound2 libgbm1 libnss3

# Executa os testes sob display virtual
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" -- npm run test:e2e
```

---

## 4. Esteira de CI/CD Multi-OS (GitHub Actions)

Aplicações desktop corporativas devem ser testadas nos 3 sistemas operacionais reais para validar comportamentos de janela, atalhos e binários nativos:

```yaml
# .github/workflows/desktop-tests.yml
name: Desktop Test Suite

on:
  push:
    branches: [main, dev*]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    name: Unit Tests (Fast Feedback)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Verifica cobertura mínima de 80%
        run: npx c8 check-coverage --lines 80 --functions 80 --branches 75

  e2e-matrix:
    name: E2E Tests on ${{ matrix.os }}
    needs: unit-tests
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build

      - name: Execução E2E Linux (com Xvfb)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update && sudo apt-get install -y xvfb libgbm1
          xvfb-run --auto-servernum -- npm run test:e2e

      - name: Execução E2E macOS / Windows
        if: runner.os != 'Linux'
        run: npm run test:e2e
```

---

## 5. Otimizações de Cache e Dependências Nativas

Módulos compilados em C++ (como `better-sqlite3` ou `@parcel/watcher`) precisam ser recompilados para o ABI exato da versão do Electron em uso:
- Adicione `@electron/rebuild` nos scripts de `postinstall` (`electron-rebuild -f -w better-sqlite3`).
- Cacheie os diretórios `.cache` e `node_modules` no CI/CD com chaves baseadas no `package-lock.json` e versão do SO para evitar compilações C++ redundantes a cada commit.
