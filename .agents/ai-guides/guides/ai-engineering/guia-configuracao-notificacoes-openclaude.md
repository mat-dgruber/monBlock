# 🔔 Guia de Configuração: Notificações Desktop no OpenClaude e Claude Code via `terminal-notifier`

Este guia formaliza a configuração de **notificações de desktop nativas e clicáveis no macOS** para o **OpenClaude** e **Claude Code**, utilizando **exclusivamente o `terminal-notifier` diretamente no `settings.json`**, eliminando de forma definitiva o uso do **Editor de Scripts (`osascript`)** e dispensando scripts Bash auxiliares (`notify.sh`).

**Versão**: 1.1.0 (2026-09-18) — Heurísticas Executáveis (slug `notificacoes-openclaude`); hook com fonte canônica em `templates/harness/notification-hook.json`

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). Aplicável apenas no macOS (`uname = Darwin`); em outros sistemas as heurísticas ficam ⏭️.

```yaml heuristics
guide: notificacoes-openclaude
version: 2
requires: []
heuristics:
  - id: NOTIF-01
    title: terminal-notifier e jq instalados (macOS)
    when: "test \"$(uname)\" = Darwin && { ! command -v terminal-notifier >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; }"
    do: |
      sh "$AI_GUIDES_RUNTIME/templates/install_dep.sh" terminal-notifier
      sh "$AI_GUIDES_RUNTIME/templates/install_dep.sh" jq
    verify: "command -v terminal-notifier >/dev/null 2>&1 && command -v jq >/dev/null 2>&1"
    optional: true

  - id: NOTIF-02
    title: Hook Notification com terminal-notifier em .claude/settings.json
    when: "test \"$(uname)\" = Darwin && ! grep -q 'terminal-notifier' .claude/settings.json 2>/dev/null"
    do: |
      agent: Rode python3 "$AI_GUIDES_RUNTIME/templates/harness/merge_hooks.py" "$AI_GUIDES_RUNTIME/templates/harness/notification-hook.json" .claude/settings.json
      (preserva os hooks existentes e não duplica). Depois, só no comando que ele inseriu, troque o bundle id de
      `-activate` pelo editor do desenvolvedor conforme a tabela da seção 4 (VS Code com.microsoft.VSCode, Cursor
      com.todesktop.23031312ki9naea, Antigravity com.google.antigravity-ide, iTerm2 com.googlecode.iterm2, Ghostty
      com.mitchellh.ghostty, Terminal com.apple.Terminal); se não souber, mantenha VS Code. Nunca escreva hook à mão.
    verify: "grep -q 'terminal-notifier' .claude/settings.json && python3 -c \"import json; json.load(open('.claude/settings.json'))\""
    depends_on: [NOTIF-01]
```

---

---

## 📚 Fundamentos

### 1. Por que NÃO utilizar o Editor de Scripts (`osascript`)?

Anteriormente, utilizavam-se comandos baseados em AppleScript (`osascript -e "display notification ..."`) ou scripts intermediários (`notify.sh`). Esse método foi descontinuado pelos seguintes motivos técnicos:

1. **Atribuição Incorreta ao "Editor de Scripts":** As notificações aparecem atribuídas ao aplicativo de sistema *Editor de Scripts* (com o ícone genérico de pergaminho), poluindo a Central de Notificações do macOS e ocultando o contexto real do OpenClaude/IDE.
2. **Ausência de Redirecionamento/Foco ao Clicar:** O `display notification` do AppleScript não suporta o parâmetro `-activate`. Quando o desenvolvedor clica no banner da notificação, nada acontece ou o Editor de Scripts é trazido para a frente, forçando o usuário a alternar manualmente para o terminal/IDE.
3. **Complexidade Desnecessária e Fragilidade de Scripts Externos:** Scripts como `notify.sh` exigiam permissões (`chmod +x`), caminhos absolutos/relativos e condicionais frágeis baseadas em detecção de processos (`pgrep`) ou TTY, que frequentemente falhavam ao receber o stream do hook via `stdin`.
4. **Vantagem da Abordagem Inline com `terminal-notifier`:** Um único comando no pipeline `jq` + `terminal-notifier` resolve o disparo sonoro, título, mensagem e foco direto da janela com zero scripts adicionais e execução instantânea.

---

### 2. Pré-Requisitos

Instale o `terminal-notifier` e o `jq` via Homebrew no macOS:

```bash
brew install terminal-notifier jq
```

---

### 3. Configuração Oficial no `settings.json`

Tanto o OpenClaude quanto o Claude Code possuem o hook de ciclo de vida `Notification`. Quando o agente conclui uma execução, solicita aprovação ou requer atenção do desenvolvedor, ele emite um payload JSON via `stdin` com a propriedade `message`.

Configure diretamente no seu arquivo de preferências:
- **Global:** `~/.claude/settings.json` ou `~/.openclaude/settings.json` (no diretório home do usuário)
- **Por Projeto:** `.claude/settings.json` (na raiz do repositório — o OpenClaude consome nativamente a pasta `.claude/` do projeto; nunca crie uma pasta `.openclaude/` no repositório)

#### Configuração Canônica Recomendada (Antigravity IDE)

Para o **Antigravity IDE**, use o Bundle ID `com.google.antigravity-ide`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.message // \"OpenClaude requer atenção\"' | terminal-notifier -title 'OpenClaude' -sound default -activate com.google.antigravity-ide"
          }
        ]
      }
    ]
  }
}
```

> **Comportamento garantido:** O macOS emite o som padrão (`default`), exibe o banner com o título "OpenClaude" e o texto do agente, e ao clicar na notificação, o macOS imediatamente redireciona o foco para a janela do Antigravity IDE.

---

### 4. Tabela de Bundle Identifiers por Editor / Terminal (`-activate`)

Caso utilize outro ambiente de desenvolvimento, basta alterar o valor da flag `-activate <bundle-id>`:

| Ferramenta / IDE | Bundle Identifier (`-activate`) | Comando Completo no `settings.json` |
| :--- | :--- | :--- |
| **Antigravity IDE** | `com.google.antigravity-ide` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.google.antigravity-ide` |
| **VS Code** | `com.microsoft.VSCode` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.microsoft.VSCode` |
| **Cursor** | `com.todesktop.23031312ki9naea` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.todesktop.23031312ki9naea` |
| **Ghostty** | `com.mitchellh.ghostty` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.mitchellh.ghostty` |
| **iTerm2** | `com.googlecode.iterm2` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.googlecode.iterm2` |
| **Apple Terminal** | `com.apple.Terminal` | `jq -r '.message // \"OpenClaude requer atenção\"' \| terminal-notifier -title 'OpenClaude' -sound default -activate com.apple.Terminal` |

#### Como Descobrir o Bundle ID de Qualquer Aplicativo no macOS

Se estiver usando outro editor ou terminal, descubra seu Bundle Identifier executando no terminal:

```bash
osascript -e 'id of app "Nome Do Aplicativo"'
# Exemplo:
osascript -e 'id of app "Antigravity IDE"'
# Retorno: com.google.antigravity-ide
```

---

### 5. Opções Adicionais de Personalização

Você pode combinar parâmetros do `terminal-notifier` diretamente no comando inline:

- `-sound <nome>`: Altera o efeito sonoro do macOS (ex: `Glass`, `Ping`, `Submarine`, `Hero`, `default`).
- `-subtitle <texto>`: Adiciona um subtítulo fixo ao banner (ex: `-subtitle 'Sessão de IA'`).
- `-group <id>`: Agrupa notificações substituindo as anteriores para evitar acúmulo no Centro de Notificações (ex: `-group openclaude`).

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.message // \"Ação concluída\"' | terminal-notifier -title 'OpenClaude' -subtitle 'Aviso de Agente' -group 'openclaude' -sound 'Glass' -activate com.google.antigravity-ide"
          }
        ]
      }
    ]
  }
}
```

---

### 6. Como Testar no Terminal

Para testar o disparo e o foco imediato da janela sem aguardar uma mensagem do agente:

```bash
echo '{"message": "Tarefa executada com sucesso! Teste de redirecionamento."}' | jq -r '.message' | terminal-notifier -title 'OpenClaude' -sound default -activate com.google.antigravity-ide
```
