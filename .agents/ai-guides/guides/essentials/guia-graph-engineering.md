---
title: Guia Oficial de Graph Engineering e Knowledge Graphs para Agentes de IA
description: Manual essencial e universal para transformar repositórios de código em Knowledge Graphs operacionais com Graphify, viabilizando navegação determinística por AST, economia de até 70% de tokens e eliminação de alucinações.
version: 2.2.1
date: 2026-09-27
---

<!-- 
=================================================================================
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO
=================================================================================
Data       | Autor          | Descrição da Alteração
-----------|----------------|--------------------------------------------------
2026-08-31 | Matheus Diniz  | Criação do guia inicial de Graph Engineering.
2026-09-09 | Eduardo Batista| v2.0.0 — Promoção para Guia Essencial Canônico:
           |                | desacoplamento total de stack; regra mandatória de
           |                | exclusão de docs/ no .graphifyignore; obrigatoriedade
           |                | de recálculo total do grafo do zero (--force --code-only)
           |                | em mudanças estruturais; alinhamento ao Dual-Harness.
2026-09-18 | Eduardo Batista| v2.1.0 — Seção de Heurísticas Executáveis (slug graph-engineering)
           |                | consumida pelo /setup; prosa movida para Fundamentos;
           |                | .graphifyignore e subagente curador com fonte em templates/.
2026-09-27 | Eduardo Batista| v2.2.0 — GRAPH-04/05 mesclam hooks via templates/harness/merge_hooks.py (determinístico);
           |                | GRAPH-06 não sobrescreve curador customizado; GRAPH-09 exige nós na resposta (graph_smoke.sh).
2026-09-27 | Eduardo Batista| v2.2.1 — GRAPH-04/05 comparam o settings com o template (merge_hooks.py --check)
           |                | e trocam hook-guard/graphify legado (caminho absoluto, sem PATH, sem --strict)
           |                | pelo canônico via --replace ancorado nas formas legadas, preservando os hooks do projeto.
2026-10-14 | Eduardo Batista| AGENTS.md como instrução única: referência GRAPH-02 passa a ser verificada no AGENTS.md; GRAPH-03 removida (o Gemini lê o mesmo AGENTS.md). Bloco na versão 4.
=================================================================================
-->

# 🕸️ Guia Oficial de Graph Engineering e Knowledge Graphs para Agentes de IA

Este guia estabelece o padrão normativo e agnóstico de **Graph Engineering (Engenharia de Grafos de Conhecimento)** para repositórios de software operados por assistentes de IA (Claude Code, Gemini CLI, OpenClaude e Codex). 

Ao substituir buscas textuais cegas por navegação relacional baseada em AST (Abstract Syntax Tree), o agente orienta suas ações com precisão cirúrgica, **reduzindo o consumo de tokens em até 70%** e eliminando turnos perdidos com alucinações de contexto.

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). `do` é shell ou começa com `agent:`. Requer o guia `harness-commit-memoria` aplicado antes (instala `uv`, `graphify`, `.claude/`, `.gemini/`).

```yaml heuristics
guide: graph-engineering
version: 4
requires: [harness-commit-memoria]
heuristics:
  - id: GRAPH-01
    title: .graphifyignore canônico (docs/, harnesses, *.md, caches e graphify-out/ fora do grafo)
    when: "! test -f .graphifyignore || ! grep -qxF 'docs/' .graphifyignore || ! grep -qxF '.agents/' .graphifyignore || ! grep -qxF '*.md' .graphifyignore || ! grep -qxF 'graphify-out/' .graphifyignore"
    do: |
      if ! test -f .graphifyignore; then cp "$AI_GUIDES_RUNTIME/templates/graphifyignore" .graphifyignore
      else
        printf '\n# ai-guides: exclusões canônicas (Regra de Ouro 1)\n' >> .graphifyignore
        for e in docs/ docs/ai/ .agents/ .claude/ .gemini/ .superpowers/ '*.md' graphify-out/ .git/ .worktrees/ node_modules/ .venv/ __pycache__/ dist/ build/; do
          grep -qxF "$e" .graphifyignore || printf '%s\n' "$e" >> .graphifyignore
        done
      fi
    verify: "grep -qxF 'docs/' .graphifyignore && grep -qxF '.agents/' .graphifyignore && grep -qxF '*.md' .graphifyignore && grep -qxF 'graphify-out/' .graphifyignore"

  - id: GRAPH-02
    title: Diretriz "Graphify antes de Grep/Glob" no AGENTS.md
    when: "! grep -q 'Graphify Antes de Grep' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md o bloco "## graphify (Knowledge Graph Obrigatório)" da seção 7.1 deste guia
      (4 diretrizes: Graphify Antes de Grep/Glob, Subagent Dispatch, Uso Proativo, Recálculo Estrutural), sem remover
      conteúdo existente. Se AGENTS.md não existir, aplique antes o guia harness-commit-memoria.
    verify: "grep -q 'Graphify Antes de Grep' AGENTS.md"

  - id: GRAPH-04
    title: Hooks hook-guard do Graphify no .claude/settings.json, no formato canônico do template
    when: "! python3 \"$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py\" --check \"$AI_GUIDES_RUNTIME/templates/settings.claude.json\" .claude/settings.json 2>/dev/null"
    do: |
      python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" "$AI_GUIDES_RUNTIME/templates/settings.claude.json" .claude/settings.json --replace '^(PATH=\S+ )?(\S*/)?graphify hook-guard [a-z]+( --strict)?$|^\(jq -r [^|]*\| grep -E [^&]*&& (PATH=\S+ )?(\S*/)?graphify update \.\) \|\| true$'
    verify: "python3 \"$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py\" --check \"$AI_GUIDES_RUNTIME/templates/settings.claude.json\" .claude/settings.json"

  - id: GRAPH-05
    title: Hooks hook-guard do Graphify no .gemini/settings.json, no formato canônico do template
    when: "! python3 \"$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py\" --check \"$AI_GUIDES_RUNTIME/templates/settings.gemini.json\" .gemini/settings.json 2>/dev/null"
    do: |
      python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" "$AI_GUIDES_RUNTIME/templates/settings.gemini.json" .gemini/settings.json --replace '^(PATH=\S+ )?(\S*/)?graphify hook-guard [a-z]+( --strict)?$|^\(jq -r [^|]*\| grep -E [^&]*&& (PATH=\S+ )?(\S*/)?graphify update \.\) \|\| true$'
    verify: "python3 \"$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py\" --check \"$AI_GUIDES_RUNTIME/templates/settings.gemini.json\" .gemini/settings.json"

  - id: GRAPH-06
    title: Subagente knowledge-graph-curator nos dois harnesses
    when: "! test -f .claude/agents/knowledge-graph-curator.md || ! test -f .gemini/agents/knowledge-graph-curator.md"
    do: |
      mkdir -p .claude/agents .gemini/agents
      for d in .claude .gemini; do test -f "$d/agents/knowledge-graph-curator.md" || cp "$AI_GUIDES_RUNTIME/templates/knowledge-graph-curator.md" "$d/agents/knowledge-graph-curator.md"; done
    verify: "grep -q 'name: knowledge-graph-curator' .claude/agents/knowledge-graph-curator.md && grep -q 'name: knowledge-graph-curator' .gemini/agents/knowledge-graph-curator.md"

  - id: GRAPH-07
    title: Hooks nativos do Git do Graphify (post-commit / post-checkout)
    when: "git rev-parse --git-path hooks >/dev/null 2>&1 && ! grep -q graphify \"$(git rev-parse --git-path hooks)/post-commit\" 2>/dev/null"
    do: "PATH=\"$HOME/.local/bin:$PATH\" graphify hook install"
    verify: "grep -q graphify \"$(git rev-parse --git-path hooks)/post-commit\""
    optional: true

  - id: GRAPH-08
    title: Grafo de conhecimento gerado (graphify-out/graph.json)
    when: "! test -f graphify-out/graph.json"
    do: |
      PATH="$HOME/.local/bin:$PATH" graphify extract . --force --code-only
      PATH="$HOME/.local/bin:$PATH" graphify cluster-only . || true
    verify: "test -s graphify-out/graph.json"
    depends_on: [GRAPH-01]

  - id: GRAPH-09
    title: Graphify funcionando de fato (consulta ao grafo devolve nós reais)
    when: "! sh \"$AI_GUIDES_RUNTIME/templates/graph_smoke.sh\" >/dev/null 2>&1"
    do: |
      PATH="$HOME/.local/bin:$PATH" graphify extract . --force --code-only && PATH="$HOME/.local/bin:$PATH" graphify cluster-only .
      sh "$AI_GUIDES_RUNTIME/templates/graph_smoke.sh"
    verify: "sh \"$AI_GUIDES_RUNTIME/templates/graph_smoke.sh\" >/dev/null 2>&1"
    depends_on: [GRAPH-08]
```

---

## 📚 Fundamentos

### 🧭 1. O Paradoxo da Varredura Textual vs. Navegação Relacional

Em bases de código médias e grandes, o comportamento padrão dos agentes de IA tende a ser ineficiente e propenso a erros:
- **Varredura Cega (`Grep` / `Glob` / `find`)**: Retorna dezenas de ocorrências dispersas em mocks, fixtures, comentários e arquivos de teste, sobrecarregando a janela de contexto.
- **Leitura Excessiva de Arquivos**: O agente lê múltiplos arquivos inteiros apenas para rastrear o fluxo de uma dependência ou identificar quem consome um serviço.
- **Alucinação de Arquitetura**: Sem uma visão topológica estruturada, o agente cria modelos mentais fragmentados, gerando código incompatível com as convenções vigentes.

#### A Solução: Graph Engineering via AST
O Graph Engineering extrai os nós semânticos do código (classes, funções, interfaces, endpoints, schemas) e seus relacionamentos direcionados (`importa`, `chama`, `herda`, `injeta`). O agente passa a consultar primeiro o grafo operacional (`graphify-out/graph.json`), recebendo o subgrafo exato de dependências antes de abrir qualquer arquivo de código-fonte.

---

### 🛠️ 2. A Ferramenta Padrão: Graphify (`graphifyy`)

O **Graphify** é o padrão de referência adotado por sua capacidade de extrair AST localmente sem custo de inferência por LLM:

| Recurso | Detalhes Técnicos |
| :--- | :--- |
| **Pacote CLI** | `graphifyy` (disponível via PyPI: `uv tool install graphifyy` ou `pip install graphifyy`) |
| **Artefatos Gerados** | `graphify-out/graph.json` (grafo para consultas), `graphify-out/graph.html` (visualizador interativo) e `graphify-out/GRAPH_REPORT.md` (relatório de hubs e comunidades) |
| **Compatibilidade** | Universal: Python, TypeScript, JavaScript, Go, Rust, Java, PHP, C# e outros |
| **Integração com Agentes** | Skill nativa `/graphify`, hook-guards de interceptação e comandos CLI diretos |

---

### 🛡️ 3. As Duas Regras de Ouro do Graph Engineering

Para que o Grafo de Conhecimento permaneça determinístico, rápido e sem ruído, duas regras operacionais são estritamente obrigatórias:

#### 🚫 Regra de Ouro 1: `docs/` NUNCA Deve Fazer Parte do Grafo
Arquivos de documentação técnica, especificações de design, chats de IA e planos voláteis contêm texto livre, exemplos hipotéticos e termos soltos. Indexar pastas de documentação:
- Cria centenas de **nós fantasmas** e relacionamentos inexistentes na AST de código.
- Confunde os agentes de IA, induzindo-os a editar documentações obsoletas em vez de código de produção.
- Inflaciona desnecessariamente o tamanho do `graph.json` e o tempo de resposta.

> ⚠️ **Diretriz**: O diretório `docs/` (bem como `docs/ai/`, `.agents/`, `.claude/`, `.gemini/` e arquivos `.md`) deve constar compulsoriamente no `.graphifyignore`. O grafo deve refletir **exclusivamente a topologia do código-fonte produtivo**.

#### 🔄 Regra de Ouro 2: Mudanças Estruturais Demandam Recalcular o Grafo do Zero
O comando `graphify update .` realiza atualizações **estritamente incrementais** em arquivos modificados pontualmente. No entanto:
- Quando módulos são renomeados, fatias verticais são criadas/deletadas ou regras do `.graphifyignore` são alteradas, a topologia geral é rompida.
- Executar apenas `update` mantém arestas órfãs e conexões obsoletas no arquivo `graph.json`.

> 🚨 **Diretriz de Recálculo**: Sempre que houver refatorações arquiteturais, movimentações de diretórios ou modificações no `.graphifyignore`, é **compulsório recalcular o grafo do zero**, purificando a base com o comando:
> ```bash
> graphify extract . --force --code-only
> graphify cluster-only .  # (Opcional: re-clusteriza métricas do relatório)
> ```

---

### ⚙️ 4. Configuração Canônica do `.graphifyignore`

Crie ou atualize o arquivo `.graphifyignore` na raiz do projeto com os filtros canônicos de exclusão:

```gitignore
# Documentação Técnica e Artefatos de IA (Regra de Ouro 1)
docs/
docs/ai/
.agents/
.claude/
.gemini/
.superpowers/
*.md

# Ambientes Virtuais e Gerenciadores de Pacotes
.venv/
venv/
node_modules/
vendor/

# Artefatos de Build, Compilação e Bytecode
__pycache__/
*.pyc
dist/
build/
*.egg-info/
.angular/
.next/
.nuxt/
target/

# Caches e Relatórios de Teste
.pytest_cache/
.ruff_cache/
.coverage
coverage/
htmlcov/
graphify-out/

# Controle de Versão e Worktrees
.git/
.worktrees/
.trunk/
```

---

### 🚀 5. Setup e Comandos Operacionais

#### 5.1 Instalação e Configuração da CLI

O **Graphify deve ser configurado compulsoriamente com o `uv`** (`uv tool install graphifyy`), a menos que o usuário declare expressamente que não deseja utilizar o `uv`. O `uv` garante isolamento hermético de dependências, execução ultrarrápida e atualização limpa sem poluir o ambiente Python global.

##### Passo 1: Verificação e Instalação Prévia do `uv`

Caso o `uv` **não esteja presente na máquina do usuário**, ele deve ser instalado e configurado **primeiro**:

```bash
# 1. Verificar se o uv já está instalado:
command -v uv
```

Se o comando não retornar o caminho do binário, instale o `uv`:

- **macOS e Linux (Recomendado via instalador oficial da Astral):**
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # Recarregue o ambiente do shell para disponibilizar o comando uv:
  source $HOME/.cargo/env 2>/dev/null || source $HOME/.local/bin/env 2>/dev/null || exec $SHELL
  ```
  *(Alternativa no macOS via Homebrew: `brew install uv`)*

- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```

Confirme que o `uv` está operacional:
```bash
uv --version
```

##### Passo 2: Instalação do Graphify via `uv tool` (Padrão Canônico)

Com o `uv` disponível na máquina:

```bash
# Instala a CLI do Graphify em ambiente isolado global:
uv tool install graphifyy

# Para atualizar futuramente para a versão mais recente:
uv tool upgrade graphifyy
```

##### Exceção: Usuário que Opta Expressamente por Não Usar `uv`

Apenas caso o usuário declare de forma explícita que prefere não utilizar o `uv`, configure o Graphify via `pip` tradicional (recomenda-se ambiente virtual ativo ou flag `--user`):

```bash
pip install graphifyy
# ou:
pip install --user graphifyy
```

#### 5.2 Geração Inicial ou Recálculo Forçado do Grafo
Na raiz do repositório, gere a topologia completa limpa:
```bash
graphify extract . --force --code-only
```

Os seguintes arquivos serão consolidados em `graphify-out/`:
- `graphify-out/graph.json`: O grafo de conhecimento estruturado consultável pelos agentes.
- `graphify-out/graph.html`: Visualizador web interativo para exploração humana.
- `graphify-out/GRAPH_REPORT.md`: Relatório executivo com hubs, comunidades e pontos críticos de acoplamento.

---

### 💬 6. Comandos Essenciais de Consulta

Durante a interação com o assistente de IA ou via terminal:

| Comando | Finalidade Técnica | Exemplo de Invocação |
| :--- | :--- | :--- |
| `graphify query "<pergunta>"` | Retorna o subgrafo relevante focado na pergunta solicitada. | `graphify query "como funciona o fluxo de autenticação e geração de JWT?"` |
| `graphify path "<A>" "<B>"` | Mapeia o caminho determinístico de chamadas e dependências entre dois nós. | `graphify path "src/api/auth.py" "src/services/token_service.py"` |
| `graphify explain "<conceito>"` | Fornece análise focada de responsabilidades e acoplamento de uma entidade. | `graphify explain "UnitOfWork"` |
| `graphify update .` | Atualização incremental silenciosa após edições pontuais de código. | `graphify update .` |
| `graphify extract . --force --code-only` | **Recálculo total do zero** após mudanças estruturais de arquitetura. | `graphify extract . --force --code-only` |

---

### 🤖 7. Configuração nos Assistentes de IA (Dual-Harness)

#### 7.1 Diretriz no Arquivo de Instrução (`AGENTS.md`)
Adicione o seguinte bloco de regras para impor o uso disciplinado do grafo:

```markdown
## graphify (Knowledge Graph Obrigatório)

Este repositório mantém um Grafo de Conhecimento atualizado em `graphify-out/graph.json`.

Diretrizes Compulsorias para Agentes:
1. **Graphify Antes de Grep/Glob**: Você DEVE OBRIGATORIAMENTE executar consultas estruturadas ao grafo (`graphify query "<pergunta>"`, `graphify path "<A>" "<B>"` ou `graphify explain "<conceito>"`) ANTES de utilizar ferramentas de busca textual ou varreduras de arquivos (`Grep`, `Glob`, `search_file_content`).
2. **Subagent Dispatch Directive**: Ao despachar qualquer subagente para investigação, refatoração ou exploração, injete obrigatoriamente a diretiva de consultar o Graphify como primeira ação de contexto.
3. **Uso Proativo**: Não aguarde solicitações do usuário; consulte o grafo autonomamente para planejar modificações.
4. **Recálculo Estrutural**: Edições pontuais disparam `graphify update .`. Refatorações estruturais ou alterações no `.graphifyignore` exigem `graphify extract . --force --code-only`.
```

#### 7.2 Interceptação Determinística via Hooks

##### Claude Code (`.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Grep",
        "hooks": [
          {
            "type": "command",
            "command": "graphify hook-guard search"
          }
        ]
      },
      {
        "matcher": "Read|Glob",
        "hooks": [
          {
            "type": "command",
            "command": "graphify hook-guard read"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "FILE=$(jq -r \".tool_response.filePath // .tool_input.file_path\"); if echo \"$FILE\" | grep -q \"\\.graphifyignore$\"; then graphify extract . --force --code-only; elif echo \"$FILE\" | grep -qE \"\\.(py|ts|js|go|rs|java|php|cs)$\"; then graphify update .; fi || true",
            "statusMessage": "Atualizando Grafo de Conhecimento com Graphify..."
          }
        ]
      }
    ]
  }
}
```

##### Gemini CLI (`.gemini/settings.json`):
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "read_file|list_directory|search_file_content|grep_search|run_shell_command",
        "hooks": [
          {
            "type": "command",
            "command": "graphify hook-guard gemini"
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "write_file|edit_file",
        "hooks": [
          {
            "type": "command",
            "command": "(jq -r \".tool_response.filePath // .tool_input.file_path\" | grep -E \"\\.(py|ts|js|go|rs|java|php|cs)$\" && graphify update .) || true",
            "statusMessage": "Atualizando Grafo de Conhecimento com Graphify..."
          }
        ]
      }
    ]
  }
}
```

---

### 🗄️ 8. Subagente de Curadoria (`knowledge-graph-curator`)

Para auditorias periódicas ou após grandes releases, configure o subagente em `.claude/agents/knowledge-graph-curator.md` e `.gemini/agents/knowledge-graph-curator.md`:

```markdown
---
name: knowledge-graph-curator
description: Audita e reconstrói o grafo de conhecimento do repositório via Graphify após refatorações estruturais.
---

# Knowledge Graph Curator

Você é o auditor e curador do Grafo de Conhecimento (`graphify-out/`).

## Responsabilidades
1. Inspecionar o arquivo `.graphifyignore` garantindo que `docs/`, `docs/ai/`, caches e artefatos de IA não sejam indexados.
2. Executar o recálculo forçado do grafo após refatorações:
   ```bash
   graphify extract . --force --code-only
   graphify cluster-only .
   ```
3. Verificar a integridade dos artefatos `graph.json`, `graph.html` e `GRAPH_REPORT.md`.
```

---

### 🔗 9. Versionamento e Automação no Git

Instale os hooks nativos do Git para manter o grafo sincronizado entre membros do time:

```bash
graphify hook install
```

O comando registra:
- `.git/hooks/post-commit`: Atualização incremental automática após cada commit.
- `.git/hooks/post-checkout`: Re-indexação rápida ao alternar branches.
- `merge driver`: Resolução determinística de conflitos para o `graphify-out/graph.json`.

#### Política de Versionamento no Git:
- **Ignorar no `.gitignore`**: `graphify-out/` (a pasta `graphify-out` inteira deve ser **completamente ignorada** no Git; o grafo é gerado e atualizado localmente pelo agente ou desenvolvedor, eliminando ruídos de diff e conflitos de merge de artefatos volumosos gerados).
- **Versionar no repositório (`git add`)**: `.graphifyignore` (garante que todos os membros do time e agentes apliquem rigorosamente os mesmos filtros de exclusão de código e documentação).

Ao clonar o projeto pela primeira vez ou realizar mudanças estruturais, o desenvolvedor ou agente gera a topologia localmente de forma limpa e determinística com `graphify extract . --force --code-only`.
