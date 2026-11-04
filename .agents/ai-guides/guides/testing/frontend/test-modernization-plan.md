# Arquitetura e Plano de Padronização de Testes Frontend (Modern Angular & SPAs)

## Visão Geral da Arquitetura de Testes

Aplicações frontend modernas baseadas em **Angular Standalone**, **Signals**, **RxJS** e roteamento reativo demandam uma estratégia de testes em camadas, garantindo alta cobertura funcional, velocidade de execução e independência de backends externos durante os testes automatizados.

A suíte é estruturada em três níveis complementares que compõem a pirâmide de testes de interface:

---

## Pirâmide de Testes Frontend

```
        / \
       /   \     10% E2E Tests (Playwright / Cypress — Jornadas Críticas e Integração Completa)
      / E2E \
     /-------\   20% Component Integration (TestBed Standalone + DOM Events + Form Bindings)
    / Integra \
   /-----------\ 70% Unit & State Tests (Reactive Services, Signals, Guards, Interceptors, UI Atômica)
  /  Unitários  \
 /---------------\
```

### 1. Testes Unitários e de Estado (~70%)
- **Escopo**: Serviços HTTP de acesso a dados (`AuthService`, `BillingService`, `NotificationService`), Signal Stores, Functional Route Guards (`CanActivateFn`), HTTP Interceptors (`HttpInterceptorFn`), Pipes e componentes atômicos puros.
- **Isolamento**: Completo. Todas as chamadas de rede são interceptadas via `provideHttpClientTesting()` / `HttpTestingController`. Dependências de roteamento utilizam mocks leves ou `provideRouter([])`.
- **Objetivo**: Validar regras de negócio, transformação de dados, tratamento de erros HTTP e propagação de estado reativo em milissegundos.

### 2. Testes de Integração de Componentes (~20%)
- **Escopo**: Componentes de página e organismos compostos (`DashboardPageComponent`, `UserModalComponent`, `DataTableComponent`, `FilterBarComponent`).
- **Renderização**: Utiliza `TestBed` com `ComponentFixture`, disparando eventos de DOM (`click`, `input`), inspecionando templates renderizados e validando bindings de formulários reativos (`ReactiveFormsModule`).
- **Objetivo**: Garantir que a integração entre template, signals de estado e serviços injetados responda corretamente às ações do usuário.

### 3. Testes End-to-End (~10%)
- **Escopo**: Fluxos e jornadas de usuário de ponta a ponta executadas em navegadores reais:
  1. Autenticação e controle de acesso baseado em perfis (RBAC).
  2. Operações CRUD críticas e submissão de formulários complexos.
  3. Comportamento de navegação, deep-linking e persistência de sessão.
  4. Resiliência de interface frente a indisponibilidade temporária de rede (exibição de toasts e feedbacks de erro).

---

## Princípios Fundamentais de Testabilidade

1. **Determinismo e Isolamento de Rede**: Testes unitários e de componentes nunca realizam requisições HTTP reais. Todo tráfego é simulado de forma síncrona ou controlada.
2. **Foco no Comportamento do Usuário**: Asserções de componentes inspecionam o DOM renderizado (textos, botões desabilitados, mensagens de validação) em vez de verificar propriedades privadas de classes.
3. **Gestão do Ciclo de Vida Reativo**: Controle estrito de subscrições com `takeUntilDestroyed()`, cancelamento de efeitos assíncronos e verificação de requisições pendentes via `httpMock.verify()`.
4. **Alinhamento com Paradigma Standalone**: Utilização exclusiva de `TestBed.configureTestingModule({ imports: [...] })` sem dependência de `NgModules` legados.

