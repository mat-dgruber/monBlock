# 🧪 Guias de Testes Automatizados & Qualidade de Software

<div align="center">

[![Category](https://img.shields.io/badge/Category-Testing%20%26%20QA-059669?style=for-the-badge)](../../README.md)
[![Standards](https://img.shields.io/badge/Pattern-AAA%20(Arrange--Act--Assert)-10B981?style=for-the-badge)](backend/test-writing-standards.md)
[![Coverage](https://img.shields.io/badge/Target-Determinism%20%7C%20Fast%20Execution-3B82F6?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Diretrizes canônicas, padrões de escrita, guias de execução e planos de modernização para suítes de testes de Backend, Frontend, Mobile e Games.</b>
</p>

</div>

---

## 📂 Organização das Suítes

```text
guides/testing/
├── backend/    ──> 🐍 Testes de Backend: Pytest, Pest, JUnit, in-memory fixtures e mocks
├── frontend/   ──> 🌐 Testes de Frontend: Karma, Jasmine, Angular Signals, Playwright E2E e Acessibilidade
├── mobile/     ──> 📱 Testes de Mobile: Compose, SwiftUI, Flutter test, React Native Testing Library e Maestro E2E
├── desktop/    ──> 🖥️ Testes de Desktop: Vitest Main/IPC, SQLite in-memory, Playwright Electron e Xvfb
└── games/      ──> 🎮 Testes de Jogos: GUT, gdUnit4, Unity UTF, testes de Resource puro, física headless e netcode
```

---

## ⚙️ Heurísticas Executáveis

Cada suíte tem um bloco `yaml heuristics` no seu `README.md` — slugs `testing-backend` (`TESTB-01..08`), `testing-frontend` (`TESTF-01..08`), `testing-mobile` (`TMOB-01..03`), `testing-desktop` (`TDSK-01..03`) e `testing-games` (`TGAM-01..03`) — aplicado pelo `/setup` via `setup-testing-backend`, `setup-testing-frontend`, `setup-testing-mobile`, `setup-testing-desktop` e `setup-testing-games` e provado por `verify_setup.py`. Os 4 guias internos de cada suíte (standards, execution, modernization, troubleshooting) são o conteúdo normativo que as heurísticas referenciam.

---

## 📋 Resumo das Suítes

| Diretório | Foco & Tecnologias | Guias Contidos |
| :--- | :--- | :--- |
| [`backend/`](backend/README.md) | **Backend & APIs**<br>(Pytest, Pest PHP, JUnit, Go Test) | Padrões de escrita AAA, isolamento com bancos in-memory, execução rápida, troubleshooting de falhas comuns e plano de modernização. |
| [`frontend/`](frontend/README.md) | **Frontend & UI/E2E**<br>(Karma, Jasmine, Playwright, Vitest) | Padrões para componentes e Signals, testes de acessibilidade com `axe-core`, testes E2E resilientes, execução e troubleshooting. |
| [`mobile/`](mobile/README.md) | **Mobile & Telas/E2E**<br>(Compose, Flutter, RNTL, Maestro) | Padrões AAA para ViewModels e Widgets, isolamento sem chamadas de rede reais, execução em emuladores headless e Maestro E2E. |
| [`games/`](games/README.md) | **Jogos & Simulação em Tempo Real**<br>(Godot 4 GUT/gdUnit4, Unity UTF, Unreal) | Padrões AAA para `Resource`/Estado puro em microssegundos, testes de cena/colisão e sinais, execução `--headless` em CI e eliminação de *Orphan Nodes*. |
| [`desktop/`](desktop/README.md) | **Desktop Multiplataforma**<br>(Playwright Electron, Vitest IPC/Main, Spectron Migration) | Padrões AAA para processos Main/Renderer/utilityProcess, isolamento com in-memory SQLite, testes E2E headless via Xvfb e troubleshooting multi-OS. |

---

## 🎯 Padrão Arquitetural Universal: AAA (Arrange-Act-Assert)

Todas as suítes de teste deste ecossistema seguem a convenção rigorosa em 3 blocos bem demarcados:

```python
def test_deve_autenticar_usuario_com_sucesso(client, user_fixture):
    # 1. Arrange (Preparação)
    payload = {"email": user_fixture.email, "password": "valid_password"}
    
    # 2. Act (Ação)
    response = client.post("/auth/login", json=payload)
    
    # 3. Assert (Verificação)
    assert response.status_code == 200
    assert "access_token" in response.json()
```
