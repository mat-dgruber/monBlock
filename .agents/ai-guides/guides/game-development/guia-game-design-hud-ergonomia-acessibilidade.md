---
title: Guia de Game Design, HUD, Ergonomia de Controles e Acessibilidade em Jogos
description: Diretrizes de engenharia de interface para jogos (Game UI/UX), psicologia cognitiva (Estado de Flow), Game Feel (Coyote Time, Input Buffering, Juice), topologia de HUD e acessibilidade universal (daltonismo, remapeamento de inputs, legendas e fotossensibilidade).
version: 1.0.0
date: 2026-10-19
author: Comitê Corporativo de Arquitetura & Engenharia de Software
---

<!-- markdownlint-disable MD022 MD025 MD031 MD032 MD040 MD026 -->

<!--
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO

| Data          | Autor                                                      | Descrição da Alteração                                                                             |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-10-19    | Comitê Corporativo de Arquitetura & Engenharia de Software | v1.0.0 — Criação do guia de Game Design, HUD, ergonomia e acessibilidade em jogos (ADR 0007).       |

=================================================================================
-->

# 🎨 Guia de Game Design, HUD, Ergonomia de Controles e Acessibilidade em Jogos

> **Princípio Fundamental:** *Diferente de um software corporativo onde a interface é o próprio produto, em um jogo a interface é a lente transparente entre o jogador e o mundo virtual. Uma UX de jogos extraordinária reduz a carga cognitiva periférica (Sistema 1), perdoa a imprecisão biológica humana através de janelas ocultas de tolerância (Coyote Time e Input Buffering), responde a cada ação com feedback multissensorial imediato (Juice) e garante que nenhuma limitação visual, auditiva ou motora impeça alguém de jogar.*

---

## 1. Psicologia Cognitiva em Jogos e Preservação do Estado de Flow

Durante uma sessão intensa de gameplay, o cérebro do jogador opera sob restrição severa de tempo (decisões em $100\text{ ms}$ a $250\text{ ms}$). Qualquer elemento de interface que exija leitura analítica lenta (**Sistema 2**) no meio da ação quebra a imersão e provoca frustração.

### 1.1 Mapa de Zonas de Atenção Visual na Tela (Foveal vs. Periférica)

```text
+-----------------------------------------------------------------------+
| [HUD Periférico Superior]                      [Minimapa / Objetivos] |
| Status de Grupo, Buffs Passivos, Relógio, Pontuação Secundária        |
|                                                                       |
|                     +---------------------------+                     |
|                     |      ZONA FOVEAL (100%)   |                     |
|                     |   Personagem / Retícula   |                     |
|                     |  Telegraphing de Inimigos |                     |
|                     |  Indicadores Diegéticos   |                     |
|                     +---------------------------+                     |
|                                                                       |
| [Recursos Vitais / Armas]                     [Cooldowns de Ação]     |
| Barra de Vida/Stamina com Contraste Alto, Munição e Habilidades       |
+-----------------------------------------------------------------------+
```

### Regras Cognitivas para HUD (*Heads-Up Display*):
1. **Informação Vital Próxima ao Centro (Fóvea):** Quando o jogador está desviando de projéteis ou mirando, seus olhos estão cravados no centro da tela. Indicadores críticos (como stamina prestes a esgotar ou tempo de recarga ativo) devem possuir feedback espelhado próximo ao personagem (HUD Espacial/Diegético) para evitar que o jogador desvie o olhar para o canto extremo do monitor.
2. **Lei de Hick-Hyman em Menus Radiais:** Em combate em tempo real, rodas de seleção rápida (*Weapon Wheels* / *Item Radials*) devem conter no máximo **4 a 8 opções** distribuídas em ângulos cardeais fixos ($45^\circ$ ou $90^\circ$), permitindo memória muscular instantânea no analógico ou mouse.
3. **Visibilidade Contextual (Auto-Hide HUD):** Elementos de HUD que não são relevantes fora de combate (barras cheias em áreas seguras de fazenda/vila) devem esmaecer suavemente para maximizar a contemplação artística do cenário.

---

## 2.As 4 Classes de Interface em Jogos (Taxonomia Diegética)

Ao projetar qualquer indicador visual, escolha a camada menos intrusiva que preserve total clareza funcional:

| Classe | Existe no Mundo Fictício? | Está no Espaço 2D/3D da Cena? | Exemplos Práticos |
| :--- | :---: | :---: | :--- |
| **1. Diegética** | Sim | Sim | Contador de munição digital gravado no próprio rifle (Dead Space/Halo); fumaça saindo do capô do carro danificado; mochila visível enchendo na fazenda. |
| **2. Espacial** | Não | Sim | Contorno brilhante ao redor de uma planta colhível; barra de vida flutuando sobre a cabeça de um inimigo; seta 3D indicando o caminho no chão. |
| **3. Meta-Representação** | Sim | Não (Plano 2D da Câmera) | Vinheta avermelhada ou gotas de chuva/gelo nas bordas da lente da tela indicando frio ou vida crítica. |
| **4. Não-Diegética (Tradicional)** | Não | Não (Overlay `CanvasLayer`) | Menus de inventário, barra de vida fixa no canto, árvore de habilidades e janela de configurações. |

---

## 3. Engenharia de Game Feel: Tolerâncias Humanas e *Juice*

Um controle que obedece apenas à física matemática estrita parece "duro", punitivo e quebrado para o cérebro humano. Os melhores jogos implementam **mentiras benevolentes** em código para alinhar a simulação com a intenção do jogador:

### 3.1 Os 4 Pilares Obrigatórios de Responsividade de Controle

| Mecanismo | Janela Canônica | O Problema Humano | A Solução de Engenharia |
| :--- | :---: | :--- | :--- |
| **Coyote Time** | $80\text{ ms}$ a $150\text{ ms}$ | O jogador corre até a beirada de uma plataforma e aperta o botão de pulo $50\text{ ms}$ **após** o pé perder contato com o chão, caindo no abismo frustrado. | Conceda uma janela de tolerância após deixar o solo (`not is_on_floor()`) na qual o comando de pulo ainda é aceito como válido. |
| **Input Buffering** | $100\text{ ms}$ a $150\text{ ms}$ | O jogador aperta o botão de pular ou atacar $2$ quadros **antes** do personagem tocar o chão ou terminar a animação anterior, e o jogo ignora o botão. | Armazene o timestamp do comando em um buffer; se a condição tornar-se válida dentro de $120\text{ ms}$, execute a ação automaticamente no primeiro tick disponível. |
| **Corner Correction** | $4\text{ px}$ a $8\text{ px}$ | Durante um salto vertical, a quina superior da *hitbox* da cabeça raspa por $3$ pixels na borda inferior de um bloco acima, interrompendo todo o impulso. | Detecte colisões apenas nas extremidades externas do topo da hitbox e deslize o personagem lateralmente alguns pixels para completar o salto. |
| **Hitstop & Squash/Stretch** | $30\text{ ms}$ a $80\text{ ms}$ | Golpes de espada ou colheitas de impacto parecem "cortar o ar" sem peso físico. | Congele a animação do atacante e do alvo por $3$ a $5$ quadros no exato frame do impacto, acompanhado de deformação elástica preservando volume ($S_x \cdot S_y = 1$). |

```gdscript
# Implementação canônica combinando Coyote Time e Input Buffering no Godot 4
class_name ResponsivePlatformController
extends CharacterBody2D

const COYOTE_TIME_SEC: float = 0.12
const JUMP_BUFFER_SEC: float = 0.14
const JUMP_VELOCITY: float = -420.0

var coyote_timer: float = 0.0
var jump_buffer_timer: float = 0.0

func _physics_process(delta: float) -> void:
	# Atualiza timer de Coyote Time
	if is_on_floor():
		coyote_timer = COYOTE_TIME_SEC
	else:
		coyote_timer = maxf(0.0, coyote_timer - delta)
		velocity += get_gravity() * delta

	# Atualiza timer de Input Buffering
	if Input.is_action_just_pressed("jump"):
		jump_buffer_timer = JUMP_BUFFER_SEC
	else:
		jump_buffer_timer = maxf(0.0, jump_buffer_timer - delta)

	# Consome ambos os timers se houver interseção válida
	if jump_buffer_timer > 0.0 and coyote_timer > 0.0:
		velocity.y = JUMP_VELOCITY
		jump_buffer_timer = 0.0
		coyote_timer = 0.0

	move_and_slide()
```

---

## 4. Ergonomia Multiplataforma: Teclado/Mouse, Gamepad e Touch

Um jogo multiplataforma (PC, Consoles e Mobile) jamais deve tratar um método de entrada como cidadão de segunda classe (ex.: emular um cursor lento de mouse controlado pelo analógico do gamepad quando um menu simples de grade resolveria).

1. **Detecção Dinâmica Instantânea de Dispositivo:** O jogo deve escutar `_input(event)` e trocar todos os ícones de prompt da HUD (`[Espaço]`, `(A)` Xbox, `(X)` PlayStation, Botão de Toque) no mesmo quadro em que o jogador tocar no controle ou no teclado, sem exigir reinicialização ou ida ao menu.
2. **Navegação Integral por Foco (`focus_neighbor`):** Toda tela de inventário, diálogo ou loja deve possuir foco inicial explícito (`grab_focus()`), navegação direcional determinística pelo D-Pad/Setas e ações padronizadas de Confirmar e Cancelar/Voltar.
3. **Zonas de Polegar e Alvos de Toque no Mobile:** Em versões móveis, controles virtuais (Joystick Virtual e botões de ação) devem situar-se nos cantos inferiores dentro da *Thumb Zone*, com dimensão mínima de **$48 \times 48\text{ dp}$**, opacidade ajustável e respeito estrito às *Safe Areas* (`DisplayServer.get_display_safe_area()`).

---

## 5. Acessibilidade Universal em Jogos (Xbox Accessibility Guidelines & WCAG)

Acessibilidade em jogos não significa alterar a visão criativa da obra, mas remover barreiras artificiais de hardware e percepção sensorial.

### 5.1 Os 5 Controles de Acessibilidade Mandatórios

| Domínio | Regra Técnica Obrigatória | Implementação Prática |
| :--- | :--- | :--- |
| **1. Visão & Daltonismo** | **Zero dependência exclusiva de cor.** Nunca diferencie raridade de itens, aliados vs. inimigos ou quebra-cabeças apenas por Verde vs. Vermelho. | Combine sempre **Cor + Ícone/Forma Geométrica + Padrão/Textura**. Ofereça paletas de alto contraste para Protanopia, Deuteranopia e Tritanopia. |
| **2. Motricidade & Fadiga** | **Remapeamento total (`InputMap`) e Alternância de Segurar (`Hold` $\leftrightarrow$ `Toggle`).** | Permita reconfigurar qualquer tecla/botão em tempo de execução e converter ações contínuas (correr, mirar, agachar) de "Manter Pressionado" para "Alternar com 1 Toque", além de substituir *Button Mashing* repetitivo por manter pressionado. |
| **3. Audição & Espacialidade** | **Legendas claras e Indicadores Visuais de Som Direcional.** | Legendas com fundo semitransparente de alto contraste ($\ge 7:1$), identificação do nome do personagem que fala, tamanho ajustável e indicadores visuais na borda da tela apontando a direção de passos, tiros ou alertas sonoros fora da câmera. |
| **4. Vestibular & Fotossensibilidade** | **Sliders independentes de *Screen Shake*, *Motion Blur* e *Flashes*.** | Forneça um controle deslizante de $0\%$ a $100\%$ para intensidade de tremor de câmera (*Screen Shake*), opção para desativar flashes luminosos rápidos (prevenção de crises fotossensíveis) e ponto central fixo para evitar cinetose (*Motion Sickness*). |
| **5. Cognição & Ritmo** | **Mixagem de Áudio Segregada e Escala de UI.** | Disponibilize no mínimo 4 barramentos de áudio independentes (`Master`, `Music`, `SFX`, `Voice/UI`) no `AudioServer` e permita escalar a fonte/HUD entre $100\%$ e $150\%$ sem truncar textos. |

---

## 6. Checklist de Auditoria de Game Design, HUD e Acessibilidade

- [ ] **Tolerância de Controles:** Ações de tempo crítico implementam *Coyote Time* ($\ge 100\text{ ms}$) e *Input Buffering* ($\ge 100\text{ ms}$)?
- [ ] **Redundância Visual (Daltonismo):** Todos os estados de combate, raridade, plantio ou puzzles possuem diferenciação por forma/ícone além da cor?
- [ ] **Conforto Vestibular:** O menu de opções expõe um multiplicador global (`0.0` a `1.0`) para reduzir ou zerar *Screen Shake* e efeitos estroboscópicos?
- [ ] **Navegação Sem Mouse:** É possível navegar do menu principal até o jogo, abrir o inventário, salvar e sair usando **100% Gamepad/Teclado** sem tocar no mouse?
- [ ] **Input Remapping Persistente:** O jogador pode remapear teclas e botões de controle e essas alterações são salvas no perfil local (`user://settings.cfg`)?
