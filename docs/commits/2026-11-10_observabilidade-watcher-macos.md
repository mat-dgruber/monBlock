<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-10 | Agente         | Registro consolidado de observabilidade e refino do Watcher macOS.
================================================================================
-->

# Registro de Desenvolvimento — 2026-11-10

| Metadado | Detalhe |
| :--- | :--- |
| **Escopo Principal** | `enforcers / macos-watcher & observabilidade` |
| **Commits Gerados** | `1` |
| **Arquivos Modificados** | `2` |
| **ADRs Vinculadas / Geradas** | Nenhuma (conforme ADR-0002) |

---

## 1. Visão Geral das Alterações
> Diagnóstico aprofundado e resolução de silenciamento de erros no Watcher macOS em modo LaunchAgent.
> Adição de janela deslizante de 60s para throttle de logs de permissão TCC/automação e telemetria de interceptação no processo principal do Electron.

---

## 2. Arquitetura Afetada & Decisões (ADRs)
- **Camada Afetada:** Camada 3 (Watcher Universal macOS — ADR-0002).
- **Diagrama de Relações e Fluxos:**

```mermaid
graph LR
    LaunchAgent[LaunchAgent: Electron --watcher] -->|TCC AppleEvents| SystemEvents[System Events]
    SystemEvents -->|Consulta Aba Ativa| FrontApp[Navegador em Foco]
    LaunchAgent -->|Avalia Regras| RuleEngine[Rule Engine]
    RuleEngine -->|Violação Detectada| Redirect[Redirecionamento 127.0.0.1:49152/blocked]
    Redirect -->|Log com Throttle| WatcherLog[/tmp/monblock-watcher.log]
```

---

## 3. Mapa de Arquivos Modificados

| Arquivo | Camada Técnica | Resumo da Modificação |
| :--- | :--- | :--- |
| `src/enforcers/macos-watcher.ts` | Enforcer | Substituição de `warnedFailure` por throttle de 60s e log de erro em redirecionamento |
| `src/main/main.ts` | Main Process | Log informativo no processo principal quando aba é interceptada e redirecionada |

---

## 4. Detalhamento por Commit

### `fix(watcher): melhorar observabilidade e throttle de erros no watcher macos`

- **Razão da alteração:** Quando o app era atualizado, falhas pontuais no primeiro ciclo do LaunchAgent silenciavam permanentemente o log devido à flag estática `warnedFailure`, mascarando problemas de automação.
- **Comportamento atual:** Erros de permissão/execução do AppleScript são reportados com throttle de 60 segundos no `/tmp/monblock-watcher.log`. Interceptações bem-sucedidas são registradas no console do daemon/watcher.
- **Arquivos envolvidos:**
  - `src/enforcers/macos-watcher.ts`: throttle de 60s e log de falha de redirecionamento.
  - `src/main/main.ts`: log de interceptação bem-sucedida.

---

## 5. Dívida Técnica & Próximos Passos

- [ ] Avaliar monitoramento via NSWorkspace/Accessibility API (`AXUIElement`) como alternativa complementar a AppleScript puro.
- [ ] Monitorar telemetria de redirecionamento em múltiplos navegadores em testes E2E com automação macOS.
