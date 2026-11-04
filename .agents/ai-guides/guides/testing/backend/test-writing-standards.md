# Padroes Universais de Escrita de Testes Backend

## Estrutura Obrigatoria (AAA Pattern)

Todo teste backend deve ser estruturado de forma visual e logicamente delimitada utilizando o padrao canonico **Arrange, Act, Assert**:

- **Arrange (Preparacao):** Configuracao de estado inicial, mocks, dubles de teste, fixtures e parametros de entrada.
- **Act (Execucao):** Invocacao direta do metodo, servico ou endpoint HTTP sob teste.
- **Assert (Verificacao):** Validacao dos resultados retornados, mudancas de estado no banco e assercoes sobre efeitos colaterais (chamadas de mocks, eventos disparados).

---

### Exemplo Comparativo: Teste Unitario de Regra de Negocio

#### Python (Pytest)

```python
# tests/unit/test_billing_service.py
import pytest
from unittest.mock import MagicMock
from app.services.billing_service import BillingService
from app.models.invoice import InvoiceStatus

def test_processar_fatura_com_saldo_suficiente_marca_como_paga():
    # Arrange
    gateway_mock = MagicMock()
    gateway_mock.charge.return_value = {"transaction_id": "tx_999", "status": "success"}
    service = BillingService(payment_gateway=gateway_mock)
    invoice = {"id": "inv_123", "amount": 250.00, "customer_id": "cust_456"}

    # Act
    result = service.process_invoice(invoice)

    # Assert
    assert result.status == InvoiceStatus.PAID
    assert result.transaction_id == "tx_999"
    gateway_mock.charge.assert_called_once_with(amount=250.00, customer_id="cust_456")
```

#### PHP / Laravel (Pest)

```php
// tests/Unit/BillingServiceTest.php
use App\Contracts\PaymentGatewayContract;
use App\Enums\InvoiceStatus;
use App\Services\BillingService;

it('processes invoice successfully when funds are sufficient', function () {
    // Arrange
    $gatewayMock = Mockery::mock(PaymentGatewayContract::class);
    $gatewayMock->shouldReceive('charge')
        ->once()
        ->with(250.00, 'cust_456')
        ->andReturn(['transaction_id' => 'tx_999', 'status' => 'success']);

    $service = new BillingService($gatewayMock);
    $invoice = ['id' => 'inv_123', 'amount' => 250.00, 'customer_id' => 'cust_456'];

    // Act
    $result = $service->processInvoice($invoice);

    // Assert
    expect($result->status)->toBe(InvoiceStatus::Paid)
        ->and($result->transaction_id)->toBe('tx_999');
});
```

---

### Exemplo Comparativo: Teste de Integracao de Endpoint de API

#### Python (FastAPI + TestClient)

```python
# tests/integration/test_orders_router.py
import pytest
from fastapi import status

def test_criar_pedido_autenticado_retorna_201(client, auth_headers, mock_inventory):
    # Arrange
    payload = {
        "items": [{"sku": "PROD-001", "quantity": 2}],
        "delivery_address": "Rua Exemplo, 123"
    }

    # Act
    response = client.post("/api/v1/orders", json=payload, headers=auth_headers)

    # Assert
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["status"] == "pending"
    assert len(data["items"]) == 1
    assert data["items"][0]["sku"] == "PROD-001"
```

#### PHP / Laravel (Pest Feature Test)

```php
// tests/Feature/OrdersApiTest.php
use App\Models\User;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('creates an order with authenticated user and returns 201', function () {
    // Arrange
    $user = User::factory()->create();
    $product = Product::factory()->create(['sku' => 'PROD-001', 'stock' => 10]);

    $payload = [
        'items' => [['sku' => 'PROD-001', 'quantity' => 2]],
        'delivery_address' => 'Rua Exemplo, 123',
    ];

    // Act
    $response = $this->actingAs($user)->postJson('/api/v1/orders', $payload);

    // Assert
    $response->assertCreated()
        ->assertJsonPath('data.status', 'pending')
        ->assertJsonPath('data.items.0.sku', 'PROD-001');

    $this->assertDatabaseHas('orders', [
        'user_id' => $user->id,
        'status' => 'pending',
    ]);
});
```

---

## Convencoes de Nomenclatura

### 1. Classes e Arquivos de Teste

| Stack | Tipo | Padrao de Nome | Exemplo |
| :--- | :--- | :--- | :--- |
| **Python** | Arquivo Unitario | `test_{service_ou_modulo}.py` | `tests/unit/test_auth_service.py` |
| **Python** | Arquivo Integracao | `test_{recurso}_router.py` | `tests/integration/test_billing_router.py` |
| **Python** | Classe (Opcional) | `Test{NomeDoServico}` | `class TestAuthService:` |
| **Laravel / Pest** | Arquivo Unitario | `{Service}Test.php` | `tests/Unit/AuthServiceTest.php` |
| **Laravel / Pest** | Arquivo Feature | `{Resource}ApiTest.php` | `tests/Feature/BillingApiTest.php` |

### 2. Funcoes e Metodos de Teste

O nome do teste deve descrever com precisao a intencao, o cenario e o resultado esperado:

- **Python (pytest):** `test_<acao>_<cenario>_<resultado_esperado>`
  - `test_autenticar_credenciais_validas_retorna_token_jwt`
  - `test_autenticar_senha_invalida_lanca_http_401`
  - `test_criar_pedido_sem_estoque_retorna_422`
  - `test_buscar_usuario_id_inexistente_retorna_404`

- **Laravel (Pest):** `it('<descreve o comportamento>', function () { ... })`
  - `it('issues jwt token upon valid credentials')`
  - `it('throws 401 on invalid password')`
  - `it('returns 422 when item stock is insufficient')`
  - `it('returns 404 when resource does not exist')`

---

## Estrutura de Diretorios Recomendada

### Estrutura em Python (FastAPI / Pytest)

```
backend/
├── app/
│   ├── api/
│   ├── core/
│   ├── models/
│   ├── repositories/
│   ├── schemas/
│   └── services/
└── tests/
    ├── conftest.py              # Fixtures globais, db_session e app client
    ├── unit/
    │   ├── test_auth_service.py
    │   ├── test_billing_service.py
    │   └── test_security.py
    ├── integration/
    │   ├── conftest.py          # Fixtures de integracao e database overrides
    │   ├── test_auth_router.py
    │   ├── test_billing_router.py
    │   └── test_users_router.py
    └── e2e/
        └── test_checkout_journey.py
```

### Estrutura em PHP (Laravel / Pest)

```
backend/
├── app/
│   ├── Enums/
│   ├── Http/Controllers/
│   ├── Models/
│   ├── Repositories/
│   └── Services/
└── tests/
    ├── Pest.php                 # Configuracoes globais do Pest e traits
    ├── TestCase.php             # Base TestCase do Laravel
    ├── Unit/
    │   ├── AuthServiceTest.php
    │   ├── BillingServiceTest.php
    │   └── SecurityTest.php
    └── Feature/
        ├── AuthApiTest.php
        ├── BillingApiTest.php
        ├── OrdersApiTest.php
        └── UsersApiTest.php
```

---

## Isolamento e Injecao de Dependencias

### Python: `app.dependency_overrides` com Fixtures `yield`

Em FastAPI, nunca altere `app.dependency_overrides` manualmente dentro de testes individuais sem garantir a limpeza no bloco `finally` ou via fixture com `yield`:

```python
# tests/conftest.py
import pytest
from app.main import app
from app.api.deps import get_current_user
from app.models.user import User

@pytest.fixture
def override_authenticated_user():
    fake_user = User(id=1, email="admin@example.com", is_admin=True, is_active=True)
    app.dependency_overrides[get_current_user] = lambda: fake_user
    yield fake_user
    app.dependency_overrides.pop(get_current_user, None)
```

### Laravel: Mocking no Container de Injecao de Dependencias

No Laravel, o metodo `$this->mock()` automaticamente registra o mock no Container de Servicos e limpa a instancia apos o teste:

```php
use App\Contracts\SmsNotificationServiceContract;

it('sends sms verification code to user', function () {
    $this->mock(SmsNotificationServiceContract::class, function ($mock) {
        $mock->shouldReceive('sendVerificationCode')
            ->once()
            ->with('+5511999998888', Mockery::type('string'))
            ->andReturn(true);
    });

    $response = $this->postJson('/api/v1/auth/phone-verify', [
        'phone' => '+5511999998888',
    ]);

    $response->assertOk();
});
```

---

## Testes Parametrizados

Utilize testes parametrizados para validar multiplas combinacoes de entrada, limites de borda e cenarios de erro sem duplicacao de codigo.

### Python (`@pytest.mark.parametrize`)

```python
@pytest.mark.parametrize(
    "email,expected_status",
    [
        ("valid.email@domain.com", 200),
        ("invalid-email", 422),
        ("", 422),
        ("@domain.com", 422),
    ],
)
def test_validacao_formato_email(client, email, expected_status):
    response = client.post("/api/v1/auth/validate-email", json={"email": email})
    assert response.status_code == expected_status
```

### PHP / Laravel (Pest Datasets)

```php
it('validates email formats on registration', function (string $email, int $expectedStatus) {
    $response = $this->postJson('/api/v1/auth/validate-email', [
        'email' => $email,
    ]);

    $response->assertStatus($expectedStatus);
})->with([
    ['valid.email@domain.com', 200],
    ['invalid-email', 422],
    ['', 422],
    ['@domain.com', 422],
]);
```
