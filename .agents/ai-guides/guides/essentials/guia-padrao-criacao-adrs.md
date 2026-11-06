<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-08-31 | Matheus Diniz  | Criação do Guia Canônico e Genérico de Criação de ADRs
           | (Antigravity)  | (Architecture Decision Records) em guides/essentials/,
           |                | padronizando a criação de decisões em docs/adr/.
2026-09-01 | Matheus Diniz  | v2.0.0 — Expansão abrangente de Governança Arquitetural:
           | (Antigravity)  | Gatilhos para IA, Agentes e LLMs; Matriz Comparativa
           |                | Formal de Trade-offs; Taxonomia de Tags e Metadados;
           |                | Protocolo Bidirecional de Superação (Superseding ADRs);
           |                | Scripts de Automação de Índice (README) e Validador de CI.
2026-09-18 | Eduardo Batista| v2.1.0 — Seção de Heurísticas Executáveis (slug
           |                | padrao-criacao-adrs) consumida pelo /setup; prosa movida para
           |                | Fundamentos; scripts com fonte canônica em templates/adr/.
2026-09-27 | Eduardo Batista| v2.1.1 — Templates legados (template-adr.md) não são ADRs: os
           |                | validadores os ignoram e o ADR-04 proíbe renomeá-los ou apagá-los;
           |                | ADR-02 copia sem sobrescrever e registra TEMPLATE.md no git;
           |                | ADR-03 reinstala só a cópia canônica de versões anteriores
           |                | (validador customizado pelo projeto fica); ADR numerada com
           |                | "template" no nome continua validada.
2026-09-28 | Eduardo Batista| v2.1.2 — ADR-02 só cria docs/adr/TEMPLATE.md quando o projeto não tem
           |                | template próprio (arquivo com "template" no nome que não seja ADR
           |                | numerada): um segundo template quebrava o validador do projeto.
2026-10-01 | Eduardo Batista| v2.2.0 — Diretório canônico passa a ser docs/adrs/ em novas
           |                | instalações; projetos com docs/adr/ seguem nele, sem renomear.
           |                | Scripts resolvem o diretório na raiz do git (docs/adr legado
           |                | prevalece) e ADR-03 reinstala cópias canônicas sem essa resolução.
           |                | ADR-08 pergunta se o projeto com docs/adr/ quer migrar; "manter"
           |                | fica registrado no CLAUDE.md. Bloco de heurísticas na versão 3.
2026-10-14 | Eduardo Batista| AGENTS.md como instrução única: referência ADR-07/ADR-08 passa a ser verificada no AGENTS.md. Bloco na versão 4.
2026-10-29 | Eduardo Batista| v2.3.0 — ADRs legadas com convenção própria congeladas em .agents/scripts/adr/adrs-legadas.txt (ADR-04 pergunta manter × reescrever); índice inclui legadas; ADR-03 atualiza cópias sem a lista. Bloco na versão 5.
================================================================================
-->

# Guia Canônico e Genérico de Criação de ADRs (Architecture Decision Records)

| Metadado | Detalhe |
| :--- | :--- |
| **Versão** | 2.3.0 (SemVer) |
| **Status** | **Ativo / Normativo** |
| **Escopo** | Governança Arquitetural, Engenharia de Software, IA e Compliance |
| **Diretório Canônico de ADRs** | `docs/adrs/` (projetos que já usam `docs/adr/` permanecem nele) |
| **Formato Obrigatório** | `docs/adrs/[NUMERO_4_DIGITOS]-[slug-em-kebab-case].md` |

---

> **Manifesto de Governança Arquitetural:**  
> _"Código-fonte explica o COMO; a arquitetura e as ADRs explicam o PORQUÊ. Decisões não documentadas tornam-se dívida técnica invisível, gerando custos de refatoração, vulnerabilidades de segurança e riscos de não-conformidade jurídica. Uma ADR bem estruturada é o contrato definitivo entre a engenharia, a segurança, a inteligência artificial e os objetivos estratégicos da organização."_

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). `do` é shell ou começa com `agent:`. Os scripts da seção 7 têm fonte canônica em `templates/adr/`.

```yaml heuristics
guide: padrao-criacao-adrs
version: 5
requires: [harness-commit-memoria]
heuristics:
  - id: ADR-01
    title: Diretório de ADRs existe (docs/adrs/ em novas instalações; docs/adr/ existente é mantido)
    when: "! test -d docs/adr && ! test -d docs/adrs"
    do: "mkdir -p docs/adrs"
    verify: "test -d docs/adrs || test -d docs/adr"

  - id: ADR-02
    title: Template canônico de ADR (8 seções) em TEMPLATE.md do diretório de ADRs, registrado no git, quando o projeto ainda não tem template próprio
    when: "D=docs/adr; test -d $D || D=docs/adrs; ! ls $D 2>/dev/null | grep -i template | grep -qvE '^[0-9]{4}-'"
    do: |
      D=docs/adr; test -d $D || D=docs/adrs; cp -n "$AI_GUIDES_RUNTIME/templates/adr/TEMPLATE.md" "$D/TEMPLATE.md"
      if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git add "$D/TEMPLATE.md"; fi
    verify: "D=docs/adr; test -d $D || D=docs/adrs; grep -qF '# ADR [NUMERO_4_DIGITOS]' $D/TEMPLATE.md"
    depends_on: [ADR-01]

  - id: ADR-03
    title: Scripts de índice e validação de ADRs em .agents/scripts/adr/
    when: "! test -f .agents/scripts/adr/validate_adrs.py || ! test -f .agents/scripts/adr/generate_adr_index.py || { grep -q 'fonte: guia-padrao-criacao-adrs.md' .agents/scripts/adr/validate_adrs.py && ! grep -q 'adrs-legadas.txt' .agents/scripts/adr/validate_adrs.py; } || { grep -q 'fonte: guia-padrao-criacao-adrs.md' .agents/scripts/adr/generate_adr_index.py && ! grep -q 'adrs-legadas.txt' .agents/scripts/adr/generate_adr_index.py; }"
    do: |
      mkdir -p .agents/scripts/adr
      for f in generate_adr_index.py validate_adrs.py; do
        d=".agents/scripts/adr/$f"
        if ! test -f "$d" || grep -q 'fonte: guia-padrao-criacao-adrs.md' "$d"; then cp "$AI_GUIDES_RUNTIME/templates/adr/$f" "$d"; fi
      done
    verify: "python3 -m py_compile .agents/scripts/adr/validate_adrs.py .agents/scripts/adr/generate_adr_index.py && for f in .agents/scripts/adr/validate_adrs.py .agents/scripts/adr/generate_adr_index.py; do grep -q 'adrs-legadas.txt' \"$f\" || ! grep -q 'fonte: guia-padrao-criacao-adrs.md' \"$f\" || exit 1; done"

  - id: ADR-04
    title: Todas as ADRs conformes (nome 0000-kebab.md, log de manutenção, título e seção 2), exceto as legadas congeladas
    when: "(test -d docs/adr || test -d docs/adrs) && ! python3 .agents/scripts/adr/validate_adrs.py >/dev/null 2>&1"
    do: |
      agent: Rode python3 .agents/scripts/adr/validate_adrs.py. Se reprovar ADRs que já existiam antes do setup e ainda não há
      .agents/scripts/adr/adrs-legadas.txt, pergunte com AskUserQuestion (single; se o /setup já perguntou, use a resposta dada):
      "Manter as legadas (Recomendado)" · "Reescrever no padrão".
      - Manter as legadas (Recomendado): não edite nem renomeie nenhuma ADR existente; congele-as com
        python3 .agents/scripts/adr/validate_adrs.py --congelar-legadas (grava a lista uma única vez, com as ADRs que hoje
        reprovam; as conformes continuam validadas). As ADRs novas seguem o padrão e continuam a numeração do projeto
        (a última legada é ADR-066: a próxima é 0067-slug.md). Sem AskUserQuestion (headless): mantenha, que não é destrutivo.
      - Reescrever no padrão: corrija cada ADR reportada conforme a seção 5 (anatomia canônica em 8 seções) deste guia:
        renomeie para 0000-slug-kebab.md, adicione o cabeçalho HTML "LOG DE MANUTENÇÃO", o título "# ADR 0000: ..." e a
        seção "## 2. Decisão de Arquitetura". Repita até exit 0.
      Em reexecução (projeto já configurado), ADRs que um setup anterior criou fora do padrão também reprovam e entram no
      congelamento: tudo que reprova no momento da decisão é legado. Reporte na saída final quantas ADRs foram congeladas.
      Com a lista já existente, cada ADR reprovada é nova: corrija-a conforme a seção 5; nunca a acrescente à lista e
      nunca apague nem edite a lista para o validador passar. Repita até exit 0.
      Templates (arquivos com "template" no nome, como template-adr.md) não são ADRs: nunca os renomeie, edite ou apague.
    verify: "python3 .agents/scripts/adr/validate_adrs.py"
    depends_on: [ADR-01, ADR-03]

  - id: ADR-05
    title: Índice README.md do diretório de ADRs gerado
    when: "D=docs/adr; test -d $D || D=docs/adrs; ! test -f $D/README.md"
    do: "python3 .agents/scripts/adr/generate_adr_index.py"
    verify: "D=docs/adr; test -d $D || D=docs/adrs; grep -q 'Architecture Decision Records' $D/README.md"
    depends_on: [ADR-03, ADR-04]

  - id: ADR-06
    title: Workflow de CI validando ADRs (GitHub Actions)
    when: "test -d .github/workflows && ! test -f .github/workflows/adr-lint.yml"
    do: 'cp "$AI_GUIDES_RUNTIME/templates/adr/adr-lint.yml" .github/workflows/adr-lint.yml'
    verify: "test -f .github/workflows/adr-lint.yml"
    depends_on: [ADR-03]
    optional: true

  - id: ADR-07
    title: AGENTS.md referencia o guia de ADRs e os gatilhos arquiteturais
    when: "! grep -q 'guia-padrao-criacao-adrs' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md, na seção de guias normativos, a linha:
      "- **Decisões Arquiteturais (ADRs):** Siga `.agents/ai-guides/guides/essentials/guia-padrao-criacao-adrs.md` para
      qualquer nova decisão ou mudança estrutural (6 gatilhos: dependência, persistência, contrato, segurança, infraestrutura, IA)."
      Se AGENTS.md não existir, aplique antes o guia harness-commit-memoria.
    verify: "grep -q 'guia-padrao-criacao-adrs' AGENTS.md"

  - id: ADR-08
    title: Projeto com docs/adr/ escolheu migrar para docs/adrs/ ou manter (pergunta ao usuário)
    when: "test -d docs/adr && ! test -d docs/adrs && ! grep -qF 'ADRs mantidas em docs/adr/' AGENTS.md 2>/dev/null"
    do: |
      agent: Pergunte ao usuário com AskUserQuestion (single); se o /setup já fez esta pergunta na Fase 3, use a resposta dada:
      "Migrar para docs/adrs/ (Recomendado)" (git mv preserva o histórico; links externos para docs/adr/... quebram) ·
      "Manter docs/adr/".
      - Migrar: rode `git mv docs/adr docs/adrs 2>/dev/null || mv docs/adr docs/adrs` e troque para docs/adrs/ cada
        referência viva que `git grep -n 'docs/adr/' -- ':!.agents/ai-guides'` listar (AGENTS.md, READMEs, links
        entre ADRs, workflows de CI, scripts do projeto). Logs de manutenção, changelogs e relatórios históricos ficam.
      - Manter: acrescente ao AGENTS.md, logo abaixo da linha do ADR-07, a linha
        "- ADRs mantidas em docs/adr/ (o projeto optou por não migrar para docs/adrs/)." — ela encerra a pergunta nas próximas execuções.
    verify: "test -d docs/adrs || grep -qF 'ADRs mantidas em docs/adr/' AGENTS.md 2>/dev/null"
    depends_on: [ADR-07]
    optional: true
```

---

## 📚 Fundamentos

### Sumário Executivo

1. [Visão Geral e Propósito](#1-visão-geral-e-propósito)
2. [Quando Criar uma ADR (Gatilhos Arquiteturais e de IA)](#2-quando-criar-uma-adr-gatilhos-arquiteturais-e-de-ia)
3. [Localização e Convenções de Nomenclatura](#3-localização-e-convenções-de-nomenclatura)
4. [Ciclo de Vida, Estados e Protocolo de Superação](#4-ciclo-de-vida-estados-e-protocolo-de-superação)
5. [Anatomia Canônica em 8 Seções (Passo a Passo)](#5-anatomia-canônica-em-8-seções-passo-a-passo)
   - [5.1 Cabeçalho HTML, Metadados e Taxonomia](#51-cabeçalho-html-metadados-e-taxonomia)
   - [5.2 Contexto e Riscos Mapeados](#52-contexto-e-riscos-mapeados)
   - [5.3 Seção 1: Fundamentação Jurídica & Fontes Normativas](#53-seção-1-fundamentação-jurídica--fontes-normativas-diretas-se-aplicável)
   - [5.4 Seção 2: Decisão de Arquitetura, Trade-offs & Diagramas](#54-seção-2-decisão-de-arquitetura-trade-offs--diagramas)
   - [5.5 Seção 3: Matriz de Implementação Técnica (IN-CODE)](#55-seção-3-matriz-de-implementação-técnica-in-code)
   - [5.6 Seção 4: Matriz de Governança & Ações Institucionais (OFF-CODE)](#56-seção-4-matriz-de-governança--ações-institucionais-off-code-se-aplicável)
   - [5.7 Seção 5: Prazos Legais de Guarda e Políticas de Retenção](#57-seção-5-prazos-legais-de-guarda-e-políticas-de-retenção-se-aplicável)
   - [5.8 Seção 6: Matriz de Conformidade e Mitigação de Riscos](#58-seção-6-matriz-de-conformidade-e-mitigação-de-riscos)
   - [5.9 Seção 7: Consequências e Resultados](#59-seção-7-consequências-e-resultados)
6. [Regras de Ouro e Anti-Padrões](#6-regras-de-ouro-e-anti-padrões)
7. [Automação, Indexação e Validação em CI/CD](#7-automação-indexação-e-validação-em-cicd)
8. [Checklist de Homologação (Definition of Done)](#8-checklist-de-homologação-definition-of-done)
9. [Template Canônico "Copiar e Colar" (Markdown Raw)](#9-template-canônico-copiar-e-colar-markdown-raw)

---

### 1. Visão Geral e Propósito

Um **Architecture Decision Record (ADR)** é um documento curto, formal e estruturado que captura uma decisão arquitetural relevante tomada pela equipe de engenharia, acompanhada de seu contexto, justificativas, matriz de trade-offs, diagramas, impactos de implementação em código (_IN-CODE_), obrigações institucionais complementares (_OFF-CODE_) e consequências assumidas.

Este guia define o padrão metodológico obrigatório para a criação, revisão, evolução e manutenção de todas as ADRs do ecossistema de software.

---

### 2. Quando Criar uma ADR (Gatilhos Arquiteturais e de IA)

Uma ADR **DEVE** ser redigida sempre que uma mudança de arquitetura ou engenharia envolver um ou mais dos seguintes gatilhos:

- **Mudança Estrutural de Comunicação ou Protocolos**: Introdução ou alteração de gateways, mensageria assíncrona, WebSockets, gRPC, padrões REST ou BFF.
- **Modelagem de Dados e Persistência**: Criação ou refatoração profunda de tabelas no banco de dados, migração de esquemas DDL, introdução de estratégias _Append-Only_ ou particionamento de dados.
- **Segurança, Autenticação e Identidade (_Zero-Trust_)**: Políticas de autenticação corporativa, transporte seguro de credenciais, gestão de sessões, criptografia simétrica/assimétrica, controle de acesso baseado em funções (RBAC) ou prevenção a vulnerabilidades (IDOR, Tampering, Injeção).
- **Inteligência Artificial, Modelos LLM e Agentes Autônomos**:
  - Adoção ou troca de provedores de modelos fundacionais (OpenAI, Anthropic, Gemini, modelos locais via Ollama/vLLM).
  - Arquiteturas RAG (_Retrieval-Augmented Generation_), bancos vetoriais (pgvector, Qdrant, Pinecone) e estratégias de *Chunking/Embeddings*.
  - Concessão de permissões executáveis a ferramentas de agentes (_Tool Calling / Function Calling_) e isolamento em sandboxes.
  - Políticas de anonimização e *Context Scrubbing* de dados sensíveis antes do envio a provedores externos de IA.
- **Conformidade Regulatória e Privacidade**: Adequação a normas legais (Leis de Proteção de Dados como LGPD/GDPR, normas trabalhistas, regulamentos fiscais, assinaturas eletrônicas ou auditoria probatória).
- **Resiliência e Engenharia Distribuída**: Implementação de _Circuit Breakers_, controle de concorrência com _Idempotency Keys_, políticas de retentativa com _Jitter_, filas de mensagens mortas (_Dead Letter Queues - DLQ_) ou retenção em _Storage Object Lock_.
- **Adoção ou Descontinuação de Tecnologias**: Escolha de novas bibliotecas de infraestrutura, transição de paradigmas de gerenciamento de estado ou substituição de componentes estruturais.

> **Regra Prática**: Decisões cosméticas ou pontuais de implementação (como renomear uma variável ou refatorar uma função interna simples) **NÃO** exigem ADR. Decisões que impõem regras a outros desenvolvedores, introduzem novas dependências estruturais ou impactam a estabilidade e conformidade do sistema **SEMPRE** exigem ADR.

---

### 3. Localização e Convenções de Nomenclatura

Todas as ADRs do projeto residem obrigatoriamente no diretório centralizado `docs/adrs/`.

> **Retrocompatibilidade:** projetos que já mantêm ADRs em `docs/adr/` continuam nele — não renomeie. Os scripts da seção 7 e as heurísticas do `/setup` usam `docs/adr/` quando ele existe e `docs/adrs/` caso contrário. Ao encontrar só `docs/adr/`, o `/setup` e o `/setup-padrao-criacao-adrs` (ADR-08) perguntam se o projeto quer migrar (`git mv docs/adr docs/adrs` e atualização das referências); quem escolhe manter fica registrado no `AGENTS.md` e não é perguntado de novo.

> **ADRs legadas com convenção própria:** projetos que já têm ADRs fora deste padrão (ex.: `ADR-066-slug.md`) não precisam reescrevê-las. Os nomes dessas ADRs ficam em `.agents/scripts/adr/adrs-legadas.txt` (um por linha), gravada uma única vez por `python3 .agents/scripts/adr/validate_adrs.py --congelar-legadas` com as ADRs que reprovam no momento da decisão; o validador as ignora, o índice as lista como `Legada` e todas as demais continuam validadas. ADRs novas seguem o padrão desta seção e continuam a numeração (a legada `ADR-066` é seguida por `0067-slug.md`), e o diretório fica misto. Apagar a lista desfaz o congelamento.

```text
docs/
|-- guides/
|   `-- guia-padrao-criacao-adrs.md      # Este Guia Metodológico
`-- adrs/                                # Repositório Canônico de ADRs
    |-- README.md                        # Índice automatizado de decisões
    |-- 0001-escolha-padrao-api-gateway.md
    |-- 0002-arquitetura-autenticacao-jwt-httponly.md
    |-- 0003-modelagem-banco-dados-append-only.md
    |-- 0004-pipeline-rag-pgvector-embeddings.md
    `-- 0042-conformidade-assinatura-eletronica-documentos.md
```

#### Regras Estritas de Nomenclatura

- **Prefixo Numérico Sequencial**: 4 dígitos preenchidos com zeros à esquerda (`0001`, `0002`, ..., `0042`).
- **Slug Semântico**: Expressão em português no padrão _kebab-case_, sem acentuação, sem letras maiúsculas e sem caracteres especiais.
- **Extensão**: `.md` (Markdown puro).

---

### 4. Ciclo de Vida, Estados e Protocolo de Superação

Toda ADR segue um fluxo formal de estados, garantindo transparência sobre quais decisões estão em vigor, quais estão sob avaliação e quais foram descontinuadas:

```mermaid
stateDiagram-v2
    [*] --> Proposta: Criação da ADR
    Proposta --> Aprovada: Revisão Técnica & Aprovação
    Proposta --> Rejeitada: Inviabilidade Técnica/Negócio
    Aprovada --> Implementada: Código & Testes em Produção
    Implementada --> Substituída: Nova ADR revoga/atualiza
    Rejeitada --> [*]
    Substituída --> [*]
```

#### Definição dos Estados

- **`Proposta`**: O documento foi redigido e encontra-se em fase de análise, discussão e validação pela equipe de engenharia e lideranças técnicas.
- **`Aprovada`**: A decisão foi formalmente aceita e validada. A equipe de desenvolvimento está autorizada a implementar o plano técnico.
- **`Implementada`**: Todas as alterações de código (_IN-CODE_), DDLs de banco de dados e testes associados foram integrados e validados em ambiente de produção.
- **`Substituída por ADR-XXXX`**: Uma decisão arquitetural posterior (explicitamente referenciada pelo número da nova ADR) anula, moderniza ou revoga a decisão original.
- **`Rejeitada`**: A proposta foi avaliada e descartada. O documento é mantido no repositório com as justificativas da rejeição para preservar o histórico e evitar discussões repetidas no futuro.

#### Protocolo de Superação Bidirecional (Superseding ADRs)

Quando uma nova ADR (ex: `ADR-0045`) substitui uma ADR anterior (ex: `ADR-0012`):

1. **Na ADR Antiga (`ADR-0012`):**
   - Altere o status para: `**Substituída por [ADR-0045: ...]** (YYYY-MM-DD)`.
   - Insira um banner de aviso no topo:
     ```markdown
     > [!WARNING]
     > **ESTA DECISÃO FOI SUBSTITUÍDA:** Esta ADR foi revogada e superada pela `ADR-0045: Nova Arquitetura` (0045-nova-arquitetura.md).
     ```

2. **Na ADR Nova (`ADR-0045`):**
   - Declare nos metadados: `**Substitui:** ADR-0012: Arquitetura Anterior (0012-arquitetura-anterior.md)`.
   - Explique no Contexto o motivo pelo qual a decisão anterior se tornou obsoleta.

---

### 5. Anatomia Canônica em 8 Seções (Passo a Passo)

Uma ADR corporativa de alta maturidade deve ser autoexplicativa, precisa e exaustiva. Abaixo detalha-se o conteúdo exigido em cada seção.

#### 5.1 Cabeçalho HTML, Metadados e Taxonomia

Toda ADR deve iniciar obrigatoriamente com o comentário HTML de log de manutenção:

```html
<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
YYYY-MM-DD | Nome do Autor  | Criação da ADR XXXX detalhando [tema principal].
================================================================================
-->
```

Em seguida, declarar o título principal, a tabela estruturada de metadados e a linha de status com a data de transição:

````markdown
# ADR 0042: Arquitetura de Assinatura Eletrônica e Não-Repúdio Probatório

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-08-31) |
| **Decisores** | Matheus Diniz, Tech Lead, SecOps, DPO |
| **Tags** | `[security]`, `[compliance]`, `[zero-trust]`, `[database]` |
| **Impacto Sistêmico** | Alto (Core Backend + Storage Imutável) |
| **ADRs Relacionadas** | Supersedes `ADR-0015` (0015-autenticacao-legada.md); Extends `ADR-0002` (0002-arquitetura-jwt.md) |
````

---

#### 5.2 Contexto e Riscos Mapeados

Esta seção introduz a motivação da decisão. Deve responder:

- Qual é o problema enfrentado ou a necessidade do sistema?
- Quem são os atores e processos impactados?
- Quais são os riscos e impactos caso nada seja feito?

Exemplo de estrutura:

````markdown
## Contexto
O sistema necessita prover um mecanismo seguro de formalização documental entre colaboradores e a organização, garantindo a integridade dos artefatos digitais e a validade jurídica perante auditorias externas.

### Riscos Identificados e Problemas a Resolver:
1. **Vulnerabilidade de Adulteração**: Risco de alteração não autorizada de documentos após a assinatura.
2. **Fragilidade Probatória**: Ausência de metadados periciais (endereço IP, carimbo de tempo autoritativo, hash criptográfico), comprometendo a defesa em litígios.
3. **Inconformidade Regulatória**: Risco de penalidades por não atender aos requisitos de validade das assinaturas eletrônicas avançadas.
````

---

#### 5.3 Seção 1: Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

Quando a decisão possuir impacto regulatório, trabalhista, fiscal ou de privacidade, deve-se incluir uma tabela com a fundamentação legal estrita:

````markdown
## 1. Fundamentação Jurídica & Fontes Normativas Diretas

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **Lei de Assinaturas Eletrônicas** | Art. 4º, Inciso II (Assinatura Avançada) | Exige associação unívoca ao signatário e integridade dos dados assinados. |
| **Lei Geral de Proteção de Dados** | Art. 6º (Princípios de Segurança e Prevenção) | Obriga a adoção de medidas técnicas eficazes para proteção de dados sensíveis. |
| **Marco Civil da Internet** | Art. 15 (Guarda de Registros de Acesso) | Guarda obrigatória de registros de conexão e autenticação com carimbo de tempo. |
````

---

#### 5.4 Seção 2: Decisão de Arquitetura, Trade-offs & Diagramas

Nesta seção declara-se objetivamente a solução adotada, comparando-a com alternativas que foram consideradas e descartadas, acompanhada de **Matriz Formal de Trade-offs** e diagramas de arquitetura e fronteiras de confiança (_Trust Boundaries_).

````markdown
## 2. Decisão de Arquitetura

Optou-se pela implementação de um pipeline de assinatura eletrônica assíncrono em três camadas:
1. **Camada de Apresentação**: Coleta de manifestação de vontade, cálculo local de verificação e visualização de documento.
2. **Camada de Aplicação / API**: Geração de hash SHA-256 do documento original, captura de metadados de sessão via token seguro no servidor e orquestração de carimbo de tempo NTP autoritativo.
3. **Camada de Persistência**: Armazenamento imutável (_Append-Only_) no banco de dados relacional e custódia do arquivo em storage com bloqueio de exclusão (_Object Lock_).

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: Assinatura Externa SaaS | Opção B: Assinatura Nativa em Hardware (Eleita) | Opção C: Certificado A1 Compartilhado |
| :--- | :--- | :--- | :--- |
| **Custo Recorrente** | Alto (Cobrança por assinatura) | Baixo (Custo zero por transação) | Médio |
| **Latência de Resposta** | Alta (Chamada externa síncrona) | Baixa (< 50ms local) | Média |
| **Segurança & Não-Repúdio** | Média (Chaves em nuvem terceira) | Máxima (Chave privada em Secure Enclave) | Baixa (Risco de extração da chave) |
| **Conformidade Regulatória** | Alta | Total (Atende ISO 27001 e MP 2.200-2) | Parcial |
| **Complexidade de Engenharia** | Baixa (Plug-and-play) | Média (Pipeline de criptografia + PyMuPDF) | Baixa |

```text
+------------------+         +------------------+         +----------------------+
|  Client / Front  | ------> |  API / Backend   | ------> |  Banco de Dados SQL  |
|  (Interação UX)  |         | (Orquestração)   |         | (Append-Only Audit)  |
+------------------+         +------------------+         +----------------------+
                                      |
                                      v
                             +------------------+
                             | Storage Imutável |
                             |  (Object Lock)   |
                             +------------------+
```
````

---

#### 5.5 Seção 3: Matriz de Implementação Técnica (IN-CODE)

Detalhamento prescritivo de como a decisão deve ser implementada no código-fonte, dividida por camadas de responsabilidade:

````markdown
## 3. Matriz de Implementação Técnica (_IN-CODE_)

### 3.1 Camada de Backend / API Gateway
- **Contratos de Dados e Validação**: Definição de schemas rígidos que rejeitam payloads malformados ou dados não sanitizados.
- **Resolução de Identidade Server-Side**: Identificação unívoca do usuário autenticado exclusivamente via token de sessão validado no servidor, prevenindo ataques de enumeração ou manipulação de parâmetros (Anti-IDOR).
- **Trilha de Auditoria Transacional**: Gravação atômica de logs estruturados contendo metadados de rede, identificador de sessão e carimbo de tempo UTC.

### 3.2 Camada de Frontend / Client
- **Gerenciamento de Estado Reativo**: Controle visual de transições de estado, bloqueando submissões duplicadas na interface.
- **Proteção Criptográfica Local**: Criptografia de dados sensíveis transitórios no cliente via APIs criptográficas nativas da plataforma.
- **Acessibilidade e Usabilidade**: Conformidade de contraste, suporte a navegação por teclado e feedback visual claro para o usuário.

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)
Modelagem física executável demonstrando integridade referencial, constraints e padrão _Append-Only_:

```sql
-- Tabela principal de auditoria de assinaturas (Imutável / Append-Only)
CREATE TABLE DocumentoAssinatura (
    idDocumentoAssinatura BIGINT IDENTITY(1,1) NOT NULL,
    idDocumento VARCHAR(64) NOT NULL,
    idUsuario VARCHAR(64) NOT NULL,
    hashDocumentoOriginal CHAR(64) NOT NULL, -- SHA-256
    hashAssinaturaFinal CHAR(128) NOT NULL,  -- SHA-512 com metadados
    enderecoIp VARCHAR(45) NOT NULL,
    dataHoraRegistro DATETIME2(7) NOT NULL,
    CONSTRAINT PK_DocumentoAssinatura PRIMARY KEY (idDocumentoAssinatura),
    CONSTRAINT CK_Hash_Valido CHECK (LEN(hashDocumentoOriginal) = 64)
);

CREATE NONCLUSTERED INDEX IX_DocAssinatura_Doc_User 
ON DocumentoAssinatura (idDocumento, idUsuario);
```
````

---

#### 5.6 Seção 4: Matriz de Governança & Ações Institucionais (OFF-CODE) (Se aplicável)

A arquitetura de software corporativa frequentemente exige ações que extrapolam o código-fonte. Esta seção mapeia responsabilidades para os setores institucional, jurídico, de segurança e de operações:

````markdown
## 4. Matriz de Ações de Governança & Jurídicas (_OFF-CODE_)

| Ref | Ação Institucional Mandatória | Área Responsável | Base Legal / Normativa | Entregável / Evidência |
| :--- | :--- | :--- | :--- | :--- |
| **OFF-01** | Homologação do Termo de Adesão ao Peticionamento Eletrônico | Jurídico / RH | Código Civil, Art. 107 | Minuta assinada e arquivada nos dossiês dos colaboradores. |
| **OFF-02** | Configuração de Políticas de Bloqueio WORM no Storage | TI / Infraestrutura | Padrão ISO 27001 | Bucket de armazenamento com política _Object Lock_ ativada. |
| **OFF-03** | Registro de Operações no Relatório de Impacto (RIPD) | Segurança / DPO | LGPD, Art. 38 | Documento de RIPD aprovado pelo Comitê de Privacidade. |
````

---

#### 5.7 Seção 5: Prazos Legais de Guarda e Políticas de Retenção (Se aplicável)

Mapeamento dos prazos prescricionais de custódia dos dados e ciclos de vida em banco e storage:

````markdown
## 5. Prazos Legais de Guarda e Políticas de Retenção

| Categoria Documental / Dado | Prazo de Guarda | Fundamento Legal | Política no Storage / Banco |
| :--- | :--- | :--- | :--- |
| **Recibos e Assinaturas Trabalhistas** | 5 anos pós-rescisão | CLT / Constituição Federal | Armazenamento ativo em banco; transição para Cold Storage após 2 anos. |
| **Registros de Auditoria e Logs de Acesso** | 6 meses | Marco Civil da Internet | Expiração automática e expurgo seguro após término do prazo legal. |
| **Termos de Consentimento e Acordos** | 20 anos | Código Civil (Prescrição) | _Object Lock_ definitivo sem permissão de deleção antecipada. |
````

---

#### 5.8 Seção 6: Matriz de Conformidade e Mitigação de Riscos

Cruzamento explícito entre os riscos identificados no Contexto e as contramedidas adotadas:

````markdown
## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **Adulteração de Documento** | Alto (Invalidação probatória) | Armazenamento de hash criptográfico SHA-256 e validação a cada leitura. |
| **Enumeração de Recursos (IDOR)** | Alto (Vazamento de dados) | Resolução de identidade estritamente no backend via token de sessão autenticado. |
| **Exclusão Acidental por Administrador** | Médio (Perda de integridade) | Estrutura de banco _Append-Only_ com bloqueio de comandos `UPDATE` e `DELETE`. |
````

---

#### 5.9 Seção 7: Consequências e Resultados

Balanço transparente entre benefícios alcançados e compromissos aceitos:

````markdown
## 7. Consequências e Resultados

### Positivas
- **Blindagem Probatória**: Rastreabilidade completa de todas as operações com hashes criptográficos e carimbo de tempo.
- **Segurança Reforçada**: Eliminação de pontos únicos de falha de segurança através de validação estrita em camadas (_Zero-Trust_).
- **Conformidade Regulatória**: Pleno alinhamento com as legislações vigentes e auditorias de governança.

### Mitigações e Desafios Gerenciados
- **Overhead de Processamento Criptográfico**: Cálculo de hashes em arquivos volumosos absorvido via processamento assíncrono.
- **Crescimento do Volume de Dados**: Estrutura _Append-Only_ exige monitoramento contínuo de volumetria e políticas programadas de arquivamento.
````

---

### 6. Regras de Ouro e Anti-Padrões

Ao redigir ou revisar uma ADR, certifique-se de seguir as regras abaixo:

#### Regras de Ouro (O que SEMPRE fazer)

1. **Redigir em Português do Brasil (pt-BR)**: Toda a documentação e justificativas devem ser escritas em pt-BR claro e técnico.
2. **Preservar Termos Técnicos em Inglês**: Manter expressões consagradas da computação (_Backend_, _Frontend_, _Zero-Trust_, _Circuit Breaker_, _Append-Only_, _Object Lock_, _RAG_, _Prompt Injection_).
3. **Ser Autoexplicativo**: A ADR deve ser compreensível para novos integrantes da equipe sem necessidade de explicações verbais externas.
4. **Separar IN-CODE de OFF-CODE**: Sempre que uma decisão envolver conformidade ou operações institucionais, separar rigorosamente o que é código do que é governança.
5. **Incluir Modelagem DDL Real**: Não utilizar pseudocódigo genérico para persistência; fornecer DDLs ANSI SQL válidos com tipagens e constraints.
6. **Avaliar Riscos de IA e Privacidade**: Em ADRs envolvendo agentes ou LLMs, explicitar salvaguardas de mascaramento de PII e validação de saídas.

#### Anti-Padrões (O que NUNCA fazer)

- ❌ **Documentar Decisões Efêmeras**: Não crie ADRs para escolhas triviais (ex: "Mudança de cor de botão", "Uso de linter local").
- ❌ **Omitir Riscos e Trade-offs**: Nenhuma decisão arquitetural possui apenas vantagens. Se não há consequências negativas ou mitigações descritas, a análise está incompleta.
- ❌ **Escrever ADRs Retroativas sem Contexto**: Criar uma ADR após o fato apenas como formalidade, sem detalhar as motivações reais que levaram à escolha.
- ❌ **Acoplar Decisões a Marcas ou Nomes Temporários**: Foque nos conceitos arquiteturais e responsabilidades de camada, garantindo a portabilidade da documentação.

---

### 7. Automação, Indexação e Validação em CI/CD

Para manter o repositório de ADRs organizado e consistente em escala, utilizam-se dois scripts utilitários de automação em Python:

O validador ignora as ADRs legadas listadas em `.agents/scripts/adr/adrs-legadas.txt` (gravada uma única vez por `python3 .agents/scripts/adr/validate_adrs.py --congelar-legadas`) e o índice inclui essas ADRs como `Legada`; ver o parágrafo "ADRs legadas com convenção própria" na seção 3.

#### 7.1 Script de Geração Automática do Índice (`docs/adrs/README.md`)

```python
# Fonte canônica: templates/adr/generate_adr_index.py (instalado em .agents/scripts/adr/ por ADR-03)
# Script para gerar automaticamente o README.md consolidando todas as ADRs
import os
import re
import subprocess
import sys
import unicodedata

IGNORADOS = {"README.md", "TEMPLATE.md"}
LISTA_LEGADAS = os.path.join(".agents", "scripts", "adr", "adrs-legadas.txt")


def resolver_raiz():  # raiz do git (ou cwd)
    try:
        raiz = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, encoding="utf-8").stdout.strip()
    except OSError:
        raiz = ""
    return raiz or os.getcwd()


def resolver_diretorio_adrs():  # docs/adr legado prevalece, senão docs/adrs (padrão desde a v2.7.4)
    raiz = resolver_raiz()
    legado = os.path.join(raiz, "docs", "adr")
    return legado if os.path.isdir(legado) else os.path.join(raiz, "docs", "adrs")


def normalizar(nome):  # NFC nos dois lados: macOS devolve nomes em NFD, o editor grava NFC
    return unicodedata.normalize("NFC", nome.strip())


def caminho_legadas(raiz):
    return os.path.join(raiz, LISTA_LEGADAS)


def ler_legadas(raiz):  # nomes NFC, sem linhas vazias/comentários; só compara com listdir, nunca abre o nome como caminho
    caminho = caminho_legadas(raiz)
    if not os.path.isfile(caminho):
        return set()
    with open(caminho, "r", encoding="utf-8-sig") as f:
        nomes = (normalizar(linha) for linha in f.read().splitlines())
        return {n for n in nomes if n and not n.startswith("#")}


def numero_legada(nome):  # "ADR-008-ddd.md" -> "ADR-008"; sem dígitos, o nome sem .md
    m = re.match(r"^(.*?\d+)", nome)
    return m.group(1) if m else re.sub(r"\.md$", "", nome)


def gerar_indice_adrs():
    adr_dir = resolver_diretorio_adrs()
    readme_path = os.path.join(adr_dir, "README.md")
    existentes = os.listdir(adr_dir)
    arquivos = sorted([f for f in existentes if re.match(r"^\d{4}-.*\.md$", f)])
    listadas = ler_legadas(resolver_raiz())  # congeladas: listadas antes das novas, na ordem de nome
    legadas = sorted([f for f in existentes if f.endswith(".md") and f not in IGNORADOS and normalizar(f) in listadas
                      and f not in arquivos])

    linhas = [
        "# 📚 Repositório de Architecture Decision Records (ADRs)",
        "",
        "> Índice gerado automaticamente com o status consolidado das decisões arquiteturais.",
        "",
        "| ADR | Título | Status | Data |",
        "| :---: | :--- | :---: | :---: |",
    ]

    for arq in legadas:
        with open(os.path.join(adr_dir, arq), "r", encoding="utf-8") as f:
            conteudo = f.read()
        titulo_match = re.search(r"^#\s+(.+)$", conteudo, re.MULTILINE)
        status_match = re.search(r"\*\*Status\*\*\s*\|\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)", conteudo)
        titulo = titulo_match.group(1).strip() if titulo_match else arq
        status = status_match.group(1) if status_match else "Legada"
        data = status_match.group(2) if status_match else "-"
        linhas.append(f"| [{numero_legada(arq)}]({arq}) | **{titulo}** | `{status}` | {data} |")

    for arq in arquivos:
        caminho = os.path.join(adr_dir, arq)
        with open(caminho, "r", encoding="utf-8") as f:
            conteudo = f.read()

        num = arq.split("-")[0]
        titulo_match = re.search(r"^# ADR \d{4}:\s*(.+)$", conteudo, re.MULTILINE)
        status_match = re.search(r"\*\*Status\*\*\s*\|\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)", conteudo)

        titulo = titulo_match.group(1) if titulo_match else arq
        status = status_match.group(1) if status_match else "Desconhecido"
        data = status_match.group(2) if status_match else "-"

        linhas.append(f"| [{num}]({arq}) | **{titulo}** | `{status}` | {data} |")

    with open(readme_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    print(f"Índice {readme_path} atualizado com sucesso!")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    gerar_indice_adrs()
```

#### 7.2 Validador de Conformidade em CI/CD (Linter de ADRs)

```python
# Fonte canônica: templates/adr/validate_adrs.py (instalado em .agents/scripts/adr/ por ADR-03; ignora README.md, TEMPLATE.md, templates legados como template-adr.md e as ADRs listadas em adrs-legadas.txt)
# Validador de CI para garantir integridade e formato das ADRs
import argparse
import os
import re
import subprocess
import sys
import unicodedata

IGNORADOS = {"README.md", "TEMPLATE.md"}
LISTA_LEGADAS = os.path.join(".agents", "scripts", "adr", "adrs-legadas.txt")


def resolver_raiz():  # raiz do git (ou cwd)
    try:
        raiz = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, encoding="utf-8").stdout.strip()
    except OSError:
        raiz = ""
    return raiz or os.getcwd()


def resolver_diretorio_adrs():  # docs/adr legado prevalece, senão docs/adrs (padrão desde a v2.7.4)
    raiz = resolver_raiz()
    legado = os.path.join(raiz, "docs", "adr")
    return legado if os.path.isdir(legado) else os.path.join(raiz, "docs", "adrs")


def eh_template(nome):  # template legado (ex.: template-adr.md) não é ADR e não se renomeia; ADR numerada é sempre validada
    return "template" in nome.lower() and not re.match(r"^\d{4}-", nome)


def normalizar(nome):  # NFC nos dois lados: macOS devolve nomes em NFD, o editor grava NFC
    return unicodedata.normalize("NFC", nome.strip())


def caminho_legadas(raiz):
    return os.path.join(raiz, LISTA_LEGADAS)


def ler_legadas(raiz):  # nomes NFC, sem linhas vazias/comentários; só compara com listdir, nunca abre o nome como caminho
    caminho = caminho_legadas(raiz)
    if not os.path.isfile(caminho):
        return set()
    with open(caminho, "r", encoding="utf-8-sig") as f:
        nomes = (normalizar(linha) for linha in f.read().splitlines())
        return {n for n in nomes if n and not n.startswith("#")}


def listar_adrs(adr_dir):
    return [f for f in (os.listdir(adr_dir) if os.path.isdir(adr_dir) else []) if f.endswith(".md") and f not in IGNORADOS and not eh_template(f)]


def erros_da_adr(adr_dir, adr):
    erros = []
    if not re.match(r"^\d{4}-[a-z0-9-]+\.md$", adr):
        erros.append(f"Nome inválido: {adr} (deve seguir 0000-kebab-case.md)")

    with open(os.path.join(adr_dir, adr), "r", encoding="utf-8") as f:
        texto = f.read()

    if "LOG DE MANUTENÇÃO" not in texto:
        erros.append(f"{adr}: Cabeçalho HTML de log de manutenção ausente.")
    if not re.search(r"^# ADR \d{4}:", texto, re.MULTILINE):
        erros.append(f"{adr}: Título principal não segue o padrão '# ADR 0000:'.")
    if "## 2. Decisão de Arquitetura" not in texto:
        erros.append(f"{adr}: Seção '## 2. Decisão de Arquitetura' ausente.")
    return erros


def validar_adrs():
    raiz = resolver_raiz()
    adr_dir = resolver_diretorio_adrs()
    legadas = ler_legadas(raiz)
    erros = []
    ignoradas = 0

    for adr in listar_adrs(adr_dir):
        if normalizar(adr) in legadas:
            ignoradas += 1
            continue
        erros.extend(erros_da_adr(adr_dir, adr))

    if ignoradas:
        print(f"{ignoradas} ADR(s) legada(s) ignorada(s) (lista em .agents/scripts/adr/adrs-legadas.txt)")
    if erros:
        print("\n".join(erros))
        sys.exit(1)
    print("Todas as ADRs estão em conformidade!")


def congelar_legadas():
    raiz = resolver_raiz()
    caminho = caminho_legadas(raiz)
    if os.path.exists(caminho):
        print("lista de legadas já existe: ADR nova não se congela — corrija-a conforme a seção 5 do guia", file=sys.stderr)
        return 2
    adr_dir = resolver_diretorio_adrs()
    reprovadas = sorted(normalizar(a) for a in listar_adrs(adr_dir) if erros_da_adr(adr_dir, a))
    if not reprovadas:
        print("nada a congelar")
        return 0
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    cabecalho = ["# ADRs legadas congeladas pelo /setup (guia padrao-criacao-adrs, ADR-04): ignoradas pelo validador.",
                 "# ADR nova não entra aqui: corrija-a. Apagar este arquivo volta a validar todas."]
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(cabecalho + reprovadas) + "\n")
    print(f"{len(reprovadas)} ADR(s) congelada(s) em .agents/scripts/adr/adrs-legadas.txt")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Valida as ADRs do projeto.")
    parser.add_argument("--congelar-legadas", action="store_true",
                        help="grava .agents/scripts/adr/adrs-legadas.txt com as ADRs que hoje reprovam (uma única vez)")
    args = parser.parse_args()
    if args.congelar_legadas:
        sys.exit(congelar_legadas())
    validar_adrs()
```

Para customizar os scripts copiados para `.agents/scripts/adr/`, remova a linha `fonte: guia-padrao-criacao-adrs.md` da docstring; senão o ADR-03 os substitui na próxima atualização do guia.

#### 7.3 Recuperação Forense em Repositórios Existentes (Débito de ADRs)

Quando um repositório já possui um histórico no Git mas carece de governança formal (débito de documentação arquitetural), utilize a skill oficial **`/forensic-adr-recovery`** ([`skills/software-engineering/forensic-adr-recovery/`](../../skills/software-engineering/forensic-adr-recovery/README.md)).

Ela executa arqueologia de software automatizada no histórico do Git:
1. Minera commits, merges, tags e pontos de inflexão estrutural.
2. Reconstrói retroativamente as ADRs seguindo o template canônico deste guia.
3. Disponibiliza scripts autônomos prontos para indexação (`generate_adr_index.py`) e validação em pipelines de CI (`validate_adrs.py`).

---

### 8. Checklist de Homologação (Definition of Done)

Antes de alterar o status de uma ADR para **`Aprovada`**, a equipe de arquitetura deve validar:

- [ ] O arquivo está localizado em `docs/adrs/[NUMERO_4_DIGITOS]-[slug-em-kebab-case].md`?
- [ ] O comentário HTML de log de manutenção está preenchido no topo com data, autor e descrição?
- [ ] A tabela de metadados contém **Status**, **Decisores**, **Tags**, **Impacto** e **ADRs Relacionadas**?
- [ ] O Contexto apresenta uma lista clara de riscos e problemas a serem resolvidos?
- [ ] A Seção 2 inclui a **Matriz de Avaliação de Alternativas (Trade-offs)** e diagrama de arquitetura?
- [ ] A Matriz Técnica (_IN-CODE_) especifica Backend, Frontend e Banco de Dados com DDL executável?
- [ ] Decisões envolvendo IA/LLMs especificam salvaguardas contra Prompt Injection e vazamento de PII?
- [ ] A Matriz Institucional (_OFF-CODE_) define áreas responsáveis e entregáveis (se aplicável)?
- [ ] As Consequências detalham tanto os ganhos positivos quanto as mitigações/trade-offs aceitos?
- [ ] Se esta ADR substitui outra anterior, o banner de superação foi inserido na ADR legada?
- [ ] O texto está 100% em pt-BR sem quebras de formatação Markdown?

---

### 9. Template Canônico "Copiar e Colar" (Markdown Raw)

Utilize o bloco abaixo como ponto de partida para a criação de qualquer nova ADR em `docs/adrs/` (ou `docs/adr/`, se o projeto já o usa):

````markdown
<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
YYYY-MM-DD | Nome do Autor  | Criação da ADR XXXX detalhando [assunto principal].
================================================================================
-->

# ADR [NUMERO_4_DIGITOS]: [Título Declarativo e Abrangente da Decisão]

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **[Proposta | Aprovada | Implementada | Substituída por ADR-XXXX | Rejeitada]** (YYYY-MM-DD) |
| **Decisores** | [Nome do Autor, Tech Lead, SecOps, Arquitetura] |
| **Tags** | `[ex: security]`, `[database]`, `[api-gateway]`, `[ai-agents]` |
| **Impacto Sistêmico** | [Alto / Médio / Baixo] ([Módulos/Serviços Impactados]) |
| **ADRs Relacionadas** | [Ex: Supersedes ADR-XXXX; Extends ADR-YYYY / N/A] |

## Contexto
[Descrição detalhada do cenário técnico e de negócio, atores impactados, estado atual do sistema e necessidades a serem atendidas.]

### Riscos Identificados e Problemas a Resolver:
1. **[Risco 1 / Problema 1]**: [Detalhamento do impacto operacional, técnico, de segurança ou de conformidade].
2. **[Risco 2 / Problema 2]**: [Detalhamento do impacto].
3. **[Risco 3 / Problema 3]**: [Detalhamento do impacto].

---

## 1. Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **[Norma / Legislação 1]** | [Artigos / Cláusulas aplicáveis] | [Impacto e comportamento exigido no sistema] |
| **[Norma / Legislação 2]** | [Artigos / Cláusulas aplicáveis] | [Impacto e comportamento exigido no sistema] |

---

## 2. Decisão de Arquitetura

[Explicação detalhada da solução eleita, premissas de engenharia e justificativa comparativa frente a outras alternativas descartadas.]

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: [Solução A] | Opção B: [Solução B (Eleita)] | Opção C: [Solução C] |
| :--- | :--- | :--- | :--- |
| **Custo / Esforço** | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] |
| **Latência / Performance** | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] |
| **Segurança & Privacidade** | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] |
| **Complexidade Operacional** | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] | [Alto / Médio / Baixo] |
| **Curva de Aprendizado** | [Rápida / Moderada / Longa] | [Rápida / Moderada / Longa] | [Rápida / Moderada / Longa] |

```text
[Diagrama de Arquitetura em ASCII Art ou Mermaid modelando o fluxo e fronteiras de confiança]
```

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

### 3.1 Camada de Backend / API Gateway
- **[Componente / Módulo 1]**: [Especificação de endpoints, contratos de validação, regras de negócio e middleware].
- **[Componente / Módulo 2]**: [Especificação de segurança, resolução server-side de identidade e logs de auditoria].

### 3.2 Camada de Frontend / Client
- **[Componente / Módulo 1]**: [Especificação de interface, reatividade, gerenciamento de estado e bloqueio de idempotência].
- **[Componente / Módulo 2]**: [Especificação de proteção local de dados, validações e acessibilidade].

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)
```sql
-- DDL físico executável com constraints de integridade, índices e imutabilidade
CREATE TABLE ExemploTabelaDecisao (
    idExemplo BIGINT IDENTITY(1,1) NOT NULL,
    codigoEntidade VARCHAR(64) NOT NULL,
    hashIntegridade CHAR(64) NOT NULL,
    dataCriacaoUtc DATETIME2(7) NOT NULL,
    CONSTRAINT PK_ExemploTabela PRIMARY KEY (idExemplo)
);

CREATE NONCLUSTERED INDEX IX_Exemplo_Entidade 
ON ExemploTabelaDecisao (codigoEntidade);
```

---

## 4. Matriz de Governança & Ações Institucionais (*OFF-CODE*) (Se aplicável)

| Ref | Ação Institucional Mandatória | Área Responsável | Base Legal / Normativa | Entregável / Evidência |
| :--- | :--- | :--- | :--- | :--- |
| **OFF-01** | [Descrição da ação obrigatória fora do código] | [Jurídico / RH / Infra / DPO] | [Artigo / Resolução] | [Documento / Parecer / Configuração] |
| **OFF-02** | [Descrição da ação obrigatória fora do código] | [Área Responsável] | [Artigo / Resolução] | [Documento / Parecer / Configuração] |

---

## 5. Prazos Legais de Guarda e Políticas de Retenção (Se aplicável)

| Categoria Documental / Dado | Prazo de Guarda | Fundamento Legal | Política no Storage / Banco |
| :--- | :--- | :--- | :--- |
| **[Categoria 1]** | [Ex: 5 anos] | [Dispositivo legal] | [Retenção em banco / política de expurgo] |
| **[Categoria 2]** | [Ex: 20 anos] | [Dispositivo legal] | [Object Lock no Storage / WORM] |

---

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado no Contexto | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **[Risco 1]** | [Alto / Médio / Baixo] | [Contramedida técnica implementada no código ou banco] |
| **[Risco 2]** | [Alto / Médio / Baixo] | [Contramedida técnica implementada] |

---

## 7. Consequências e Resultados

### Positivas
- **[Benefício 1]**: [Ganho de performance, conformidade, segurança ou escalabilidade].
- **[Benefício 2]**: [Simplificação operacional ou alinhamento arquitetural].

### Mitigações e Desafios Gerenciados
- **[Desafio / Trade-off 1]**: [Complexidade adicional aceita e como ela é gerenciada].
- **[Desafio / Trade-off 2]**: [Impacto de performance ou armazenamento mitigado].
````
