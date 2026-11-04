---
title: Guia Definitivo de Desenvolvimento de Jogos: Da Arquitetura e Matemática à Produção em Tempo Real
description: Manual técnico normativo e framework arquitetural para engenharia de jogos 2D/3D e servidores multiplayer, cobrindo ciclo de vida do game loop, desacoplamento estado vs apresentação, matemática vetorial/quaternions, física e colisão avançada (GJK/EPA/CCD), IA comportamental, pipelines gráficos/PBR, networking UDP autoritativo, concorrência e Godot 4/GDScript 2.0.
version: 1.1.0
date: 2026-10-19
author: Comitê Corporativo de Arquitetura & Engenharia de Software
---

<!-- markdownlint-disable MD022 MD025 MD031 MD032 MD040 MD026 -->

<!--
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO

| Data          | Autor                                                      | Descrição da Alteração                                                                 |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-19    | Comitê Corporativo de Arquitetura & Engenharia de Software | v1.0.0 — Instituição do Guia Definitivo de Desenvolvimento de Jogos e Servidores       |
|               | & Matheus Diniz (mat-dgruber)                              | Multiplayer (ADR 0008). Síntese exaustiva multi-engine baseada nos roadmaps oficiais   |
|               |                                                            | Game Developer e Server Side Game Developer (roadmap.sh), com progressão nó a nó,    |
|               |                                                            | arquitetura desacoplada (Resource vs Node), matemática, física/colisão, shaders,      |
|               |                                                            | networking de baixa latência e integração com Godot 4 / Antigravity.                   |

| 2026-10-19    | Matheus Diniz (mat-dgruber)                                | v1.1.0 — Consolidação completa das 3 partes e 25 capítulos do guia: Fundamentos de     |
|               |                                                            | Engenharia, Aprofundamento Teórico/Algoritmos e Prática de Produção contemporânea      |
|               |                                                            | em Godot 4 (Game feel/juice, TileMaps, A* e NavMesh 2D/3D, AudioServer/Buses,          |
|               |                                                            | Profiling/Draw Calls, Design Patterns para Jogos, Save/Load com versionamento,         |
|               |                                                            | pipeline de export e economia de jogos).                                               |

=================================================================================
-->

> **Manifesto de Engenharia e Arquitetura de Jogos:** *Um jogo digital é um sistema interativo em tempo real sob rigoroso orçamento de tempo por quadro (~16.6ms para 60 FPS, ~8.3ms para 120 FPS). A excelência técnica em jogos reside na separação incondicional entre a simulação lógica do mundo (regras, estado, física determinística) e a apresentação sensorial (renderização, animação, efeitos visuais e áudio). A interface e os nós visuais são projeções efêmeras do estado; os dados e a lógica devem permanecer testáveis, desacoplados e resilientes. Em ambientes multiplayer, a autoridade do estado pertence ao servidor e a rede é tratada como um meio inerentemente hostil, sujeito a latência, perda e jitter.*

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). `do` é shell ou começa com `agent:`.

```yaml heuristics
guide: desenvolvimento-jogos
version: 1
requires: [padrao-criacao-adrs]
heuristics:
  - id: GAME-01
    title: Checklist canônico de arquitetura de jogos em .agents/rules/desenvolvimento-jogos.md
    when: "sh \"$AI_GUIDES_RUNTIME/templates/detect_stack.sh\" game && ! test -f .agents/rules/desenvolvimento-jogos.md"
    do: |
      mkdir -p .agents/rules
      cp "$AI_GUIDES_RUNTIME/templates/rules/desenvolvimento-jogos.md" .agents/rules/desenvolvimento-jogos.md
    verify: "! sh \"$AI_GUIDES_RUNTIME/templates/detect_stack.sh\" game || grep -q 'Checklist Canônico de Desenvolvimento e Arquitetura de Jogos' .agents/rules/desenvolvimento-jogos.md"

  - id: GAME-02
    title: Referência canônica do guia de desenvolvimento de jogos no AGENTS.md
    when: "sh \"$AI_GUIDES_RUNTIME/templates/detect_stack.sh\" game && ! grep -q 'desenvolvimento-jogos' AGENTS.md"
    do: "agent: Adicione a referência ao guia-desenvolvimento-jogos-arquitetura-producao.md na seção de governança do AGENTS.md."
    verify: "! sh \"$AI_GUIDES_RUNTIME/templates/detect_stack.sh\" game || grep -q 'desenvolvimento-jogos' AGENTS.md"

  - id: GAME-03
    title: Proteção de segredos no código de jogos (zero API keys ou tokens privados em fontes)
    when: |
      sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game && git grep -q --untracked -iE -e '(api_key|secret_key|private_key|token)([[:space:]]*:[[:space:]]*[^=;\n]+)?[[:space:]]*=[[:space:]]*["\x27][a-zA-Z0-9_-]{16,}["\x27]' -- '*.gd' '*.cs' '*.cpp' '*.h' '*.py' '*.ts' '*.js' ':(exclude,glob)**/test*/**' ':(exclude,glob)**/__tests__/**' ':(exclude,glob)**/*test*' ':(exclude,glob)**/*Test*' ':!.agents' ':!docs'
    do: "agent: Remova credenciais, API keys e tokens estáticos dos fontes do jogo, migrando para variáveis de ambiente ou backend seguro."
    verify: |
      ! sh "$AI_GUIDES_RUNTIME/templates/detect_stack.sh" game || ! git grep -q --untracked -iE -e '(api_key|secret_key|private_key|token)([[:space:]]*:[[:space:]]*[^=;\n]+)?[[:space:]]*=[[:space:]]*["\x27][a-zA-Z0-9_-]{16,}["\x27]' -- '*.gd' '*.cs' '*.cpp' '*.h' '*.py' '*.ts' '*.js' ':(exclude,glob)**/test*/**' ':(exclude,glob)**/__tests__/**' ':(exclude,glob)**/*test*' ':(exclude,glob)**/*Test*' ':!.agents' ':!docs'
```

---

## 📚 Sumário Executivo e Estrutura do Guia

1. [Parte I — Fundamentos de Engenharia](#1-fundamentos-de-game-development)
   - [1. Fundamentos de Game Development](#1-fundamentos-de-game-development)
   - [2. Matemática para Jogos](#2-matemática-para-jogos)
   - [3. Física, Movimento e Colisões](#3-física-movimento-e-colisões)
   - [4. IA de Gameplay](#4-ia-de-gameplay)
   - [5. Gráficos e Rendering](#5-gráficos-e-rendering)
   - [6. Multiplayer: Sockets, Transporte e Mensagens](#6-multiplayer-sockets-transporte-e-mensagens)
   - [7. Concorrência, Determinismo e Arquitetura Server-Side](#7-concorrência-determinismo-e-arquitetura-server-side)
   - [8. Registro de Cobertura e Pendências](#8-registro-de-cobertura-e-pendências)
2. [Parte II — Aprofundamento Teórico & Algoritmos](#9-transformações-orientação-curvas-e-câmera)
   - [9. Transformações, Orientação, Curvas e Câmera](#9-transformações-orientação-curvas-e-câmera)
   - [10. Movimento, Dinâmica e Colisão em Maior Detalhe](#10-movimento-dinâmica-e-colisão-em-maior-detalhe)
   - [11. Animação, Percepção Visual, Cor e Iluminação](#11-animação-percepção-visual-cor-e-iluminação)
   - [12. IA de Personagens, Busca e Aprendizado](#12-ia-de-personagens-busca-e-aprendizado)
   - [13. Servidores de Jogos: Rede, Concorrência e Dados](#13-servidores-de-jogos-rede-concorrência-e-dados)
   - [14. Projetos para Consolidar o Aprendizado](#14-projetos-para-consolidar-o-aprendizado)
   - [15. Inventário dos Roteiros](#15-inventário-dos-roteiros)
3. [Parte III — Prática de Produção, Godot 4 & Sistemas Contemporâneos](#16-game-design-fundamentals-feel-juice-e-feedback)
   - [16. Game Design Fundamentals: Feel, Juice e Feedback](#16-game-design-fundamentals-feel-juice-e-feedback)
   - [17. Arquitetura de Engine: Godot 4 em Profundidade](#17-arquitetura-de-engine-godot-4-em-profundidade)
   - [18. Navegação e Pathfinding 2D/3D (A\*, NavMesh)](#18-navegação-e-pathfinding-2d3d-a-navmesh)
   - [19. Áudio Interativo e Sound Design](#19-áudio-interativo-e-sound-design)
   - [20. Otimização, Profiling e Performance em Tempo Real](#20-otimização-profiling-e-performance-em-tempo-real)
   - [21. Padrões de Projeto (Design Patterns) Aplicados a Jogos](#21-padrões-de-projeto-design-patterns-aplicados-a-jogos)
   - [22. Sistema de Save, Persistência e Versionamento de Estado](#22-sistema-de-save-persistência-e-versionamento-de-estado)
   - [23. Pipeline de Export, Plataformas e Distribuição](#23-pipeline-de-export-plataformas-e-distribuição)
   - [24. Game Design Avançado: Balanceamento e Economia](#24-game-design-avançado-balanceamento-e-economia)
   - [25. Leituras e Referências Recomendadas](#25-leituras-e-referências-recomendadas)

---

## Sobre o que é este guia

Game development é a engenharia de sistemas interativos em tempo real: o software recebe entrada, atualiza um mundo regido por regras, calcula interações físicas e de gameplay, e transforma o estado resultante em imagem, som e resposta ao jogador. Em jogos online, a experiência também depende de rede, servidores, persistência, segurança e operação confiável.

Este guia conecta esses domínios sem confundi-los. Matemática e física fundamentam transformações, movimento e colisões; engines coordenam sistemas de execução; gráficos e animação produzem a apresentação visual; IA governa comportamentos de personagens e decisões; networking e arquitetura server-side mantêm estados multiplayer compartilhados.

## Como usar este material

- **Sequência pedagógica:** Leia na sequência dos roadmaps para acompanhar pré-requisitos e relações entre os tópicos. Os capítulos temáticos agrupam conceitos próximos, mas não substituem a ordem visual original.
- **Prática e prototipagem:** Use os exemplos e cenários para ligar a teoria a situações de jogo; implemente protótipos pequenos para observar os conceitos em funcionamento.
- **Decisões técnicas:** Consulte as tabelas comparativas quando precisar escolher entre representações, algoritmos ou abordagens com custos diferentes.
- **Rastreabilidade:** A seção “Fontes” após cada capítulo registra arquivos de nós abertos, IDs e referências publicadas.
- **Divisão conceitual:** Capítulos 1–7 abordam a visão de aprendizagem; capítulos 9–13 aprofundam algoritmos e trade-offs; o capítulo 15 traz o inventário detalhado; capítulos 16–25 consolidam a implementação no Godot 4 e engenharia de jogos contemporânea.
- **Single-player vs. Multiplayer:** Trate as duas trilhas conforme o projeto. A trilha principal é útil para jogos de qualquer escala; a trilha server-side torna-se central quando regras, partidas ou economia precisam ser autoritativas na nuvem.

## Estrutura do guia

- **Fundamentos e ferramentas:** Estado, loop de jogo, divisão cliente/servidor, linguagens e engines.
- **Matemática:** Vetores, geometria, matrizes, orientação, curvas e projeções.
- **Física e colisão:** Movimento, dinâmica, detecção, algoritmos (SAT, GJK, EPA) e estruturas espaciais.
- **IA de gameplay:** Tomada de decisão, FSM, Behavior Trees, lógica fuzzy, sistemas de Markov e pathfinding.
- **Gráficos e animação:** Pipeline gráfico, rasterização, ray tracing, shaders, iluminação e PBR.
- **Multiplayer e servidor:** Rede, transporte (TCP vs. UDP), pacotes, concorrência, determinismo, dados e segurança.
- **Prática e Godot 4:** Game feel, nós vs. recursos, NavMesh, áudio com busses, profilers, patterns e save systems.

## Fonte da verdade

- **Roadmap Game Developer:** [roadmap.sh/game-developer](https://roadmap.sh/game-developer)
- **Roadmap Server Side Game Developer:** [roadmap.sh/server-side-game-developer](https://roadmap.sh/server-side-game-developer)
- **Repositório:** `nilbuild/developer-roadmap` (redirecionado de `kamranahmedse/developer-roadmap`)
- **Caminho Game Developer:** `roadmaps/game-developer/content/<slug>@<id>.md`
- **Caminho Server Side:** `roadmaps/server-side-game-developer/content/<slug>@<id>.md`

Os roadmaps do site definem a sequência visual; os arquivos Markdown do repositório fornecem resumos e referências por nó. O repositório declara que cada arquivo de conteúdo corresponde a um tópico e que o ID no nome do arquivo liga o conteúdo ao respectivo nó. O conteúdo muda com o tempo; o guia deve ser revisado contra a branch e o commit atuais antes de ser considerado concluído.

# **1. Fundamentos de Game Development**

Um jogo pode ser modelado como um sistema que mantém um estado, recebe entradas, aplica regras e produz um novo estado. O estado pode incluir personagens, objetos, posições, velocidades, inventário, pontuação e condições de vitória. A engine coordena a atualização desse estado e a apresentação visual, sonora e interativa.

O desenvolvimento de jogos não é apenas escrever regras de gameplay. Mesmo um protótipo simples depende de representação espacial, física, colisões, carregamento de assets, input, interface e rendering. Projetos multiplayer adicionam a questão de qual computador ou serviço tem autoridade sobre cada parte do estado.

---

## **1.1. O ciclo de atualização**

Um ciclo típico recebe input, atualiza sistemas de gameplay, simula movimento e interações, resolve colisões, prepara áudio e interface e desenha o quadro. A simulação e a renderização são responsabilidades relacionadas, mas distintas: a simulação calcula o que aconteceu no mundo; a renderização converte uma cena em pixels.

- **Entrada:** teclado, controle, toque, rede ou outro dispositivo produz comandos que o jogo interpreta.
- **Atualização:** regras de gameplay e sistemas de mundo avançam o estado, por exemplo, alterando posição e velocidade.
- **Resolução:** colisões, restrições, eventos e transições de estado são processados.
- **Apresentação:** câmera, animação, shaders, áudio e interface comunicam ao jogador o estado atual.

_Cenário prático:_ num jogo de plataforma, o comando de salto altera a velocidade vertical; a simulação aplica gravidade e colisões com o chão; a animação escolhe uma pose; a câmera e a renderização mostram o movimento.

> [!NOTE]
> **Passo de Tempo (Timestep):** Se toda a simulação depender diretamente do intervalo variável entre quadros (`delta`), o comportamento pode mudar entre máquinas ou sob carga pesada. Um passo de simulação fixo (`fixed timestep`) melhora a previsibilidade e facilita física determinística e sincronização de rede, embora exija uma política de acumulação e interpolação de apresentação quando a renderização roda em frequência diferente.

---

## **1.2. Client-side e server-side**

- **Client-side:** código executado no dispositivo do jogador: rendering, input, áudio, interface e lógica local imediata. Em jogos single-player, a totalidade do jogo existe no cliente. Em multiplayer, o cliente continua responsável pela apresentação e por calcular respostas visuais locais (predição), enquanto o servidor mantém o estado autoritativo.
- **Server-side:** processamento executado em serviços remotos. Abrange networking, gestão de partidas, matchmaking, persistência e infraestrutura multiplayer. A divisão exata depende do gênero, da tolerância à latência e do grau de proteção necessário contra clientes modificados (_anti-cheat_).

| Responsabilidade                  | Cliente                                                           | Servidor                                                        |
| :-------------------------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Resposta imediata a controles** | Captura input e apresenta feedback rápido (predição local)        | Recebe comandos e valida relevância para o estado compartilhado |
| **Renderização e áudio**          | Executa toda a apresentação gráfica e sonora no dispositivo       | Não desenha nem renderiza a cena do jogador (modo headless)     |
| **Estado da partida**             | Mantém visão local prevista ou interpolada                        | Mantém e atualiza o estado oficial autoritativo                 |
| **Progresso persistente**         | Guarda preferências locais e cache volátil                        | Guarda dados críticos com garantia de integridade transacional  |
| **Confiança / Segurança**         | Ambiente hostil controlado pelo jogador; nunca valida recompensas | Valida regras que precisam valer igualmente para a comunidade   |

**Trade-off:** concentrar mais lógica no cliente simplifica a arquitetura e funciona com excelência em single-player; deslocar regras críticas para o servidor melhora a autoridade e previne trapaças, mas introduz latência de ida e volta (RTT), custo operacional e complexidade de concorrência.

---

## **1.3. Linguagens de programação**

A escolha da linguagem afeta desempenho, produtividade, tooling e facilidade de integração:

| Linguagem    | Uso típico                                            | Consideração prática                                                                                     |
| :----------- | :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **C / C++**  | Sistemas de engine de baixo nível ou gameplay crítico | Controle total sobre memória (RAII/ponteiros) com maior complexidade de depuração                        |
| **C#**       | Gameplay no ecossistema Unity e Godot (.NET)          | Excelente equilíbrio entre produtividade, tipagem forte e ecossistema maduro                             |
| **GDScript** | Scripting nativo no Godot Engine                      | Tipagem gradual opcional, altamente integrado à engine e sem necessidade de compilação externa           |
| **Rust**     | Engines modernas, sistemas concorrentes e backends    | Garantia de segurança de memória em tempo de compilação (_borrow checker_); curva de aprendizado inicial |
| **Python**   | Ferramentas de pipeline, scripts de automação e IA    | Alta produtividade para ferramentas de produção; raramente usado em loops críticos de 60 FPS             |

_Exemplo:_ um jogo feito no Godot pode usar GDScript para gameplay rápida e ferramentas externas em Python para converter dados; um projeto Unity pode usar C# para regras gerais e plugins nativos em C++ para processamento numérico denso.

> [!TIP]
> Não escolha uma linguagem apenas por benchmarks sintéticos. Priorize o ecossistema de exportação para a plataforma-alvo, a facilidade de depuração, o tempo de iteração e o domínio da equipe.

---

## **1.4. Game engines**

Uma game engine é um framework integrado que oferece sistemas centrais para criar e executar jogos: rendering, física, áudio, input, scripting e gestão de assets. Engines abstraem chamadas de plataforma e permitem que a equipe concentre esforços no design e conteúdo.

- **Engine pronta:** reduz drasticamente a barreira de entrada e disponibiliza pipelines e ferramentas integradas (editores visuais, profiling), porém vincula o projeto às decisões arquiteturais e limitações da tecnologia.
- **Engine própria (Custom Engine):** oferece controle e especialização completos, mas exige investimento contínuo em ferramentas, porte de plataformas, compatibilidade de drivers e shaders.

---

## **1.5. Engines citadas no roadmap**

- **Godot:** Engine de código aberto (MIT) e multiplataforma para jogos 2D e 3D. Apresenta sistema modular de árvore de nós e cenas, footprint extremamente leve (~100MB), usa GDScript nativo e oferece suporte a C# (.NET) e C++ (GDExtension).
- **Unity:** Engine multiplataforma consagrada para experiências 2D/3D, mobile, console e desktop. Utiliza C# e disponibiliza um dos maiores ecossistemas comerciais de pacotes e assets.
- **Unreal Engine:** Motor da Epic Games com ênfase em altíssima fidelidade gráfica (Lumen, Nanite), sistema de script visual Blueprint e arquitetura autoritativa nativa para jogos multiplayer.
- **Native:** Desenvolvimento direto sobre bibliotecas de baixo nível (SDL2/3, GLFW, Vulkan, DirectX 12, Metal), sem camada de engine comercial intermediária.

### **Fontes desta seção**

- **Client Side Development:** [gabrielgambetta.com](https://gabrielgambetta.com)
- **Programming Languages:** nós de linguagens do roadmap.sh.
- **Game Engine:** [Wikipedia - Game Engine](https://en.wikipedia.org/wiki/Game_engine) · Vídeo _“Choosing a Game Engine is Easy!”_.
- **Godot:** [godotengine.org](https://godotengine.org) · [docs.godotengine.org](https://docs.godotengine.org) · [github.com/godotengine](https://github.com/godotengine)
- **Unity 3D:** [unity.com](https://unity.com) · [docs.unity3d.com](https://docs.unity3d.com)
- **Unreal Engine:** [dev.epicgames.com](https://dev.epicgames.com)
- **Referências gerais:** [roadmap.sh](https://roadmap.sh) · [learn.microsoft.com](https://learn.microsoft.com) · [rustmeup.com](https://rustmeup.com)

# **2. Matemática para jogos**

A matemática sustenta transformações, movimento, física, câmera, rendering e consultas espaciais. Um vetor pode representar posição, velocidade, normal ou força; uma matriz pode compor transformações; a geometria descreve formas e relações espaciais. O objetivo inicial não é decorar fórmulas isoladas, mas reconhecer qual representação responde à pergunta do sistema.

---

## **2.1. Vetores: direção e magnitude**

Um vetor é uma lista ordenada de números com magnitude e direção. Em jogos 2D e 3D, vetores representam posições, velocidades, acelerações, normais e forças. Operações fundamentais:

- **Adição ($\vec{u} + \vec{v}$):** combina deslocamentos ou contribuições de movimento.
- **Subtração ($\vec{B} - \vec{A}$):** calcula a diferença entre posições; produz um vetor que aponta de $A$ em direção a $B$.
- **Multiplicação por escalar ($k \vec{v}$):** altera a magnitude sem mudar a direção (quando $k < 0$, inverte o sentido).
- **Normalização ($\hat{v} = \frac{\vec{v}}{\|\vec{v}\|}$):** preserva a direção ajustando o comprimento para $1$, essencial para direções de movimento e vetores normais.
- **Produto Escalar (Dot Product, $\vec{a} \cdot \vec{b} = \|\vec{a}\| \|\vec{b}\| \cos\theta$):**
  - $> 0$: vetores apontam no mesmo sentido geral (ângulo $< 90^\circ$).
  - $= 0$: vetores perfeitamente perpendiculares ($90^\circ$).
  - $< 0$: vetores apontam em sentidos opostos (ângulo $> 90^\circ$).
- **Produto Vetorial (Cross Product, $\vec{a} \times \vec{b}$):** em 3D, produz um vetor perpendicular a ambos, essencial para calcular normais de superfícies e vetores de base da câmera.

_Cenário prático:_ para fazer um inimigo verificar se o jogador está em seu campo de visão, subtrai-se a posição do inimigo da posição do jogador, normaliza-se o resultado e calcula-se o produto escalar com o vetor frontal (`forward`) do inimigo. Se o resultado for maior que o cosseno do meio-ângulo de visão, o jogador está à frente.

> [!CAUTION]
> **Erro comum:** misturar posição, direção e deslocamento como se fossem equivalentes. A diferença entre duas posições resulta em um deslocamento; somar uma direção unitária diretamente a uma posição sem multiplicar pelo delta de tempo causa inconsistências de escala.

---

## **2.2. Geometria e relações espaciais**

Geometria em jogos descreve formas, superfícies e relações espaciais. Pontos, linhas, planos, polígonos e malhas aparecem em colisões, física, geração procedural e rendering. O mesmo modelo geométrico pode ser representado com fidelidade alta para renderizar e com formas simplificadas para testar colisões.

- **Pontos e posições:** identificam coordenadas exatas no espaço afim.
- **Planos e normais:** descrevem superfícies e orientações via equação do plano $Ax + By + Cz + D = 0$. Permitem determinar de que lado de uma face um objeto se encontra ou como a luz incide.
- **Polígonos e malhas:** aproximam superfícies conectando vértices em faces triangulares.
- **Geometria computacional:** oferece operações como interseção, triangulação e envoltórias convexas (_convex hulls_).

Uma malha visual detalhada é computacionalmente proibitiva para detecção de colisão contínua. Colliders analíticos simples, convex hulls ou decomposições convexas fornecem aproximações ordens de magnitude mais rápidas.

---

## **2.3. Matrizes e transformação de coordenadas**

Uma matriz é uma disposição retangular de números usada para representar transformações lineares e afins. Em gráficos, matrizes transformam vértices entre espaços de coordenadas: **Espaço Local (Object) $\to$ Espaço de Mundo (World) $\to$ Espaço de Câmera (View) $\to$ Espaço de Projeção (Clip/Screen)**.

Uma matriz homogênea $4 \times 4$ combina escala, rotação, translação e projeção em uma sequência compacta de multiplicações:

| Operação       | Efeito comum                    | Pergunta útil                          |
| :------------- | :------------------------------ | :------------------------------------- |
| **Translação** | Desloca o objeto no espaço      | Onde ele fica no mundo?                |
| **Rotação**    | Altera a orientação angular     | Para que lado ele aponta?              |
| **Escala**     | Redimensiona os eixos           | Qual é o tamanho relativo?             |
| **Projeção**   | Converte a visão 3D para a tela | Como a profundidade aparece na imagem? |

_Exemplo:_ uma porta tem sua malha definida perto da origem local. Uma transformação de objeto posiciona a porta na sala; uma transformação de câmera converte o mundo para o ponto de vista do jogador; a projeção converte a cena para coordenadas de tela a serem rasterizadas.

> [!IMPORTANT]
> A ordem da multiplicação importa ($\mathbf{A} \cdot \mathbf{B} \neq \mathbf{B} \cdot \mathbf{A}$). Escalar e depois transladar não produz o mesmo resultado geométrico que transladar e depois escalar.

---

## **2.4. Orientação: ângulos de Euler e quaternions**

- **Ângulos de Euler:** representam orientação por rotações sucessivas em torno de eixos (Yaw, Pitch, Roll). São intuitivos para edição humana na interface, mas dependem da ordem dos eixos e sofrem de **gimbal lock** (perda de um grau de liberdade quando dois eixos se alinham).
- **Quaternions ($q = w + xi + yj + zk$):** representação de 4 dimensões para rotações 3D. Evitam gimbal lock, permitem interpolação esférica suave com **SLERP** e acumulam rotações sem perda de ortogonalidade.

| Representação                           | Vantagem                                   | Limite ou cuidado                            | Uso típico                                 |
| :-------------------------------------- | :----------------------------------------- | :------------------------------------------- | :----------------------------------------- |
| **Euler**                               | Fácil de ler e editar por eixos            | Ordem de rotação importa; sofre gimbal lock  | UI, inspectores e configurações manuais    |
| **Quaternion**                          | Interpolação suave (SLERP) sem gimbal lock | Pouco intuitivo para inspeção direta         | Rotação interna de nós, câmeras e física   |
| **Matriz $3 \times 3$ ou $4 \times 4$** | Composição direta com escala e translação  | Ocupa mais memória; requer reortogonalização | Shaders e pipelines de renderização na GPU |

_Exemplo:_ para girar uma câmera continuamente e interpolar uma transição suave entre duas orientações sem saltos indesejados, quaternions com SLERP são o padrão da indústria.

### **Fontes matemáticas consultadas**

- **Linear Algebra:** [en.wikipedia.org/wiki/Linear_algebra](https://en.wikipedia.org/wiki/Linear_algebra) · [youtube.com (3Blue1Brown)](https://youtube.com)
- **Vector:** [dev.to](https://dev.to) · [youtu.be](https://youtu.be)
- **Geometry:** [mathsisfun.com](https://mathsisfun.com) · [dev.to](https://dev.to)
- **Matrix:** [gameludere.com](https://gameludere.com) · [dev.to](https://dev.to)
- **Affine Space & Transformation:** [en.wikipedia.org/wiki/Affine_space](https://en.wikipedia.org/wiki/Affine_space) · [brilliant.org](https://brilliant.org) · [gamedevs.org](https://gamedevs.org)
- **Euler Angles & Quaternions:** [gameludere.com](https://gameludere.com) · [3dgep.com/understanding-quaternions](https://3dgep.com) · [docs.unity3d.com](https://docs.unity3d.com)
- **Curves & Splines:** [en.wikipedia.org](https://en.wikipedia.org) · [devmag.org.za](http://devmag.org.za) · [gamedev.net](https://gamedev.net)
- **Projections:** [mathworld.wolfram.com](https://mathworld.wolfram.com) · [gamedeveloper.com](https://gamedeveloper.com) · [medium.com](https://medium.com)

# **3. Física, movimento e colisões**

A física de jogos simula aspectos do comportamento mecânico do mundo, como dinâmica de corpos rígidos, detecção de colisões, restrições e efeitos de fluidos ou corpos deformáveis. A engine de física organiza as atualizações e abstrai parte da matemática mecânica para que posições e velocidades avancem ao longo do tempo. O objetivo de um jogo nem sempre é reproduzir a física do mundo com fidelidade científica absoluta: estabilidade numérica, controle responsivo e legibilidade para o gameplay têm prioridade.

---

## **3.1. Força, aceleração e velocidade**

Em uma simulação de corpo rígido, forças atuantes sobre um corpo são acumuladas a cada passo de simulação e integradas no tempo para calcular aceleração, velocidade e posição.

Pela segunda lei de Newton:
$$\vec{F}_{\text{resultante}} = m \cdot \vec{a} \implies \vec{a} = \frac{\vec{F}}{m}$$

- **Força ($\vec{F}$):** interação contínua que altera o momento linear (gravidade, empuxo, molas, atrito, ventos).
- **Aceleração ($\vec{a}$):** taxa de variação da velocidade no tempo ($\frac{d\vec{v}}{dt}$).
- **Velocidade ($\vec{v}$):** taxa de variação da posição no tempo ($\frac{d\vec{x}}{dt}$).
- **Impulso ($\vec{J} = \Delta \vec{p} = m \Delta \vec{v}$):** alteração quase instantânea de momento linear, comum na resposta de impactos e pancadas.

_Cenário prático:_ para um personagem que acelera ao pressionar uma direção no controle analógico, o jogo aplica aceleração orientada até atingir uma velocidade máxima; ao soltar o direcional, o atrito ou desaceleração linear reduz a velocidade gradualmente até zero.

> [!NOTE]
> Os métodos de integração numérica mais adotados em jogos são o **Euler Semi-Implícito (Symplectic Euler)** e o **Verlet**, preferidos em relação ao Euler Explícito por preservarem melhor a energia mecânica do sistema sem explosões de velocidade.

---

## **3.2. Atrito e restituição**

- **Atrito:** força resistiva tangencial ao plano de contato. O atrito estático impede o início do escorregamento; o cinético desacelera corpos em deslizamento.
- **Restituição ($e$):** coeficiente adimensional entre $0$ e $1$ que mede a elasticidade pós-impacto ($e = 1$ é colisão perfeitamente elástica com rebote total; $e = 0$ é perfeitamente inelástica).

| Propriedade           | Efeito percebido                       | Cuidado de design                                           |
| :-------------------- | :------------------------------------- | :---------------------------------------------------------- |
| **Atrito alto**       | Movimento cessa quase instantaneamente | Pode deixar controles pesados ou truncados                  |
| **Atrito baixo**      | Deslizamento prolongado                | Reduz a precisão em curvas e saltos de plataforma           |
| **Restituição alta**  | Impactos com rebotes intensos          | Pode gerar instabilidade numérica ou sensação "flutuante"   |
| **Restituição baixa** | Impactos completamente amortecidos     | Pode tornar os contatos visivelmente sem impacto ou energia |

---

## **3.3. Detecção de colisão: broad phase e narrow phase**

Para manter o orçamento de processamento em cenas com dezenas ou centenas de corpos rígidos, a detecção de colisão se divide em três etapas bem definidas:

1. **Broad Phase (Fase Ampla):** descarta rapidamente pares de corpos que estão distantes demais para colidir usando formas geométricas simples (AABB/Esferas) e estruturas espaciais, reduzindo o custo de $O(N^2)$ para $O(N \log N)$ ou próximo de $O(N)$.
2. **Narrow Phase (Fase Estreita):** executa testes geométricos analíticos complexos apenas nos pares candidatos sobreviventes da broad phase, determinando pontos de contato, penetração e vetores normais.
3. **Collision Response (Resposta à Colisão):** resolve restrições de penetração aplicando impulsos e atrito para separar os corpos sem artefatos visuais.

---

## **3.4. Volumes delimitadores e teorema do eixo separador**

Um volume delimitador (_bounding volume_) envolve um objeto em uma forma geométrica regular mais simples que a malha poligonal original, permitindo testes rápidos de rejeição:

| Estrutura                           | Ajuste à forma                | Custo de teste       | Quando é recomendada                                   |
| :---------------------------------- | :---------------------------- | :------------------- | :----------------------------------------------------- |
| **AABB (Axis-Aligned)**             | Alinhada aos eixos globais    | Baixíssimo           | Broad phase e objetos que não sofrem rotação livre     |
| **OBB (Oriented Bounding Box)**     | Rotacionada com o objeto      | Moderado             | Objetos alongados ou orientados no espaço              |
| **Bounding Sphere**                 | Esfera delimitadora           | Mínimo (raio + raio) | Objetos esféricos e verificação preliminar             |
| **Convex Hull**                     | Envoltória convexa dos pontos | Depende da geometria | Narrow phase de corpos rígidos complexos               |
| **BVH (Bounding Volume Hierarchy)** | Árvore hierárquica de caixas  | $O(\log N)$ na busca | Cenas densas, malhas complexas e ray casting acelerado |

- **Separating Axis Theorem (SAT):** dois poliedros convexos não se intersectam se existir ao menos um eixo onde suas projeções ortogonais não se sobreponham.
- **GJK (Gilbert-Johnson-Keerthi):** calcula a distância mínima entre duas formas convexas na diferença de Minkowski ($A \ominus B$). Se a origem do espaço estiver contida no simplex resultante, há colisão.
- **EPA (Expanding Polytope Algorithm):** opera em conjunto com o GJK para extrair o vetor exato e a profundidade de penetração quando uma colisão é confirmada.

---

## **3.5. Particionamento espacial e CCD**

- **Particionamento Espacial:** divide o mundo do jogo em regiões (Grids uniformes, Quadtrees em 2D, Octrees em 3D, BSP e BVHs dinâmicas - DBVT) para acelerar consultas de proximidade, frustum culling e consultas físicas.
- **Continuous Collision Detection (CCD):** em vez de verificar colisões apenas nas posições discretas nos instantes $t$ e $t + \Delta t$, o CCD testa o volume contínuo varrido pelo objeto durante o intervalo. Evita o **tunneling** (quando objetos muito rápidos ou projéteis atravessam paredes finas sem disparar colisão). Devido ao custo adicional, deve ser ativado seletivamente para projéteis e objetos velozes.

### **Fontes de física consultadas**

- **Game Physics:** [en.wikipedia.org/wiki/Game_physics](https://en.wikipedia.org/wiki/Game_physics) · [udemy.com](https://udemy.com)
- **Force & Acceleration:** [medium.com/game-physics](https://medium.com) · [earok.net](https://earok.net)
- **Friction & Restitution:** [medium.com](https://medium.com) · [youtu.be](https://youtu.be)
- **Collision Detection:** [developer.mozilla.org](https://developer.mozilla.org)
- **Algoritmos SAT e GJK:** fontes complementares na subseção 10.2.

# **4. IA de gameplay**

A IA de jogos abrange técnicas para produzir personagens e oponentes que respondem ao estado do mundo e às ações do jogador. O objetivo usual não é imitar perfeitamente a inteligência humana, mas criar comportamentos legíveis, reativos e interessantes, dentro do orçamento de processamento e do nível de desafio desejado.

O roadmap separa tomada de decisão e métodos como árvores de decisão, máquinas de estado, árvores de comportamento, lógica fuzzy, sistemas de Markov e goal-oriented behavior. A parte de jogos de tabuleiro inclui minimax, poda alfa-beta e MCTS; outra área, chamada decision learning, cobre classificadores, redes neurais e aprendizado por reforço. Essas abordagens não são intercambiáveis: algumas escolhem ações por regras ou busca, outras aprendem padrões a partir de dados ou experiência.

## **4.1. Tomada de decisão**

A tomada de decisão em IA de jogos governa como um NPC escolhe uma ação a partir do estado atual e do ambiente. A meta é produzir comportamento que pareça inteligente e responsivo sem ser previsível demais ou caro para calcular. Máquinas de estado, árvores de comportamento e sistemas de utilidade são estruturas comuns para organizar essa lógica.

- **Estado do mundo:** fornece dados relevantes, como distância do jogador, saúde, visibilidade e recursos.
- **Política de ação:** converte esse contexto numa escolha ou numa sequência de ações.
- **Feedback:** após agir, o NPC observa o resultado e atualiza seu comportamento.

_Cenário:_ um inimigo pode patrulhar quando não detecta o jogador, investigar um ruído quando suspeita de presença e entrar em combate quando confirma um alvo. A arquitetura organiza as condições e transições entre esses comportamentos.

## **4.2. Máquinas de estado**

Uma máquina de estado finita representa comportamento como um conjunto finito de estados e transições condicionais. Um personagem pode estar em “patrulhando”, “investigando”, “atacando” ou “recuando”; condições definem quando muda de um estado a outro. A abordagem é simples de inspecionar e adequada para conjuntos pequenos de modos claramente separados; muitos estados e transições podem torná-la difícil de manter.

## **4.3. Árvores de comportamento**

Uma behavior tree organiza decisões em uma hierarquia de nós composáveis. Nós internos, como sequências, seletores e decorators, controlam o fluxo; folhas executam ações ou verificam condições. Em comparação com uma máquina de estados muito grande, a árvore pode facilitar extensão e composição de comportamentos.

- **Sequence:** tenta as ações em ordem e falha se uma condição ou ação falhar.
- **Selector:** tenta alternativas até que uma delas tenha sucesso.
- **Decorator:** modifica a execução de um ramo, por exemplo, repetindo-o ou condicionando-o.
- **Leaf:** avalia uma condição ou executa uma ação concreta.

_Cenário:_ um seletor pode primeiro procurar um alvo visível; se não houver, tentar investigar o último ruído; se nenhuma suspeita existir, continuar a patrulha. Cada ramo pode ser desenvolvido e testado com relativa independência.

## **4.4. Lógica fuzzy e sistemas de Markov**

Lógica fuzzy permite trabalhar com graus de verdade em vez de somente verdadeiro/falso. Num NPC, uma variável como “agressividade” pode aumentar gradualmente conforme saúde, distância e vantagem tática, evitando alternâncias abruptas entre comportamentos binários. Funções de pertinência definem quão bem cada valor se encaixa em conceitos como baixo, médio ou alto; regras combinam essas avaliações para produzir uma decisão. O arquivo do nó contém um erro no rótulo da referência (`Fuzzy Login in Games`); o PDF linkado é preservado sem correção inferida.

_Ex.:_ em vez de “atacar se distância < 10”, a agressividade pode crescer à medida que a distância diminui, a saúde do inimigo aumenta e o jogador fica isolado. A saída é um grau usado para selecionar ou ponderar ações.

**Trade-off:** decisões graduais podem produzir transições mais naturais, mas a configuração das funções e regras exige inspeção e ajuste; comportamento emergente fica menos óbvio que uma lista simples de condições.

Um **sistema de Markov** representa estados e transições probabilísticas; em cada passo, a próxima transição é amostrada conforme pesos associados ao estado atual. Isso pode criar variedade em animações, diálogo e patrulhas. A dependência do estado atual torna o modelo compacto, mas só é adequada quando a informação histórica necessária já está resumida nesse estado.

## **4.5. Jogos de tabuleiro: minimax, alfa-beta e MCTS**

Minimax escolhe uma jogada supondo que o oponente também escolhe respostas fortes: alterna maximização do benefício próprio e minimização do benefício do adversário numa árvore de estados. A poda alfa-beta evita explorar ramos que não podem alterar a decisão já encontrada, tornando a busca mais eficiente sem mudar o resultado minimax quando os pressupostos são mantidos.

Monte Carlo Tree Search (MCTS) constrói uma árvore por simulações de partidas, usando resultados para orientar novas explorações. Ele equilibra exploração de alternativas pouco testadas com aproveitamento das opções já avaliadas e é útil em jogos com muitos movimentos possíveis. A qualidade depende do modelo, do orçamento de simulação e das condições de parada.

| Método    | Estratégia                               | Ponto forte                                                | Limite típico                                         |
| --------- | ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Minimax   | Explora respostas e contra-respostas     | Interpretação direta em jogos determinísticos de soma zero | Crescimento da árvore pode ser muito grande           |
| Alfa-beta | Poda ramos irrelevantes da busca minimax | Busca mais profunda sem alterar o valor minimax            | Depende de poda eficaz e ordenação útil de movimentos |
| MCTS      | Aprende valor aproximado por simulações  | Lida com grandes espaços de busca                          | Custo de rollout e qualidade de simulação importam    |

### **Fontes dos nós de IA consultados nesta edição**

- [Game AI, ID `Hpf_CPmLpCSP8Qo07Kq1X`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/game-ai%40Hpf_CPmLpCSP8Qo07Kq1X.md) e [Game AI, ID `Hpk8eOaOepERMmOvUgkxa`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/game-ai%40Hpk8eOaOepERMmOvUgkxa.md): os dois arquivos foram abertos e têm o mesmo texto e as mesmas referências; ainda não foi confirmado se são instâncias duplicadas no mapa ou nós com funções distintas.
- Ambos listam https://medium.com/@alidrsn/game-development-with-ai-strategy-tools-and-examples-7ae77257c062 e https://modl.ai/ai-game-development/.
- [Decision Making](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/decision-making%40Ky-95ipdgyPZGAIdqwMCk.md): decisão de ação do NPC por estado/ambiente; cita árvores de comportamento, máquinas de estado e sistemas de utilidade. Referência: https://www.cgspectrum.com/blog/game-design-decision-making-troy-dunniway
- [Decision Tree](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/decision-tree%40rwGivalwv2ozdSlVMSc4U.md): perguntas hierárquicas que direcionam ações do NPC; o próprio arquivo traz o rótulo duplicado `@@articleDecision Tree`. Referências publicadas: https://www.gamedeveloper.com/programming/behavior-trees-for-ai-how-they-work · https://www.youtube.com/watch?v=bmP4ppe_-cw
- [State Machine](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/state-machine%40aJa_2xkZuSjQ5bt6Kj5oe.md): FSM mantém um conjunto finito de estados e transições acionadas por condições; fonte: https://gamedev.net/tutorials/_/technical/game-programming/state-machines-in-games-r2982/
- [Behavior Tree](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/behavior-tree%40ztoW8fBY73Es624A_tjd7.md): estrutura hierárquica composável para comportamento de NPC, incluindo sequências, seletores, decorators e folhas; fontes: https://sterberino.github.io/open-behavior-trees-documentation/index.html · https://www.youtube.com/watch?v=hbHqv9ov8IM&list=PL4G2bSPE_8uklDwraUCMKHRk2ZiW29R6e&index=3&t=16s
- [Fuzzy Logic](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/fuzzy-logic%404ZCVUpYrCT14d_JULulLe.md): usa graus de verdade, funções de pertinência e regras para decisões graduais; URL: https://www.michelepirovano.com/pdf/fuzzy_ai_in_games.pdf. O rótulo de referência no arquivo aparece como “Fuzzy Login in Games”.
- [Markov System](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/markov-system%40c6j-30p84vk3MZEF1R2hN.md): transições probabilísticas condicionadas ao estado atual; fontes: https://towardsdatascience.com/modeling-games-with-markov-chains-c7b614731a7f · https://www.gamedeveloper.com/design/advanced-math-in-game-design-random-walks-and-markov-chains-in-action

Os destinos foram copiados dos arquivos correspondentes; não foram abertos para avaliar disponibilidade ou qualidade. Demais arquivos e URLs do ramo de IA ficam pendentes.

# **5. Gráficos e rendering**

Computer graphics é o campo de criação e manipulação de conteúdo visual por computador. Em jogos, inclui técnicas de rendering, shading, processamento geométrico e fundamentos matemáticos para converter cenas 3D em imagens. Entender esses conceitos ajuda a compreender o que a engine e a GPU fazem ao apresentar cada quadro.

## **5.1. Pipeline gráfico**

O pipeline gráfico transforma geometria, materiais, luzes e estado da câmera em pixels. Em termos gerais, vértices passam por transformações de espaço; primitivas são preparadas e projetadas; a rasterização determina quais pixels cada forma cobre; shaders calculam atributos visuais; testes de profundidade, blending e operações finais compõem a imagem.

A estrutura exata varia conforme a API, a engine e a técnica de rendering. O princípio útil é acompanhar como os dados deixam o espaço local do objeto, são posicionados no mundo e na câmera e acabam colorindo pixels na tela.

## **5.2. Rasterização, ray tracing e custo**

Rasterização projeta geometria 3D para a tela e calcula cores para os pixels cobertos. É o método predominante em gráficos em tempo real devido ao desempenho, complementado por técnicas que aproximam iluminação e reflexos. O nó de rasterização do roadmap descreve a projeção da geometria 3D para uma tela 2D, seguida do preenchimento dos pixels segundo cálculos de shading.

Ray tracing simula caminhos de luz ao lançar raios da câmera pela cena, calcular interseções com a geometria e acompanhar reflexos, refrações e sombras. Pode representar esses efeitos de maneira mais natural, mas tem custo computacional alto. Hardware moderno pode acelerar a técnica por APIs específicas, porém as restrições de desempenho continuam fazendo parte da decisão.

| Abordagem    | Como obtém a imagem                                 | Vantagem                                                      | Trade-off                                               |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Rasterização | Projeta triângulos e colore pixels cobertos         | Rápida e adequada a rendering em tempo real                   | Iluminação pode exigir aproximações e passes adicionais |
| Ray tracing  | Traça raios e calcula interseções e caminhos de luz | Reflexos e sombras podem seguir melhor o comportamento físico | Alto custo de cálculo e necessidade de otimização       |

## **5.3. Shaders, sampling e APIs gráficas**

Shaders são programas que calculam transformações e atributos visuais. Tipos diferentes atuam em estágios como vértices, geometria, pixels ou computação; podem calcular posições transformadas e a cor final de uma superfície.

Sampling converte sinais contínuos — por exemplo, uma textura ou distribuição de luz — em valores discretos. Quando o detalhe espacial excede a taxa de amostragem, surge aliasing. MSAA, supersampling e temporal anti-aliasing tentam reduzir esses artefatos. Importance sampling concentra amostras onde são mais valiosas em métodos Monte Carlo. A qualidade visual e o custo dependem da resolução, cobertura, shader e número de amostras.

A rendering equation descreve a luz que sai de um ponto de uma superfície como emissão mais luz incidente refletida em várias direções. É uma base teórica do PBR, mas sua solução exata é computacionalmente intratável; renderers usam aproximações e estratégias de importance sampling.

Uma graphics API permite que a aplicação envie comandos à GPU, gerencie recursos e controle partes do pipeline. APIs de baixo nível, como Vulkan, DirectX 12 e Metal, oferecem controle mais explícito sobre recursos e sincronização que APIs mais antigas, ao custo de mais responsabilidade para o desenvolvedor. A escolha também condiciona as plataformas atendidas pelo renderer.

- **HLSL e GLSL** aparecem no roadmap como linguagens para shaders.
- **DirectX, OpenGL, WebGL, OpenGL ES, Metal e Vulkan** aparecem como APIs gráficas ou famílias relacionadas.
- **SPIR-V** aparece como representação intermediária no ecossistema Vulkan.

**Trade-off:** abstrações de engine e APIs de alto nível aceleram o desenvolvimento; APIs de baixo nível oferecem controle, mas exigem lidar diretamente com sincronização, recursos e compatibilidade.

### **Fontes de gráficos e rendering consultadas**

- [Computer Graphics](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/computer-graphics%40lIb5MeDoqVj6HycveOgTS.md): https://open.umn.edu/opentextbooks/textbooks/420 · https://www.youtube.com/watch?v=C8YtdC8mxTU
- [Graphics API](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/graphics-api%40Kx7O7RLp7aPGtOvK8e314.md): https://docs.unity3d.com/2022.3/Documentation/ScriptReference/PlayerSettings.SetGraphicsAPIs.html
- [Rasterization](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/rasterization%40vYNj9nzu90e9xlrzHULnP.md): https://www.techspot.com/article/1888-how-to-3d-rendering-rasterization-ray-tracing/
- [Shader](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/shader%40qIrePusMuvcUva9LMDmDx.md): https://www.gamedesigning.org/learn/shaders/ · https://gamedevelopment.tutsplus.com/a-beginners-guide-to-coding-graphics-shaders--cms-23313t
- [Sampling](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/sampling%40rmtxybcavWV6A53R4ZWgc.md): https://cglearn.eu/pub/computer-graphics/textures-and-sampling
- [Rendering Equation](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/rendering-equation%40WVgozaQPFbYthZLWMbNUg.md): https://en.wikipedia.org/wiki/Rendering_equation · https://www.youtube.com/watch?v=wawf7Am6xy0
- [Computer Animation](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/computer-animation%401RdyzTI_TXqmct2bIbNh9.md): https://www.adobe.com/uk/creativecloud/animation/discover/computer-animation.html · https://unity.com/topics/what-is-computer-animation
- [Lighting and Shadow](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/lighting-and-shadow%40DDN3mn0LTueBhjRzXFcbU.md): https://www.techspot.com/article/1998-how-to-3d-rendering-lighting-shadows/ · https://3dskillup.com/effective-lighting-for-games/ · https://www.gridpaperstudio.com/post/introduction-to-lighting-in-3d-game-engines-a-beginner-s-guide
- [Advanced Rendering](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/advanced-rendering%40CDYszS1U4v95GozB_drbt.md): https://www.advances.realtimerendering.com/ · https://www.advances.realtimerendering.com/s2024/index.html

Os nós Rasterization, Shader, Sampling e Rendering Equation foram abertos nesta continuação; Computer Graphics, Graphics API, Computer Animation, Lighting and Shadow e Advanced Rendering já haviam sido consultados. Os links acima são os publicados nos nós, mas os destinos externos não foram auditados individualmente. As leituras de Graphics Pipeline e Ray Tracing expiraram; ainda faltam nós específicos de APIs, luzes, texturas e PBR.

## **5.4. Animação em tempo real**

Animação de computador reúne técnicas para produzir movimento em cenas 3D. Em jogos, os sistemas precisam responder ao gameplay e misturar clips suavemente.

- **Animação esquelética:** move uma hierarquia de ossos.
- **Blend shapes:** interpolam formas.
- **Animação procedural:** calcula movimento por regras.
- **Simulação física:** produz movimento a partir de forças e restrições.
- **Motion capture:** fornece movimento observado ao pipeline.

Máquinas de estado selecionam clips, como idle, corrida e ataque. Blend trees misturam movimentos conforme parâmetros contínuos, como velocidade e direção. Inverse kinematics calcula poses para alcançar posições-alvo, como apoiar uma mão numa parede ou ajustar os pés ao terreno. Clips autorados dão previsibilidade; procedimentos e física podem se adaptar a situações variadas, mas podem precisar de limites para evitar poses estranhas.

## **5.5. Cor, iluminação, sombras e visibilidade**

Cor é percebida em relação à iluminação, ao contraste, à adaptação visual e às cores próximas. Tone reproduction mapeia a luminância da cena para a faixa que a tela pode mostrar, alterando highlights, sombras e contraste global. Espaço de cor, exposição e tone mapping afetam a imagem final. Contraste e hierarquia visual ajudam a guiar a atenção; saturar todos os elementos importantes pode tornar a cena menos legível.

Sistemas de iluminação definem como fontes iluminam a cena e como objetos bloqueiam a luz:

- **Directional light:** aproxima uma fonte distante.
- **Point light:** emite a partir de uma posição em várias direções.
- **Spot light:** restringe a emissão a um cone.
- **Shadow mapping:** desenha a cena do ponto de vista da luz para estimar áreas ocultas.
- **Cascaded shadows:** divide o frustum em regiões para alocar resolução, pois sombras próximas à câmera tendem a precisar de mais detalhe.

Frustum culling elimina objetos fora da câmera; clipping recorta primitivas que cruzam planos; occlusion culling descarta objetos totalmente escondidos. Fog reduz contraste e profundidade aparente. Um teste de oclusão incorreto pode causar pop-in; seu custo deve ser comparado ao de desenhar os objetos.

## **5.6. Texturas, materiais e PBR**

Texture mapping associa uma imagem à superfície por coordenadas UV. Bump mapping altera a aparência das normais sem adicionar geometria; parallax mapping usa profundidade aparente para sugerir relevo. Essas técnicas acrescentam detalhe sem aumentar proporcionalmente a contagem de polígonos.

Physically Based Rendering (PBR) organiza a resposta dos materiais à luz em torno de conservação de energia, metallicity e microsurface scattering. Materiais metálicos refletem a luz de modo diferente de dielétricos; microfacetas aproximam rugosidade; translucency e transparency transmitem ou dispersam luz, mas podem exigir ordenação e blending mais caros. PBR favorece consistência sob várias iluminações, mas não produz realismo automaticamente: textura, luz, exposição e amostragem continuam importantes.

### **Cobertura desta seção**

O capítulo cobre conceitos gerais de animação, iluminação, visibilidade, texturas e PBR. Nem todos os arquivos de nós correspondentes foram abertos nesta edição; a lista acima não deve ser lida como confirmação de uma verificação individual desses subnós.

# **6. Multiplayer: sockets, transporte e mensagens**

A arquitetura server-side começa com a comunicação entre programas executados em máquinas diferentes. Socket programming usa APIs do sistema operacional para enviar e receber dados pela rede; ela oferece controle de baixo nível sobre conexões TCP e UDP e sustenta bibliotecas de networking de nível mais alto.

## **6.1. TCP e UDP**

TCP garante entrega confiável e ordenada, com retransmissão e controle de congestionamento; esses mecanismos podem introduzir atraso. UDP não inclui garantias de entrega ou ordenação, oferecendo uma base mais leve e de menor latência; a aplicação decide quais garantias precisa construir por cima. Jogos em tempo real costumam usar UDP para atualizações de estado e TCP — ou uma camada confiável sobre UDP — para mensagens de controle, mas a escolha depende do tráfego.

| Critério             | TCP                                                                 | UDP                                                 |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Entrega              | Confiável e ordenada                                                | Sem garantias incorporadas                          |
| Perda de pacote      | Retransmissão pode causar espera                                    | Aplicação decide se ignora, repete ou corrige       |
| Ordenação            | Mantida pelo protocolo                                              | Não garantida                                       |
| Uso possível em jogo | Login, controle e mensagens que precisam de entrega ordenada        | Estado frequente e mensagens sensíveis a latência   |
| Custo                | Mais mecanismos de transporte e possíveis atrasos por retransmissão | Aplicação assume mais responsabilidade de protocolo |

Não se deve concluir que UDP é sempre mais rápido em qualquer situação nem que todas as mensagens do jogo devem usar o mesmo transporte. A decisão parte da semântica de cada mensagem: uma posição antiga pode perder valor quando chega; um comando de inventário ou confirmação de sessão normalmente exige tratamento diferente.

## **6.2. Datagrama e estrutura de pacote**

Um datagrama é uma unidade autossuficiente transmitida por UDP e encaminhada sem uma conexão prévia. Como datagramas não garantem ordenação, aplicação e protocolo precisam decidir como detectar perdas, identificar sequência, lidar com dados desatualizados e recompor informações quando necessário.

Pacotes de jogo carregam mais do que valores: precisam indicar a finalidade da mensagem e como interpretar o conteúdo. Um formato pode incluir tipo de mensagem, sequência ou timestamp, identificadores de entidades e payload. Estruturas bem definidas tornam possível validar, versionar e decodificar dados com previsibilidade.

_Cenário:_ uma atualização de posição recebida fora de ordem pode ser descartada se houver outra mais recente. Uma mensagem de início de partida, por outro lado, precisa de controle de entrega e confirmação apropriados.

## **6.3. Serialização**

Serialização converte estruturas de dados em memória em uma sequência de bytes para transmitir pela rede ou armazenar; desserialização desfaz o processo. Formato escolhido afeta largura de banda, uso de CPU e compatibilidade entre linguagens.

- **JSON:** legível e conveniente para inspeção; pode ocupar mais bytes e exigir mais trabalho de parsing.
- **Protocol Buffers:** formato estruturado e compacto por schema, mas demanda gerar/manter definições e considerar compatibilidade de versões.
- **Formato binário próprio:** pode ser compacto e adaptado ao tráfego, mas cria obrigação de documentação, testes, versionamento e ferramentas de inspeção.

Não escolha serialização só por tamanho do arquivo. Compare custo total no dispositivo e servidor, compatibilidade, evolução do schema, debugging, robustez do parser e tamanho real das mensagens observadas.

### **Fontes de rede e serialização abertas nesta edição**

- [Socket Programming](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/socket-programming%40HvpuFTCknHPhnFkhmhRc4.md): https://dev.to/chakewitz/c-networking-raw-sockets-tcp-and-udp-programming-46oc · https://realpython.com/python-sockets/ · https://www.youtube.com/watch?v=ppcBIHv_ZPs
- [TCP vs UDP](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/tcp-vs-udp%40RfTcTUjaXyp49FnUf44MK.md): https://softwareengineering.stackexchange.com/questions/342254/tcp-or-udp-for-a-multiplayer-game · https://1024monkeys.wordpress.com/2014/04/01/game-servers-udp-vs-tcp/ · https://ithare.com/64-network-dos-and-donts-for-game-engines-part-iv-great-tcp-vs-udp-debate/
- [Packet vs Datagram](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/packet-vs-datagram%40JE3uZ5U6oe6dVzsmglTl2.md): https://en.wikipedia.org/wiki/Datagram · https://networkengineering.stackexchange.com/questions/50083/what-are-the-differences-in-the-contents-of-datagrams-frames-and-network-packe · https://stackoverflow.com/questions/14026858/tcp-ip-packets-and-datagrams
- [Serialization](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/serialization%40TS6dz61rUSxm-SqmK6JKe.md): https://www.gravitee.io/blog/protobuf-vs-json · https://www.gamedeveloper.com/programming/data-serialization-for-games · https://thatonegamedev.com/cpp/my-course-on-data-serialization-is-out/
- [Protobuf](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/protobuf%40w2zbab_6Gxw6AWS0N759U.md): https://protobuf.dev/getting-started/ · https://protobuf.dev/programming-guides/proto3/ · https://en.wikipedia.org/wiki/Protocol_Buffers

Essas são as referências literais contidas nesses cinco arquivos; os destinos externos ainda não foram avaliados um a um.

# **7. Concorrência, determinismo e arquitetura server-side**

O servidor de um jogo multiplayer deve lidar com várias conexões, mensagens e sessões sem corromper o estado compartilhado. Concorrência permite realizar trabalho sobreposto, mas sincronização mal projetada pode causar condições de corrida, bloqueios e estados difíceis de reproduzir. A arquitetura precisa combinar o modelo de concorrência, a propriedade do estado e o modo de comunicação entre componentes.

## **7.1. Actor Model**

Os atores são unidades independentes que se comunicam exclusivamente por mensagens; cada ator processa uma mensagem por vez, evitando estado mutável compartilhado. Isso torna mais fácil raciocinar sobre concorrência, mas não elimina a necessidade de tratar falhas, filas e consistência entre serviços.

- **Estado local:** cada ator controla seu próprio estado em vez de permitir que muitos fluxos o modifiquem diretamente.
- **Mensagens:** interações passam por comandos ou eventos explícitos.
- **Isolamento:** falhas e sincronização ficam delimitadas pelas responsabilidades dos atores, embora o sistema ainda precise tratar filas, falhas e consistência entre componentes.

_Cenário:_ uma sessão de partida pode ser representada por um ator que processa comandos dos participantes em sequência e publica atualizações, enquanto um serviço de matchmaking mantém outros dados e responsabilidades.

## **7.2. Determinismo e lockstep**

Determinismo significa que a mesma sequência de entradas produz a mesma sequência de saídas. Lógica determinística pode habilitar replay confiável, multiplayer lockstep e depuração de desyncs. Se dois peers executam a mesma simulação determinística com as mesmas entradas e regras, podem avançar sem transmitir todo o estado a cada instante.

Isso exige cuidado com fontes de variação, como ordem de processamento, números aleatórios, precisão numérica e dependências do ambiente. Mesmo diferenças pequenas podem se acumular e fazer estados divergirem. Determinismo é útil quando a arquitetura o exige; não é uma propriedade automática de qualquer simulação.

| Abordagem               | O que trafega principalmente          | Benefício                                   | Custo ou risco                                     |
| ----------------------- | ------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Estado autoritativo     | Snapshots ou atualizações do servidor | Servidor controla o resultado compartilhado | Mais tráfego e necessidade de reconciliar clientes |
| Lockstep determinístico | Sequência de comandos/inputs          | Pode reduzir transmissão repetida do estado | Exige simulação reproduzível e sensível a atraso   |
| Cliente com previsão    | Comandos locais e confirmações        | Feedback visual rápido                      | Correções quando previsão diverge do servidor      |

**Determinismo, autoridade e segurança são questões diferentes.** Uma simulação determinística pode facilitar repetição e sincronização sem, por si só, impedir que um cliente malicioso envie entradas falsas. A validação de comandos permanece uma responsabilidade do servidor quando resultados precisam ser confiáveis.

### **Fontes de actor e determinismo abertas nesta edição**

- [Actor Model](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/actor-model%40KUQEgHldZPOLwFoXqQ2vM.md): https://doc.akka.io/libraries/akka-core/current/typed/guide/actors-intro.html · https://www.theserverside.com/blog/Coffee-Talk-Java-News-Stories-and-Opinions/How-the-Actor-Model-works-by-example · https://en.wikipedia.org/wiki/Actor_model
- [Determinism](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/determinism%40zFx1jjt1hKgCpYHFTzbZZ.md): https://github.com/pietrobassi/deterministic-lockstep-demo · https://ruoyusun.com/2019/04/06/game-networking-3.html · https://gamedev.stackexchange.com/questions/101181/how-do-we-make-online-games-deterministic
- Os nós Asynchronous, Multithreading e Reactive Approach estão documentados na subseção 13.3.

# **8. Registro de cobertura e pendências**

Os dois roadmaps são extensos. O repositório contém arquivos por nó, inclusive duplicatas de slug com IDs diferentes; a listagem alfabética não representa a ordem de estudo. Esta seção registra o que foi escrito e o que ainda precisa de verificação de fonte.

## **8.1. Estado por domínio**

- **Client-side e linguagens:** Client Side Development, Programming Languages e arquivos de linguagens (incluindo C/C++, C#, GDScript, Rust e Python) foram localizados. As descrições individuais das linguagens ainda não foram todas abertas.
- **Engines:** Game Engine, Godot, Unity 3D e Unreal Engine foram consultados. Fontes publicadas estão no capítulo 1; destinos externos não auditados.
- **Matemática:** arquivos consultados: Linear Algebra, Vector, Geometry, Matrix, Affine Space, Affine Transformation, Euler Angle, Quaternion, Curve, Spline, Hermite, Bézier, Catmull–Rom, Projection, Perspective e Orthogonal. Game Mathematics, Linear Transformation, Orientation e Frustum ainda pendem de abertura.
- **Física e colisão:** arquivos consultados: Game Physics, Force, Acceleration, Friction, Collision Detection, Broad Phase, Narrow Phase, AABB, Bounding Volume, OBB, GJK, EPA, SAT, CCD, BVH e Convex Decomposition. Outros nós de dinâmica e particionamento ainda pendem.
- **Gráficos e animação:** Computer Graphics, Graphics API, Rasterization, Shader, Sampling, Rendering Equation, Computer Animation, Lighting and Shadow e Advanced Rendering consultados; Graphics Pipeline e Ray Tracing falharam por timeout. Restantes subnós de APIs, luz, texturas, PBR e ray tracing ainda pendem.
- **IA:** Game AI (dois IDs), Decision Making, Decision Tree, State Machine, Behavior Tree, Fuzzy Logic, Markov System e Minimax consultados. GOAP, Movement, Board Game, AB Pruning, MCTS e os nós de aprendizado ainda pendem.
- **Server Side:** Server Side Development, DNS, Socket Programming, TCP vs UDP, Packet Structure, Packet vs Datagram, Reliable Transmission, Flow Control, Security, TLS, checksum (dois IDs), congestion control (dois IDs), Asynchronous, Actor Model, Determinism, multithreading (dois IDs), reactive approach (dois IDs), Databases, Redis, Serialization, Protobuf, Message Queues, Docker e Cloud foram consultados. Outros nós de IP, confiabilidade, concorrência, APIs, provedores cloud, operação e segurança continuam pendentes.

**Precisão da cobertura:** capítulos 1–7 apresentam sínteses temáticas. Os nós consultados por ID aparecem nas listas de fontes dos capítulos de aprofundamento; estar mencionado no capítulo não significa que o Markdown individual foi aberto. As listas 15.1 e 15.2 são índices de nomes coletados e não comprovam, sozinhas, cobertura integral nem ordem do grafo.

## **8.2. Critério para considerar o guia completo**

- Cada nó visível tem capítulo ou subcapítulo correspondente, na sequência do mapa interativo.
- Cada Markdown está associado ao nó pelo slug e ID, incluindo arquivos com slug repetido.
- Cada referência conserva o rótulo e URL publicados, e cada destino recebe status de acesso e nota sobre seu conteúdo.
- O texto distingue resumos do roadmap, fontes externas confirmadas e explicação didática acrescentada.
- Branch/commit e data de coleta ficam registrados para permitir reprodução.

## **8.3. Estado desta edição**

**Estado desta edição:** guia expandido com mapeamento parcial, não integral. O inventário de arquivos não equivale a abrir cada Markdown ou confirmar posição, pai, filhos e conexões no mapa visual. Várias consultas ao GitHub expiraram; nós, arquivos e referências não lidos continuam pendentes. Os links de referência presentes são transcritos dos arquivos consultados, não avaliados um a um quanto a acesso e conteúdo.

## **8.4. Atualizações desta continuação**

- Reorganizado o capítulo 13 para seguir rede, checksums/congestionamento, concorrência, determinismo, dados e operação.
- Foram acrescentados IDs e URLs literais para mais nós de matemática, colisão, IA e server-side.
- Conferida a hierarquia dos títulos e removidos os títulos repetidos detectados nesta sessão.
- O documento final segue marcado como parcial até abrir cada nó e mapear conexões e referências.

# **9. Transformações, orientação, curvas e câmera**

Os fundamentos matemáticos da trilha se conectam em uma cadeia: pontos e vetores descrevem a cena; transformações posicionam objetos; orientação controla rotação; curvas definem trajetórias; projeção leva o mundo à tela.

## **9.1. Espaço afim e transformação afim**

Um espaço afim contém pontos e deslocamentos entre pontos, sem escolher uma origem absoluta por si só. Posição é um ponto; direção, velocidade e deslocamento são vetores. Transformações lineares giram, escalam ou cisalham vetores; uma transformação afim acrescenta translação e mapeia pontos entre sistemas de coordenadas.

Em jogos, transformações afins são representadas normalmente por matrizes homogêneas 4×4. Elas levam vértices de espaço local a mundo e depois à câmera. Pontos, direções e normais não são intercambiáveis: translação afeta pontos, não direções; normais sob escala não uniforme precisam de tratamento adequado. A ordem da composição importa: escalar e depois transladar não equivale em geral a transladar e depois escalar.

## **9.2. Orientação e ângulos de Euler**

Orientação descreve rotação em relação a um referencial. Ângulos de Euler são intuitivos para editar e ler, mas dependem da ordem dos eixos; certas configurações alinham eixos e produzem gimbal lock. Quaternions representam rotação 3D sem essa singularidade e permitem interpolação suave; a convenção de eixos e a orientação da engine continuam importantes.

Na prática, uma interface pode expor controles em graus enquanto a engine mantém internamente quaternion ou matriz. A escolha depende de edição, composição de rotações e interpolação requerida.

## **9.3. Curvas e splines**

Curvas descrevem trajetórias e contornos a partir de pontos de controle. Splines juntam segmentos e podem passar por pontos ou aproximá-los; diferem no controle de tangentes e continuidade.

| Curva       | Controle                                                   | Uso comum                                           | Cuidado                                                |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Bézier      | Pontos de controle moldam o segmento; passa pelos extremos | Trajetórias, UI, animação e formas                  | Alterar controles pode afetar boa parte da curva       |
| Hermite     | Pontos finais e tangentes                                  | Trajetórias com direção de entrada/saída controlada | Tangentes inadequadas causam overshoot                 |
| Catmull–Rom | Passa pelos pontos da sequência                            | Caminhos por waypoints                              | Espaçamento e parametrização afetam forma e velocidade |

Avaliar uma spline uniformemente pelo parâmetro não garante velocidade constante no espaço. Para isso, pode ser preciso parametrizar por comprimento de arco ou ajustar a progressão do parâmetro.

## **9.4. Projeção perspectiva, ortográfica e frustum**

Projeção transforma coordenadas 3D para espaço 2D de tela, descartando ou codificando profundidade. Perspectiva faz objetos distantes parecerem menores, produzindo um frustum e sensação de profundidade; projeção ortográfica não escala com a distância, mantendo objetos do mesmo tamanho aparente e usando volume de visão em forma de caixa. A ortográfica é útil em 2D, vistas isométricas, visualização técnica e shadow maps de luz direcional. O frustum é o volume visível da câmera; geometria fora dele pode ser descartada antes de rendering.

### **Fontes matemáticas abertas nesta edição**

- [Affine Space](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/affine-space%40r5TcXQsU9s4NlAQIPvZ3U.md): https://en.wikipedia.org/wiki/Affine_space · https://brilliant.org/wiki/affine-spaces/
- [Affine Transformation](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/affine-transformation%40SkCreb6g4i-OFtJWhRYqO.md): https://www.gamedevs.org/uploads/affine-transformations.pdf · https://code.tutsplus.com/understanding-affine-transformations-with-matrix-mathematics--active-10884t
- [Euler Angle](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/euler-angle%40L0J2kvveJNsmN9ueXhqKf.md): https://www.gameludere.com/2020/03/12/euler-angles-hamilton-quaternions-and-video-games/
- [Quaternion](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/quaternion%40zPs_LlDvkfxvvCrk5fXB2.md): https://www.3dgep.com/understanding-quaternions/ · https://docs.unity3d.com/ScriptReference/Quaternion.html · https://youtu.be/zjMuIxRvygQ?si=ANmFr5k8JMUzBCUC
- [Spline](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/spline%40nTiHZXRh2j3_FsBotmlGf.md): https://en.wikipedia.org/wiki/Spline_%28mathematics%29 · https://youtu.be/jvPPXbo87ds?si=JX_G-gS81tOwQwjf
- [Hermite](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/hermite%40m4AuHjEBnHS0wyATG-I1Z.md): https://en.wikipedia.org/wiki/Hermite_interpolation
- [Bézier](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/bezier%40DUEEm9sAaZqSI-W-PFZ8f.md): http://devmag.org.za/2011/04/05/bzier-curves-a-tutorial/ · https://www.youtube.com/watch?v=pnYccz1Ha34
- [Catmull–Rom](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/catmull-rom%40N9GoA3YvOaKwYjljj6NZv.md): https://gamedev.net/forums/topic/535895-catmull-rom-in-shmups/ · https://gamedev.stackexchange.com/questions/47354/catmull-rom-spline-constant-speed
- [Projection](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/projection%405qfoD77wU4ETI7rUSy4Nc.md): https://mathworld.wolfram.com/Projection.html
- [Perspective](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/perspective%40LEJymJ2EaAW5FM5LgKW38.md): https://www.gamedeveloper.com/design/making-the-most-out-of-the-first-person-perspectives
- [Orthogonal](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/orthogonal%40d6C1qFv-Tad3AtMBDLI6r.md): https://medium.com/retronator-magazine/game-developers-guide-to-graphical-projections-with-video-game-examples-part-1-introduction-aa3d051c137d

Os links acima são os publicados nos arquivos abertos; seus destinos não foram avaliados um a um.

# **10. Movimento, dinâmica e colisão em maior detalhe**

A física de jogos combina modelos matemáticos, integração numérica e escolhas de controle que servem ao gameplay. Motores como Bullet, PhysX, Havok e Box2D encapsulam parte da dinâmica e colisão; compreender os conceitos ajuda a escolher colliders e a depurar estabilidade.

## **10.1. Grandezas lineares e angulares**

A trilha inclui velocidade linear, velocidade angular, aceleração, massa, centro de massa e momento de inércia. Velocidade linear descreve mudança de posição; velocidade angular descreve mudança de orientação. Centro de massa resume a distribuição de massa; momento de inércia mede resistência à mudança de rotação e depende de massa e sua distribuição em torno do eixo.

Forças aplicadas longe do centro de massa podem criar torque. Juntas conectam corpos ou restringem graus de liberdade, como dobradiças, molas e articulações. Restrições muito rígidas ou mal condicionadas podem tornar a simulação instável. Conservação de energia descreve conversão entre energia cinética e potencial em um sistema ideal; uma simulação de jogo pode dissipar ou acrescentar energia para alcançar um controle desejado. Flutuabilidade é a força resultante de um fluido sobre um corpo imerso; uma aproximação estilizada costuma bastar para produzir movimento convincente na água.

## **10.2. Formas convexas, côncavas e algoritmos**

Uma forma convexa contém o segmento entre quaisquer dois pontos internos; formas côncavas têm recortes e tornam certos testes mais difíceis. Uma aproximação convexa ou decomposição em peças convexas pode simplificar colliders, com custo de precisão ou de mais pares de formas.

- **Convex hull:** menor envoltória convexa que contém os pontos de entrada, podendo preencher concavidades.
- **Convex decomposition:** divide uma forma côncava em peças convexas; mais peças aproximam melhor, mas custam mais.
- **SAT:** procura um eixo em que projeções das formas estejam separadas; esse eixo prova não interseção.
- **GJK:** testa interseção entre formas convexas usando a diferença de Minkowski e support mappings; se não há interseção, pode também fornecer distância entre formas.
- **EPA:** parte do simplex produzido por GJK e expande um poliedro até estimar a direção e profundidade da penetração; esses dados podem alimentar a resposta ao contato.

A sequência importa: GJK responde se duas formas convexas se intersectam; quando há sobreposição, EPA estima quanto e em que direção separá-las. Não são algoritmos gerais para quaisquer geometrias sem condições: a abordagem pressupõe formas convexas e support mappings apropriados.

## **10.3. Broad phase e particionamento espacial**

Broad phase reduz candidatos antes de testar geometrias detalhadas. AABB é barata e alinhada aos eixos, mas pode produzir falsos positivos quando o objeto gira; OBB acompanha melhor a orientação, com teste mais caro. Sort and Sweep ordena intervalos num eixo para encontrar sobreposições; BVH organiza bounding volumes em hierarquia; DBVT atualiza dinamicamente essa árvore quando objetos se movem.

Particionamento espacial divide a cena em regiões para acelerar consultas de colisão, ray casting e culling. Grades, árvores e hierarquias permitem descartar regiões inteiras. A escolha depende da distribuição e mobilidade dos objetos, não de uma estrutura universalmente superior.

## **10.4. CCD e tunneling**

Detecção discreta examina corpos em instantes sucessivos. Um objeto veloz pode atravessar uma parede fina entre esses instantes sem sobrepor-se a ela em nenhum deles: tunneling. Continuous Collision Detection (CCD) considera o trajeto durante o passo e busca impactos intermediários. Como custa mais, costuma ser habilitada seletivamente para projéteis e objetos rápidos.

### **Fontes de colisão e broad phase abertas nesta edição**

- [Collision Detection](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/collision-detection%40AdOfOJtLtNgDwuABb6orE.md): fase ampla elimina rapidamente pares impossíveis, fase estreita calcula geometria de contato, que alimenta a resposta; fonte: https://developer.mozilla.org/en-US/docs/Games/Tutorials/2D_Breakout_game_pure_JavaScript/Collision_detection
- [AABB](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/aabb%40aTeYGd4JlPr5txNPyBezn.md): https://gdbooks.gitbooks.io/3dcollisions/content/Chapter1/aabb.html
- [Bounding Volume](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/bounding-volume%40PLR_4yoRifoTzkOR4c7ym.md): o arquivo lista os títulos “Collision Detection in 3D Games” e “Visualizing Bounding Volume”, sem URLs expostas no conteúdo recuperado.
- [OBB](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/obb%407nGtvbxoEAheiF4IPMfPf.md): https://gamedev.stackexchange.com/questions/25397/obb-vs-obb-collision-detection · https://gamedev.stackexchange.com/questions/49041-oriented-bounding-box-how-to
- [Narrow Phase](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/narrow-phase%40SuemqQuiePab0Qpm2EGy9.md): https://rocketbrush.com/blog/game-development-process-guide
- **GJK (ID `lwd3Gz9bJEKCIwhXD6m-v`)** testa interseção entre formas convexas pela diferença de Minkowski; referências e explicação estão na subseção 10.2.
- **EPA (ID `vWLKYK2KUzV1fO-vQunzW`)** estima profundidade/direção de penetração a partir do simplex de GJK; referências e explicação estão na subseção 10.2.
- **SAT (ID `kSMz7mZ243qMKtT_YD3AD`)** testa eixos separadores em formas convexas; referências e explicação estão na subseção 10.2.
- **CCD (ID `1yK8TH4Pn7Ag8VQoug54i`)** testa o trajeto varrido contra tunneling; referência e explicação estão na subseção 10.2.
- **BVH (ID `FCc5xwb_G3VsDRXOcg3hV`)** permite podar subárvores que não cruzam o volume consultado; referência e explicação estão na subseção 10.2.
- **Convex Decomposition (ID `bgP9NpD0DJGqN4VCt65xP`)** divide formas côncavas em peças convexas; referência e explicação estão na subseção 10.2.

Os URLs são os que os arquivos publicados indicam; os destinos externos não foram validados um a um.

# **11. Animação, percepção visual, cor e iluminação**

A apresentação visual comunica profundidade, forma, movimento e estado. O pipeline transforma geometria em pixels; a percepção também depende de contraste, cor, movimento, câmera, iluminação e sombras.

## **11.1. Animação em tempo real**

Animação de computador reúne técnicas para produzir movimento em cenas 3D. Em jogos, sistemas precisam responder ao gameplay e misturar clips suavemente. Skeletal animation move hierarquias de ossos; blend shapes interpolam formas; animação procedural calcula movimento por regras; simulação física gera movimento a partir de forças e restrições. Motion capture fornece movimento observado ao pipeline.

Máquinas de estado selecionam clips, como idle, corrida e ataque. Blend trees misturam movimentos conforme parâmetros contínuos, como velocidade e direção. Inverse kinematics calcula poses para alcançar posições-alvo, como apoiar uma mão numa parede ou ajustar os pés ao terreno. Clips autorados dão previsibilidade; procedimentos e física se adaptam a situações variadas, mas podem precisar de limites para evitar poses estranhas.

## **11.2. Cor e tone reproduction**

Cor é percebida em relação à iluminação, contraste, adaptação e cores próximas. Tone reproduction mapeia luminância da cena para a faixa que a tela pode mostrar, alterando highlights, sombras e contraste global. Espaço de cor, exposição e tone mapping afetam a imagem final. Hierarquia visual e contraste ajudam a guiar a atenção; simplesmente saturar tudo que importa torna a cena menos legível.

## **11.3. Luzes, sombras e visibilidade**

Sistemas de iluminação definem como fontes iluminam a cena e como objetos bloqueiam luz. Directional aproxima uma fonte distante; point emite a partir de uma posição em várias direções; spot restringe emissão a um cone. Shadow mapping desenha a cena do ponto de vista da luz para estimar áreas ocultas. Cascaded shadows dividem o frustum em regiões para alocar resolução, pois sombras próximas à câmera tendem a precisar de mais detalhe. Stencil e ray-traced shadows são alternativas com diferentes custos e propriedades.

Frustum culling elimina objetos fora da câmera; clipping recorta primitivas que cruzam planos; occlusion culling descarta objetos totalmente escondidos. Fog reduz contraste e profundidade aparente. Um ocluder serve para bloquear visibilidade; culling incorreto causa pop-in. O custo do teste deve ser comparado ao de desenhar os objetos.

## **11.4. Texturas, materiais e PBR**

Texture mapping associa imagem à superfície por coordenadas UV. Bump mapping altera a aparência de normais sem geometria adicional; parallax mapping usa profundidade aparente para sugerir relevo. São maneiras de acrescentar detalhe sem aumentar proporcionalmente a contagem de polígonos.

Physically Based Rendering (PBR) organiza a resposta dos materiais à luz em torno de conservação de energia, metallicity e microsurface scattering. Materiais metálicos refletem a luz de modo diferente de dielétricos; microfacetas aproximam rugosidade; translucency e transparency transmitem ou dispersam luz, mas podem exigir ordenação e blending mais caros. PBR favorece consistência sob várias iluminações, mas não produz realismo automaticamente: textura, luz, exposição e amostragem ainda importam.

### **Fontes desta seção**

- [Computer Animation](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/computer-animation%401RdyzTI_TXqmct2bIbNh9.md): https://www.adobe.com/uk/creativecloud/animation/discover/computer-animation.html · https://unity.com/topics/what-is-computer-animation
- [Lighting and Shadow](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/lighting-and-shadow%40DDN3mn0LTueBhjRzXFcbU.md): https://www.techspot.com/article/1998-how-to-3d-rendering-lighting-shadows/ · https://3dskillup.com/effective-lighting-for-games/ · https://www.gridpaperstudio.com/post/introduction-to-lighting-in-3d-game-engines-a-beginner-s-guide
- [Advanced Rendering](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/advanced-rendering%40CDYszS1U4v95GozB_drbt.md): https://www.advances.realtimerendering.com/ · https://www.advances.realtimerendering.com/s2024/index.html
- A pasta lista ainda color, visual perception, tone reproduction, shadow maps, tipos de luz, visibilidade, APIs gráficas, shaders, ray tracing, PBR, transparência e microsurface scattering; vários arquivos individuais faltam conferir.

# **12. IA de personagens, busca e aprendizado**

Game AI no roadmap é usada para criar personagens e oponentes que atuam e reagem ao jogador. Isso não exige que todo NPC use aprendizado de máquina: grande parte da IA de gameplay é lógica explícita, navegação e controle de comportamento, escolhidos para produzir desafio legível e custo previsível.

## **12.1. Técnicas de decisão**

Decision trees fazem perguntas e escolhem ramos; máquinas de estado descrevem modos e transições, como patrulha, investigação e combate; behavior trees organizam condições e ações em nós composáveis; fuzzy logic permite decisão gradual em vez de limiares binários; Markov systems descrevem transições probabilísticas; goal-oriented behavior escolhe ações em busca de objetivos.

| Técnica       | Representação                 | Boa quando                    | Limite comum                                               |
| ------------- | ----------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Decision tree | Perguntas e ramos             | Regras pequenas e explicáveis | Cresce com combinações de condições                        |
| State machine | Estados e transições          | Modos discretos               | Combinações geram muitos estados                           |
| Behavior tree | Condições e ações em árvore   | Reuso e composição            | Prioridade e atualização podem ser difíceis de inspecionar |
| Goal-oriented | Objetivos, ações e efeitos    | Planejar sequências           | Exige modelo e custos coerentes                            |
| Fuzzy logic   | Graus de pertinência e regras | Sinais imprecisos             | Regras precisam de calibração                              |
| Markov system | Transições probabilísticas    | Variação com memória limitada | Contexto exige ampliar o estado                            |

## **12.2. Busca adversarial**

Minimax escolhe uma ação supondo que a partida seja de dois jogadores e soma zero e que o oponente responda otimamente: cada lado alterna maximizar seu resultado e minimizar o do adversário. O algoritmo pode ser combinado com poda alfa-beta. Os arquivos individuais de alfa-beta, MCTS e Board Game ainda não foram abertos nesta continuação; as definições abaixo são explicações didáticas gerais, não transcrição desses nós.

Minimax percorre uma árvore de estados até uma profundidade definida e escolhe a ação que maximiza o pior resultado possível para o jogador atual. A poda alfa-beta pode deixar de avaliar ramos incapazes de alterar a decisão encontrada, reduzindo o trabalho sem mudar o resultado minimax ideal. Monte Carlo Tree Search (MCTS) utiliza simulações para avaliar alternativas em árvores grandes; qualidade e custo dependem do modelo e do orçamento de busca.

| Método    | Estratégia                                    | Ponto forte                                                | Limite típico                                      |
| --------- | --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Minimax   | Explora respostas e contra-respostas          | Interpretação direta em jogos determinísticos de soma zero | Crescimento da árvore pode ser muito grande        |
| Alfa-beta | Poda ramos irrelevantes da busca minimax      | Busca mais profunda sem alterar o valor minimax            | Eficiência depende da ordenação de movimentos      |
| MCTS      | Usa simulações para estimar o valor das ações | Lida com grandes espaços de busca                          | Custo e qualidade dependem do número de simulações |

### **Fontes de Minimax**

- [Minimax](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/minimax%40oOjGqicW3eqRwWyIwJdBA.md): https://en.wikipedia.org/wiki/Minimax
- **Pendentes de abertura individual:** Board Game, AB Pruning e MCTS.

## **12.3. Decision learning**

A pasta inclui Decision Learning, Naive Bayes, Decision Tree Learning, Deep Learning, Artificial Neural Network e Reinforcements Learning. De modo geral, esses métodos aprendem relações ou políticas a partir de exemplos, dados ou recompensas; exigem objetivo claro, avaliação e custo de inferência compatível com o jogo.

- **Naive Bayes:** classificador probabilístico com hipótese simplificadora de independência condicional.
- **Decision tree learning:** aprende regras em árvore, potencialmente inspecionáveis.
- **Deep learning/ANN:** redes com camadas aprendem representações, exigindo dados e avaliação do comportamento.
- **Reinforcement learning:** agente aprende por interação e recompensa; estabilidade e desenho da recompensa são desafios.

Uma política com alto desempenho não garante experiência justa ou legível; é preciso avaliar como ela afeta o jogador.

### **Fontes e estado dos nós de IA**

- [Game AI, ID `Hpf_CPmLpCSP8Qo07Kq1X`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/game-ai%40Hpf_CPmLpCSP8Qo07Kq1X.md) e [Game AI, ID `Hpk8eOaOepERMmOvUgkxa`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/game-ai%40Hpk8eOaOepERMmOvUgkxa.md): ambos abertos; texto e referências iguais. Papel separado no mapa não confirmado. Referências: https://medium.com/@alidrsn/game-development-with-ai-strategy-tools-and-examples-7ae77257c062 · https://modl.ai/ai-game-development/.
- [Decision Making](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/decision-making%40Ky-95ipdgyPZGAIdqwMCk.md): https://www.cgspectrum.com/blog/game-design-decision-making-troy-dunniway
- [Decision Tree](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/decision-tree%40rwGivalwv2ozdSlVMSc4U.md): https://www.gamedeveloper.com/programming/behavior-trees-for-ai-how-they-work · https://www.youtube.com/watch?v=bmP4ppe_-cw
- [State Machine](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/state-machine%40aJa_2xkZuSjQ5bt6Kj5oe.md): https://gamedev.net/tutorials/_/technical/game-programming/state-machines-in-games-r2982/
- [Behavior Tree](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/behavior-tree%40ztoW8fBY73Es624A_tjd7.md): https://sterberino.github.io/open-behavior-trees-documentation/index.html · https://www.youtube.com/watch?v=hbHqv9ov8IM&list=PL4G2bSPE_8uklDwraUCMKHRk2ZiW29R6e&index=3&t=16s
- [Fuzzy Logic](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/fuzzy-logic%404ZCVUpYrCT14d_JULulLe.md): o título no arquivo aparece como “Fuzzy Login in Games”; URL publicada: https://www.michelepirovano.com/pdf/fuzzy_ai_in_games.pdf.
- [Markov System](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/markov-system%40c6j-30p84vk3MZEF1R2hN.md): https://towardsdatascience.com/modeling-games-with-markov-chains-c7b614731a7f · https://www.gamedeveloper.com/design/advanced-math-in-game-design-random-walks-and-markov-chains-in-action
- [Minimax](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/game-developer/content/minimax%40oOjGqicW3eqRwWyIwJdBA.md): https://en.wikipedia.org/wiki/Minimax. O arquivo indica jogos de dois jogadores e soma zero.
- **Pendentes de abertura individual:** Goal-Oriented Behavior, Movement, Board Game, AB Pruning, MCTS, Decision Learning, Naive Bayes, Decision Tree Learning, Deep Learning, Artificial Neural Network, Reinforcements Learning e Learning.

As referências acima são URLs publicadas nos arquivos abertos; os destinos externos não foram avaliados um a um.

# **13. Servidores de jogos: rede, concorrência e dados**

A trilha Server Side Game Developer cobre serviços em resposta a clientes, networking, gestão do estado da partida, matchmaking, persistência e infraestrutura para sessões multiplayer. O servidor valida regras compartilhadas, atualiza estado e persiste dados que precisam sobreviver à sessão.

## **13.1. Rede, sockets e transporte**

Endereçamento, transporte e framing de mensagens conectam clientes ao servidor. DNS resolve hostnames em endereços IP por meio de uma hierarquia distribuída de servidores de nomes. Socket programming usa APIs do sistema operacional para enviar bytes em TCP ou datagramas UDP. TCP oferece fluxo confiável e ordenado, mas não conserva limites de mensagens entre chamadas de envio; a aplicação precisa enquadrá-las. UDP preserva limites de datagrama, mas não oferece entrega, ordenação ou retransmissão. O protocolo decide se cada mensagem exige sequência, confirmação, repetição ou descarte por obsolescência.

Packet é termo genérico para unidade de dados de rede; datagram é a unidade sem conexão entregue pelo UDP. Uma estrutura de pacote organiza cabeçalho e payload; definir campos compactos e previsíveis reduz banda e facilita serialização/parsing. Mensagens de estado frequentes podem priorizar dados recentes, enquanto inventário e transações persistentes exigem confirmação, validação e idempotência.

- [Server Side Development](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/server-side-development%40rQArtuVKGVgLn_fw9yO3b.md): https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/First_steps/Introduction · https://www.coursera.org/learn/learning-server-side-programming-through-game-development · https://www.youtube.com/watch?v=HXquxWtE5vA
- [DNS](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/dns%40yNytLrQAMKBw4t73YRL3J.md): https://www.ibm.com/think/topics/dns-protocol · https://en.wikipedia.org/wiki/Domain_Name_System · https://www.freecodecamp.org/news/how-dns-works-the-internets-address-book/
- [Socket Programming](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/socket-programming%40HvpuFTCknHPhnFkhmhRc4.md): https://dev.to/chakewitz/c-networking-raw-sockets-tcp-and-udp-programming-46oc · https://realpython.com/python-sockets/ · https://www.youtube.com/watch?v=ppcBIHv_ZPs
- [TCP vs UDP](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/tcp-vs-udp%40RfTcTUjaXyp49FnUf44MK.md): https://softwareengineering.stackexchange.com/questions/342254/tcp-or-udp-for-a-multiplayer-game · https://1024monkeys.wordpress.com/2014/04/01/game-servers-udp-vs-tcp/ · https://ithare.com/64-network-dos-and-donts-for-game-engines-part-iv-great-tcp-vs-udp-debate/
- [Packet Structure](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/packet-structure%40CCxVnrGDKa1EROXgF_OAm.md): https://support.huawei.com/enterprise/en/doc/EDOC1100174721/23023485/udp-packet-format · https://www.imperva.com/learn/ddos/udp-user-datagram-protocol/ · https://datatracker.ietf.org/doc/html/rfc768
- [Packet vs Datagram](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/packet-vs-datagram%40JE3uZ5U6oe6dVzsmglTl2.md): https://en.wikipedia.org/wiki/Datagram · https://networkengineering.stackexchange.com/questions/50083/what-are-the-differences-in-the-contents-of-datagrams-frames-and-network-packe · https://stackoverflow.com/questions/14026858/tcp-ip-packets-and-datagrams

## **13.2. Integridade, confiabilidade e controle de fluxo/congestionamento**

Checksums detectam corrupção acidental; não autenticam o remetente. Os dois nós de checksum cobrem casos diferentes: TCP inclui cabeçalho, payload e pseudo-header com endereços IP; UDP tem seu próprio campo de checksum.

- **Checksum TCP (ID `XxBl-zO7CF6DpOZ2bMDxJ`):** [arquivo](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/checksum%40XxBl-zO7CF6DpOZ2bMDxJ.md) · https://datatracker.ietf.org/doc/html/rfc1071 · https://en.wikipedia.org/wiki/Internet_checksum · https://en.wikipedia.org/wiki/Transmission_Control_Protocol
- **Checksum UDP (ID `tBOvBpDi3SOKZjAmkxdM0`):** [arquivo](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/checksum%40tBOvBpDi3SOKZjAmkxdM0.md) · https://en.wikipedia.org/wiki/User_Datagram_Protocol · https://www.slashroot.in/how-is-tcp-and-udp-checksum-calculated · https://www.securitynik.com/2015/08/calculating-udp-checksum-with-taste-of.html

Transmissão confiável em TCP usa números de sequência, ACKs e timeouts de retransmissão. O emissor mantém dados não confirmados num buffer e reenvia quando o ACK não chega; ARQ e sliding window são conceitos relacionados. [Reliable Transmission](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/reliable-transmission%40X2KHWgQZDHSVDsTRMUwSj.md): https://datatracker.ietf.org/doc/html/rfc3366 · https://book.systemsapproach.org/direct/reliable.html · https://datatracker.ietf.org/doc/html/rfc793 · https://en.wikipedia.org/wiki/Automatic_repeat_request · https://en.wikipedia.org/wiki/Sliding_window_protocol.

Flow control protege o receptor: ele anuncia o espaço de buffer disponível e o emissor limita os dados sem ACK à janela anunciada. Isso difere de congestion control, que protege a rede. [Flow Control](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/flow-control%40lDVD-3i64Mk7-KPJrXmFH.md): https://datatracker.ietf.org/doc/html/rfc5681 · https://www.baeldung.com/cs/tcp-flow-control-vs-congestion-control · https://www.sanfoundry.com/computer-network-tcp-flow-control/.

Controle de congestionamento regula a taxa de envio para não sobrecarregar enlaces e roteadores. TCP ajusta sua janela; aplicativos sobre UDP devem responder a perda, RTT e capacidade.

- **Congestion Control, ID `1GML0Jsfdb1Fn-0PNryiQ`:** [arquivo](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/congestion-control%401GML0Jsfdb1Fn-0PNryiQ.md) · https://www.rfc-editor.org/rfc/rfc8085.html · https://www.usenix.org/conference/2002-usenix-annual-technical-conference/congestion-control-linux-tcp · https://en.wikipedia.org/wiki/TCP_congestion_control · https://synchronet.net/congestion-control-in-tcp/
- **Congestion Control, ID `jsNsyrGzegVnjIF2l52vI`:** [arquivo](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/congestion-control%40jsNsyrGzegVnjIF2l52vI.md) · https://datatracker.ietf.org/doc/html/rfc2581 · https://networkengineering.stackexchange.com/questions/79588/how-is-congestion-avoided-when-using-udp · https://en.wikipedia.org/wiki/Congestion_control

## **13.3. Concorrência e I/O**

Programação assíncrona inicia uma operação e executa outro trabalho enquanto aguarda. Async I/O evita bloquear threads durante espera de rede ou disco, mas não cria paralelismo de CPU automaticamente. Multithreading executa fluxos simultâneos e exige coordenação do estado compartilhado. Mutex, semaphore, condition variable, barrier, spinlock e thread-local storage são mecanismos de sincronização; futures/promises, coroutines, fibers e tasks estruturam trabalho suspensível. Reactor, proactor, epoll, kqueue, IOCP, io_uring e registered I/O aparecem como mecanismos na árvore.

| Modelo                    | Benefício                                       | Cuidado                                                   |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Thread por conexão/tarefa | Fluxo direto de entender                        | Muitas conexões consomem memória e escalonamento          |
| Async/reactor             | Muitas esperas sem thread bloqueada por conexão | Cancelamento, erro e backpressure precisam ser explícitos |
| Proactor/completion       | Continua quando I/O termina                     | APIs variam por plataforma                                |
| Tasks/coroutines/fibers   | Unidades leves de trabalho                      | Filas precisam de limites e estado exige proteção         |
| Actor Model               | Isola estado e comunica por mensagens           | Filas, falhas e ordem continuam importantes               |

Os dois nós `Multithreading` têm IDs distintos e ênfases ligeiramente diferentes: `3QSLUMKD0G08N3MIb1cG7` descreve o uso de threads para paralelizar I/O, lógica, física e banco de dados; `_jd91rrAXGbJI9RhXlSx8` compara modelos reativo, baseado em tarefas e actor quanto a throughput, latência e complexidade. Ambos tratam threads concorrentes como meio de organizar trabalho, não como garantia automática de desempenho.

### **Referências dos nós de concorrência**

- [Multithreading, ID `3QSLUMKD0G08N3MIb1cG7`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/multithreading%403QSLUMKD0G08N3MIb1cG7.md): https://docs.oracle.com/javase/tutorial/essential/concurrency/index.html · https://www.educative.io/blog/modern-multithreading-and-concurrency-in-cpp · https://gamedev.stackexchange.com/questions/181838/multithreaded-design-for-a-game-server
- [Multithreading, ID `_jd91rrAXGbJI9RhXlSx8`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/multithreading%40_jd91rrAXGbJI9RhXlSx8.md): https://erikmcclure.com/blog/multithreading-problems-in-game-design/ · https://www.reddit.com/r/gamedev/comments/44fux4/multi_threading_in_game_development/ · https://spirited.io/multi-threaded-game-server-design/
- [Reactive Approach, ID `LVwGXmZhMewGQy61qwNyu`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/reactive-approach%40LVwGXmZhMewGQy61qwNyu.md): https://reactivex.io/intro.html · https://www.reactivemanifesto.org/ · https://retool.com/blog/event-driven-architecture-and-reactive-programming
- [Reactive Approach, ID `Vl-WW0LThrQTOO_tFl51B`](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/reactive-approach%40Vl-WW0LThrQTOO_tFl51B.md): o arquivo lista “Reactive Programming in Unity Game Development - InnoGames”, “Building a Reactive RESTful Web Service - Spring” e “Reactive Extensions - Wikipedia”; URLs literais não estavam expostas no conteúdo recuperado.
- [Asynchronous](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/asynchronous%40ThBxS9xIMt9OrXfnto3rW.md): https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Async_JS · https://www.velotio.com/engineering-blog/asynchronous-programming-python-an-introduction · https://www.wholetomato.com/blog/cpp-coroutines-async-development/
- [Actor Model](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/actor-model%40KUQEgHldZPOLwFoXqQ2vM.md): https://doc.akka.io/libraries/akka-core/current/typed/guide/actors-intro.html · https://www.theserverside.com/blog/Coffee-Talk-Java-News-Stories-and-Opinions/How-the-Actor-Model-works-by-example · https://en.wikipedia.org/wiki/Actor_model

## **13.4. Determinismo e sincronização**

Determinismo em um servidor reativo significa que a mesma sequência de entradas sempre produz a mesma sequência de saídas. Isso permite replay confiável, lockstep multiplayer e depuração mais fácil de desyncs.

- [Determinism](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/determinism%40zFx1jjt1hKgCpYHFTzbZZ.md): https://github.com/pietrobassi/deterministic-lockstep-demo · https://ruoyusun.com/2019/04/06/game-networking-3.html · https://gamedev.stackexchange.com/questions/101181/how-do-we-make-online-games-deterministic

## **13.5. Banco de dados, cache e serialização**

Servidores de jogos usam bancos para persistir dados de jogadores, estado de jogo, leaderboards, inventário e histórico de partidas. Modelos relacionais, NoSQL e key-value atendem padrões de acesso e exigências de consistência diferentes.

- **Relacionais (PostgreSQL, MySQL, MS SQL):** transações e relações ajudam em atualizações consistentes; schema, índices e consultas precisam ser planejados.
- **Documentos (MongoDB, Couchbase):** podem agrupar dados de jogador; desenho e evolução do schema importam.
- **Wide-column/distribuídos (Cassandra):** adequados a padrões específicos de distribuição e consulta.
- **Key-value/cache (Redis, Memcached):** aceleram dados temporários ou derivados; expiração, invalidação e fonte durável precisam ser definidas.
- **ORM/DAL:** abstraem acesso, mas não eliminam a necessidade de entender transações, índices e consultas.

O nó [Databases](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/databases%40FLFaGZDg2MSG6_YHnWETM.md) enfatiza dados de jogador, estado, leaderboards, inventário e histórico, escolhendo bancos por padrão de acesso e consistência. Fontes publicadas: https://generalistprogrammer.com/tutorials/game-database-architecture-complete-backend-guide-2025 · https://gsb.supercraft.host/blog/player-data-schema-design-nosql-vs-sql/ · https://jahej.com/alt/2011_08_08_from-the-mmo-trenches-using-postgresql-for-the-game-database.

Redis é um store key-value em memória que oferece strings, hashes, lists, sets e sorted sets. O nó cita baixa latência e usos como cache de sessão, leaderboards (sorted sets), pub/sub e rate limiting; isso não o torna automaticamente fonte durável. [Redis](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/redis%407YNaELVcoV7DV1Fa06USi.md): https://redis.io/docs/latest/develop/get-started/data-store/ · https://www.ibm.com/think/topics/redis · https://severalnines.com/blog/introduction-redis-what-it-what-are-use-cases-etc/. Sharding divide mundo ou população de jogadores em partições independentes em servidores/threads separados, permitindo escala horizontal com menor comunicação entre shards. [Sharding](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/sharding%403use5vuLBJTk40wOg9S-X.md): https://www.pubnub.com/guides/sharding/ · https://www.mongodb.com/docs/manual/core/sharded-cluster-components/ · https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding.

- **Serialização:** converte estruturas em memória a bytes para rede/arquivo; desserialização reconstitui os dados. JSON é legível para inspeção; Protocol Buffers usa schemas `.proto` e gera serializadores binários em várias linguagens. A escolha afeta banda, CPU, compatibilidade e debugging.

[Serialization](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/serialization%40TS6dz61rUSxm-SqmK6JKe.md) lista https://www.gravitee.io/blog/protobuf-vs-json · https://www.gamedeveloper.com/programming/data-serialization-for-games · https://thatonegamedev.com/cpp/my-course-on-data-serialization-is-out/. [Protobuf](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/protobuf%40w2zbab_6Gxw6AWS0N759U.md) aponta https://protobuf.dev/getting-started/ · https://protobuf.dev/programming-guides/proto3/ · https://en.wikipedia.org/wiki/Protocol_Buffers.

## **13.6. Filas, APIs, cloud, operação e segurança**

Filas de mensagens são middleware para comunicação assíncrona por produtores e consumidores. Em backend de jogos, podem desacoplar serviços, suavizar picos de tráfego e entregar eventos como resultados de partida ou confirmações de compra. Não substituem o fluxo sensível a latência de cada atualização de gameplay. [Message Queues](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/message-queues%40cw7WdFfL5HpeZ_n8wYk2t.md): https://aws.amazon.com/compare/the-difference-between-rabbitmq-and-kafka/ · https://www.systemdesignhandbook.com/guides/message-queue-system-design/ · https://www.ibm.com/think/topics/message-queue.

REST organiza operações em recursos HTTP; RPC expressa chamadas remotas; gRPC usa contratos e serialização estruturada. Uma arquitetura pode separar gameplay em tempo real de serviços de conta, lobby, matchmaking, inventário e analytics. A árvore também lista serverless, dependency injection, design patterns e ferramentas como Akka, Erlang, Go, Java, C/C++, JavaScript e Python; isso não forma um pacote obrigatório.

[Docker](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/docker%40zW_7VLeEHQp8fp_f5N__0.md) descreve Dockerfile, imagens e containers em hosts compatíveis; fontes: https://www.docker.com/101-tutorial/ · https://github.com/docker/getting-started · https://docker-curriculum.com/. Kubernetes orquestra containers: automatiza implantação, escala e gestão; o nó relaciona isso a frotas de pods de servidores de jogo, scale-on-demand, rolling updates e recuperação de falhas. [Kubernetes](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/kubernetes%40lUBUUoETjfADmM4OPtwwX.md): https://kubernetes.io/docs/tutorials/kubernetes-basics/ · https://kubernetes.io/docs/setup/ · https://kubernetes.io/docs/tutorials/.

O nó [Security](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/security%40qkO0s9zR0sAnjTRWcrLQY.md) aborda spoofing de IP, ataques de fragmentação, manipulação de roteamento e IPsec; a árvore também lista hijacking, cipher, TLS, vulnerabilities e denial of service. Defesa em profundidade combina validação autoritativa, autenticação, proteção do transporte, limites de tamanho/frequência, autorização e monitoramento. Checksum detecta corrupção acidental, não autentica mensagem. Fontes do nó: https://aws.amazon.com/blogs/gametech/protect-multiplayer-game-servers-from-ddos-attacks-using-amazon-gamelift-2/ · https://iceline-hosting.com/blog/securing-your-game-server-best-practicies · https://www.corero.com/how-ddos-attacks-disrupt-gaming/. O nó [TLS](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/tls%40FX8ASd-QzTUFDHzBB93WK.md) descreve autenticação, integridade e criptografia sobre TCP; fontes: https://auth0.com/blog/the-tls-handshake-explained/ · https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security · https://www.codecademy.com/article/transport-layer-security.

### **Fontes de server-side consultadas nesta edição**

- [DNS](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/dns%40yNytLrQAMKBw4t73YRL3J.md): https://www.ibm.com/think/topics/dns-protocol · https://en.wikipedia.org/wiki/Domain_Name_System · https://www.freecodecamp.org/news/how-dns-works-the-internets-address-book/
- [Packet Structure](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/packet-structure%40CCxVnrGDKa1EROXgF_OAm.md): https://support.huawei.com/enterprise/en/doc/EDOC1100174721/23023485/udp-packet-format · https://www.imperva.com/learn/ddos/udp-user-datagram-protocol/ · https://datatracker.ietf.org/doc/html/rfc768
- [Reliable Transmission](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/reliable-transmission%40X2KHWgQZDHSVDsTRMUwSj.md): https://datatracker.ietf.org/doc/html/rfc3366 · https://book.systemsapproach.org/direct/reliable.html · https://datatracker.ietf.org/doc/html/rfc793 · https://en.wikipedia.org/wiki/Automatic_repeat_request · https://en.wikipedia.org/wiki/Sliding_window_protocol
- [Flow Control](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/flow-control%40lDVD-3i64Mk7-KPJrXmFH.md): https://datatracker.ietf.org/doc/html/rfc5681 · https://www.baeldung.com/cs/tcp-flow-control-vs-congestion-control · https://www.sanfoundry.com/computer-network-tcp-flow-control/
- [Databases](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/databases%40FLFaGZDg2MSG6_YHnWETM.md): https://generalistprogrammer.com/tutorials/game-database-architecture-complete-backend-guide-2025 · https://gsb.supercraft.host/blog/player-data-schema-design-nosql-vs-sql/ · https://jahej.com/alt/2011_08_08_from-the-mmo-trenches-using-postgresql-for-the-game-database.html
- [PostgreSQL](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/postgresql%40dAiEwN7phwMyaitvM5kRl.md): https://www.postgresql.org/docs/current/tutorial.html · https://neon.com/postgresql/tutorial · https://www.devart.com/blog/postgresql-tutorial.html
- [MongoDB](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/mongodb%40HYxtPW401-J6aYcTuiGnx.md): https://www.mongodb.com/docs/manual/tutorial/getting-started/ · https://www.mongodb.com/resources/products/fundamentals/basics · https://www.w3schools.com/mongodb/mongodb_get_started.php
- [Redis](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/redis%407YNaELVcoV7DV1Fa06USi.md): https://redis.io/docs/latest/develop/get-started/data-store/ · https://www.ibm.com/think/topics/redis · https://severalnines.com/blog/introduction-redis-what-it-what-are-use-cases-etc/
- [Sharding](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/sharding%403use5vuLBJTk40wOg9S-X.md): https://www.pubnub.com/guides/sharding/ · https://www.mongodb.com/docs/manual/core/sharded-cluster-components/ · https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
- [Message Queues](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/message-queues%40cw7WdFfL5HpeZ_n8wYk2t.md): https://aws.amazon.com/compare/the-difference-between-rabbitmq-and-kafka/ · https://www.systemdesignhandbook.com/guides/message-queue-system-design/ · https://www.ibm.com/think/topics/message-queue
- [Kubernetes](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/kubernetes%40lUBUUoETjfADmM4OPtwwX.md): https://kubernetes.io/docs/tutorials/kubernetes-basics/ · https://kubernetes.io/docs/setup/ · https://kubernetes.io/docs/tutorials/
- [TLS](https://github.com/nilbuild/developer-roadmap/blob/master/roadmaps/server-side-game-developer/content/tls%40FX8ASd-QzTUFDHzBB93WK.md): https://auth0.com/blog/the-tls-handshake-explained/ · https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security · https://www.codecademy.com/article/transport-layer-security
- Security, Docker, Cloud, Actor Model, Determinism, Asynchronous, TCP/UDP, sockets, serialization e Protobuf: URLs já registradas nas subseções acima.

As URLs desta seção vieram dos próprios Markdown; não foram abertas ou auditadas individualmente.

# **14. Projetos para consolidar o aprendizado**

1. **Protótipo 2D:** movimento com aceleração, colisão, câmera e estado simples; teste passo fixo e resposta a contato.
2. **Cena 3D de laboratório:** transformações, projeções, iluminação e materiais; compare custo e resultado visual.
3. **NPC:** patrulha, investigação, perseguição e combate por máquina de estado ou behavior tree.
4. **Jogo de tabuleiro:** implemente minimax e alfa-beta; compare estados explorados com diferentes ordenações.
5. **Servidor mínimo:** dois clientes enviam comandos a servidor autoritativo que valida, atualiza estado e publica snapshots.
6. **Persistência:** salve perfil e resultado; implemente idempotência para evitar recompensas duplicadas após retry.
7. **Teste de falhas:** introduza latência, perda, desconexões e aumento de jogadores; meça CPU, banda, filas e recuperação.
8. **Entrega reproduzível:** empacote o serviço, configure health checks e logs, documente atualização e rollback.

# **15. Inventário dos Roteiros e Cobertura**

O README do repositório afirma que cada arquivo `roadmaps/<slug>/content/<topic-slug>@<node-id>.md` representa um tópico e que o ID conecta conteúdo ao nó; mudanças mescladas são sincronizadas com o site. A pasta é alfabética, não uma sequência de estudo.

### **15.1. Game Developer: grupos encontrados**

- **Cliente, linguagem e engine:** Client Side Development; Programming Languages; C/C++; C#; GDScript; Rust; Python; Game Engine; Godot; Unreal Engine; Native; Unity 3D.
- **Matemática:** Game Mathematics; Linear Algebra; Vector; Matrix; Geometry; Linear Transformation; Affine Space; Affine Transformation; Orientation; Quaternion; Euler Angle; Curve; Spline; Hermite; Bezier; Catmull–Rom; Projection; Perspective; Orthogonal.
- **Física:** Game Physics; Dynamics; Center of Mass; Moment of Inertia; Acceleration; Joints; Force; Restitution; Angular Velocity; Buoyancy; Linear Velocity; Friction; Collision Detection; Narrow Phase; Broad Phase; Convexity; Convex; Concave; Convex Hull; Convex Decomposition; Intersection; SAT; GJK; EPA; Bounding Volume; AABB; OBB; Spatial Partitioning; Sort & Sweep; BVH; DBVT; CCD.
- **Gráficos e animação:** Computer Graphics; Ray Tracing; Rasterization; Graphics Pipeline; Sampling; Shader; Rendering Equation; Reflection; Diffuse; Specular; Mapping; Texture; Bump; Parallax; Horizon; Computer Animation; Color; Visual Perception; Tone Reproduction; Lighting and Shadow; Shadow Map; Cube; Cascaded; Light Source; Directional; Point; Spot; Infinite; Visibility and Occlusion; Occluder; Culling; Clipping; Fog; Frustum; Light; Shadow; Polygon; Polyhedron; Stencil Shadow; Graphics API; DirectX; OpenGL; WebGL; HLSL; GLSL; OpenGL ES; Metal; Vulkan; SPIR-V.
- **IA e aprendizado:** Game AI (dois arquivos com IDs diferentes); Decision Making; Decision Tree; State Machine; Behavior Tree; Fuzzy Logic; Markov System; Goal-Oriented Behavior; Movement; Board Game; Minimax; AB Pruning; MCTS; Decision Learning; Naive Bayes Classifier; Decision Tree Learning; Deep Learning; Artificial Neural Network; Reinforcements Learning; Learning.
- **Rendering avançado:** Advanced Rendering; Real-time Ray Tracing; DirectX Ray Tracing; Vulkan Ray Tracing; OptiX; Physically-Based Rendering; Translucency & Transparency; Conservation of Energy; Metallicity; Microsurface Scattering.

### **15.2. Server Side Game Developer: grupos encontrados**

A pasta contém mais de uma centena de arquivos de tópicos. A relação abaixo agrupa nomes vistos no índice; não representa ordem pedagógica.

- **Base e programação:** Actor Model; Address Conversion; AI; Akka Java; Akka.NET C#; Amazon ML; Apache Kafka; Apache Spark; API; ARP; Async/Await C++; Asynchronous; AWS; Azure ML; Azure; Barrier; BSD Socket; Byte Manipulation; C; Capability; Cassandra; Category; C/C++; Channel; Checksum (dois IDs); Cipher; Cloud ML; Cloud; Concurrency Java; Condition Variable.
- **Transporte e rede:** Congestion Control (dois IDs); Connection Hijacking; Connection; DHCP; DNS; Epoll; Error Detection; Flow Control; IP Addressing; IP; IPv4; IPv6; KQueue; Link Capacity; Maximum Segment Scaling; Maximum Segment Size; Out-of-band Data; Packet Structure; Packet vs Datagram; Proactor; Registered I/O; Reliable Transmission; Reliable vs Unreliable; Routing; Segment Structure; Select; Selective ACK; Socket Programming; TCP; TCP vs UDP; Timestamp; UDP; Windows; Winsock; WSA Poll; IOCP; io_uring.
- **Concorrência e reatividade:** Fiber; FRP; Function; Functional Programming; Future/Promises; Go; Goroutine; Java; JavaScript; Multithreading (dois IDs); Mutex; Ordered vs Unordered; OORP; Programming Languages; Programming Techniques; Reactive Approach (dois IDs); Reactive Model; Reactor; Synchronization; Synchrony; Task-based; Thread Building Block C; Thread-local Storage; Coroutine; Semaphore; Spinlock; Pthread; Dependency Injection; Design Patterns.
- **Dados, persistência e mensagens:** Databases; DAL; Data Clustering; Data Transfer; Datagram Construction; Datagram; Couchbase; DynamoDB; JSON; Memcached; Message Queues; MongoDB; MS SQL; MySQL; ORM; PostgreSQL; Protobuf; RabbitMQ; Redis; REST; RPC/REST; Serialization; Sharding; TOML; Transactions; XML; YAML.
- **Cloud, segurança e operação:** Cloud; AWS; Azure; GCP; Serverless; Containerization; Docker; Docker Compose; Kubernetes; Reliability (dois IDs); Resource Usage; Dump Analysis; Update Process; Security; Vulnerability; Denial of Service; SSL; TLS.

### **15.3. Duplicatas de slug**

- **Game AI (`Hpf_CPmLpCSP8Qo07Kq1X` e `Hpk8eOaOepERMmOvUgkxa`):** ambos os arquivos foram abertos; texto e referências iguais, mas o papel de cada nó no mapa não foi confirmado.
- **Server Side:** `checksum` e `congestion-control` foram abertos para ambos IDs e tratam, respectivamente, de TCP versus UDP e controle TCP versus controle sobre UDP. Os pares `multithreading` e `reactive-approach` foram abertos e diferem em escopo ou referências. `reliability` permanece sem validação por ID.

### **15.4. Critério de conclusão**

- Validar posição, pai, filhos e conexões de cada nó dos dois mapas interativos.
- Abrir cada Markdown por slug e ID, inclusive os repetidos.
- Registrar rótulo e URL literal de todas as referências, abrir destinos e marcar acesso e conteúdo.
- Revisar capítulos contra o índice e registrar links indisponíveis ou quebrados.
- Fixar branch/commit e data para reproduzir a versão.

**Estado desta edição:** guia expandido com mapeamento parcial, não integral. O inventário de arquivos não equivale a abrir cada Markdown ou confirmar posição, pai, filhos e conexões no mapa visual. Várias chamadas em lote ao GitHub expiraram; os arquivos e links não lidos continuam pendentes. O conteúdo técnico pode cobrir conceitos sem atestar a conferência do nó individual. URLs das referências são transcritas dos arquivos consultados; não foram avaliadas uma a uma quanto a acesso ou conteúdo.

---

# **16. Game Design Fundamentals: Feel, Juice e Feedback**

Game feel (também chamado de "game juice") é o conjunto de respostas sensoriais e mecânicas que tornam um jogo satisfatório de jogar mesmo antes de entender suas regras. É a diferença entre um personagem que "anda" e um personagem que "voa". Esses conceitos são fundamentais para qualquer projeto, inclusive jogos 2D estilo Stardew Valley.

## **16.1. Core Loop e Game Loop**

O **core loop** é a sequência de ações que o jogador repete durante a maior parte do tempo de jogo. Em jogos de fazenda:

```
Plantar → Aguardar/Cuidar → Colher → Vender → Reinvestir → Plantar
```

Boas loops têm três propriedades:

- **Progresso visível:** o jogador sente que avançou a cada iteração.
- **Variedade incremental:** novas culturas, ferramentas ou mecânicas surgem para evitar monotonia.
- **Recompensa de curto, médio e longo prazo:** colheita (curto), construir celeiro (médio), desbloquear bioma (longo).

**Secondary loops** complementam o core loop sem competir com ele. Exemplo: construção de relacionamentos com NPCs (loop social) que recompensa o core loop com itens especiais.

## **16.2. Game Feel e Juice**

"Juice" são todos os elementos extras que fazem uma ação sentir-se satisfatória:

| Elemento             | Exemplo em jogo de fazenda         | Como implementar no Godot                               |
| -------------------- | ---------------------------------- | ------------------------------------------------------- |
| **Screen shake**     | Ao cortar uma árvore               | `Camera2D.offset` com ruído aleatório por alguns frames |
| **Hitstop**          | Pequena pausa ao colher            | `Engine.time_scale = 0.1` por 2–3 frames                |
| **Partículas**       | Folhas voando ao podar             | `GPUParticles2D` com emissão por burst                  |
| **Sound feedback**   | Som diferente p/ cada tipo de crop | `AudioStreamPlayer` com pitch randomizado               |
| **Squeeze/stretch**  | Personagem comprime ao pular       | Animar `scale` antes da animação de pulo                |
| **Trails**           | Rasto da enxada balançando         | `Line2D` ou `Trail2D` seguindo o sprite                 |
| **Numbers voadores** | XP ganhado flutua na tela          | Instanciar `Label` e mover com `Tween`                  |

**Regra prática:** adicione juice em três momentos: ao iniciar uma ação, durante a ação e ao completar a ação. Cada um reforça a sensação de controle e resposta.

## **16.3. Feedback Loop e Player Agency**

O jogador precisa sempre sentir que suas decisões importam. Tipos de feedback:

- **Imediato** (< 100ms): animação, som, partícula.
- **Tático** (segundos a minutos): resultado de uma ação muda o estado do mundo.
- **Estratégico** (sessões): decisões passadas afetam o presente.

**Player agency** é a sensação de que o jogador controla o resultado. Em jogos de fazenda, preservar agency significa:

- Não punir severamente escolhas de plantio (oferecer recuperação).
- Mostrar previsões (ícone de chuva, contador de dias até colheita).
- Permitir desfazer ações menores (replantio sem penalidade alta).

## **16.4. MDA Framework**

**Mechanics → Dynamics → Aesthetics** é um modelo para analisar e projetar jogos:

- **Mecânicas:** regras e sistemas formais (plantar, regar, vender).
- **Dinâmicas:** comportamentos emergentes quando mecânicas interagem (otimização de rotinas, gestão de energia/tempo).
- **Estéticas:** emoções produzidas na experiência do jogador (sensação de progresso, conexão com personagens, exploração).

Use MDA para verificar se as mecânicas implementadas produzem as dinâmicas desejadas e se essas dinâmicas geram as emoções intencionadas.

---

# **17. Godot 4 — Arquitetura e Boas Práticas**

Godot 4 introduz mudanças significativas em relação ao Godot 3: novo renderer (Vulkan/Mobile/Compatibility), GDScript 2.0, sistema de sinais melhorado e `@export` annotations. Este capítulo cobre padrões específicos para o ecossistema Godot 4.

## **17.1. Filosofia de Cenas e Nós**

Godot usa composição por cenas (cenas são árvores de nós). A regra principal:

> **Cada cena deve ser autossuficiente e comunicar com o mundo externo apenas via sinais (para cima) e chamadas de método (para baixo).**

Hierarquia típica de um jogo 2D:

```
World (Node2D)
├── TileMap
├── Player (CharacterBody2D)
│   ├── Sprite2D
│   ├── AnimationPlayer
│   ├── CollisionShape2D
│   └── InteractionArea (Area2D)
├── NPCSpawner (Node)
│   └── [NPCs instanciados]
├── GameCamera (Camera2D)
└── UILayer (CanvasLayer)
    └── HUD (Control)
```

**Padrão de comunicação:**

- Filho → Pai: emitir sinal (`emit_signal`)
- Pai → Filho: chamar método diretamente
- Não relacionados: usar um autoload/singleton como barramento de eventos ou passar referências

## **17.2. Autoloads e Singletons**

Autoloads são nós carregados automaticamente e acessíveis globalmente via nome. Use com moderação — são o equivalente de variáveis globais.

Bons candidatos a autoload em jogo de fazenda:

```gdscript
# GameState.gd — estado do jogo (dia, estação, recursos globais)
# AudioManager.gd — controla trilha sonora e SFX
# SaveManager.gd — serialização/deserialização do save
# EventBus.gd — barramento de sinais para comunicação entre sistemas
```

**EventBus pattern** evita acoplamento direto entre nós distantes:

```gdscript
# EventBus.gd (Autoload)
signal crop_harvested(crop_type: String, amount: int)
signal day_changed(new_day: int)
signal npc_relationship_changed(npc_id: String, delta: int)

# Em qualquer nó, sem precisar de referência direta:
EventBus.crop_harvested.emit("wheat", 5)
EventBus.crop_harvested.connect(_on_crop_harvested)
```

## **17.3. GDScript 2.0 — Tipagem Estática e @annotations**

GDScript 2.0 tem tipagem estática opcional, que melhora performance e autocomplete:

```gdscript
# Ruim — sem tipo
var speed = 100
func move(delta):
    position.x += speed * delta

# Bom — com tipo estático
var speed: float = 100.0
func move(delta: float) -> void:
    position.x += speed * delta
```

**@annotations importantes:**

```gdscript
@export var crop_data: CropResource          # Expõe no Inspector
@export_range(0, 100, 1) var health: int = 100
@onready var sprite := $Sprite2D            # Resolve referência quando nó entra na árvore
@tool                                         # Executa o script no editor
```

**Resources como dados:**

```gdscript
# CropResource.gd
class_name CropResource
extends Resource

@export var crop_name: String
@export var growth_days: int
@export var sell_price: int
@export var texture: Texture2D
```

Resources são objetos serializáveis que podem ser editados no Inspector e salvos como `.tres`. São ideais para dados de culturas, itens, NPCs, receitas e qualquer dado de configuração.

## **17.4. CharacterBody2D e Movimento**

`CharacterBody2D` é o nó para personagens que precisam colidir e ser controlados. Padrão com aceleração e atrito:

```gdscript
extends CharacterBody2D

const MAX_SPEED: float = 120.0
const ACCELERATION: float = 800.0
const FRICTION: float = 600.0

func _physics_process(delta: float) -> void:
    var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")

    if direction != Vector2.ZERO:
        velocity = velocity.move_toward(direction * MAX_SPEED, ACCELERATION * delta)
    else:
        velocity = velocity.move_toward(Vector2.ZERO, FRICTION * delta)

    move_and_slide()
```

**Dica de feel:** adicionar um pequeno overshoot na parada (o personagem desliza levemente além do ponto de parada antes de volcar) faz o movimento parecer mais orgânico.

## **17.5. Signals e Desacoplamento**

Sinais são o mecanismo central de comunicação reativa do Godot. Regras:

```gdscript
# Declara sinal com tipo
signal item_picked_up(item: ItemResource, amount: int)

# Emite com dados
item_picked_up.emit(tomato_resource, 3)

# Conecta — forma segura no _ready
func _ready() -> void:
    # Conectar sinal de filho sem guardar referência frágil
    $InteractionArea.body_entered.connect(_on_body_entered)

    # Conectar com callable e parâmetros adicionais
    EventBus.day_changed.connect(_on_day_changed)

# Desconectar ao sair da árvore (evita memory leaks)
func _exit_tree() -> void:
    EventBus.day_changed.disconnect(_on_day_changed)
```

**Padrão Observer via signals:** NPC pode escutar `EventBus.crop_harvested` para reagir emocionalmente a colheitas do jogador, sem o nó do jogador conhecer os NPCs.

## **17.6. TileMap e Mundo 2D**

`TileMapLayer` (Godot 4.3+) substituiu o antigo `TileMap` monolítico. Cada camada é um nó separado:

```
WorldMap (Node2D)
├── GroundLayer (TileMapLayer)    # Chão, grama
├── ObjectLayer (TileMapLayer)   # Pedras, árvores (com collision)
├── WaterLayer (TileMapLayer)    # Água (com animação)
└── OverlayLayer (TileMapLayer)  # Sombras, decorações
```

Para acessar e modificar tiles por código:

```gdscript
# Converter posição do mundo para célula
var cell: Vector2i = ground_layer.local_to_map(player.global_position)

# Verificar tipo de tile
var tile_data: TileData = ground_layer.get_cell_tile_data(cell)
if tile_data and tile_data.get_custom_data("is_farmable"):
    can_plant = true

# Trocar tile (ex: terra arada)
ground_layer.set_cell(cell, SOURCE_ID, TILLED_ATLAS_COORD)
```

**Sistema de plantio por grid:** use um `Dictionary` para mapear coordenadas de células a objetos de cultura. Persista esse dicionário no save do jogo.

---

# **18. Pathfinding e Navegação**

Pathfinding determina como um agente (NPC, inimigo, animal) encontra um caminho entre dois pontos evitando obstáculos.

## **18.1. A\* (A-estrela)**

A\* é o algoritmo padrão para pathfinding em grades e grafos. Combina o custo real do caminho percorrido (g) com uma heurística do custo estimado até o destino (h):

```
f(n) = g(n) + h(n)
```

A heurística mais comum em grids com 4 direções é a distância Manhattan; para 8 direções, distância de Chebyshev.

**A\* no Godot 4 com AStarGrid2D:**

```gdscript
var astar := AStarGrid2D.new()

func setup_grid() -> void:
    astar.region = Rect2i(0, 0, MAP_WIDTH, MAP_HEIGHT)
    astar.cell_size = Vector2(16, 16)
    astar.update()

    # Marcar células bloqueadas
    for cell in obstacle_cells:
        astar.set_cell_solid(cell, true)

func get_path(from_world: Vector2, to_world: Vector2) -> PackedVector2Array:
    var from_cell := ground_layer.local_to_map(from_world)
    var to_cell := ground_layer.local_to_map(to_world)
    return astar.get_point_path(from_cell, to_cell)
```

## **18.2. NavigationAgent2D**

Para mapas irregulares (não apenas grids), use `NavigationRegion2D` + `NavigationAgent2D`. O Godot gera automaticamente um **navmesh** a partir das geometrias de colisão:

```gdscript
# No NPC
@onready var nav_agent := $NavigationAgent2D

func move_to(target_position: Vector2) -> void:
    nav_agent.target_position = target_position

func _physics_process(delta: float) -> void:
    if nav_agent.is_navigation_finished():
        return

    var next_pos := nav_agent.get_next_path_position()
    var direction := (next_pos - global_position).normalized()
    velocity = direction * MOVE_SPEED
    move_and_slide()
```

**Atualização dinâmica:** quando o jogador planta ou constrói algo, chame `NavigationServer2D.bake_navigation_mesh()` ou use regiões menores que podem ser ativadas/desativadas.

## **18.3. Steering Behaviors**

Steering behaviors produzem movimento orgânico sem necessidade de pathfinding completo. São funções que calculam uma força de direção:

| Behavior       | Descrição                          | Uso em fazenda                 |
| -------------- | ---------------------------------- | ------------------------------ |
| **Seek**       | Move em direção a um alvo          | NPC caminha ao jogador         |
| **Flee**       | Foge de um alvo                    | Animal foge ao se aproximar    |
| **Arrive**     | Como Seek mas desacelera ao chegar | NPC para suavemente em destino |
| **Wander**     | Movimento aleatório orgânico       | Animais pastando               |
| **Separation** | Evita outros agentes               | NPCs não se sobrepõem          |
| **Flock**      | Grupo se move coeso                | Bandos de pássaros             |

```gdscript
# Exemplo: Wander behavior
func get_wander_force(delta: float) -> Vector2:
    wander_angle += randf_range(-WANDER_JITTER, WANDER_JITTER)
    var wander_dir := Vector2(cos(wander_angle), sin(wander_angle))
    return wander_dir * WANDER_STRENGTH
```

---

# **19. Sistema de Áudio**

Áudio bem implementado aumenta dramaticamente a imersão. Godot oferece um sistema de áudio baseado em barramentos (buses).

## **19.1. AudioServer e Buses**

O grafo de áudio do Godot funciona com buses encadeados que processam o áudio antes de chegar ao Master:

```
Master Bus
├── Music Bus (com Reverb e Compressor)
├── SFX Bus (com Limiter)
│   ├── UI Bus
│   └── World Bus (com spatial audio)
└── Voice Bus (com Low Cut Filter)
```

Configurar programaticamente:

```gdscript
# Ajustar volume de um bus em dB
AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), -10.0)

# Mutar bus
AudioServer.set_bus_mute(AudioServer.get_bus_index("SFX"), true)
```

## **19.2. AudioManager — Padrão para Jogos de Fazenda**

Um Autoload `AudioManager` centraliza toda lógica de áudio:

```gdscript
# AudioManager.gd (Autoload)
extends Node

const SFX_POOL_SIZE: int = 8

var _music_player := AudioStreamPlayer.new()
var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_pool_index: int = 0

func _ready() -> void:
    add_child(_music_player)
    _music_player.bus = "Music"

    for i in SFX_POOL_SIZE:
        var player := AudioStreamPlayer.new()
        player.bus = "SFX"
        add_child(player)
        _sfx_pool.append(player)

func play_music(stream: AudioStream, fade_in: float = 1.0) -> void:
    if _music_player.stream == stream:
        return
    var tween := create_tween()
    tween.tween_property(_music_player, "volume_db", -80.0, fade_in * 0.5)
    await tween.finished
    _music_player.stream = stream
    _music_player.play()
    tween = create_tween()
    tween.tween_property(_music_player, "volume_db", 0.0, fade_in * 0.5)

func play_sfx(stream: AudioStream, pitch_variation: float = 0.1) -> void:
    var player := _sfx_pool[_sfx_pool_index % SFX_POOL_SIZE]
    _sfx_pool_index += 1
    player.stream = stream
    player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
    player.play()
```

## **19.3. Áudio Espacial 2D**

`AudioStreamPlayer2D` posiciona o som no mundo 2D com atenuação por distância:

```gdscript
# Em animais ou fontes do mundo (rio, fogueira)
@onready var audio := $AudioStreamPlayer2D

func _ready() -> void:
    audio.max_distance = 300.0   # Ouvível a 300px
    audio.attenuation = 1.5      # Curva de atenuação
    audio.bus = "World"
```

**Variação de pitch:** randomizar levemente o pitch de sons repetidos (passos, colheita) evita a "fadiga auditiva" que torna sons mecânicos irritantes:

```gdscript
audio.pitch_scale = randf_range(0.9, 1.1)
```

## **19.4. Música Dinâmica e Adaptativa**

Em jogos de fazenda, a música pode variar conforme o contexto:

```gdscript
# Transição suave por estação
func set_season_music(season: String) -> void:
    var stream := SEASON_TRACKS[season]
    AudioManager.play_music(stream, fade_in = 2.0)

# Adicionar camadas (stems) por estado
# Ex: adicionar percussão durante combate
func add_combat_stem() -> void:
    _combat_stem_player.volume_db = 0.0  # liga o stem já sincronizado
```

---

# **20. Otimização e Profiling**

Um jogo com 60 fps suave exige que cada frame seja processado em menos de 16.6ms. Otimizar sem medir é improdutivo — use o profiler antes de qualquer mudança.

## **20.1. Godot Profiler e Monitor**

O Godot 4 inclui ferramentas de diagnóstico integradas:

- **Profiler** (Debug > Profiler): mostra tempo gasto em cada função por frame.
- **Monitor** (Debug > Monitor): gráficos em tempo real de FPS, uso de memória, draw calls, objetos.
- **Remote Scene Tree**: inspeciona a árvore de nós em execução.

**Métricas-chave:**
| Métrica | Ideal | Preocupante |
|---|---|---|
| FPS | ≥ 60 | < 30 |
| Draw calls | < 100 | > 500 |
| Objetos em cena | < 1000 | > 5000 |
| Memória de textura | < 256MB | > 512MB |

## **20.2. Draw Calls e Batching**

Cada chamada de desenho à GPU tem overhead fixo. Reduzir draw calls melhora performance:

- **CanvasItem.use_parent_material:** compartilha material entre nós filhos.
- **MultiMesh:** renderiza muitas instâncias do mesmo mesh em uma única draw call (ideal para grama, pedras, decorações).
- **Sprite Atlas:** agrupar sprites em uma textura única evita trocas de textura.
- **TileMap batching:** tiles da mesma textura são automaticamente batched.

```gdscript
# MultiMeshInstance2D para grama — 1 draw call para milhares de instâncias
@onready var grass_multi := $MultiMeshInstance2D

func spawn_grass(positions: Array[Vector2]) -> void:
    grass_multi.multimesh.instance_count = positions.size()
    for i in positions.size():
        var transform := Transform2D(0.0, positions[i])
        grass_multi.multimesh.set_instance_transform_2d(i, transform)
```

## **20.3. Culling e Visibility**

Não processe ou desenhe o que o jogador não vê:

```gdscript
# VisibleOnScreenNotifier2D — pausa lógica de NPCs fora da câmera
@onready var visibility := $VisibleOnScreenNotifier2D

func _ready() -> void:
    visibility.screen_entered.connect(func(): set_process(true))
    visibility.screen_exited.connect(func(): set_process(false))
```

**Para tilemaps grandes:** use `TileMapLayer.set_layer_enabled()` para desativar camadas inteiras fora da área atual do mundo.

## **20.4. Object Pooling**

Instanciar e destruir nós frequentemente é caro (aloca/desaloca memória). Um pool reutiliza objetos:

```gdscript
# ObjectPool.gd
class_name ObjectPool
extends Node

var _pool: Array[Node] = []
var _scene: PackedScene
var _pool_size: int

func initialize(scene: PackedScene, size: int) -> void:
    _scene = scene
    _pool_size = size
    for i in size:
        var instance := scene.instantiate()
        instance.visible = false
        add_child(instance)
        _pool.append(instance)

func get_object() -> Node:
    for obj in _pool:
        if not obj.visible:
            obj.visible = true
            return obj
    # Pool cheio — instancia extra (ou ignora)
    return null

func return_object(obj: Node) -> void:
    obj.visible = false
    obj.position = Vector2.ZERO
```

Use pools para: projéteis, partículas manuais, números voadores, efeitos de impacto.

## **20.5. \_process vs \_physics_process**

| Função                    | Frequência              | Use para                   |
| ------------------------- | ----------------------- | -------------------------- |
| `_process(delta)`         | A cada frame (variável) | Animação, UI, input visual |
| `_physics_process(delta)` | Taxa fixa (padrão 60/s) | Física, movimento, colisão |
| `_input(event)`           | A cada evento           | Captura input pontual      |

**Regra:** nunca coloque lógica de física em `_process`. Nunca coloque lógica pesada desnecessária em ambos — use sinais e estados para fazer lógica apenas quando necessário.

---

# **21. Design Patterns para Jogos**

Padrões de projeto são soluções reutilizáveis para problemas recorrentes. Em jogos, alguns padrões são especialmente relevantes.

## **21.1. State Pattern — FSM Orientada a Objetos**

Em vez de um `if/match` gigante no player, cada estado é uma classe:

```gdscript
# state.gd — interface base
class_name State
extends RefCounted

var player: CharacterBody2D

func enter() -> void: pass
func exit() -> void: pass
func process(delta: float) -> State: return null
func physics_process(delta: float) -> State: return null

# idle_state.gd
class_name IdleState
extends State

func physics_process(delta: float) -> State:
    if Input.get_vector("ui_left","ui_right","ui_up","ui_down") != Vector2.ZERO:
        return WalkState.new()
    return null

# state_machine.gd
class_name StateMachine
extends Node

var current_state: State

func transition_to(new_state: State) -> void:
    if current_state:
        current_state.exit()
    current_state = new_state
    current_state.player = owner
    current_state.enter()

func _physics_process(delta: float) -> void:
    var next := current_state.physics_process(delta)
    if next:
        transition_to(next)
```

## **21.2. Command Pattern — Input e Replay**

Encapsula cada ação em um objeto, permitindo desfazer, refazer e gravar replays:

```gdscript
# Command interface
class_name GameCommand
extends RefCounted
func execute() -> void: pass
func undo() -> void: pass

# Comando concreto
class_name PlantCropCommand
extends GameCommand

var _grid_cell: Vector2i
var _crop: CropResource
var _farm_grid: FarmGrid

func _init(cell: Vector2i, crop: CropResource, grid: FarmGrid) -> void:
    _grid_cell = cell
    _crop = crop
    _farm_grid = grid

func execute() -> void:
    _farm_grid.plant(_grid_cell, _crop)

func undo() -> void:
    _farm_grid.remove_crop(_grid_cell)
```

## **21.3. Observer Pattern — EventBus**

Já coberto em 17.2 (EventBus). O padrão Observer desacopla produtores de eventos de consumidores:

```gdscript
# Produtor não conhece consumidores
EventBus.day_changed.emit(new_day)

# Consumidor não conhece produtores
EventBus.day_changed.connect(_on_new_day)
```

## **21.4. Component Pattern — Composição via Nós**

Godot favorece composição naturalmente. Em vez de herança profunda, componha comportamentos:

```gdscript
# Ao invés de: Player extends Character extends Entity
# Use composição:
Player (CharacterBody2D)
├── MovementComponent (Node)
├── HealthComponent (Node)
├── InventoryComponent (Node)
├── InteractionComponent (Area2D)
└── AnimationComponent (Node)
```

Cada componente é autossuficiente e pode ser reutilizado em NPCs, inimigos, etc.

## **21.5. Data-Driven Design com Resources**

Separar dados de lógica facilita balanceamento e extensão sem mudar código:

```gdscript
# Todos dados de culturas em .tres separados
# wheat.tres → CropResource(name="Trigo", days=4, price=25)
# tomato.tres → CropResource(name="Tomate", days=8, price=60)

# O código não muda quando adiciona nova cultura
@export var available_crops: Array[CropResource]
```

Isso permite que designers de jogo (ou você mesmo mais tarde) adicionem culturas sem tocar em código GDScript.

---

# **22. Save/Load System**

Persistência é crítica em jogos de fazenda. O jogador não pode perder horas de progresso.

## **22.1. Estrutura de Save**

Organize o save em seções:

```gdscript
# SaveManager.gd (Autoload)
const SAVE_PATH: String = "user://savegame.json"

func save_game() -> void:
    var save_data := {
        "version": GameState.SAVE_VERSION,
        "timestamp": Time.get_unix_time_from_system(),
        "world": {
            "day": GameState.current_day,
            "season": GameState.current_season,
            "time": GameState.time_of_day,
        },
        "player": {
            "gold": Inventory.gold,
            "energy": Player.energy,
            "position": var_to_str(Player.global_position),
            "inventory": Inventory.serialize(),
        },
        "farm": FarmGrid.serialize(),
        "npcs": NPCManager.serialize_relationships(),
    }

    var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
    file.store_string(JSON.stringify(save_data, "\t"))

func load_game() -> bool:
    if not FileAccess.file_exists(SAVE_PATH):
        return false

    var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
    var parse_result := JSON.parse_string(file.get_as_text())
    if not parse_result:
        return false

    _apply_save_data(parse_result)
    return true
```

## **22.2. Versionamento de Save**

Sempre versione o formato de save para lidar com atualizações do jogo:

```gdscript
func _apply_save_data(data: Dictionary) -> void:
    var version: int = data.get("version", 0)

    match version:
        0: _migrate_v0_to_v1(data)
        1: _apply_v1(data)
        _: push_error("Save version %d not supported" % version)

func _migrate_v0_to_v1(data: Dictionary) -> void:
    # Converter formato antigo para novo
    if "player_gold" in data:
        data["player"] = {"gold": data["player_gold"]}
    _apply_v1(data)
```

## **22.3. Auto-save e Proteção Contra Corrupção**

```gdscript
# Salvar em arquivo temporário primeiro, depois renomear
func _safe_save(data: String) -> void:
    var tmp_path := SAVE_PATH + ".tmp"
    var file := FileAccess.open(tmp_path, FileAccess.WRITE)
    file.store_string(data)
    file.close()

    # Substituição atômica (evita arquivo corrompido se o jogo crashar)
    DirAccess.rename_absolute(tmp_path, SAVE_PATH)

# Auto-save ao final de cada dia
EventBus.day_changed.connect(func(_day): SaveManager.save_game())
```

---

# **23. Exportação e Distribuição**

## **23.1. Export Templates no Godot 4**

Para exportar um projeto, você precisa dos Export Templates correspondentes à versão do Godot:

1. **Editor → Export → Manage Export Templates → Download**
2. Ou baixe manualmente de https://godotengine.org/download
3. Templates ficam em `user://export_templates/`

**Plataformas suportadas pelo Godot 4:**

- Windows (x86_64, arm64)
- macOS (Universal — x86_64 + arm64)
- Linux (x86_64, arm64)
- Web (HTML5 via Emscripten)
- Android (arm64, x86_64)
- iOS

## **23.2. Configuração de Exportação**

No arquivo `export_presets.cfg` (versionado no projeto):

```
[preset.0]
name="Windows Desktop"
platform="Windows Desktop"
include_filter=""
exclude_filter=""
export_path="exports/windows/FazendaBrasil.exe"

[preset.0.options]
binary_format/architecture="x86_64"
texture_format/bptc=true
```

**Para Web/HTML5:**

- Habilitar SharedArrayBuffer no servidor (requer HTTPS e headers COOP/COEP).
- Considerar itch.io que configura esses headers automaticamente.

## **23.3. Plataformas de Distribuição**

| Plataforma           | Taxa                 | Perfil             | Integração Godot              |
| -------------------- | -------------------- | ------------------ | ----------------------------- |
| **itch.io**          | 0–10% (você escolhe) | Indie, Game Jams   | Upload direto, HTML5 embutido |
| **Steam**            | 30%                  | PC, grande alcance | Steamworks SDK via GodotSteam |
| **Epic Games Store** | 12%                  | PC, menor catálogo | Epic Online Services          |
| **Google Play**      | 15–30%               | Android            | Godot Android Export          |
| **App Store**        | 15–30%               | iOS/macOS          | Requer Mac e conta Apple      |

## **23.4. GodotSteam — Integração com Steam**

Para distribuição no Steam, use a extensão [GodotSteam](https://godotsteam.com/):

```gdscript
# Verificar se rodando no Steam
if Steam.isSteamRunning():
    Steam.run_callbacks()

# Achievements
Steam.setAchievement("ACH_FIRST_HARVEST")

# Leaderboards
Steam.findLeaderboard("high_score")

# Cloud Save (Steam Cloud)
# Configurar no Steamworks Dashboard e mapear user:// para Steam Cloud
```

## **23.5. Checklist de Lançamento**

Antes de publicar:

- [ ] Versão de lançamento compilada (não debug)
- [ ] Export templates corretos instalados
- [ ] Ícones em todas as resoluções requeridas
- [ ] Nome do produto, versão e company name em `project.godot`
- [ ] Permissões de distribuição de assets de terceiros confirmadas
- [ ] Teste em máquina sem Godot instalado
- [ ] Save/load testado extensivamente (incluindo save de versão anterior)
- [ ] Crash/error reporting configurado
- [ ] Analytics básico configurado (se desejado)
- [ ] Página de store com screenshots e trailer
- [ ] Preço e região de preços definidos

---

# **24. Tópicos Avançados de Game Design**

## **24.1. Economia de Jogo (Game Economy)**

Em jogos de fazenda, a economia define o ritmo e motivação do jogador:

**Fontes (Sources)** de recursos: colheitas, pesca, mineração, criação de animais, trabalho para NPCs.

**Sumidouros (Sinks)** de recursos: compra de sementes, ferramentas, construções, presentes, melhorias.

**Balanceamento:** use uma planilha para mapear o valor de cada item e o tempo necessário para obtê-lo. A razão tempo/recompensa deve ser consistente ou intencionalmente variável (surpresa e descoberta têm valor).

**Inflação de jogo:** sem sumidouros adequados, o jogador acumula riqueza sem propósito. Introduza objetivos caros (casamento, casa grande, doação para vila) como sumidouros naturais.

## **24.2. Progressão e Curva de Dificuldade**

A curva de aprendizado deve acompanhar a curva de desafio:

```
Habilidade do jogador
      ↑
      |    _________ (Flow)
      |   /
      |  / (Aprendizado)
      | /
      |/________________→ Tempo

Zona de Flow: desafio ≈ habilidade
Abaixo do Flow: tédio (jogo muito fácil)
Acima do Flow: ansiedade (jogo muito difícil)
```

**Técnicas para manter o Flow:**

- Introduzir mecânicas gradualmente (tutorial implícito).
- Dar ao jogador mais opções à medida que domina as existentes.
- Usar NPCs para sinalizar próximas metas de forma orgânica.

## **24.3. Onboarding e Tutorial Design**

O melhor tutorial não parece um tutorial:

- **Tutorial contextual:** ensinamento acontece quando a mecânica é necessária pela primeira vez.
- **Constraint de entrada:** começa com fazenda pequena, expandindo gradualmente.
- **Feedback imediato:** cada ação do tutorial tem consequência visível.
- **Não bloquear:** tutoriais obrigatórios frustram jogadores experientes.

Em Stardew Valley, a primeira primavera é o tutorial implícito — você tem recursos limitados, NPCs que ensinam mecanicamente através de diálogos orgânicos, e um objetivo claro (restaurar a comunidade).

## **24.4. Juice Checklist para Cada Mecânica**

Ao implementar qualquer mecânica nova, verifique:

- [ ] **Visual feedback:** animação ou efeito visível ao interagir.
- [ ] **Sound feedback:** som correspondente à ação.
- [ ] **Screen space feedback:** UI reage (número voa, barra muda).
- [ ] **World space feedback:** o mundo muda visualmente (tile trocado, planta cresce).
- [ ] **Haptic feedback:** (se mobile) vibração sutil.
- [ ] **Progression feedback:** algum indicador de progresso avançou.

Se uma mecânica não tem pelo menos 3 desses 6, ela provavelmente parece "vazia".

---

# **25. Referências e Recursos de Aprofundamento**

## **25.1. Godot 4 — Documentação e Comunidade**

- Documentação oficial: https://docs.godotengine.org/en/stable/
- GodotShaders (shaders prontos): https://godotshaders.com/
- Godot Asset Library: https://godotengine.org/asset-library/
- Reddit: https://www.reddit.com/r/godot/
- Discord oficial Godot: https://discord.gg/godotengine
- GDScript style guide: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html

## **25.2. Game Design**

- _The Art of Game Design_ — Jesse Schell (livro essencial)
- Game Maker's Toolkit (YouTube): https://www.youtube.com/@GMTK
- GDC Talks: https://www.gdcvault.com/ (muitos gratuitos)
- _A Theory of Fun for Game Design_ — Raph Koster
- Juice it or lose it (palestra clássica sobre game feel): https://www.youtube.com/watch?v=Fy0aCDmgnxg

## **25.3. Matemática e Física para Jogos**

- Math for Game Developers (YouTube series): https://www.youtube.com/@FreyaHolmér
- _Mathematics for 3D Game Programming_ — Eric Lengyel
- Immersive Math (linear algebra interativo): http://immersivemath.com/

## **25.4. Áudio para Jogos**

- _The Game Audio Strategy Guide_ — Stephan Schutze
- GDC Audio Talks: https://www.youtube.com/playlist?list=PL2e4mYbwSTba1GZDKJOU4MXQBFK5B2_Nk
- Freesound.org (SFX gratuitos): https://freesound.org/
- OpenGameArt.org (assets livres): https://opengameart.org/

## **25.5. Otimização e Performance**

- Godot Performance Guidelines: https://docs.godotengine.org/en/stable/tutorials/performance/
- _Game Programming Patterns_ — Robert Nystrom (gratuito online): https://gameprogrammingpatterns.com/
- Catlike Coding (shaders e Unity, mas conceitos aplicáveis): https://catlikecoding.com/

---

_Seções 16–25 adicionadas em 2026-10-19. Cobrem game design prático, arquitetura Godot 4, pathfinding, áudio, otimização, design patterns, save system, exportação e recursos de aprofundamento. Este documento deve ser atualizado conforme o projeto evolui — priorize decisões documentadas nos ADRs sobre descrições genéricas aqui._
