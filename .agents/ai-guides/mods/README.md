# 🧩 Claude Code Mods: O Guia Definitivo e Prático

> **Referência Oficial & Catálogo Prático de Mods para Claude Code (2.1.287+)**  
> Aprenda o que são mods, por que transformam o fluxo de trabalho, os 8 principais mods essenciais para o seu dia a dia e como criar o seu próprio mod do zero.

---

## 📑 Sumário

1. [O que são Claude Code Mods?](#-o-que-são-claude-code-mods)
2. [A Tríade de Extensibilidade: Skill vs Connector vs Mod](#-a-tríade-de-extensibilidade-skill-vs-connector-vs-mod)
3. [Onde os Mods Funcionam (Compatibilidade)](#-onde-os-mods-funcionam-compatibilidade)
4. [Por que Usar Mods?](#-por-que-usar-mods)
5. [Segurança & Permissões (Crítico)](#-segurança--permissões-crítico)
6. [Como Funciona a Instalação de Mods](#-como-funciona-a-instalação-de-mods)
7. [Os 8 Mods Essenciais (Análise Aprofundada)](#-os-8-mods-essenciais-análise-aprofundada)
   - [01. Cache Tax](#01-cache-tax)
   - [02. Blast Radius](#02-blast-radius)
   - [03. Reflect](#03-reflect)
   - [04. Terminal Browser](#04-terminal-browser)
   - [05. Replay Theater](#05-replay-theater)
   - [06. You Should Know (Built-in)](#06-you-should-know-built-in)
   - [07. Savvy Progress](#07-savvy-progress)
   - [08. Next Steps](#08-next-steps)
8. [Como Criar o Seu Próprio Mod (Guia Passo a Passo)](#-como-criar-o-seu-próprio-mod-guia-passo-a-passo)
   - [Anatomia Canônica de um Mod](#anatomia-canônica-de-um-mod)
   - [Ciclo de Vida e Event Hooks](#ciclo-de-vida-e-event-hooks)
   - [Renderização de UI: Bands e Side Panels](#renderização-de-ui-bands-e-side-panels)
   - [Testando em Tempo de Execução](#testando-em-tempo-de-execução)
   - [Instalação Permanente](#instalação-permanente)
9. [Prompt Mestre para Construção de Novos Mods com IA](#-prompt-mestre-para-construção-de-novos-mods-com-ia)
10. [Estrutura deste Diretório (`mods/`)](#-estrutura-deste-diretório-mods)

---

## 💡 O que são Claude Code Mods?

Lançados oficialmente pela Anthropic em **1º de Outubro de 2026** (a partir do **Claude Code 2.1.287**), os **Mods** são extensões de primeira classe que executam **dentro do próprio processo e ciclo de vida do Claude Code**.

Diferente de um script isolado ou de uma instrução de texto, um Mod possui acesso à interface do terminal (TUI) e aos canais de telemetria internos do assistente. Ele pode:
- **Injetar elementos visuais na tela:** barras de status e avisos imediatamente acima da caixa de digitação (*bands*), painéis laterais de navegação (*side panels*), botões interativos e badges coloridos.
- **Interceptar o ciclo de vida:** pausar comandos destrutivos antes que ocorram, inspecionar o estado do cache de tokens, capturar correções feitas pelo usuário e acoplar comandos de barra customizados (slash commands).
- **Controlar o fluxo de execução:** impedir chamadas excessivas, exigir confirmação manual com base em impacto e renderizar diffs interativos.

Se você está com o Claude Code atualizado (versão 2.1.287 ou superior), **o suporte a mods já vem ativado de fábrica**. Não é necessária nenhuma flag obscura de configuração.

---

## ⚖️ A Tríade de Extensibilidade: Skill vs Connector vs Mod

Para entender onde os Mods se encaixam, compare os três conceitos fundamentais do ecossistema:

| Conceito | O que é | Onde atua | O que altera |
| :--- | :--- | :--- | :--- |
| **Skill** | Conjunto de regras, instruções em markdown (`SKILL.md`) e scripts de apoio que ensinam um fluxo de trabalho. | **Fora** (Camada de Conhecimento) | Ensina *o que* e *como* o Claude deve raciocinar sobre um assunto específico. |
| **Connector** | Pontes de integração (geralmente via MCP ou APIs) que ligam o Claude a serviços externos (bancos de dados, GitHub, Slack, Firebase). | **Fora** (Camada de I/O) | Dá ao Claude novas ferramentas e fontes de dados externas. |
| **Mod** | Extensão de software executada nativamente pelo runtime do Claude Code. | **Dentro** (Runtime Interno & TUI) | **Muda o que você vê na tela** (layout, cores, botões, painéis) e **como o Claude se comporta** durante o turno. |

---

## 🖥️ Onde os Mods Funcionam (Compatibilidade)

Nem todos os ambientes desenham elementos de interface do mesmo jeito. O suporte oficial atual é dividido em:

| Ambiente | Suporte de UI (TUI / Bands) | Suporte de Lógica (Hooks de Fundo) |
| :--- | :---: | :---: |
| **Terminal Claude Code** (macOS, Linux, Git Bash/WSL) | ✅ Total | ✅ Total |
| **Claude Desktop App** (Aba "Code") | ✅ Suportado | ✅ Total |
| **Extensão VS Code** | ❌ Não desenha UI | ⚠️ Apenas hooks em segundo plano |
| **Chat Web Tradicional** (claude.ai) | ❌ Não suportado | ❌ Não suportado |
| **Sessões Cloud Remotas puras** | ❌ Não suportado | ⚠️ Depende do cliente |

> 💡 **Recomendação de Terminal:** Para mods com painéis laterais (*Filetree*, *Blast Radius*, *Savvy Progress*), utilize uma janela de terminal com pelo menos **110 a 144 colunas** de largura e suporte a UTF-8.

---

## 🚀 Por que Usar Mods?

A utilização de mods eleva o Claude Code de uma CLI convencional para uma verdadeira estação de trabalho de engenharia:

1. **Visibilidade Operacional & Fim da "Caixa-Preta":**
   Em tarefas complexas com subagentes múltiplos, os mods mostram exatamente qual modelo está executando cada sub-tarefa, a porcentagem de conclusão e a telemetria ao vivo.
2. **Governança de Custos Direta na Tela:**
   Saber quando uma sessão esfriou no cache de prompt evita desperdício substancial de tokens em chats extensos.
3. **Prevenção Real de Acidentes (Blast Radius Control):**
   Comandos arriscados (`rm -rf`, `git push --force`, deleções em lote) são interceptados antes do clique, exibindo a lista precisa de arquivos que seriam impactados.
4. **Ergonomia e Conforto Visual:**
   Sessões de 6 a 8 horas exigem diffs legíveis, temas contrastantes e ferramentas integradas (como navegador interno lado a lado) sem quebrar o foco trocando de janelas.
5. **Memória Contínua Automática:**
   Captura de correções em tempo real sem a necessidade de reescrever manualmente o `CLAUDE.md` a cada preferência de framework ou convenção de equipe.

---

## 🔒 Segurança, Permissões & Scanner de Footprint (Crítico)

> [!CAUTION]
> **ATENÇÃO: Mods NÃO rodam em ambiente isolado (sem sandbox)!**  
> Um mod executa no seu computador com os **mesmos privilégios de usuário** que o seu terminal possui.

Isso significa que um mod malicioso ou mal projetado pode:
- Ler e escrever qualquer arquivo que seu usuário tenha acesso.
- Iniciar processos no sistema operacional.
- Realizar requisições de rede.
- Inspecionar seus prompts, variáveis de ambiente e retornos de ferramentas.

### Boas Práticas e Auditoria de Footprint:
1. **Auditoria de Footprint:**
   Antes de instalar qualquer mod comunitário do catálogo [awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods) ou do portal [mods.aidojo.si](https://mods.aidojo.si/), verifique a matriz de pegada operacional (*Footprint Scanner*):
   - **`read`**: Quais caminhos do disco o mod lê.
   - **`write`**: Onde ele grava dados ou logs.
   - **`run`**: Quais comandos ou binários do sistema ele executa.
   - **`network`**: Se ele abre conexões externas ou webhooks.
2. **Valide qualquer mod antes de rodar:**
   ```bash
   claude plugin validate ./caminho-do-mod
   ```
   Esse comando analisa os arquivos `plugin.json` e `hooks/hooks.json`, verificando a sintaxe, os eventos do ciclo de vida e garantindo que não haja componentes mal posicionados.
3. **Inspecione hooks ativos durante a sessão:**
   Digite `/hooks` dentro do terminal para ver a lista completa de todos os hooks atualmente registrados e seus respectivos gatilhos.

---

## 📦 Como Funciona a Instalação e Execução de Mods

Existem três formas equivalentes de instalar mods no Claude Code e no OpenClaude:

### Opção A: Dentro do Chat Box (Dual Trigger: `/` ou `$`)
Os comandos de mods podem ser chamados com a barra tradicional ou com o prefixo dedicado de mods `$`:

```text
# Passo 1: Adicionar o repositório/marketplace
/plugin marketplace add proprietario/repositorio

# Passo 2: Instalar o mod desejado
/plugin install nome-do-mod@marketplace

# Passo 3: Recarregar plugins na sessão atual (ou abrir uma nova)
/reload-plugins

# Passo 4: Executar comandos do mod
/replay          # Chamada tradicional
$replay          # Chamada direta com prefixo de Mod no OpenClaude
```

### Opção B: Pelo Terminal do Sistema (Fora do Chat)
```bash
claude plugin marketplace add proprietario/repositorio
claude plugin install nome-do-mod@marketplace
```

### Opção C: Teste Temporário (Apenas para a sessão atual)
Ideal para inspecionar ou desenvolver um mod local sem registrá-lo no sistema operacional:
```bash
claude --plugin-dir ./pasta-do-mod
# ou no OpenClaude:
openclaude --plugin-dir ./pasta-do-mod
```
Ao fechar o assistente, o mod não será carregado na próxima sessão.

---

## 🌐 Recursos Oficiais & Catálogos Comunitários

- **Blog Oficial da Anthropic:** [Getting started with Claude Code mods (claude.dev)](https://claude.dev/blog/getting-started-with-claude-code-mods/)
- **Catálogo Comunitário no GitHub:** [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods)
- **Portal & Explorador Visual de Permissões:** [mods.aidojo.si](https://mods.aidojo.si/)

---

## 🌟 Os 8 Mods Essenciais (Análise Aprofundada)

Abaixo estão detalhados os 8 mods selecionados com suas características, comandos e instruções práticas:

---

### 01. Cache Tax
*Guardião de Custos e Alerta de Cache Cold*

- **O que faz:** Monitora o ciclo de vida do cache de contexto do Anthropic. Em assinaturas normais, o cache de prompt costuma expirar após cerca de 1 hora de inatividade (ou 5 minutos com chaves de API cruas). O Cache Tax **pausa sua próxima mensagem** se o cache tiver expirado, exibindo uma estimativa monetária de quanto custará reenviar todo o histórico antes de você autorizar.
- **Por que importa:** Em sessões longas com muitos arquivos analisados, uma única mensagem enviada com cache frio pode custar dólares extras desnecessários.
- **Recurso Keep-Warm:** Possui um comando para manter o cache aquecido com pings de baixo custo caso você precise sair para almoçar ou fazer uma pausa.
- **Comandos Úteis:**
  - `/keepwarm 90m` — Mantém a sessão aquecida pelos próximos 90 minutos.
  - `/keepwarm off` — Desativa o modo keep-warm imediatamente.
- **Instalação:**
  ```bash
  claude plugin marketplace add karanb192/claude-code-mods
  claude plugin install cache-tax@claude-code-mods
  ```
- **Fonte Oficial:** [karanb192/cache-tax](https://github.com/karanb192/cache-tax)
- **Exemplo neste repositório:** Veja [`mods/cache-tax/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/cache-tax/README.md).

---

### 02. Blast Radius
*Escudo de Segurança Pré-Execução de Comandos Críticos*

- **O que faz:** Criado pela própria equipe da Anthropic como mod de referência. Intercepta comandos potencialmente perigosos ou destrutivos (como `rm -rf`, `git push --force`, deleção em lote, remoções de branches) e renderiza em um painel lateral a lista exata dos arquivos e pastas que serão excluídos, com botões de **Proceed** (Confirmar) e **Cancel** (Cancelar).
- **Por que importa:** Evita a perda acidental de horas de trabalho e arquivos não versionados em decorrência de alucinações ou caminhos relativos mal interpretados.
- **Ergonomia de Teclado:** O foco padrão ao abrir o aviso fica posicionado no botão **Cancel**, de forma que pressionar `Enter` por reflexo cancela a ação de forma segura.
- **Instalação (Teste Local):**
  ```bash
  git clone https://github.com/anthropics/claude-code-playground.git
  claude --plugin-dir ./claude-code-playground/claude-code/mods/blast-radius
  ```
- **Instalação Permanente:**
  ```bash
  cd claude-code-playground/claude-code/mods
  claude plugin marketplace add ./
  claude plugin install blast-radius@claude-code-playground-mods --scope user
  ```
- **Requisitos de Sistema:** Requer `bash`, `git`, `find` e `du`. No Windows, deve ser executado via Git Bash.
- **Exemplo neste repositório:** Veja [`mods/blast-radius/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/blast-radius/README.md).

---

### 03. Reflect
*Aprendizado Contínuo e Persistência Automática de Regras*

- **O que faz:** Monitora o diálogo entre você e o Claude. Sempre que você faz uma correção técnica direta (ex: *"não use npm neste projeto, usamos apenas pnpm"* ou *"nunca use any no TypeScript"*), o Reflect faz uma mini-análise com Claude Haiku e exibe uma banda acima do prompt com a regra extraída e opções:
  - **Save:** Grava no `CLAUDE.md` do repositório atual.
  - **Global:** Grava nas configurações globais do usuário.
  - **Edit:** Permite ajustar o texto da regra antes de salvar.
  - **Skip:** Descarta a sugestão.
- **Por que importa:** Elimina a frustração de ter que corrigir os mesmos hábitos e convenções repetidas vezes a cada nova sessão.
- **Instalação:**
  ```bash
  claude plugin marketplace add bayramannakov/claude-reflect
  claude plugin install reflect-mod@claude-reflect-marketplace
  ```
- **Fonte Oficial:** [BayramAnnakov/claude-reflect](https://github.com/BayramAnnakov/claude-reflect)
- **Exemplo neste repositório:** Veja [`mods/reflect/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/reflect/README.md).

---

### 04. Terminal Browser
*Navegador Web Completo Integrado ao Terminal Lado a Lado*

- **O que faz:** Abre um navegador web de verdade em um painel lateral adjacente ao chat do Claude Code no terminal. Permite visualizar e inspecionar páginas web criadas pelo Claude, testar interfaces locais e inspecionar Pull Requests do GitHub sem sair da CLI.
- **Por que importa:** Elimina a constante troca de janelas (Alt+Tab/Cmd+Tab) entre o editor/terminal e o Chrome/Safari para validar mudanças no frontend.
- **Comandos Úteis:**
  - `/browser` — Abre a interface do navegador no painel lateral.
  - `/browser https://localhost:3000` — Navega diretamente para um endereço.
- **Instalação (macOS / Linux):**
  ```bash
  # Instalar o binário do terminal-browser
  brew install terminal-browser
  # ou via script oficial: curl -fsSL https://terminal-browser.sh/install | bash

  # Instalar o mod no Claude Code
  claude plugin marketplace add zenbu-labs/terminal-browser
  claude plugin install terminal-browser@terminal-browser
  ```
- **Requisitos de Sistema:** macOS ou Linux rodando em emuladores de terminal modernos com suporte a Kitty Graphics Protocol (ex: Kitty, WezTerm, Ghostty). Não compatível com Windows ou com o app desktop.
- **Exemplo neste repositório:** Veja [`mods/terminal-browser/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/terminal-browser/README.md).

---

### 05. Replay Theater
*Auditor Passo a Passo de Diffs e Modificações de Arquivo*

- **O que faz:** Desenvolvido pela Anthropic como mod de referência. Ao final de qualquer turno em que o Claude realiza edições de código, surge um indicador visual. Ao digitar `/replay` (ou pressionar a tecla de atalho `r`), abre-se uma tela interativa que permite navegar arquivo por arquivo, diff por diff, revisando cada linha adicionada (em verde) e removida (em vermelho) com controles de `Next`, `Prev` e `Close`.
- **Por que importa:** Evita a necessidade de confiar cegamente em resumos de texto gerados pela IA ou de rodar `git diff` manual toda vez que múltiplos arquivos são modificados de uma só vez.
- **Instalação (Teste Local):**
  ```bash
  claude --plugin-dir ./claude-code-playground/claude-code/mods/replay-theater
  ```
- **Caveat Importante:** O Replay Theater registra apenas edições realizadas pelas ferramentas nativas de edição do Claude (`Edit`, `Write`, `MultiEdit`). Modificações feitas via comandos indiretos no terminal (ex: scripts bash, `sed`, etc.) não entram no histórico de diffs do mod.
- **Exemplo neste repositório:** Veja [`mods/replay-theater/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/replay-theater/README.md).

---

### 06. You Should Know (Built-in)
*Auditor Inteligente em Segundo Plano para Riscos Ocultos*

- **O que faz:** Mod oficial embutido no próprio Claude Code pela Anthropic. Roda um agente observador em segundo plano que analisa silenciosamente as respostas e propostas de código geradas pelo Claude principal. Se o código introduzir um efeito colateral grave que possa passar despercebido (ex: adicionar retentativas automáticas em uma API financeira de cobrança que poderia duplicar cobranças no cartão), uma notificação em destaque surge acima do prompt.
- **Ações Disponíveis na Notificação:**
  - `Learn more` — Explica em detalhes o risco técnico associado.
  - `Knew this already` — Informa ao agente que você já considerou a restrição.
  - `Dismiss` — Fecha o alerta.
- **Instalação / Ativação:**
  Este mod já vem pré-instalado em todas as cópias do Claude Code. Para ativá-lo, basta digitar dentro do Claude Code:
  ```text
  /plugin enable cc-plugin-you-should-know@builtin
  ```
- **Consumo de Recursos:** Como roda um agente leve em segundo plano, utiliza uma fração pequena de tokens adicionais do seu plano. Permanece silencioso a maior parte do tempo, manifestando-se apenas quando detecta riscos reais.
- **Exemplo neste repositório:** Veja [`mods/you-should-know/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/you-should-know/README.md).

---

### 07. Savvy Progress
*Telemetria ao Vivo de Subagentes e Monitoramento de Custos*

- **O que faz:** Adiciona uma barra de progresso em tempo real acima da área de prompt e um painel expansível com `/agents-info`. Sempre que uma tarefa é distribuída entre múltiplos subagentes (helpers), o painel lista cada agente em execução, o modelo utilizado (Haiku, Sonnet, Opus), o progresso percentual estimado, a ocupação de contexto e o custo financeiro aproximado da operação.
- **Por que importa:** Transforma o trabalho assíncrono de subagentes — que normalmente é uma caixa-preta enquanto você aguarda — em um dashboard observável e transparente.
- **Comandos Úteis:**
  - `/agents-info` — Abre ou fecha o painel detalhado de telemetria de subagentes.
- **Instalação:**
  ```bash
  /plugin marketplace add johnnyvizz/claude-kit
  /plugin install savvy-progress@claude-kit
  ```
- **Fonte Oficial:** [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress)
- **Exemplo neste repositório:** Veja [`mods/savvy-progress/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/savvy-progress/README.md).

---

### 08. Next Steps
*Sugestão Preditiva de Próximos Prompts e Comandos Contextuais*

- **O que faz:** Ao final de cada turno (`turn.complete`), sugere até três próximos passos ou comandos contextuais diretamente acima da barra de digitação. Pressionar `1`, `2` ou `3` insere a opção selecionada no prompt como rascunho para você revisar; `Tab` aceita o *ghost text* translúcido da primeira sugestão; `0` descarta.
- **Por que importa:** Acelera a cadência de desenvolvimento eliminando digitação repetitiva de comandos óbvios do fluxo (como rodar testes, code-review ou commits).
- **Comandos Úteis:**
  - `/next-steps` — Exibe e gerencia as sugestões preditivas ativas para a sessão.
- **Instalação:**
  ```bash
  /plugin marketplace add anthropics/claude-plugins-community
  /plugin install next-steps@claude-community
  ```
- **Fonte Oficial:** [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps)
- **Exemplo neste repositório:** Veja [`mods/next-steps/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/next-steps/README.md).

---

## 🛠️ Como Criar o Seu Próprio Mod (Guia Passo a Passo)

Construir um mod pronto para produção exige entender como o runtime do **Claude Code** e do **OpenClaude** executam extensões com isolamento de processos, alta performance e segurança.

---

### Anatomia Canônica de Alta Performance (Arquitetura Híbrida)

Para garantir **100% de compatibilidade** tanto com o ecossistema oficial do Claude Code quanto com o OpenClaude (e ferramentas de validação automatizadas como `claude plugin validate`), utilizamos uma estrutura híbrida com manifestos sincronizados:

```text
meu-novo-mod/
├── plugin.json         # Manifesto oficial validado pelo PluginManifestSchema do Claude Code/OpenClaude
├── mod.json            # Manifesto conceitual com declaração de UI bands e sidePanels
├── bin/
│   ├── hook-handler.js # Script executável que lê stdin (JSON) e responde com decisão estruturada
│   └── cli-panel.js    # Visualizador de dados ou TUI no terminal
├── commands/
│   └── meu-comando.md  # Slash command nativo (/meu-comando) com frontmatter
└── README.md           # Documentação de uso, atalhos e instalação
```

#### 1. O Manifesto Oficial (`plugin.json`)

O arquivo `plugin.json` declara hooks formais e comandos de barra reconhecidos diretamente pelo CLI:

```json
{
  "name": "meu-novo-mod",
  "version": "1.2.0",
  "description": "Exibe informações personalizadas e monitora comandos.",
  "author": {
    "name": "Seu Nome"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ./bin/hook-handler.js",
            "statusMessage": "Auditando comando preventivamente...",
            "if": "Bash(*)"
          }
        ]
      }
    ]
  },
  "commands": [
    "./commands/meu-comando.md"
  ]
}
```

---

### Protocolo Real de Comunicação de Hooks (Stdin / Stdout JSON)

Ao interceptar eventos como `PreToolUse`, `PostToolUse` ou `UserPromptSubmit`, o assistente inicia o script em um subprocesso limpo e seguro:

1. **Entrada (Stdin):** Recebe um payload JSON contendo:
   - `tool_name`: Ferramenta invocada (`"Bash"`, `"Write"`, `"Edit"`, etc.).
   - `tool_input`: Argumentos fornecidos pelo modelo (ex: `{"command": "rm -rf dist"}`).
   - `hook_event_name`: Nome do ciclo de vida (`"PreToolUse"`, `"PostToolUse"`, etc.).
   - `session_id`: Identificador da sessão atual.

2. **Saída (Stdout):** O script responde no stdout conforme a governança de hooks:
   - **Sem Risco / Operação Segura (Padrão Recomendado):**  
     Sair com **Exit Code 0** sem nenhum stdout (saída vazia). Isso garante que as permissões nativas e prompts do usuário não sejam ignorados nem bypassados.
   - **Para Bloquear com Confirmação Interativa (Permission Prompt):**  
     ```json
     {
       "reason": "Alerta de segurança formatado",
       "hookSpecificOutput": {
         "hookEventName": "PreToolUse",
         "permissionDecision": "ask"
       }
     }
     ```
   - **Para Bloqueio Imediato (Erro Crítico):**  
     Sair com **Exit Code 2** emitindo a justificativa no `stderr`.

3. **Persistência de Estado:** Como cada hook executa em um processo isolado, dados entre turnos devem ser salvos de forma atômica no diretório local `.cache/` do projeto (ou em `os.tmpdir()` prefixado com hash do diretório do projeto para evitar colisão entre repositórios).

---

### Exemplo de Script de Hook de Produção (`bin/hook-handler.js`)

```javascript
#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

async function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((res) => {
    let data = '';
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        res(data.trim());
      }
    };
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    const timer = setTimeout(done, 5000);
    timer.unref?.();
  });
}

async function main() {
  const raw = await readStdin();
  if (raw) {
    try {
      const { tool_name, tool_input } = JSON.parse(raw);
      if (tool_name === 'Bash' && tool_input?.command?.includes('rm -rf')) {
        console.log(JSON.stringify({
          reason: 'Comando destrutivo detectado.',
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask'
          }
        }));
        process.exit(0);
      }
    } catch {}
  }

  // Seguro: sai silenciosamente sem stdout
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
```

---

### Testando em Tempo de Execução

Tanto no **Claude Code** quanto no **OpenClaude**, teste o seu mod imediatamente via `--plugin-dir`:

```bash
# Executa o assistente carregando o mod apenas na sessão atual
claude --plugin-dir ./mods/meu-novo-mod
# Ou no OpenClaude
openclaude --plugin-dir ./mods/meu-novo-mod
```

- Se você modificar o código do mod, basta rodar `/reload-plugins` dentro da sessão ou reiniciar.
- Para validar o esquema sem executar:
  ```bash
  claude plugin validate ./mods/meu-novo-mod
  ```

---

## 🤖 Prompt Mestre para Construção de Novos Mods com IA

Você pode pedir diretamente ao Claude Code (ou a qualquer agente especializado) para criar um novo mod completo. Utilize o template de prompt abaixo ajustando o que estiver entre colchetes:

```markdown
crie um Claude Code mod completo para mim com os seguintes requisitos:
[descreva o que você quer ver na tela ou alterar no comportamento. Por exemplo: "quero que todo arquivo recém-criado pelo Claude gere uma notificação com um botão para abrir no VS Code e uma contagem total de arquivos modificados na sessão acima da caixa de prompt, além de um comando /stats para resumir as mudanças"].

Diretrizes obrigatórias:
- Siga as especificações oficiais de Mods do Claude Code (versão 2.1.287+).
- Crie o arquivo mod.json com os metadados, comandos e hooks necessários.
- Implemente o index.js com manipulação limpa de eventos e renderização TUI ANSI elegante.
- Mantenha o mod focado e seguro: sem chamadas de rede desnecessárias e sem tocar em arquivos fora do escopo.
- Inclua instruções claras de como testar temporariamente via `claude --plugin-dir` e como instalar permanentemente.
```

---

## 📁 Estrutura deste Diretório (`mods/`)

Nesta pasta você encontra implementações de referência e esqueletos práticos prontos para estudo e adaptação:

| Diretório | Descrição do Conteúdo |
| :--- | :--- |
| [`template-starter-mod/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/template-starter-mod/) | **Boilerplate canônico**: Esqueleto inicial pronto para copiar e criar novos mods do zero. |
| [`cache-tax/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/cache-tax/) | Exemplo de hook de cálculo de cache e comando `/keepwarm`. |
| [`blast-radius/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/blast-radius/) | Exemplo de interceptor `PreToolUse` com cálculo e aviso de impacto. |
| [`reflect/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/reflect/) | Exemplo de captura de correções de usuário e persistência em `CLAUDE.md`. |
| [`terminal-browser/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/terminal-browser/) | Integração de comando `/browser` e renderização em split terminal. |
| [`replay-theater/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/replay-theater/) | Exemplo de visualizador passo a passo de diffs recentes no turno. |
| [`you-should-know/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/you-should-know/) | Guia de configuração e ativação do mod built-in oficial da Anthropic. |
| [`savvy-progress/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/savvy-progress/) | Exemplo de telemetria visual e painel de progresso de subagentes. |
| [`next-steps/`](file:///Users/matheus.diniz_1/Documents/GitHub/ai-guides/mods/next-steps/) | Sugestão preditiva de próximos passos/prompts e aceitação via Tab ghost text. |

---

*Documento mantido e auditado conforme os padrões normativos do repositório `ai-guides`.*
