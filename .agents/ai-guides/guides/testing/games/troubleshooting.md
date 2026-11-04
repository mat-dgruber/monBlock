# 🩺 Troubleshooting de Testes de Jogos & Erradicação de Flakiness

> **Fonte Normativa:** `guides/testing/games/troubleshooting.md`  
> **Objetivo:** Diagnóstico determinístico e eliminação definitiva de falhas intermitentes (*flaky tests*), vazamentos de memória (*Orphan Nodes*) e divergências físicas em suítes de testes de jogos

---

## 1. As 8 Causas Raízes de Flakiness em Motores de Jogos

Motores de jogos operam sobre loops contínuos de eventos, servidores de física assíncronos e cálculos de ponto flutuante. Quando um teste de jogo passa na máquina do desenvolvedor e falha no CI, a causa reside invariavelmente em um dos 8 pontos abaixo:

### 1.1. Colisões Avaliadas Antes do Passo do Servidor de Física
- **Sintoma:** Você instancia um projétil dentro da `Area2D` de um inimigo, checa `area.get_overlapping_areas()` na linha seguinte e a lista vem vazia `[]`.
- **Causa Técnica:** No Godot 4 (e na Unity/Unreal), mover a propriedade `global_position` de um nó não atualiza as árvores espaciais (BVH) instantaneamente; o *PhysicsServer2D/3D* só recalcula sobreposições no próximo tick de física.
- **Solução Definitiva:**
  Aguarde explicitamente a sincronização do quadro físico antes da asserção:
  ```gdscript
  bullet.global_position = enemy_hitbox.global_position
  await get_tree().physics_frame
  await get_tree().physics_frame # 1º frame registra transform, 2º dispara overlaps
  assert_true(enemy_hitbox.overlaps_area(bullet))
  ```

---

### 1.2. Vazamento de Nós Órfãos (*Orphan Nodes Detected*)
- **Sintoma:** O teste passa nas asserções lógicas, mas o runner falha ao final reportando `Orphan Nodes: 12` ou o consumo de RAM cresce até travar a esteira.
- **Causa Técnica:** Em GDScript/C++, enquanto `Resource` e `RefCounted` possuem contagem automática de referências, todo `Node` (e seus derivados `Node2D`, `Control`, `Timer`) exige liberação explícita via `free()` / `queue_free()`. Se um teste instancia cenas ou projéteis fora da árvore ou não os limpa no `after_each`, eles permanecem vivos na memória.
- **Solução Definitiva:**
  Sempre registre qualquer nó criado no teste com `add_child_autofree(node)` (no GUT) ou `auto_free(node)` (no gdUnit4).

---

### 1.3. Uso de `queue_free()` Seguido de Asserção Imediata na Mesma Linha
- **Sintoma:** O código chama `enemy.take_lethal_damage()` (que executa `queue_free()`), mas `assert_eq(get_child_count(), 0)` falha dizendo que o inimigo ainda está lá.
- **Causa Técnica:** `queue_free()` agenda a destruição do nó para o **final do frame atual** (*idle frame*), para evitar corromper iterações ou sinais em andamento na pilha de chamadas.
- **Solução Definitiva:**
  Verifique `assert_true(enemy.is_queued_for_deletion())` imediatamente ou aguarde `await get_tree().process_frame` antes de contar os filhos restantes.

---

### 1.4. Divergência de Ponto Flutuante (IEEE 754) entre Arquiteturas (x86_64 vs. ARM64/Apple Silicon)
- **Sintoma:** `assert_eq(player.position.x, 14.142135)` passa no MacBook M3 (ARM64) mas falha no runner Linux (x86_64) com `14.142136 != 14.142135`.
- **Causa Técnica:** Instruções FMA (*Fused Multiply-Add*) e registradores SIMD diferem nos últimos bits de mantissa entre arquiteturas de CPU.
- **Solução Definitiva:**
  Jamais compare `float`, `Vector2`, `Vector3` ou `Quaternion` com igualdade exata (`assert_eq`). Utilize `assert_almost_eq(obtido, esperado, 0.001)` ou `is_equal_approx()`.

---

### 1.5. Estado Global Contaminado em Singletons (`Autoloads`)
- **Sintoma:** Um teste passa quando executado isoladamente (`-gtest=...`), mas falha quando toda a suíte roda em sequência.
- **Causa Técnica:** Um `Autoload` global (ex.: `GameState`, `EventBus`, `InventoryGlobal`) reteve conexões de sinais, moedas ou flags mutadas pelo teste anterior.
- **Solução Definitiva:**
  1. Evite guardar estado mutável de partida em Autoloads; prefira injetar uma instância limpa de `GameSessionResource` em cada teste.
  2. Se existir um Autoload inevitável, implemente um método `reset_for_testing()` e invoque-o no `before_each()` da suíte.

---

### 1.6. Sementes de Aleatoriedade (`RNG`) Não Inicializadas
- **Sintoma:** Testes de geração procedural, crítico de combate ou drop de sementes falham em $1\%$ das execuções no CI.
- **Causa Técnica:** Uso das funções globais `randomize()`, `randf()` ou `randi()` sem semente determinística controlada pelo teste.
- **Solução Definitiva:**
  Receba `rng: RandomNumberGenerator` por parâmetro nas classes de domínio e defina `rng.seed = 12345` no bloco **Arrange**.

---

### 1.7. Travamento Headless por Inicialização de Áudio ou Shader Cache
- **Sintoma:** O comando `godot --headless` congela indefinidamente ou imprime dezenas de erros `ERROR: Cannot open audio driver` / `Vulkan: Loader Message` no Linux CI.
- **Causa Técnica:** O projeto tenta abrir dispositivos de som ALSA/PulseAudio inexistentes no container Docker ou compilar shaders antes de importar os assets `.godot/`.
- **Solução Definitiva:**
  1. Rode `godot --headless --import` antes de disparar os testes no CI.
  2. Passe explicitamente `--headless --audio-driver Dummy` na linha de comando.

---

### 1.8. Ações de `Input` Presas Entre Testes (`Input.action_press`)
- **Sintoma:** O teste A simula `Input.action_press("move_right")` e falha no meio; todos os testes seguintes começam com o personagem andando sozinho para a direita.
- **Causa Técnica:** O singleton `Input` mantém o estado global das ações pressionadas até que `Input.action_release()` seja chamado.
- **Solução Definitiva:**
  No hook `after_each()`, limpe sistematicamente todas as ações simuladas:
  ```gdscript
  func after_each() -> void:
  	for action in InputMap.get_actions():
  		if Input.is_action_pressed(action):
  			Input.action_release(action)
  ```
