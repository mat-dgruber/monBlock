---
title: Guia de Instalação e Uso da Suíte Canônica de Mods de TUI e Observabilidade
description: Diretrizes e heurísticas executáveis para instalação opcional, configuração e integração da suíte de 8 mods de TUI e observabilidade de runtime em projetos Claude Code e OpenClaude.
version: 1.0.0
date: 2026-10-14
---

<!-- 
=================================================================================
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO
=================================================================================
Data       | Autor          | Descrição da Alteração
-----------|----------------|--------------------------------------------------
2026-10-14 | Matheus Diniz  | Criação do guia canônico para suíte de mods como módulo opcional
2026-10-19 | Eduardo Batista | mods/package.json ESM, MODS-05 (.cache/ no .gitignore), seções canônicas
=================================================================================
-->

# Guia de Instalação e Uso da Suíte Canônica de Mods de TUI e Observabilidade

Este guia normativo padroniza a adoção opcional da **Suíte Canônica de Mods de TUI e Observabilidade** no ambiente do projeto.

A suíte adiciona uma camada leve e declarativa de visibilidade e governança no terminal, composta por 8 mods. O `/setup` registra por padrão (via `templates/settings.mods.json`) apenas os hooks `PreToolUse`, `PostToolUse`, `UserPromptSubmit` e `Stop`; os demais mods são comandos de CLI:

1. **`blast-radius`** (`PreToolUse: Bash`): Intercepta comandos potencialmente destrutivos (`rm -rf`, `DROP DATABASE`, etc.) calculando impacto e acionando confirmação do usuário (`permissionDecision: ask`).
2. **`cache-tax`** (`UserPromptSubmit`): Monitora o TTL de 5 minutos do cache de prompt da Anthropic, alertando quando pausas de inatividade provocam perda do desconto de 90% em cache reads.
3. **`next-steps`** (`Stop`): Sugere ações subsequentes contextuais no rodapé da resposta do agente.
4. **`reflect`** (`UserPromptSubmit`): Detecta correções e preferências explícitas do usuário, sugerindo salvá-las em memória de projeto (`CLAUDE.md`).
5. **`replay-theater`** (`PostToolUse: Write/Edit`): Registra histórico de diffs para visualização comparativa colorida.
6. **`savvy-progress`** (CLI; hooks `SubagentStart`/`SubagentStop` só se registrados à mão a partir de `mods/savvy-progress/mod.json`): Exibe telemetria visual de progresso e subagentes ativos.
7. **`terminal-browser`** (CLI): Navegador de documentação estática e relatórios locais diretamente no terminal.
8. **`you-should-know`** (`PreToolUse`): Advisor consultivo que alerta sobre efeitos colaterais ocultos de comandos complexos.

Os hooks gravam estado (histórico de diffs, regras detectadas com trecho do prompt) em `.cache/` na raiz do projeto, por isso o MODS-05 garante que essa pasta fique fora do Git.

## ⚙️ Heurísticas Executáveis

```yaml heuristics
guide: mods-tui-observabilidade
version: 1
requires: []
heuristics:
  - id: MODS-01
    title: Node.js instalado (runtime de execução dos mods de observabilidade)
    when: "! command -v node >/dev/null 2>&1"
    do: 'sh "$AI_GUIDES_RUNTIME/templates/install_dep.sh" node winget:OpenJS.NodeJS choco:nodejs scoop:nodejs'
    verify: "command -v node >/dev/null 2>&1"
    optional: true

  - id: MODS-02
    title: Suíte canônica de mods copiada para mods/
    when: "! test -d mods/blast-radius || ! test -d mods/next-steps || ! test -d mods/cache-tax || ! grep -q '\"module\"' mods/package.json 2>/dev/null"
    do: |
      mkdir -p mods
      cp -R "$AI_GUIDES_RUNTIME/mods/"* mods/ 2>/dev/null || cp -R "$AI_GUIDES_RUNTIME/mods" .
      chmod +x mods/*/bin/*.js 2>/dev/null || true
    # mods/package.json ("type": "module"): os hooks são ESM; sem ele quebram num projeto "type": "commonjs" e o `node -c` do verify_hooks não acusa erro de sintaxe
    verify: "test -d mods/blast-radius && test -d mods/next-steps && test -d mods/cache-tax && grep -q '\"module\"' mods/package.json"

  - id: MODS-03
    title: Hooks dos mods integrados no .claude/settings.json
    when: '! python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" --check "$AI_GUIDES_RUNTIME/templates/settings.mods.json" .claude/settings.json >/dev/null 2>&1'
    do: 'python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" "$AI_GUIDES_RUNTIME/templates/settings.mods.json" .claude/settings.json'
    verify: 'python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" --check "$AI_GUIDES_RUNTIME/templates/settings.mods.json" .claude/settings.json'
    depends_on: [MODS-02]

  - id: MODS-04
    title: Verificador de hooks executado com sucesso
    when: '! python3 "$AI_GUIDES_RUNTIME/templates/harness/verify_hooks.py" .claude/settings.json >/dev/null 2>&1'
    do: 'python3 "$AI_GUIDES_RUNTIME/templates/harness/verify_hooks.py" .claude/settings.json'
    verify: 'python3 "$AI_GUIDES_RUNTIME/templates/harness/verify_hooks.py" .claude/settings.json'
    depends_on: [MODS-03]

  - id: MODS-05
    title: Estado dos mods (.cache/) fora do controle de versão
    when: "! git check-ignore -q .cache/replay-history.json"
    do: "printf '\\n.cache/\\n' >> .gitignore"
    verify: "git check-ignore -q .cache/replay-history.json"
    depends_on: [MODS-02]
```

## 📚 Fundamentos

### Como Usar

A instalação dos mods é estritamente **opcional** e gerenciada pelo orquestrador `/setup`:

```bash
# Diagnosticar estado da suíte de mods
uv run skills/setup/scripts/verify_setup.py verify mods-tui-observabilidade

# Aplicar e integrar a suíte de mods no projeto
uv run skills/setup/scripts/verify_setup.py apply mods-tui-observabilidade
```
