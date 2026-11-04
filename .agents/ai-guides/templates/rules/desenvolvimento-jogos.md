# Checklist de Arquitetura e Engenharia de Jogos (`.agents/rules/desenvolvimento-jogos.md`)

<!-- Fonte canônica: templates/rules/desenvolvimento-jogos.md (guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md) — instalado por GAME-01 -->

Regra always-on: aplique este checklist em code review, auditoria de cenas, scripts e aprovação de PRs de jogos digitais (Godot 4, Unity, Unreal, engines customizadas e servidores multiplayer). Guia completo em `.agents/ai-guides/guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md`.

## Checklist Canônico de Desenvolvimento e Arquitetura de Jogos

### A. Ciclo de Vida e Game Loop
- [ ] A física e o movimento cinemático de corpos utilizam passo de tempo fixo (`_physics_process` com delta constante no Godot)?
- [ ] A renderização visual e efeitos estéticos utilizam o passo variável (`_process`) com interpolação suave para evitar trepidação (*jitter*) em taxas de quadros elevadas (144Hz+)?
- [ ] A lógica do jogo é imune a quedas momentâneas de framerate (sem integração numérica com delta variável descontrolado)?
- [ ] Inputs do jogador são convertidos em intenções/comandos lógicos em vez de atualizar diretamente posições ou físicas do mundo?

### B. Separação Arquitetural: Estado vs. Apresentação
- [ ] Atributos de personagens, dados de inventário, balanceamento de combate e regras econômicas residem em recursos de dados puros (`Resource` / `.tres` no Godot, `ScriptableObject` na Unity), desacoplados de nós visuais?
- [ ] Cenas e nós visuais (`Node2D`, `CanvasItem`, `Sprite2D`) atuam como visualizadores que escutam sinais e eventos emitidos pelo estado?
- [ ] Nenhuma regra crítica de negócio depende de referências frágeis a nós na árvore de cena (`get_parent().get_parent()`)? Injeção de dependências ou sinais desacoplados são utilizados?
- [ ] As classes de dados e lógica possuem tipagem estática estrita (ex.: GDScript 2.0 com type hints completos em variáveis, argumentos e retornos)?

### C. Física, Matemática e Geometria
- [ ] Movimentação diagonal de personagens é devidamente normalizada (`direction.normalized()`) para evitar aceleração artificial de $\sqrt{2} \approx 1.414$?
- [ ] Corpos com alta velocidade (tiros, projéteis rápidos) utilizam Detecção Contínua de Colisão (*Continuous Collision Detection - CCD*) ou Raycasting para evitar *tunneling* através de paredes finas?
- [ ] Interpolações de rotação tridimensional utilizam Quaternions com SLERP, prevenindo Gimbal Lock?
- [ ] Máscaras e camadas de colisão (*Collision Layers & Masks*) estão organizadas de forma esparsa e com papéis claros (ex.: Jogador, Inimigos, Projéteis, Cenário)?

### D. Performance, Shaders e Orçamento de Tempo
- [ ] O orçamento de tempo por quadro respeita os limites da plataforma alvo (máximo 16.6ms para 60 FPS estáveis, 8.3ms para 120 FPS)?
- [ ] Cálculos matemáticos pesados e alocações de coleções/arrays na memória não ocorrem repetidamente a cada quadro no `_process`?
- [ ] Instanciação frequente de objetos efêmeros (balas, partículas, números de dano) utiliza *Object Pooling* em vez de alocações e destruições contínuas de memória?
- [ ] Texturas utilizam formatos compactados adequados para a GPU (VRAM compression) e atlas de texturas para minimizar chamadas de desenho (*Draw Calls*)?

### E. Inteligência Artificial e Respostas Sensoriais (Game Feel)
- [ ] Comportamentos de NPCs utilizam máquinas de estados finitas (FSM) ou árvores de comportamento (Behavior Trees) com estados explícitos e transições controladas?
- [ ] O jogo implementa tolerâncias essenciais de jogabilidade (*Coyote Time* para saltos após bordas e *Input Buffering* para comandos prévios)?
- [ ] Feedbacks visuais e de impacto (*Screen Shake*, *Hitstop/Freeze frame*, deformações de squash/stretch e áudio contextual) enriquecem ações contundentes?

### F. Segurança, Multiplayer e Operação em Nuvem
- [ ] Zero chaves de API secretas, credenciais de produção ou tokens privados commitados no repositório ou embutidos no binário distribuído do cliente?
- [ ] Em arquiteturas multiplayer, o servidor é a autoridade absoluta sobre regras, física, vida, posição e concessão de itens? O cliente atua apenas como previsor visual e transmissor de inputs.
- [ ] Pacotes de rede recebidos de clientes remotos passam por validação e sanitização estrita de limites numéricos antes de processamento na simulação do servidor?
