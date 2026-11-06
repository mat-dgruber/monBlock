<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-04 | adr-governor   | Criação da ADR 0001 detalhando a arquitetura split privilegiada com daemon root monblockd.
================================================================================
-->

# ADR 0001: Arquitetura Split Privilegiada com UI Electron Desprivilegiada e Daemon Root monblockd

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-04) |
| **Decisores** | Arquitetura monBlock, SecOps, Tech Lead |
| **Tags** | `[architecture]`, `[security]`, `[electron]`, `[daemon]`, `[zero-trust]` |
| **Impacto Sistêmico** | Alto (`monblock-ui`, `monblockd`, `ipc-socket`, `platform-enforcer`) |
| **ADRs Relacionadas** | Supera ADR-001 de `_reversa_sdd/`; Relacionada a ADR-0002, ADR-0003, ADR-0004 |

## Contexto
O `monBlock` é um bloqueador colaborativo voltado à proteção contra consumo compulsivo de pornografia, apostas e conteúdos destrutivos. A engenharia reversa do aplicativo de referência (`_reversa_sdd/` — Cisdem AppCrypt v7.11.0, build 7110) revelou uma falha estrutural crítica documentada na `ADR-001` de referência: o aplicativo operava como um processo monolítico em espaço de usuário (*Userland*). Quando o usuário fechava a janela ou executava `kill -9` / *Force Quit* no Activity Monitor em um momento de impulso, 100% do bloqueio de sites e aplicativos cessava imediatamente.

Além disso, executar o processo Electron inteiro como `root` violaria frontalmente as diretrizes de segurança defensiva Zero-Trust (`guia-seguranca-defensiva-desktop-electron.md`), expondo o motor Chromium/V8 a escalonamento de privilégio caso qualquer conteúdo externo fosse renderizado.

### Riscos Identificados e Problemas a Resolver:
1. **Bypass por Encerramento Forçado (`kill -9`)**: Processos rodando sob o UID do usuário logado podem ser encerrados pelo próprio usuário sem necessidade de autenticação do Ajudante.
2. **Incompatibilidade de Privilégios para Enforcers de SO**: A escrita atômica em `/etc/hosts`, aplicação de flag imutável `chflags uchg`, regras de firewall `pfctl` e gravação em `/Library/Managed Preferences/` exigem privilégio `root` (`UID 0`).
3. **Superfície de Ataque do Chromium em Root**: Rodar a UI Electron com privilégios administrativos ampliaria criticamente o risco de execução remota de código (RCE) com privilégio máximo.

---

## 1. Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **Guia de Segurança Defensiva Desktop Electron** | `.agents/ai-guides/guides/desktop/guia-seguranca-defensiva-desktop-electron.md` | Isolamento estrito de processos (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`) e separação de privilégios. |
| **Guia Segurança Defensiva Zero-Trust** | `.agents/ai-guides/guides/architecture/guia-seguranca-defensiva-zero-trust.md` | Princípio do menor privilégio e validação de autoridade em fronteira IPC. |

---

## 2. Decisão de Arquitetura

Adotar uma **Arquitetura Split Privilegiada em 3 Camadas** separando fisicamente o cliente visual (`Electron UI`, rodando em *Userland* sem privilégios elevados) do motor de imposição e guarda de estado (`monblockd`, rodando como serviço privilegiado `root` gerenciado pelo sistema operacional via `LaunchDaemon` no macOS, `systemd` no Linux e `Windows Service SYSTEM` no Windows).

A comunicação entre `Electron UI` e `monblockd` ocorre exclusivamente via **Unix Domain Socket** (`/var/run/monblockd.sock`) com validação estrita de schema JSON e verificação criptográfica de tokens para qualquer operação de afrouxamento de regra.

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: Electron Monolítico Userland (Cisdem AppCrypt) | Opção B: Electron UI Desprivilegiada + Daemon Root `monblockd` (Eleita) | Opção C: Kernel Extension (kext) / EndpointSecurity System Extension |
| :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Médio | Muito Alto |
| **Latência / Performance** | Média (polling em UI thread) | Alta (`< 1% CPU`, `< 50MB RAM` no daemon) | Muito Alta |
| **Segurança & Resistência a Bypass** | Baixa (vulnerável a `kill -9`) | Alta (sobrevive a `kill -9`, KeepAlive no `launchd`) | Muito Alta |
| **Complexidade Operacional** | Baixa | Média (instalador `.pkg` + socket IPC) | Extrema (exige entitlement restrito da Apple) |
| **Curva de Aprendizado** | Rápida | Moderada | Longa |

```text
+-----------------------------------------------------------------------+
| ESPAÇO DO USUÁRIO (UID 501 - Desprivilegiado / Sandbox Chromium)      |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | Electron UI + System Tray (monBlock Desktop)                    |  |
|  | - Renderiza Dashboard, Categorias e Status                      |  |
|  | - Zero acesso direto a /etc/hosts, SQLite root ou segredos HMAC |  |
|  +--------------------------------+--------------------------------+  |
+-----------------------------------|-----------------------------------+
                                    | IPC Unix Domain Socket
                                    | (/var/run/monblockd.sock)
                                    | Comandos validados + RFC 9457
+-----------------------------------v-----------------------------------+
| ESPAÇO PRIVILEGIADO (UID 0 - root / LaunchDaemon KeepAlive=true)      |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | monblockd (Node.js/TypeScript Service Daemon)                   |  |
|  | - RuleEngine (Catraca Append-Only)                              |  |
|  | - PartnerAuth (Argon2id + HMAC-SHA256 + Telegram Bot)           |  |
|  | - PlatformEnforcer (/etc/hosts uchg, Policies, Watcher)         |  |
|  | - SQLite 0600 (/Library/Application Support/monBlock/monblock.db)| |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

### 3.1 Camada de Backend / Daemon (`monblockd`)
- **`LaunchDaemon` (`com.ccat.monblockd.plist`)**: Instalado em `/Library/LaunchDaemons/com.ccat.monblockd.plist` com `RunAtLoad = true` e `KeepAlive = true`. Se o processo sofrer `SIGKILL` mesmo por falha externa, o `launchd` o reinicia imediatamente e reaplica o estado a partir do SQLite `0600`.
- **Servidor IPC & HTTP Local (`127.0.0.1:49152`)**: Expõe comandos tipados (`ADD_RULE`, `ENABLE_CATEGORY`, `REQUEST_UNBLOCK`, `AUTHORIZE_UNBLOCK`) e retorna erros padronizados em `application/problem+json` (RFC 9457 Problem Details).

### 3.2 Camada de Frontend / Client (`Electron UI`)
- **Isolamento do Renderer**: Configurado obrigatoriamente com `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` e `webSecurity: true`.
- **Resiliência de Desconexão**: O fechamento da janela Electron (`window-all-closed`) ou o encerramento do processo de UI não afeta o `monblockd`, mantendo 100% do bloqueio ativo.

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)

> **Nota (2026-11-05, ADR-0007):** o SQLite abaixo não será adotado; o estado segue nos 3 cofres `MBV1.` (AES-256-GCM + HMAC). A meta de `< 50MB RAM` foi revista para `< 120 MB` RSS (Node SEA).
```sql
CREATE TABLE daemon_health_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daemon_version TEXT NOT NULL,
    last_enforced_at TEXT NOT NULL,
    hosts_sha256 CHAR(64) NOT NULL,
    state_hmac CHAR(64) NOT NULL
) STRICT;
```

---

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado no Contexto | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **Usuário encerra o app Electron no Activity Monitor** | Alto | O bloqueio reside no `monblockd` (`root`) e nas camadas de SO (`/etc/hosts` + Browser Policies); matar a UI tem efeito zero no bloqueio. |
| **Escalonamento de privilégio via IPC** | Alto | O socket IPC rejeita payloads fora do schema estrito e exige token assinado ou hash Argon2id para qualquer mutação redutora de segurança. |
| **Corrupção do estado em queda abrupta de energia** | Médio | Uso de SQLite em modo `WAL` (`PRAGMA synchronous = FULL`) com verificação de `row_hmac` no boot do daemon (Fail-Closed). |

---

## 7. Consequências e Resultados

### Positivas
- **Imunidade a `kill -9` em Userland**: O usuário não consegue desativar o bloqueio fechando o aplicativo ou matando processos da sua sessão.
- **Superfície de Ataque Mínima**: Segredos criptográficos (`hmac_secret`, `telegram_bot_token`) ficam inacessíveis ao usuário comum (`root:wheel 0600`).
- **Consumo Reduzido em Background**: Mesmo com a janela Electron fechada para economizar RAM, o `monblockd` consome `< 50MB RAM` e `< 1% CPU`.

### Negativas e Trade-offs Assumidos
- **Complexidade de Instalação e Atualização**: Exige instalador privilegiado (`.pkg` no macOS / prompt `sudo` de registro inicial do `LaunchDaemon`) em vez de simples drag-and-drop para `/Applications`.
- **Comunicação Inter-Processos Obrigatória**: Toda ação da UI requer serialização IPC e tratamento assíncrono de erros RFC 9457 entre processos distintos.
