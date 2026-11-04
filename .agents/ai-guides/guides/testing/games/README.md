# 🎮 Suíte de Guias de Testes de Jogos (Game Testing & Simulation QA)

<div align="center">

[![Category](https://img.shields.io/badge/Category-Game%20Testing-059669?style=for-the-badge)](../../../README.md)
[![Pyramid](https://img.shields.io/badge/Pyramid-Resource%20%7C%20Scene%20%7C%20Headless%20E2E-10B981?style=for-the-badge)](test-writing-standards.md)
[![Tools](https://img.shields.io/badge/Tools-GUT%20%7C%20gdUnit4%20%7C%20Unity%20UTF%20%7C%20Unreal%20Gauntlet-7C3AED?style=for-the-badge)](test-execution-guide.md)

<p align="center">
  <b>Padrões de engenharia para testes unitários de estado puro (Resource/ScriptableObject), testes de cena e física passo-a-passo, determinismo de simulação e execução headless em CI/CD para Godot 4, Unity e Unreal.</b>
</p>

</div>

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto de jogo, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). Heurísticas ativam quando manifests de engines de jogos são detectados (`project.godot`, `ProjectVersion.txt` ou `*.uproject` via `detect_stack.sh game`). Os 4 guias abaixo compõem o conteúdo normativo referenciado.

```yaml heuristics
guide: testing-games
version: 1
requires: [desenvolvimento-jogos]
heuristics:
  - id: TGAM-01
    title: Runner ou alvo de teste headless definido para a engine do jogo
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game && test -f project.godot && ! test -d addons/gut && ! test -d addons/gdUnit4 && ! { test -f Makefile && grep -qE '^test:' Makefile; }
    do: |
      agent: Configure o runner de testes headless do projeto (ex.: instale GUT em addons/gut ou gdUnit4 em addons/gdUnit4, ou defina o alvo 'test:' no Makefile invocando 'godot --headless').
    verify: |
      ! sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game || ! test -f project.godot || test -d addons/gut || test -d addons/gdUnit4 || { test -f Makefile && grep -qE '^test:' Makefile; }
    optional: true

  - id: TGAM-02
    title: Estrutura de testes segregada (unitários de Resource/domínio e testes de cena/integração)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game && ! test -d test && ! test -d tests && ! test -d Assets/Tests
    do: |
      agent: Crie a estrutura canônica de diretórios de testes do jogo (ex.: tests/unit e tests/scenes no Godot 4; Assets/Tests/EditMode e Assets/Tests/PlayMode na Unity) conforme guides/testing/games/test-writing-standards.md.
    verify: |
      ! sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game || test -d test || test -d tests || test -d Assets/Tests

  - id: TGAM-03
    title: Ausência de nós órfãos e chamadas reais de rede na suíte de testes de jogo
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game && { git grep -h --untracked -iE -e 'http:[/]/|https:[/]/api\.' -- '*test*.gd' '*test*.cs' '*test*.cpp' ':(glob)**/test*/**' ':(glob)**/tests/**' ':!.agents' ':!docs' ':!*.md' 2>/dev/null | grep -qvE 'https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)'; }
    do: "agent: Substitua chamadas diretas de URLs reais ou sockets externos nos testes de jogo por Fakes determinísticos em memória ou stubs locais de multiplayer."
    verify: |
      ! sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game || ! { git grep -h --untracked -iE -e 'http:[/]/|https:[/]/api\.' -- '*test*.gd' '*test*.cs' '*test*.cpp' ':(glob)**/test*/**' ':(glob)**/tests/**' ':!.agents' ':!docs' ':!*.md' 2>/dev/null | grep -qvE 'https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)'; }
```

---

## 📚 Documentos Normativos da Suíte de Testes de Jogos

A suíte divide-se em 4 guias canônicos de engenharia:

1. **[`test-writing-standards.md`](test-writing-standards.md):** Padrão AAA (*Arrange, Act, Assert*), escrita de testes unitários ultrarrápidos para `Resource`/Economia/Combate sem instanciar `SceneTree`, testes de cena e sinais com `SceneRunner`, e testes de reconciliação multiplayer.
2. **[`test-execution-guide.md`](test-execution-guide.md):** Execução local e headless por CLI (`godot --headless`, Unity Batchmode, Unreal Automation), containers Docker para CI/CD e testes de estresse de servidores dedicados.
3. **[`troubleshooting.md`](troubleshooting.md):** Erradicação das 8 causas raízes de *flakiness* em jogos (dessincronização de `_physics_process`, `await physics_frame`, vazamento de nós órfãos `add_child_autofree`, sementes de RNG e divergência de ponto flutuante).
4. **[`test-modernization-plan.md`](test-modernization-plan.md):** Roteiro estratégico em 4 fases para extrair regras de negócio de scripts monolíticos de cena (`Node2D`/`MonoBehaviour`) para recursos testáveis com catraca de cobertura.

---

## 🏛️ A Pirâmide de Testes em Engenharia de Jogos

```mermaid
graph TD
    subgraph E2E_Layer [10% — Simulação Headless E2E & Bots de Partida]
        E2E[Partidas Headless Automatizadas / Bots de Replay Determinístico / Gauntlet<br/>Ciclo completo: Boot -> Carregar Save -> Loop de Gameplay -> Persistência / Netcode]
    end

    subgraph Scene_Layer [30% — Testes de Cena, Física, Colisão e Sinais]
        Scene[gdUnit4 SceneRunner / GUT / Unity PlayMode<br/>Interação entre CharacterBody, Area2D/Hitboxes, emissão de signals e máquinas de estado]
    end

    subgraph Unit_Layer [60% — Testes Unitários de Estado Puro e Matemática]
        Unit[Testes de Resource (.tres) / ScriptableObject / EditMode<br/>Fórmulas de dano, economia, inventário, save/load, pathfinding e tabelas de loot em < 5ms]
    end

    E2E_Layer --> Scene_Layer
    Scene_Layer --> Unit_Layer
```
