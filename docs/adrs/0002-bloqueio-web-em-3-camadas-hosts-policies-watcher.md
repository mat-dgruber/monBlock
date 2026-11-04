<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-04 | adr-governor   | Criação da ADR 0002 detalhando o bloqueio web em 3 camadas (/etc/hosts, Enterprise Policies e Watcher Universal).
================================================================================
-->

# ADR 0002: Defesa em Profundidade para Bloqueio Web em 3 Camadas (/etc/hosts, Enterprise Policies e Watcher Universal)

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-04) |
| **Decisores** | Arquitetura monBlock, SecOps, Tech Lead |
| **Tags** | `[web-blocking]`, `[network]`, `[browser-policies]`, `[accessibility]`, `[resilience]` |
| **Impacto Sistêmico** | Alto (`platform-enforcer`, `hosts-enforcer`, `browser-policy-enforcer`, `universal-watcher`) |
| **ADRs Relacionadas** | Supera ADR-002 de `_reversa_sdd/`; Depende de ADR-0001 |

## Contexto
A engenharia reversa do Cisdem AppCrypt v7.11.0 (`_reversa_sdd/web-block-engine/design.md:49` e `ADR-002` de referência) demonstrou que depender exclusivamente de polling via AppleEvents (`NSAppleScript`) apresenta três vulnerabilidades graves:
1. O **Firefox** no macOS não expõe dicionário completo de Scripting Bridge para leitura e redirecionamento de abas, permitindo bypass trivial basta abrir o Firefox ou navegadores baseados em Gecko.
2. O polling isolado de UI possui latência de até `1.000ms` a `2.000ms`, permitindo que conexões de rede iniciem antes do redirecionamento.
3. Navegadores com **DNS-over-HTTPS (DoH)** ou **Modo Anônimo** ativo podem contornar filtros rasos.

### Riscos Identificados e Problemas a Resolver:
1. **Bypass via Firefox e Navegadores Alternativos**: Ausência de suporte a AppleEvents em navegadores não-Chromium/WebKit.
2. **Corrupção do `/etc/hosts` do Sistema**: Escritas diretas sem atomicidade podem quebrar entradas críticas de desenvolvimento (`localhost`, túneis VPN, Docker).
3. **Bloqueio por Palavra-Chave em Caminhos de URL e Títulos**: `/etc/hosts` bloqueia apenas domínios inteiros, sendo incapaz de filtrar caminhos específicos ou termos combinados (`AND`) na URL/título da página.

---

## 1. Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **Padrões de Resiliência Defensiva** | `.agents/ai-guides/guides/architecture/guia-padroes-resiliencia-defensiva.md` | Escrita atômica com `.tmp`/`.bak`, preservação de integridade e prevenção de auto-sabotagem (allowlist crítica). |
| **Engenharia Reversa Cisdem AppCrypt** | `_reversa_sdd/web-block-engine/requirements.md` (`RN-WEB-01..07`) | Precedência máxima de `whiteWebsites`, prevenção de loop de redirecionamento e palavras-chave combinadas. |

---

## 2. Decisão de Arquitetura

Implementar um motor de bloqueio web em **3 Camadas Complementares (Defesa em Profundidade)** coordenadas pelo `monblockd`:

1. **Camada 1 — Kernel & Rede (`/etc/hosts` Atômico + `chflags uchg` + DNS Family `1.1.1.3`)**:
   - Escrita atômica delimitada por marcadores `# >>> MONBLOCK START >>>` e `# <<< MONBLOCK END <<<` via arquivo temporário (`/etc/hosts.monblock.tmp` + `fs.renameSync`) com backup prévio em `/etc/hosts.monblock.bak`, trava de imutabilidade `chflags uchg` e flush imediato do cache DNS (`dscacheutil -flushcache`).
   - Configuração de DNS Familiar (`1.1.1.3` Cloudflare Family) e regras `pfctl` para bloquear portas DoT (`853`).
2. **Camada 2 — Enterprise Browser Policies (`.plist` & `policies.json`)**:
   - Geração de políticas corporativas gerenciadas em `/Library/Managed Preferences/*.plist` (Chrome, Brave, Edge, Arc, Safari) e `/Applications/Firefox.app/Contents/Resources/distribution/policies.json` (Firefox).
   - Aplica `URLBlocklist`, `URLAllowlist` (precedência máxima `RN-WEB-01`), desativa DNS-over-HTTPS interno (`DnsOverHttpsMode = off`) e controla a flag opcional trancável **"Bloquear Modo Anônimo"** (`IncognitoModeAvailability = 1` e `DisablePrivateBrowsing = true`).
3. **Camada 3 — Watcher Universal de Abas e Palavras-Chave (AppleEvents + `AXUIElement`)**:
   - Combina AppleEvents (`NSAppleScript` para Safari, Chrome, Brave, Edge, Arc) com a API de Acessibilidade nativa do macOS (`AXUIElement` lendo `AXURL` / `AXValue` da barra de endereços e `AXTitle` da janela para Firefox, Zen e qualquer navegador).
   - Avalia palavras-chave simples e compostas por vírgula com operador lógico `AND` (`RN-WEB-06`) e redireciona abas violadoras em `p95 < 400ms` para `http://127.0.0.1:49152/blocked`, respeitando prevenção de loop (`RN-WEB-02`) e allowlist de infraestrutura crítica (`localhost`, `127.0.0.1`, `api.telegram.org`, SSO).

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: Apenas `/etc/hosts` + DNS | Opção B: Apenas Polling AppleEvents (Cisdem) | Opção C: Tripla Camada Híbrida (`/etc/hosts` + Policies + Watcher AppleEvents/`AXUIElement`) (Eleita) |
| :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Médio | Médio |
| **Latência de Bloqueio** | `< 1ms` (domínio) / Nulo para keywords | `500ms - 1.500ms` | `< 1ms` (domínio) / `< 400ms` (keywords/URL) |
| **Cobertura no Firefox & DoH** | Parcial (vulnerável a DoH) | Falha no Firefox | Total (Policies desativam DoH + `AXUIElement` lê Firefox) |
| **Complexidade Operacional** | Baixa | Média | Média |
| **Curva de Aprendizado** | Rápida | Moderada | Moderada |

```text
Navegador do Usuário (Chrome, Safari, Brave, Arc, Edge, Firefox)
  |
  +---> [Camada 1: /etc/hosts (0.0.0.0 + uchg) + DNS 1.1.1.3] ---> Bloqueia domínio em < 1ms
  |
  +---> [Camada 2: Enterprise Policies (.plist / policies.json)] -> Bloqueia DoH, Modo Anônimo (se ativo) e URLBlocklist
  |
  +---> [Camada 3: Watcher Universal (AppleEvents + AXUIElement)] -> Inspeciona URL completa/Título (AND keywords)
                                                                     e redireciona p/ http://127.0.0.1:49152/blocked
```

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

### 3.1 Camada de Backend / Daemon (`PlatformEnforcer`)
- **`HostsEnforcer`**: Remove temporariamente `chflags nouchg /etc/hosts`, valida a existência de `/etc/hosts.monblock.bak`, substitui exclusivamente o bloco delimitado em `/etc/hosts.monblock.tmp`, executa `renameSync` e reaplica `chflags uchg /etc/hosts`.
- **`BrowserPolicyEnforcer`**: Sincroniza listas de exceção (`whiteWebsites` > `blackWebsites`) e a flag `lock_incognito_flag` nos arquivos `.plist` e `policies.json`.
- **`UniversalBrowserWatcher`**: Loop assíncrono de baixo consumo (`< 1% CPU`) que ignora URLs iniciadas por `http://127.0.0.1:49152/blocked` (`RN-WEB-02`) e domínios da allowlist crítica de infraestrutura.

### 3.2 Camada de Frontend / Client (`Tela Local de Bloqueio`)
- **Servidor Local (`127.0.0.1:49152/blocked`)**: Renderiza a tela empática de bloqueio com a causa exata (categoria ou palavra-chave disparada) e botão para acionar o fluxo de desbloqueio junto ao Ajudante.

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)
```sql
CREATE TABLE category (
    id TEXT PRIMARY KEY,
    name_pt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    is_default_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_default_locked IN (0, 1)),
    domain_count INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE rule_item (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('DOMAIN_BLOCK', 'KEYWORD', 'ALLOWLIST_EXCEPTION')),
    value TEXT NOT NULL,
    category_id TEXT REFERENCES category(id),
    added_by TEXT NOT NULL CHECK (added_by IN ('USER', 'PARTNER', 'SYSTEM')),
    created_at TEXT NOT NULL,
    row_hmac CHAR(64) NOT NULL
) STRICT;

CREATE INDEX ix_rule_item_type_value ON rule_item (type, value);
```

---

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado no Contexto | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **Perda de entradas customizadas no `/etc/hosts`** | Alto | Backup automático `/etc/hosts.monblock.bak` antes da primeira escrita e edição restrita aos delimitadores `# >>> MONBLOCK START/END`. |
| **Falso positivo bloqueando login corporativo (SSO) ou Telegram** | Alto | Allowlist estrita imune a keywords (`localhost`, `127.0.0.1`, `api.telegram.org`, `accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com`). |
| **Loop infinito de redirecionamento na aba** | Médio | Guard explícito no Watcher ignorando qualquer aba cujo host seja `127.0.0.1:49152` (`RN-WEB-02`). |

---

## 7. Consequências e Resultados

### Positivas
- **Cobertura Universal de Navegadores**: O Firefox e navegadores baseados em Gecko passam a ser protegidos tanto por `policies.json` quanto por inspeção via `AXUIElement`.
- **Latência Zero para Domínios Conhecidos**: Domínios das categorias ativas são barrados diretamente na resolução de nomes do kernel (`< 1ms`).
- **Controle Granular de Modo Anônimo**: O usuário pode optar por travar o Modo Anônimo via Enterprise Policy sob proteção da Catraca Unidirecional.

### Negativas e Trade-offs Assumidos
- **Permissões de Sistema no macOS**: O Watcher Universal exige concessão de permissão de Acessibilidade (`AXIsProcessTrusted`) e Automação (`AppleEvents`) no onboarding inicial.
- **Aviso de Gerenciamento nos Navegadores**: O uso de Enterprise Policies exibe o indicador "Gerenciado pela sua organização" no menu do Chrome/Firefox/Brave, comportamento esperado e documentado para o usuário.
