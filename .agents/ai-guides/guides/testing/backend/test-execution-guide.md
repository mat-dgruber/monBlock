# Guia Universal de Execucao de Testes Backend

## Comandos Essenciais de Execucao em Python (Pytest)

### 1. Execucao Basica e por Camadas

```bash
# Executar toda a suite de testes com saida detalhada
pytest -v

# Executar apenas testes unitarios
pytest tests/unit/ -v

# Executar apenas testes de integracao
pytest tests/integration/ -v

# Executar testes End-to-End
pytest tests/e2e/ -v

# Executar um arquivo especifico
pytest tests/unit/test_billing_service.py -v

# Filtrar testes por expressao de nome (palavra-chave)
pytest -k "processar_fatura" -v
```

---

### 2. Paralelizacao de Testes (`pytest-xdist`)

Para acelerar a execucao distribuindo os testes entre multiplos nucleos de CPU:

```bash
# Executar testes utilizando todos os cores disponiveis
pytest -n auto

# Executar especificando o numero exato de workers
pytest -n 4
```

---

### 3. Medicao de Cobertura de Codigo (`pytest-cov`)

```bash
# Exibir relatorio de cobertura no terminal com indicacao de linhas faltantes
pytest --cov=app --cov-report=term-missing

# Gerar relatorio detalhado em HTML (exportado na pasta htmlcov/)
pytest --cov=app --cov-report=html

# Falhar a execucao caso a cobertura minima nao seja atingida (ex: 80%)
pytest --cov=app --cov-fail-under=80
```

---

### 4. Execucao em Modo Continuo / Watch (TDD)

```bash
# Utilizando pytest-watch
ptw -- -v

# Ou utilizando pytest-watcher
pytest-watcher . --now
```

---

## Comandos Essenciais de Execucao em PHP / Laravel (Pest / Artisan)

### 1. Execucao Basica e por Camadas

```bash
# Executar toda a suite de testes via Artisan
php artisan test

# Executar toda a suite diretamente via Pest
./vendor/bin/pest

# Executar apenas a camada de testes unitarios
php artisan test tests/Unit
# ou
./vendor/bin/pest tests/Unit

# Executar apenas a camada de Feature / Integracao
php artisan test tests/Feature
# ou
./vendor/bin/pest tests/Feature

# Executar um arquivo especifico
php artisan test tests/Feature/OrdersApiTest.php

# Filtrar testes por nome ou expressao
php artisan test --filter="creates an order"
# ou
./vendor/bin/pest --filter="creates an order"
```

---

### 2. Paralelizacao de Testes no Laravel

O Laravel e o Pest gerenciam dinamicamente bancos de dados de teste isolados por worker durante a execucao paralela:

```bash
# Executar em paralelo via Artisan
php artisan test --parallel

# Executar em paralelo via Pest
./vendor/bin/pest --parallel

# Executar em paralelo com numero definido de processos
php artisan test --parallel --processes=4
```

---

### 3. Medicao de Cobertura de Codigo (Pest / PHPUnit)

Requer o driver Xdebug ou PCOV habilitado no ambiente PHP:

```bash
# Exibir resumo de cobertura no terminal
php artisan test --coverage
# ou
./vendor/bin/pest --coverage

# Forcar percentual minimo de cobertura (falha se < 80%)
./vendor/bin/pest --coverage --min=80

# Gerar relatorio em formato HTML
./vendor/bin/pest --coverage-html coverage-report/
```

---

### 4. Execucao em Modo Continuo / Watch (Pest)

```bash
# Modo watch nativo do Pest para TDD
./vendor/bin/pest --watch
```

---

## Metas de Cobertura e Qualidade

| Camada / Modulo | Meta de Cobertura | Prioridade de Validacao |
| :--- | :--- | :--- |
| **Domain Services e Use Cases** | $\ge 85\%$ | Regras de negocio, calculos financeiros, validacoes de estado |
| **Core Security, Auth e JWT** | $\ge 95\%$ | Hashing, geracao de tokens, refresh tokens, RBAC/ABAC |
| **Endpoints e Roteadores HTTP** | $\ge 80\%$ | Status codes, formatacao de respostas, headers e tratamento de erros |
| **Repositories e Persistencia** | $\ge 80\%$ | Consultas parametrizadas, filtros complexos e integridade referencial |
