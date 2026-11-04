# Padrões de Escrita de Testes Frontend (Modern Angular Standalone & Jasmine/Jest)

## Estrutura Obrigatória (Padrão AAA)

Todo teste frontend deve seguir rigorosamente a estrutura **Arrange, Act, Assert**:

1. **Arrange (Preparação)**: Configura o estado inicial, inicializa mocks, define retornos esperados e prepara o contexto de injeção (`TestBed`).
2. **Act (Execução)**: Invoca o método sob teste, despacha eventos no DOM ou altera valores de signals.
3. **Assert (Verificação)**: Assegura que o resultado gerado, estado computado ou elemento de interface corresponde exatamente ao esperado.

```typescript
describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve buscar lista de usuarios ativos com sucesso', () => {
    // Arrange
    const mockUsers = [
      { id: 1, name: 'Alice Silva', email: 'alice@example.com', active: true }
    ];

    // Act
    service.getUsers().subscribe((users) => {
      // Assert
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Alice Silva');
    });

    const req = httpMock.expectOne('/api/v1/users');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsers);
  });
});
```

---

## Convenções de Nomenclatura e Estrutura

### 1. Suítes de Teste (`describe`)
- Identifique a unidade sob teste pelo seu nome canônico:
  - `describe('UserService', () => { ... })`
  - `describe('UserCardComponent', () => { ... })`
  - `describe('authGuard', () => { ... })`
  - `describe('authInterceptor', () => { ... })`

### 2. Casos de Teste (`it`)
- Descreva o comportamento funcional esperado em Português do Brasil:
  - `it('deve autenticar usuario e emitir estado logado', () => { ... })`
  - `it('deve renderizar mensagem de erro quando requisicao falhar com status 404', () => { ... })`
  - `it('deve desabilitar botao de submissao enquanto formulario for invalido', () => { ... })`
  - `it('deve recalcular valor computado quando signal dependente for alterado', () => { ... })`

### 3. Nomenclatura de Arquivos
- Arquivos de teste devem ser co-localizados junto ao arquivo de código correspondente:
  - `user.service.ts` -> `user.service.spec.ts`
  - `user-card.component.ts` -> `user-card.component.spec.ts`
  - `auth.guard.ts` -> `auth.guard.spec.ts`
  - `auth.interceptor.ts` -> `auth.interceptor.spec.ts`

---

## Testando Serviços HTTP Reativos

Utilize `provideHttpClientTesting()` e `HttpTestingController` para simular requisições e respostas HTTP de forma síncrona e determinística.

### Cenário de Sucesso e Parâmetros de Query

```typescript
describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve enviar parametros de filtro na busca de produtos', () => {
    service.searchProducts({ category: 'hardware', page: 1 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/products' && r.params.has('category'));
    expect(req.request.params.get('category')).toBe('hardware');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0 });
  });
});
```

### Tratamento de Erros HTTP

```typescript
it('deve propagar erro amigavel quando API retornar status 500', () => {
  let errorMessage = '';

  service.getProductById(99).subscribe({
    next: () => fail('Deveria ter falhado com erro 500'),
    error: (err) => {
      errorMessage = err.message;
    }
  });

  const req = httpMock.expectOne('/api/v1/products/99');
  req.flush({ error: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });

  expect(errorMessage).toContain('Falha ao consultar produto');
});
```

---

## Testando Signals e Estado Reativo

Signals síncronos (`signal()`, `computed()`) podem ser testados diretamente, enquanto `effect()` requer a invocação de `TestBed.flushEffects()`.

### Testando `signal` e `computed`

```typescript
describe('CartStore', () => {
  it('deve recalcular total computado quando itens forem adicionados ao carrinho', () => {
    const store = new CartStore();
    expect(store.totalPrice()).toBe(0);

    store.addItem({ id: 1, name: 'Mouse', price: 150, quantity: 2 });

    expect(store.totalItems()).toBe(2);
    expect(store.totalPrice()).toBe(300);
  });
});
```

### Testando `effect` com `flushEffects`

```typescript
describe('ThemeService', () => {
  it('deve sincronizar classe no DOM via effect quando signal de tema mudar', () => {
    TestBed.configureTestingModule({
      providers: [ThemeService]
    });

    const service = TestBed.inject(ThemeService);
    service.setDarkMode(true);
    TestBed.flushEffects();

    expect(document.documentElement.classList.contains('dark-theme')).toBeTrue();
  });
});
```

### Interoperabilidade RxJS e Signals com `TestBed.runInInjectionContext`

```typescript
describe('LiveCounterService', () => {
  it('deve converter observable em signal com valor inicial no contexto de injecao', () => {
    TestBed.configureTestingModule({});

    TestBed.runInInjectionContext(() => {
      const trigger$ = new BehaviorSubject<number>(10);
      const countSignal = toSignal(trigger$, { initialValue: 0 });

      expect(countSignal()).toBe(10);
      trigger$.next(25);
      expect(countSignal()).toBe(25);
    });
  });
});
```

---

## Testando Componentes Standalone

Componentes Standalone devem ser declarados no array `imports` do `TestBed.configureTestingModule`.

```typescript
@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button [disabled]="disabled()" (click)="handleClick()">
      <ng-content></ng-content>
    </button>
  `
})
export class ButtonComponent {
  disabled = input<boolean>(false);
  clicked = output<void>();

  handleClick(): void {
    if (!this.disabled()) {
      this.clicked.emit();
    }
  }
}

describe('ButtonComponent', () => {
  let fixture: ComponentFixture<ButtonComponent>;
  let component: ButtonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve emitir evento de clique quando o botao nao estiver desabilitado', () => {
    let emitted = false;
    component.clicked.subscribe(() => (emitted = true));

    const buttonEl = fixture.nativeElement.querySelector('button');
    buttonEl.click();

    expect(emitted).toBeTrue();
  });

  it('deve respeitar signal input de disabled no DOM', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const buttonEl = fixture.nativeElement.querySelector('button');
    expect(buttonEl.disabled).toBeTrue();
  });
});
```

---

## Testando Functional Route Guards (`CanActivateFn`)

Guards funcionais utilizam `TestBed.runInInjectionContext` para resolver dependências sem a necessidade de instanciar classes:

```typescript
describe('authGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  it('deve permitir acesso quando usuario estiver autenticado', () => {
    authServiceSpy.isAuthenticated.and.returnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBeTrue();
  });

  it('deve redirecionar para /login quando usuario nao estiver autenticado', () => {
    const loginUrlTree = {} as UrlTree;
    authServiceSpy.isAuthenticated.and.returnValue(false);
    routerSpy.createUrlTree.and.returnValue(loginUrlTree);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBe(loginUrlTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
```

---

## Testando Functional HTTP Interceptors (`HttpInterceptorFn`)

Interceptors funcionais são testados configurando `provideHttpClient(withInterceptors([authInterceptor]))` junto a `provideHttpClientTesting()`:

```typescript
describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStorage: jasmine.SpyObj<TokenStorageService>;

  beforeEach(() => {
    tokenStorage = jasmine.createSpyObj('TokenStorageService', ['getToken']);

    TestBed.configureTestingModule({
      providers: [
        { provide: TokenStorageService, useValue: tokenStorage },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve adicionar cabecalho Authorization Bearer quando houver token valido', () => {
    tokenStorage.getToken.and.returnValue('mock-jwt-token');

    httpClient.get('/api/v1/profile').subscribe();

    const req = httpMock.expectOne('/api/v1/profile');
    expect(req.request.headers.get('Authorization')).toBe('Bearer mock-jwt-token');
    req.flush({});
  });

  it('nao deve adicionar cabecalho Authorization quando nao houver token', () => {
    tokenStorage.getToken.and.returnValue(null);

    httpClient.get('/api/v1/public').subscribe();

    const req = httpMock.expectOne('/api/v1/public');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
```

