# 🧪 Padrões de Escrita de Testes de Jogos (Godot 4, Unity & Servidores)

> **Fonte Normativa:** `guides/testing/games/test-writing-standards.md`  
> **Padrão Obrigatório:** Pirâmide de Testes de Jogos & Convenção AAA (*Arrange, Act, Assert*)

---

## 1. O Padrão AAA Aplicado à Simulação em Tempo Real

Em jogos digitais, todo teste automatizado deve ser **100% determinístico** (independente da taxa de quadros do monitor ou de relógios de parede reais) e estruturar-se em 3 blocos explícitos:

1. **Arrange (Preparação):** Instanciação do `Resource` de dados, fixação da semente do gerador de números aleatórios (`RandomNumberGenerator.seed = 42`) ou montagem da cena isolada com `add_child_autofree()`.
2. **Act (Ação / Simulação):** Invocação da regra de domínio (ex.: `stats.apply_damage(35, 10)`) ou avanço explícito de $N$ quadros físicos (`await runner.simulate_frames(10)`).
3. **Assert (Verificação):** Validação matemática do estado resultante, dos sinais emitidos (`assert_signal_emitted`) e da ausência de nós órfãos na memória.

---

## 2. Testes Unitários de Estado Puro (`Resource` / Domínio — 60% da Base)

Graças à arquitetura de separação **Estado (`Resource`) vs. Apresentação (`Node`)**, a maior parte das regras do jogo (fórmulas de combate, colheita, plantio, crafting, inventário, diálogos e serialização de save) não precisa carregar texturas, shaders ou a árvore de cena. Eles executam em microssegundos.

### 2.1 Godot 4 com GUT (`GutTest`) ou `gdUnit4`

```gdscript
# res://tests/unit/test_character_stats.gd
extends GutTest

func test_quando_receber_dano_com_armadura_deve_mitigar_e_emitir_sinal() -> void:
	# 1. Arrange
	var stats: CharacterStats = CharacterStats.new()
	stats.max_health = 100
	stats.initialize()
	watch_signals(stats)

	# 2. Act
	var dano_aplicado: int = stats.apply_damage(40, 15) # 40 bruto - 15 armadura = 25

	# 3. Assert
	assert_eq(dano_aplicado, 25, "Dano efetivo deve descontar a mitigação da armadura")
	assert_eq(stats.current_health, 75, "Vida atual deve cair de 100 para 75")
	assert_signal_emitted_with_parameters(stats, "health_changed", [75, 100])
	assert_signal_not_emitted(stats, "depleted")

func test_quando_dano_exceder_vida_restante_deve_cravar_em_zero_e_emitir_depleted() -> void:
	# 1. Arrange
	var stats: CharacterStats = CharacterStats.new()
	stats.max_health = 50
	stats.initialize()
	watch_signals(stats)

	# 2. Act
	stats.apply_damage(999, 0)

	# 3. Assert
	assert_eq(stats.current_health, 0, "Vida nunca pode ficar negativa")
	assert_signal_emitted(stats, "depleted")
```

### 2.2 Testes Determinísticos de Economia, Loot e RNG (Semente Fixa)

Nunca utilize `randi()` ou `randf()` global diretamente em regras de negócio. Injete uma instância de `RandomNumberGenerator` com `seed` explícita para que o teste unitário seja 100% reproduzível:

```gdscript
# res://tests/unit/test_crop_harvest_yield.gd
extends GutTest

func test_colheita_com_fertilizante_premium_deve_gerar_quantidade_deterministica() -> void:
	# Arrange
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 133742 # Semente fixa: elimina flakiness estatística
	var crop_rule: CropHarvestRule = CropHarvestRule.new()

	# Act
	var drop_count: int = crop_rule.calculate_yield(
		base_min = 3,
		base_max = 6,
		fertility_multiplier = 1.5,
		rng = rng
	)

	# Assert
	assert_between(drop_count, 4, 9, "Rendimento com multiplicador 1.5x deve respeitar o envelope [4, 9]")
```

---

## 3. Testes de Cena, Física e Sinais (`SceneTree` Isolada — 30% da Base)

Quando é necessário validar colisões (`Area2D`, `CharacterBody2D`, `RayCast3D`), máquinas de estado acopladas a animações ou resposta a inputs (*Coyote Time* / *Input Buffering*), instancie apenas a sub-cena sob teste usando `add_child_autofree()` para evitar vazamento de memória (*Orphan Nodes*).

```gdscript
# res://tests/scenes/test_responsive_platform_controller.gd
extends GutTest

var PackedPlayerScene: PackedScene = preload("res://presentation/actors/player_actor.tscn")

func after_each() -> void:
	Input.action_release("jump")
	Input.action_release("move_right")

func test_coyote_time_permite_pular_logo_apos_sair_da_plataforma() -> void:
	# 1. Arrange
	var player: ResponsivePlatformController = add_child_autofree(PackedPlayerScene.instantiate())
	player.coyote_timer = 0.10 # Simula que acabou de deixar o solo há 20ms
	player.jump_buffer_timer = 0.12 # Jogador pressionou pulo dentro da janela

	# 2. Act — avança 1 passo de física determinístico (60Hz -> delta = 1/60)
	player._physics_process(1.0 / 60.0)

	# 3. Assert
	assert_lt(player.velocity.y, 0.0, "Vetor Y negativo comprova disparo do salto via Coyote Time")
	assert_almost_eq(player.coyote_timer, 0.0, 0.0001, "Coyote timer deve ser consumido após o salto")
	assert_almost_eq(player.jump_buffer_timer, 0.0, 0.0001, "Jump buffer deve ser zerado após o salto")
```

---

## 4. Testes de Persistência Atômica e Netcode

### 4.1 Teste de Recuperação de Save Corrompido (`.sav` $\rightarrow$ `.bak`)

```gdscript
# res://tests/unit/test_save_manager.gd
extends GutTest

const TEST_SLOT: int = 99

func after_each() -> void:
	DirAccess.remove_absolute("user://saves/slot_99.sav")
	DirAccess.remove_absolute("user://saves/slot_99.bak")
	DirAccess.remove_absolute("user://saves/slot_99.tmp")

func test_quando_save_principal_for_corrompido_deve_restaurar_backup_automaticamente() -> void:
	# Arrange: realiza 2 salvamentos válidos consecutivos (criando .sav e .bak)
	assert_eq(SaveManager.save_game(TEST_SLOT, {"day": 1, "coins": 100}), OK)
	assert_eq(SaveManager.save_game(TEST_SLOT, {"day": 2, "coins": 250}), OK)

	# Corrompe intencionalmente o arquivo principal (.sav) simulando queda de energia
	var f: FileAccess = FileAccess.open("user://saves/slot_99.sav", FileAccess.WRITE)
	f.store_string("DADOS_TRUNCADOS_CORROMPIDOS")
	f.close()

	# Act
	var loaded_state: Dictionary = SaveManager.load_game(TEST_SLOT)

	# Assert: recupera o estado íntegro do backup (.bak -> day 1)
	assert_false(loaded_state.is_empty(), "SaveManager deve recuperar o arquivo .bak quando o .sav falha no SHA-256")
	assert_eq(loaded_state.get("day"), 1)
```

---

## 5. Regras de Ouro e Antipadrões Proibidos

| Prática | Status | Justificativa Técnica |
| :--- | :---: | :--- |
| Usar `add_child_autofree(node)` (GUT) ou `auto_free(node)` (gdUnit4) | ✅ Obrigatório | Garante que nós instanciados sejam destruídos ao fim de cada teste, zerando *Orphan Nodes*. |
| Usar `assert_almost_eq(a, b, epsilon)` para `float` / `Vector2` / `Vector3` | ✅ Obrigatório | Aritmética IEEE 754 acumula desvios de $10^{-6}$; comparações `==` diretas em floats quebram entre CPUs x86 e ARM. |
| Usar `await get_tree().create_timer(2.0).timeout` em testes | ❌ Proibido | Torna a suíte lenta e dependente de carga da CPU no runner de CI. Avance os quadros ou invoque `_physics_process(delta)` diretamente. |
| Acoplar testes de inventário/economia à interface visual (`InventoryPanel.tscn`) | ❌ Proibido | Regras de negócio devem ser testadas diretamente contra `InventoryResource`, sem abrir janelas gráficas. |
