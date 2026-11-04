# Troubleshooting e Resolucao de Problemas em Testes Backend

## Diagnostico de Problemas Comuns

Este guia reune solucoes para as falhas mais frequentes em suites de testes de backend, abrangendo problemas de estado compartilhado, concorrencia, paralelismo, deadlocks e vazamento de mocks.

---

## 1. Vazamento de Estado em Fixtures e Inversoes de Dependencia

### Sintoma
Um teste passa com sucesso quando executado individualmente (`pytest path/to/test.py::test_name` ou `pest --filter="test_name"`), mas falha de forma intermitente quando a suite completa e executada.

### Causa
Dependencias injetadas, configuracoes globais ou registros em banco de dados persistiram apos a finalizacao do teste anterior sem o devido descarte (*teardown*).

### Solucao em Python (FastAPI / Pytest)
Sempre utilize fixtures com a instrucao `yield` para garantir a limpeza de `app.dependency_overrides` e descarte de sessoes:

```python
# conftest.py
import pytest
from app.main import app
from app.api.deps import get_current_user
from app.models.user import User

@pytest.fixture
def auth_user_override():
    user = User(id=1, email="test@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    
    yield user
    
    # Teardown garantido apos a execucao do teste
    app.dependency_overrides.pop(get_current_user, None)
```

### Solucao em PHP / Laravel (Pest / PHPUnit)
Certifique-se de utilizar a trait `RefreshDatabase` e redefinir servicos singleton que mantenham estado interno:

```php
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\MetricsCollector;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Resetar singletons em memoria que acumulam metricas/estado
    app()->forgetInstance(MetricsCollector::class);
});
```

---

## 2. Race Conditions e Concorrencia na Execucao Paralela

### Sintoma
Erros de violacao de chave unica (`IntegrityError: duplicate key value` ou `QueryException: Duplicate entry`), dados inesperados ou testes falhando apenas ao usar `pytest -n auto` ou `artisan test --parallel`.

### Causa
Multiplos processos de teste concorrentes acessando e modificando a mesma instancia de banco de dados ou a mesma tabela sem isolamento de schema.

### Solucao em Python
Isole o banco de dados por worker usando o identificador `worker_id` fornecido pelo `pytest-xdist`:

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from app.db.base import Base

@pytest.fixture(scope="session")
def db_engine(worker_id):
    # Se rodando com pytest-xdist, worker_id contera 'gw0', 'gw1', etc.
    db_name = f"test_db_{worker_id}" if worker_id != "master" else "test_db_master"
    db_url = f"sqlite:///./{db_name}.db"
    
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    
    yield engine
    
    Base.metadata.drop_all(bind=engine)
```

### Solucao em Laravel
O runner paralelo do Laravel gerencia bancos isolados automaticamente (`test_1`, `test_2`). Caso ocorra inconsistencia, recrie os bancos paralelos:

```bash
# Recriar e rodar migracoes nos bancos de cada processo de teste
php artisan test --parallel --recreate-databases
```

---

## 3. Deadlocks e Conflitos de Bloqueio Transacional

### Sintoma
Erros como `OperationalError: database is locked` (SQLite) ou `Lock wait timeout exceeded; try restarting transaction` (PostgreSQL/MySQL), acompanhados de testes congelados ate o tempo limite de execucao.

### Causa
Conexoes ativas mantendo transacoes abertas com locks exclusivos durante assercoes assincronas ou ausencia de encerramento de sessoes em blocos de excecao.

### Solucao
1. **Garantir Rollback Imediato:** Envolver cada teste em uma transacao isolada com `rollback` incondicional no teardown.
2. **Definir Timeouts Agressivos para Testes:** Configure timeouts curtos para locks no ambiente de teste para identificar rapidamente queries bloqueantes.

```python
# Configuracao de conexao SQLite com timeout explicito em Python
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"timeout": 5, "check_same_thread": False}
)
```

No Laravel, evite misturar chamadas `DB::transaction()` sem o trait `DatabaseTransactions` ou `RefreshDatabase`.

---

## 4. Vazamento de Mocks Globais e Dubles de Rede

### Sintoma
Requisicoes HTTP reais tentam ser disparadas para APIs externas ou respostas mockadas de um teste anterior vazam para o proximo.

### Causa
Uso de `unittest.mock.patch` sem gerenciador de contexto ou realizacao de monkeypatching sem restauracao do objeto original.

### Solucao em Python
Prefira a fixture nativa `monkeypatch` do Pytest ou gerenciadores de contexto dedicados como `respx.mock`:

```python
import respx

def test_gateway_timeout(client):
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.post("https://api.payment.com/v1/charge").respond(status_code=504)
        response = client.post("/api/v1/checkout", json={"amount": 100})
        assert response.status_code == 504
```

### Solucao em Laravel
Sempre utilize o facade `Http::fake()` no inicio do teste. O Laravel descarta os fakes registrados automaticamente ao final de cada teste:

```php
use Illuminate\Support\Facades\Http;

it('handles payment gateway timeout gracefully', function () {
    Http::fake([
        'https://api.payment.com/*' => Http::response(null, 504),
    ]);

    $response = $this->postJson('/api/v1/checkout', ['amount' => 100]);
    $response->assertStatus(504);
});
```
