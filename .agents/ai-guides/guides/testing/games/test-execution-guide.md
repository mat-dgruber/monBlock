# 🚀 Guia de Execução e Automação de Testes de Jogos (Headless & CI/CD)

> **Fonte Normativa:** `guides/testing/games/test-execution-guide.md`  
> **Escopo:** Execução local por linha de comando, modo `--headless` sem GPU, esteiras de CI/CD (GitHub Actions / Containers) e testes de carga de servidores dedicados

---

## 1. Execução Local por Engine (Inner Loop Rápido)

Em engenharia de jogos, abrir o editor gráfico completo apenas para rodar testes unitários desperdiça memória e tempo. Toda engine moderna suporta execução via CLI em modo **Headless** (sem criar janela OpenGL/Vulkan/DirectX e sem inicializar dispositivos de áudio).

### 1.1 Godot Engine 4 (GUT & gdUnit4)

```bash
# Validação rápida de sintaxe e tipagem estática de scripts GDScript sem abrir janela
godot --headless --quit

# Execução completa da suíte GUT via linha de comando (encerra com exit code != 0 se falhar)
godot --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit,res://tests/scenes -ginclude_subdirs -gexit

# Execução de um único script de teste específico (ciclo TDD < 2 segundos)
godot --headless --path . -s addons/gut/gut_cmdln.gd -gtest=res://tests/unit/test_character_stats.gd -gexit

# Execução via gdUnit4 CLI
./addons/gdUnit4/runtest.sh --audio-driver Dummy --display-driver headless -a res://tests
```

### 1.2 Unity 6 / 2022 LTS (Unity Test Framework — UTF)

```bash
# Testes EditMode (equivalente aos testes de estado puro/Resource — ultra rápidos)
Unity -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults ./build/editmode-results.xml -quit

# Testes PlayMode (simulação de ciclo de vida de MonoBehaviours e Física)
Unity -batchmode -nographics -projectPath . -runTests -testPlatform PlayMode -testResults ./build/playmode-results.xml -quit
```

### 1.3 Unreal Engine 5 (Automation System & Gauntlet)

```bash
# Execução headless de testes unitários e funcionais via UnrealEditor-Cmd
UnrealEditor-Cmd "MeuJogo.uproject" -ExecCmds="Automation RunTests Project.Unit; Quit" -NullRHI -Unattended -NoSplash -NoSound -ReportExportPath="./build/reports"
```

---

## 2. Alvos Canônicos no `Makefile` para Projetos de Jogos

Todo repositório de jogo deve expor atalhos padronizados no `Makefile` para que desenvolvedores e agentes de IA executem verificações de forma uniforme:

```makefile
GODOT ?= godot

.PHONY: test test-unit test-scenes check-Orphans export-check

test: ## Executa toda a suíte de testes automatizados em modo headless
	$(GODOT) --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit,res://tests/scenes -ginclude_subdirs -gexit

test-unit: ## Executa apenas os testes unitários puros de Resource/Domínio (< 3s)
	$(GODOT) --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit -ginclude_subdirs -gexit

test-scenes: ## Executa os testes de integração de cenas, física e sinais
	$(GODOT) --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests/scenes -ginclude_subdirs -gexit
```

---

## 3. Pipeline de CI/CD para Jogos (GitHub Actions Headless)

Servidores de CI (Ubuntu runners) não possuem placa de vídeo dedicada nem servidor de som. Configure sempre os flags `--headless --audio-driver Dummy` para evitar travamentos por inicialização de ALSA/PulseAudio ou Vulkan:

```yaml
# .github/workflows/game-ci.yml
name: Game CI — Headless Tests & Build

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  unit-and-scene-tests:
    name: Testes Headless (Godot 4)
    runs-on: ubuntu-latest
    container:
      image: barichello/godot-ci:4.3
    steps:
      - name: Checkout do Repositório
        uses: actions/checkout@v4
        with:
          lfs: true

      - name: Importar Recursos e Gerar Cache Headless (.godot)
        run: godot --headless --import

      - name: Executar Suíte de Testes (Unit + Scenes)
        run: |
          godot --headless --audio-driver Dummy --path . \
            -s addons/gut/gut_cmdln.gd \
            -gdir=res://tests/unit,res://tests/scenes \
            -ginclude_subdirs \
            -gjunit_xml_file=build/junit-report.xml \
            -gexit

      - name: Publicar Artefato de Relatório JUnit
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: build/junit-report.xml
```

---

## 4. SLAs de Performance da Suíte de Testes

| Camada da Pirâmide | Tempo Máximo por Teste | Tempo Total da Camada | Frequência de Execução |
| :--- | :---: | :---: | :--- |
| **Unitários (`Resource` / Matemática)** | $< 10\text{ ms}$ | $< 5\text{ s}$ | A cada salvamento local e pre-commit |
| **Cena & Física (`SceneTree` Headless)** | $< 150\text{ ms}$ | $< 30\text{ s}$ | Antes de cada commit e em todo Pull Request |
| **Simulação Headless E2E / Bots Multiplayer** | $< 15\text{ s}$ | $< 3\text{ min}$ | Em todo PR para `main` e antes de gerar Release |
