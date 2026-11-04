# Troubleshooting e Resolução de Problemas em Testes Frontend

## Problemas Comuns e Diagnósticos

---

### 1. Erro `ChromeHeadless failed to connect` ou Desconexão do Runner

#### Sintoma
O runner de testes falha ao iniciar em contêineres Docker ou pipelines CI com mensagem `Disconnected (0 times) re-connected` ou falha de inicialização do processo do Chrome.

#### Causa
Ausência das flags `--no-sandbox` e `--disable-gpu` requeridas pelo Chrome em ambientes Linux sem interface gráfica ou sem privilégios de root.

#### Solução
Configure um browser customizado no arquivo de configuração do runner ou passe as flags via script de CI:

```bash
# Execução com browser headless configurado para CI
npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
```

Exemplo de configuração customizada:

```typescript
// karma.conf.js / test runner config
customLaunchers: {
  ChromeHeadlessNoSandbox: {
    base: 'ChromeHeadless',
    flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  }
}
```

---

### 2. Requisições HTTP Pendentes no `HttpTestingController`

#### Sintoma
Falha no bloco `afterEach(() => httpMock.verify())` com o erro:
`Expected no open requests, found 1 request(s): GET /api/v1/resource`

#### Causa
Um método de serviço ou componente disparou uma chamada HTTP que não foi interceptada via `httpMock.expectOne(...)` e respondida com `req.flush(...)` ou `req.error(...)`.

#### Solução
Certifique-se de interceptar todas as chamadas disparadas durante o teste e fornecer a resposta simulada:

```typescript
// Arrange & Act
service.loadData().subscribe();

// Assert & Flush
const req = httpMock.expectOne('/api/v1/resource');
expect(req.request.method).toBe('GET');
req.flush({ data: [] });
```

Caso o método não deva disparar requisições em determinada condição:

```typescript
httpMock.expectNone('/api/v1/resource');
```

---

### 3. Componentes Standalone não Encontrados (`NG0304: 'app-element' is not a known element`)

#### Sintoma
Erro de compilação de template durante a inicialização de um componente em teste:
`NG0304: 'app-user-card' is not a known element`

#### Causa
Em arquiteturas Angular Standalone, componentes, diretivas e pipes utilizados no template do componente sob teste devem ser explicitamente importados no array `imports` do `TestBed.configureTestingModule`.

#### Solução
Importe as dependências de UI standalone diretamente no módulo de teste:

```typescript
await TestBed.configureTestingModule({
  imports: [
    DashboardPageComponent,
    UserCardComponent,
    ButtonComponent
  ],
  providers: [
    provideHttpClient(),
    provideHttpClientTesting()
  ]
}).compileComponents();
```

---

### 4. Timing de Signals e `effect()` não Disparados

#### Sintoma
Valores de `signal()` foram atualizados, mas o callback dentro de um `effect()` registrado não executou antes das asserções (`expect(...)`).

#### Causa
Diferente de `computed()`, que recalcula valores sincronicamente sob demanda, instâncias de `effect()` agendam sua execução em microtasks assíncronas gerenciadas pelo framework.

#### Solução
Chame `TestBed.flushEffects()` ou `fixture.detectChanges()` para forçar a execução imediata de todos os efeitos pendentes:

```typescript
it('deve executar efeito colateral apos atualizacao de signal', () => {
  store.setFilter('categoria-a');

  // Força o processamento de effects enfileirados
  TestBed.flushEffects();

  expect(serviceSpy.onFilterChanged).toHaveBeenCalledWith('categoria-a');
});
```

---

### 5. Vazamento de Subscriptions RxJS e Testes Instáveis (*Memory Leaks*)

#### Sintoma
Testes subsequentes recebem emissões de testes anteriores, gerando asserções duplicadas ou timeouts intermitentes em suítes longas.

#### Causa
Observables inscritos via `.subscribe()` sem mecanismo de cancelamento de ciclo de vida (`takeUntilDestroyed()`, `take(1)`, ou `Subscription.unsubscribe()`).

#### Solução
1. Utilize o operador `takeUntilDestroyed()` em componentes e serviços:

```typescript
// Componente / Servico
@Injectable()
export class NotificationService {
  private destroyRef = inject(DestroyRef);

  listenEvents(stream$: Observable<Event>): void {
    stream$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
```

2. Nos testes, limpe subscrições manuais no gancho `afterEach`:

```typescript
let sub: Subscription;

afterEach(() => {
  if (sub && !sub.closed) {
    sub.unsubscribe();
  }
});
```

---

### 6. Asserções Assíncronas no DOM com `fakeAsync` e `tick`

#### Sintoma
Testes que envolvem debounce de inputs, timers (`setTimeout`) ou transições assíncronas falham porque o DOM ainda não refletiu o novo estado no momento do `expect`.

#### Causa
A alteração de estado está agendada na fila de macro/microtasks assíncronas e o DOM não foi re-renderizado.

#### Solução
Utilize a zona de teste `fakeAsync` combinada com `tick()` para avançar o tempo virtual e force a detecção de mudanças com `fixture.detectChanges()`:

```typescript
it('deve filtrar resultados com debounce de 300ms', fakeAsync(() => {
  const inputEl = fixture.nativeElement.querySelector('input');
  inputEl.value = 'termo de busca';
  inputEl.dispatchEvent(new Event('input'));

  // Estado ainda nao mudou imediatamente
  expect(component.searchQuery()).toBe('');

  // Avanca o tempo virtual pelo tempo do debounce
  tick(300);
  fixture.detectChanges();

  // Agora o estado e a UI refletem o valor
  expect(component.searchQuery()).toBe('termo de busca');
}));
```

Para promessas assíncronas nativas sem `fakeAsync`, utilize `waitForAsync` com `fixture.whenStable()`:

```typescript
it('deve carregar dados assincronos com fixture.whenStable', waitForAsync(async () => {
  component.loadAsyncProfile();
  fixture.detectChanges();

  await fixture.whenStable();
  fixture.detectChanges();

  const titleEl = fixture.nativeElement.querySelector('h1');
  expect(titleEl.textContent).toContain('Perfil do Usuario');
}));
```

---

### 7. Playwright / Puppeteer baixando centenas de MBs em `npm install` ou falhando por binário ausente

#### Sintoma
Durante `npm install` ou `npm test`, o processo demora vários minutos baixando Chromium (~300MB+) ou falha com erro:
`Executable doesn't exist at /Users/.../Library/Caches/ms-playwright/...` ou `Could not find Chromium`.

#### Causa
O Playwright e o Puppeteer tentam gerenciar suas próprias compilações de navegador isoladas por padrão quando não instruídos a ignorar o download ou quando o canal nativo não está configurado.

#### Solução
1. **Bloquear o download na instalação:**
Adicione as variáveis de ambiente ao arquivo `.npmrc` na raiz do projeto:
```ini
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
CYPRESS_INSTALL_BINARY=0
```

2. **Usar o navegador do sistema no Playwright:**
No `playwright.config.ts`, defina o canal nativo:
```typescript
use: {
  channel: 'chrome', // ou 'msedge'
}
```
Caso o Chrome esteja em um caminho customizado, forneça o `executablePath` (ex: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` no macOS).

---

### 8. Karma abrindo janelas físicas do Chrome e roubando o foco da máquina local

#### Sintoma
Ao disparar `npm test`, uma janela visível do Google Chrome se abre, roubando o foco do editor e interrompendo o fluxo de digitação.

#### Causa
O array `browsers` no `karma.conf.js` está definido como `['Chrome']` em vez de `['ChromeHeadless']`.

#### Solução
Altere a configuração para o modo Headless padrão:
```javascript
// karma.conf.js
module.exports = function (config) {
  config.set({
    browsers: ['ChromeHeadless'],
    singleRun: true, // Garante que encerra o processo após o teste
    customLaunchers: {
      ChromeHeadlessCI: {
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
Se a variável `CHROME_BIN` não for encontrada no macOS/Linux, declare-a temporariamente ou exporte no ambiente:
```bash
export CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```


