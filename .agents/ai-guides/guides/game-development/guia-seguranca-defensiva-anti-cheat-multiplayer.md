---
title: Guia de Segurança Defensiva em Jogos, Autoridade de Servidor e Anti-Cheat
description: Framework de segurança Zero-Trust para jogos digitais singleplayer e multiplayer, cobrindo autoridade estrita do servidor, validação cinemática de pacotes UDP, proteção de economia contra duplicação, integridade de saves e proteção de binários.
version: 1.0.0
date: 2026-10-19
author: Comitê Corporativo de Arquitetura & Engenharia de Software
---

<!-- markdownlint-disable MD022 MD025 MD031 MD032 MD040 MD026 -->

<!--
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO

| Data          | Autor                                                      | Descrição da Alteração                                                                          |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-10-19    | Comitê Corporativo de Arquitetura & Engenharia de Software | v1.0.0 — Instituição do guia canônico de segurança defensiva e anti-cheat em jogos (ADR 0007). |

=================================================================================
-->

# 🛡️ Guia de Segurança Defensiva em Jogos, Autoridade de Servidor e Anti-Cheat

> **Princípio Fundamental:** *Na engenharia de jogos, o cliente está nas mãos do adversário. A memória RAM do processo será vasculhada por Cheat Engine, os pacotes UDP serão forjados ou atrasados artificialmente por proxies de rede, e os arquivos `.pck`/assets serão extraídos por ferramentas de descompilação. A única barreira intransponível em jogos online é o Servidor Autoritativo: o cliente nunca dita resultados, apenas envia intenções de entrada sujeitas à validação matemática e física rigorosa.*

---

## 1. Taxonomia de Ameaças em Jogos Digitais (Game Security Matrix)

Inspirado nos pilares Zero-Trust e OWASP, o modelo de defesa de jogos organiza-se em 7 superfícies críticas:

```text
GAME-SEC v1
├── GSEC-AUTHORITY  ──> Autoridade absoluta do servidor sobre física, dano, posição e loot
├── GSEC-NETWORK    ──> Sanitização de pacotes UDP/RPC, anti-replay, rate limit e DTLS
├── GSEC-KINEMATICS ──> Detecção de anomalias de movimento (Speedhack, Teleport, Wallhack/NoClip)
├── GSEC-ECONOMY    ──> Transações atômicas de inventário, prevenção de Dupe Exploits e servidor de loja
├── GSEC-MEMORY     ──> Ofuscação de variáveis críticas em RAM e proteção contra Memory Scanners
├── GSEC-STORAGE    ──> Assinatura criptográfica (HMAC) de saves locais e encriptação de pacotes (.pck)
└── GSEC-SECRETS    ──> Erradicação de chaves de API, credenciais de banco e webhooks no binário do cliente
```

---

## 2. GSEC-AUTHORITY: Autoridade Estrita do Servidor (Never Trust the Client)

### O Erro Fatal do RPC Confiável pelo Cliente
Permitir que o cliente invoque procedimentos remotos que alteram diretamente o estado do mundo — como `rpc("apply_damage_to_enemy", enemy_id, 99999)` ou `rpc("add_gold", 5000)` — torna o jogo instantaneamente vulnerável a trapaças triviais.

### O Contrato Canônico Intenção → Validação → Efeito:
1. **O Cliente transmite apenas Intenções (Inputs):** *"No tick 1042, pressionei o botão de ataque primário olhando para o vetor $(0.707, 0.707)$"*.
2. **O Servidor valida todas as pré-condições:**
   - O jogador está vivo e não está atordoado (*stunned*)?
   - O tempo de recarga (*cooldown*) da arma já expirou no relógio do servidor?
   - O jogador possui munição/stamina suficiente no estado autoritativo do servidor?
   - A distância e a linha de visão (*Raycast* no servidor com *Lag Compensation*) permitem atingir o alvo?
3. **O Servidor calcula o efeito e replica o resultado:** Somente após a validação, o servidor subtrai a vida do alvo e transmite o novo estado aos clientes.

```gdscript
# ❌ PROIBIDO: O cliente dita o dano e o alvo sem validação
@rpc("any_peer", "reliable")
func client_deal_damage_bad(target_peer_id: int, damage: int) -> void:
	players[target_peer_id].health -= damage # Exploiter envia damage = 9999999

# ✅ CORRETO: O cliente envia a intenção de ataque; o servidor valida tudo
@rpc("any_peer", "reliable")
func request_melee_attack(aim_direction: Vector2, client_tick: int) -> void:
	if not multiplayer.is_server():
		return
	var attacker_id: int = multiplayer.get_remote_sender_id()
	var attacker: ServerPlayerState = server_world.get_player(attacker_id)
	if attacker == null or not attacker.is_alive():
		return

	# 1. Sanitização matemática de vetores (previne NaN / Inf que derrubam o servidor)
	if not aim_direction.is_finite() or aim_direction.length_squared() < 0.0001:
		return
	var safe_dir: Vector2 = aim_direction.normalized()

	# 2. Validação de Cooldown e Stamina no relógio autoritativo do servidor
	var now_sec: float = Time.get_ticks_msec() / 1000.0
	if now_sec - attacker.last_attack_time < attacker.weapon.cooldown_sec:
		security_audit.record_violation(attacker_id, "ATTACK_COOLDOWN_VIOLATION")
		return

	attacker.last_attack_time = now_sec
	server_world.execute_authoritative_melee(attacker, safe_dir, client_tick)
```

---

## 3. GSEC-NETWORK & KINEMATICS: Sanitização de Pacotes e Anti-Speedhack

### 3.1 Blindagem contra Poison Packets (`NaN` e `Inf`)
Em motores físicos 2D e 3D, se um cliente malicioso injetar um único `float` com valor `NAN` (*Not a Number*) ou `INF` (*Infinity*) em um pacote de posição ou velocidade, a multiplicação matricial contamina toda a árvore espacial (BVH/Octree) e derruba a instância do servidor para todos os jogadores da partida.

**Regra Obrigatória:** Todo vetor ou escalar de ponto flutuante recebido pela rede deve passar por `is_finite()` (ou ` float.IsFinite()` em C#) e *clamping* de limites antes de tocar o motor de física.

### 3.2 Validação Cinemática contra Speedhack e Teleport
Mesmo que o cliente envie apenas comandos de movimento, um atacante pode enviar pacotes numa frequência artificialmente acelerada (ex.: 120 pacotes por segundo num servidor de 60Hz) ou informar deslocamentos maiores que a velocidade máxima permitida pelo personagem.

```gdscript
# Validador cinemático no Servidor Dedicado
class_name MovementAntiCheat
extends RefCounted

const MAX_TOLERANCE_FACTOR: float = 1.15 # 15% de folga para jitter de rede

static func validate_displacement(
	prev_pos: Vector3,
	proposed_pos: Vector3,
	dt: float,
	max_allowed_speed: float,
	space_state: PhysicsDirectSpaceState3D,
	collision_mask: int
) -> Dictionary:
	# 1. Rejeita valores não finitos imediatamente
	if not proposed_pos.is_finite() or dt <= 0.0 or dt > 1.0:
		return {"valid": false, "corrected_pos": prev_pos, "reason": "INVALID_FLOAT_OR_DELTA"}

	# 2. Verifica limite de velocidade máxima (Anti-Speedhack / Anti-Teleport)
	var distance: float = prev_pos.distance_to(proposed_pos)
	var max_distance: float = max_allowed_speed * dt * MAX_TOLERANCE_FACTOR
	if distance > max_distance:
		return {"valid": false, "corrected_pos": prev_pos, "reason": "SPEED_ENVELOPE_EXCEEDED"}

	# 3. Verifica atravessamento ilegal de paredes sólidas (Anti-NoClip)
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(
		prev_pos, proposed_pos, collision_mask
	)
	var hit: Dictionary = space_state.intersect_ray(query)
	if not hit.is_empty():
		return {"valid": false, "corrected_pos": prev_pos, "reason": "WALL_NOCLIP_DETECTED"}

	return {"valid": true, "corrected_pos": proposed_pos, "reason": "OK"}
```

### 3.3 Fog of War Server-Side (Mitigação Definitiva de Wallhack / ESP)
Um *Wallhack* ou *Radar ESP* lê a memória do cliente para desenhar caixas ao redor de inimigos escondidos atrás de paredes ou na névoa de guerra (*Fog of War*).
- **A única defesa eficaz:** O servidor **não deve transmitir pacotes de posição** de entidades que estejam fora do raio de percepção ou ocultas pela linha de visão (*Area of Interest / PVS — Potentially Visible Set*) daquele cliente específico. Se a informação não chega pela placa de rede do cliente, nenhum Cheat Engine ou overlay externo pode revelá-la.

---

## 4. GSEC-ECONOMY: Proteção de Economia e Prevenção de Dupe Exploits

Ataques de duplicação de itens (*Item Duplication / Dupe Exploits*) destroem a economia de jogos online em horas. Eles exploram condições de corrida (*Race Conditions*) quando o jogador tenta vender, trocar e dropar o mesmo item simultaneamente em duas conexões ou durante uma desconexão forçada.

### Regras de Ouro da Economia Segura:
1. **Identificadores Únicos de Instância (UUIDv4 / ULID):** Itens raros, equipamentos e moedas transacionáveis devem possuir IDs únicos rastreáveis no banco de dados para auditoria instantânea de duplicação.
2. **Chave de Idempotência em Transações:** Toda compra na loja, abertura de baú (*lootbox*) ou troca entre jogadores deve exigir um `transaction_id` único e ser processada dentro de uma transação ACID com *row-level locking* (`SELECT ... FOR UPDATE`).
3. **Save-Before-Acknowledge em Trocas:** Em transferências entre dois jogadores ($A \rightarrow B$), a remoção do item de $A$ e a inserção em $B$ ocorrem na **mesma transação atômica**. Jamais salve o inventário de $B$ em memória esperando salvar $A$ no encerramento da sessão.

---

## 5. GSEC-SECRETS & STORAGE: Proteção de Binários, Assets e Credenciais

### 5.1 Zero Credenciais no Binário Distribuído (`.pck`, `.apk`, `.ipa`, `.exe`)
Jogos compilados para PC, Mobile ou WebAssembly são integralmente extraíveis em segundos com ferramentas públicas (ex.: `gdre_tools` para Godot, `ILSpy`/`dnSpy` para Unity, `UnrealPak` para Unreal).
- **PROIBIÇÃO ABSOLUTA:** Nunca inclua chaves de API da OpenAI/Anthropic, tokens de administração do Supabase/Firebase, credenciais AWS S3, strings de conexão de banco de dados ou URLs privadas de webhooks do Discord dentro de scripts GDScript/C# ou arquivos `.tres` empacotados no cliente.
- **Arquitetura Correta:** O cliente autentica o jogador no backend (via ticket da Steam, Epic EOS, Apple Game Center ou Google Play Games), recebe um token de sessão de escopo restrito, e o **Backend/Edge Function** realiza chamadas sensíveis em nome do jogador.

### 5.2 Encriptação de Pacotes e Integridade de Saves Offline
1. **Encriptação de Exportação:** Em builds de produção do Godot 4, habilite a encriptação de scripts e recursos no *Export Preset* fornecendo uma chave AES-256 de 64 caracteres hexadecimais injetada exclusivamente via variável de ambiente na esteira de CI (`GODOT_SCRIPT_ENCRYPTION_KEY`), nunca commitada no repositório.
2. **Telemetria de Integridade em Leaderboards Singleplayer:** Se um jogo singleplayer possui placar de líderes online (*Leaderboards*), não aceite apenas o número da pontuação final (`score = 999999`). Envie a `seed` da partida e o log compactado de inputs/eventos para que o servidor valide a plausibilidade matemática do recorde.

---

## 6. Checklist de Auditoria de Segurança em Jogos

- [ ] **Nenhum RPC de Mutação Direta:** Todos os métodos `@rpc("any_peer")` tratam o remetente (`get_remote_sender_id()`) como não confiável e validam permissões, distância e cooldown no servidor?
- [ ] **Sanitização de Floats:** Todo `Vector2`, `Vector3`, `Quaternion` ou `float` vindo da rede é verificado com `is_finite()` antes de entrar em cálculos físicos?
- [ ] **Rate Limiting por Peer:** O servidor impõe limite máximo de pacotes/RPCs por segundo por cliente, desconectando peers que tentem inundar (*flood*) o loop de simulação?
- [ ] **Zero Segredos no Cliente:** Nenhum arquivo `.gd`, `.cs`, `.tres`, `.cfg` ou `project.godot` contém chaves secretas de API ou credenciais de infraestrutura?
- [ ] **Transações Econômicas Idempotentes:** Compras, drops e trocas de itens utilizam bloqueio transacional atômico imune a desconexões propositais (*plug-pulling*)?
