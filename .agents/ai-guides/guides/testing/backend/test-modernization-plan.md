# Arquitetura e Plano de Padronizacao de Testes Backend

## Visao Geral da Arquitetura de Testes

Uma suite de testes de backend moderna deve ser deterministica, rapida e independente de infraestrutura externa para testes de unidade e integracao local. A arquitetura de testes adota uma abordagem em camadas, garantindo que regras de negocio sejam testadas de forma exaustiva com feedback instantaneo, enquanto fluxos transacionais e contratos de API sejam validados com fidelidade comportamental.

---

## Piramide e Camadas de Teste

```
        / \
       /   \     10% E2E Tests (Fluxos Transacionais Completos / Contratos Externos)
      / E2E \
     /-------\   20% Integration Tests (API Endpoints + ORM/Banco + Middleware)
    / Integra \
   /-----------\ 70% Unit Tests (Domain Services, Use Cases, Schemas, Regras Puras)
  /  Unitarios  \
 /---------------\
```

### 1. Testes Unitarios (~70%)
- **Escopo:** Regras de negocio puras, use cases, domain services (`AuthService`, `BillingService`, `OrderProcessor`), schemas de validacao (Pydantic / FormRequests) e funcoes utilitarias.
- **Isolamento:** Total. Qualquer chamada de I/O (banco de dados, rede, sistemas de arquivos, filas) e substituida por mocks ou dubles de teste em memoria.
- **Performance:** Execucao ultra-rapida (milissegundos por teste, poucos segundos para toda a suite).

### 2. Testes de Integracao (~20%)
- **Escopo:** Roteadores/Controllers HTTP, middlewares, repositorios de dados com persistencia real/emulada (SQLite in-memory ou Testcontainers), transacoes de banco de dados e eventos internos.
- **Isolamento:** Controlado. O servico e instanciado com dependencias reais de banco de dados isolado por transacao, enquanto servicos de terceiros externos (Gateways de pagamento, provedores de OAuth2, servicos de e-mail) sao simulados com mocks de transporte HTTP (`respx` em Python, `Http::fake()` em Laravel).
- **Performance:** Execucao rapida com paralelismo habilitado.

### 3. Testes End-to-End (~10%)
- **Escopo:** Jornadas transacionais criticas de ponta a ponta: Cadastro ➔ Autenticacao (Token JWT) ➔ Operacao de Negocio (ex: Criacao de Pedido) ➔ Emissao de Evento ➔ Registro em Log de Auditoria.
- **Ambiente:** Executados contra instancias efemeras ou ambiente de staging com dependencias integradas.

---

## Estrategias de Isolamento de Banco de Dados

### Abordagem em Python (FastAPI / SQLAlchemy / Tortoise / SQLModel)

1. **SQLite in-memory com Rollback Transacional:**
   Para testes de integracao leves, utilize uma conexao SQLite compartilhada por sessao de teste com transacoes aninhadas que executam `rollback` ao final de cada teste.

```python
# conftest.py (Python / Pytest)
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base

TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = SessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()
```

2. **Substituicao de Dependencias (`app.dependency_overrides`):**
   Garante que a aplicacao FastAPI utilize a sessao transacional isolada durante a chamada HTTP do `TestClient` ou `httpx.AsyncClient`.

```python
@pytest.fixture
def client(app, db_session):
    from app.api.deps import get_db

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

---

### Abordagem em PHP / Laravel (Pest / PHPUnit)

1. **Trait `RefreshDatabase`:**
   O Laravel migra o esquema de banco de dados na primeira execucao e envolve cada teste subsequente em uma transacao de banco de dados com rollback automatico.

```php
// tests/Feature/OrderCreationTest.php (Laravel / Pest)
use App\Models\User;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('creates an order with valid items and reduces inventory', function () {
    $user = User::factory()->create();
    $product = Product::factory()->create(['stock' => 10, 'price' => 100]);

    $response = $this->actingAs($user)->postJson('/api/v1/orders', [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2],
        ],
    ]);

    $response->assertStatus(201);
    expect($product->fresh()->stock)->toBe(8);
});
```

2. **Model Factories e States:**
   Criacao expressiva e declarativa de estado para testes de integracao, evitando manipulacao manual de dados ou dependencias estaticas.

```php
// Criacao de usuario administrador com faturas pendentes
$admin = User::factory()
    ->admin()
    ->hasInvoices(3, ['status' => 'pending'])
    ->create();
```

---

## Estrategias de Mocks para Integracoes Externas e I/O

### 1. Mock de Servicos HTTP Externos

- **Python:** Utilize bibliotecas como `respx` ou `responses` para interceptar clientes HTTP (`httpx` / `requests`) no nivel de transporte sem monkeypatching invasivo.

```python
import respx
import httpx

@respx.mock
def test_pagamento_gateway_sucesso(client):
    respx.post("https://api.paymentgateway.com/v1/charges").respond(
        status_code=200,
        json={"id": "ch_123", "status": "paid"}
    )

    response = client.post("/api/v1/checkout", json={"amount": 5000})
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"
```

- **Laravel:** Utilize `Http::fake()` nativo do framework para simular chamadas de API externas e realizar assercoes sobre requisicoes emitidas.

```php
use Illuminate\Support\Facades\Http;

it('processes payment through external gateway', function () {
    Http::fake([
        'api.paymentgateway.com/*' => Http::response(['id' => 'ch_123', 'status' => 'paid'], 200),
    ]);

    $response = $this->postJson('/api/v1/checkout', ['amount' => 5000]);

    $response->assertOk();
    Http::assertSent(fn ($request) => $request->url() === 'https://api.paymentgateway.com/v1/charges');
});
```

---

### 2. Mocks no Container de Injecao de Dependencias

- **Python (FastAPI):** `app.dependency_overrides` para dependencias injetadas via `Depends()`.
- **Laravel:** `$this->mock(Interface::class, fn ($mock) => ...)` ou `$this->instance()` para substituir servicos registrados no Service Container do Laravel.

```php
use App\Contracts\NotificationServiceContract;

it('dispatches welcome notification upon registration', function () {
    $this->mock(NotificationServiceContract::class, function ($mock) {
        $mock->shouldReceive('sendWelcomeEmail')->once()->andReturn(true);
    });

    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'SecurePass123!',
    ]);

    $response->assertStatus(201);
});
```

---

## Metas de Cobertura e Qualidade

| Camada / Componente | Meta de Cobertura de Linhas | Foco Principal |
| :--- | :--- | :--- |
| **Domain Services e Use Cases** | $\ge 85\%$ | Regras de negocio, calculos e fluxos condicionais |
| **Core Security, Auth e Permissoes** | $\ge 95\%$ | Hashing de senhas, geracao/validacao de tokens, RBAC/ABAC |
| **Endpoints e Roteadores de API** | $\ge 80\%$ | Validacao de schemas, status codes HTTP e tratamento de excecoes |
| **Data Repositories e Persistence Helpers** | $\ge 80\%$ | Queries parametrizadas, ordenacao, paginacao e transacoes |
