# Guia de Execução de Testes Frontend (Modern Angular & SPAs)

## Comandos Essenciais de Execução

Todos os comandos de teste devem ser executados a partir do diretório raiz do projeto frontend (`frontend/` ou raiz do repositório):

---

### 1. Checagem Estática de Tipos (TypeScript)

Antes de rodar a suíte de testes unitários, execute a verificação estática de tipos para garantir integridade e ausência de regressões de tipagem:

```bash
# Executa a verificação estática de tipos sem emitir arquivos compilados
npx tsc --noEmit
```

---

### 2. Execução de Testes Unitários e de Componente

#### Execução Rápida em Modo Watch (Desenvolvimento Local)

Durante o desenvolvimento diário, utilize o modo watch para reexecução automática a cada salvamento:

```bash
# Angular CLI com Karma / Vitest / Webpack
npm test

# Ou explicitamente via CLI
npm test -- --watch=true
```

#### Execução Headless para CI/CD e Pre-commit

Para pipelines de integração contínua e hooks de pre-commit, execute a suíte em modo headless de disparo único:

```bash
# Executa todos os testes e finaliza o processo (exit code 0 para sucesso, 1 para falha)
npm test -- --watch=false --browsers=ChromeHeadless
```

Em ambientes Docker/Linux CI onde o Chrome requer flags de isolamento:

```bash
# Execução com flags sandbox desativadas
CHROME_BIN=/usr/bin/google-chrome npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
```

---

### 3. Geração de Relatórios de Cobertura de Código

Gere relatórios nos formatos LCOV (para SonarQube / Codecov) e HTML navegável:

```bash
# Execução com coleta de cobertura
npm test -- --watch=false --browsers=ChromeHeadless --code-coverage
```

Os artefatos serão disponibilizados em:
- **LCOV**: `coverage/lcov.info`
- **Relatório HTML**: `coverage/index.html` (abra diretamente no navegador para inspecionar linhas e branches não cobertos)

---

### 4. Execução Focada e Seletiva (Single Spec / Test)

Para depurar um teste específico sem executar toda a suíte:

#### Via Código (Jasmine / Jest)

Substitua `describe` por `fdescribe` ou `it` por `fit`:

```typescript
// Executa exclusivamente esta suíte
fdescribe('UserCardComponent', () => { ... });

// Executa exclusivamente este caso de teste
fit('deve emitir evento de clique com o ID do usuario', () => { ... });
```

```bash
# Executa apenas testes que contenham o termo no nome
npm test -- --include="src/app/services/user.service.spec.ts"
```

---

### 5. Execução E2E com Playwright: Usando Navegadores do Sistema

Por padrão, o Playwright baixa centenas de megabytes em binários isolados do Chromium, Firefox e WebKit. Em máquinas de desenvolvimento locais, você pode configurar o Playwright para utilizar diretamente o **Google Chrome** ou **Microsoft Edge** nativo já instalado no sistema operacional, poupando espaço em disco e acelerando a inicialização.

#### Configuração via `channel` (Recomendado)

No arquivo `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    /* Roda em headless no CI e permite ver o navegador abrindo caso false */
    headless: !!process.env.CI,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Google Chrome Nativo',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome', // Utiliza a instalação nativa do Google Chrome do SO
      },
    },
    {
      name: 'Microsoft Edge Nativo',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge', // Utiliza a instalação nativa do MS Edge do SO
      },
    },
  ],
});
```

#### Apontando para Navegador Alternativo (`executablePath`)

Caso utilize navegadores como Brave, Arc ou Vivaldi:

```typescript
// playwright.config.ts
use: {
  /* Exemplo macOS */
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  // Brave macOS: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  // Arc macOS:   '/Applications/Arc.app/Contents/MacOS/Arc'
  // Linux:       '/usr/bin/google-chrome'
  // Windows:     'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
}
```

---

### 6. Prevenção de Download de Binários (`.npmrc` e Env Vars)

Para garantir que o `npm install` nunca faça o download de binários pesados de navegadores em ferramentas de teste (Playwright, Puppeteer, Cypress), defina regras em um arquivo `.npmrc` na raiz do repositório ou no ambiente:

```ini
# .npmrc na raiz do projeto
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CYPRESS_INSTALL_BINARY=0
```

Para comandos avulsos no terminal:
```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

---

### 7. Execução Silenciosa (Headless) no Karma sem Abertura Visual

Para suítes que utilizam Karma/Jasmine e não devem abrir janelas na tela nem concorrer com o foco de trabalho do desenvolvedor:

```javascript
// karma.conf.js
module.exports = function (config) {
  config.set({
    // Utiliza ChromeHeadless para execução 100% invisível em background
    browsers: ['ChromeHeadless'],
    singleRun: true,
    customLaunchers: {
      ChromeHeadlessCustom: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-translate',
          '--disable-extensions'
        ]
      }
    }
  });
};
```

---

### 8. Matriz de Realidade de Testes: Projetos Modernos / SSR vs SPAs Tradicionais

| Aspecto | Projetos Modernos / SSG (Astro, Next, Vite) | SPAs Tradicionais (Angular / React / Vue Legado) |
| :--- | :--- | :--- |
| **Runner Unitário** | **`node --test`** ou **`vitest`** (ultra-rápido, sem dependências de browser para lógica) | Karma + Jasmine ou Jest |
| **Execução de E2E** | Playwright conectando ao servidor local usando canal nativo (`channel: 'chrome'`) | Playwright / Cypress com mocks de rede |
| **Download de Navegadores** | **Desativado via `.npmrc`** (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) usando navegador nativo do SO | Frequentemente consome centenas de MBs baixando Chromium isolado |
| **Visibilidade** | Execução 100% silenciosa em terminal | Karma abre navegador visível caso não configurado com `ChromeHeadless` |

---

## Metas de Cobertura e Governança de Qualidade

| Camada da Aplicação | Diretório Típico | Cobertura Mínima Recomendada |
| :--- | :--- | :--- |
| **Serviços HTTP e Signals State** | `src/app/services/`, `src/app/state/` | **≥ 85%** |
| **Route Guards e Interceptors** | `src/app/guards/`, `src/app/interceptors/` | **≥ 90%** |
| **Componentes de UI Reutilizáveis** | `src/app/components/`, `src/app/ui/` | **≥ 80%** |
| **Componentes de Página (Containers)** | `src/app/pages/`, `src/app/features/` | **≥ 70%** |


