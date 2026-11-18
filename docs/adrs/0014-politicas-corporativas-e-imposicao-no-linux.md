<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-18 | Ambrósio / Matheus Diniz | Criação da ADR 0014: Políticas Corporativas e Imposição no Linux.
================================================================================
-->

# ADR 0014: Políticas Corporativas de Navegadores e Imposição de Sistema no Linux (systemd, chattr e Drop-in JSON)

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-18) |
| **Decisores** | Matheus Diniz, Ambrósio |
| **Tags** | `architecture`, `linux`, `enforcer`, `systemd`, `chattr`, `browser-policies`, `watcher` |
| **Impacto Sistêmico** | Alto (`linux-platform-enforcer.ts`, `linux-watcher.ts`, `platform-enforcer.ts`, `entry.ts`) |
| **ADRs Relacionadas** | Complementa ADR-0007, ADR-0011 e ADR-0013 |

---

## 1. Contexto

A expansão do monBlock para Linux exige paridade com os três níveis de imposição do macOS (Hosts com trava imutável, Políticas Corporativas de Navegadores e Watcher de abas em tempo real), preservando os princípios de **Defesa em Profundidade**, **Zero-Trust**, **Fail-Closed** e integridade criptográfica.

No macOS, as políticas de navegadores são aplicadas via perfil de configuração `.mobileconfig` gerenciado pelo subsistema `mdm`/`profiles` da Apple, e o arquivo `/etc/hosts` recebe a flag imutável do sistema `chflags uchg`. No Linux, tais ferramentas não existem, demandando primitivas nativas do kernel Linux e do FHS (Filesystem Hierarchy Standard).

---

## 2. Decisão de Arquitetura

### 2.1 Camada 1: `/etc/hosts` com Trava de Extensões de Arquivo (`chattr +i`)
- A escrita atômica do arquivo `/etc/hosts` é realizada com permissão `0644`.
- A proteção anti-tampering aplica o atributo imutável `chattr +i /etc/hosts`. Qualquer tentativa de edição ou remoção por processos sem privilégios ou scripts é bloqueada diretamente pelo VFS do kernel Linux.
- Antes de atualizações legítimas realizadas pelo daemon root, o monBlock executa temporariamente `chattr -i`, reaplica o bloco atômico e restaura `chattr +i`.
- A descarga de cache DNS é executada via `resolvectl flush-caches` com fallback para `systemd-resolve --flush-caches`.

### 2.2 Camada 2: Políticas Gerenciadas Drop-in JSON
Ao invés de manifestos XML `.plist`, navegadores modernos no Linux suportam leitura nativa de políticas gerenciadas corporativas a partir de arquivos JSON em diretórios administrativos de sistema (`/etc`):
- **Google Chrome:** `/etc/opt/chrome/policies/managed/monblock.json`
- **Chromium:** `/etc/chromium/policies/managed/monblock.json`
- **Brave Browser:** `/etc/brave/policies/managed/monblock.json`
- **Microsoft Edge:** `/etc/opt/edge/policies/managed/monblock.json`
- **Vivaldi:** `/etc/vivaldi/policies/managed/monblock.json`
- **Mozilla Firefox:** `/etc/firefox/policies/policies.json`

O `LinuxPlatformEnforcer` gera as configurações com:
- `URLBlocklist` e `URLAllowlist` ativas.
- `DnsOverHttpsMode: "off"` para impedir bypass de DNS.
- `IncognitoModeAvailability: 1` quando `lockIncognito` estiver habilitado.
- `WebsiteFilter` e `DNSOverHTTPS: { Enabled: false, Locked: true }` no Firefox.

### 2.3 Camada 3: Watcher Linux (`LinuxBrowserWatcher`)
- A inspeção de janela ativa utiliza adaptadores baseados em X11 (`xdotool getactivewindow getwindowname` e `xprop WM_CLASS`) ou interfaces de acessibilidade AT-SPI2 no Wayland.
- O redirecionamento é disparado de forma padronizada via `xdg-open "http://127.0.0.1:49152/blocked?..."`.
- Mantém-se o mesmo motor com debounce de 150ms, cache `lastCheckedKey` e verificação de `TemporaryGrants`.

### 2.4 Ciclo de Vida e Sandboxing com systemd
- O daemon roda sob `systemd` como serviço de sistema: `monblockd.service`.
- Utiliza diretivas de endurecimento:
  - `RuntimeDirectory=monblock` (cria `/run/monblock` com permissões `0750` e grupo `monblock`).
  - `ProtectSystem=strict` e `ProtectHome=read-only`.
  - `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_DAC_OVERRIDE CAP_LINUX_IMMUTABLE`.

---

## 3. Consequências

### Positivas
- **Paridade Total:** Linux atinge o mesmo rigor de bloqueio de 3 camadas presente no macOS.
- **Transparência:** Sem binários de terceiros ou hooks de kernel complexos; utiliza recursos canônicos de distribuições Debian/Ubuntu/Fedora/Arch.
- **Desacoplamento:** O daemon `monblockd` consome o mesmo contrato `PlatformEnforcer`, alternando a implementação via `createPlatformEnforcer('linux')`.

### Negativas / Mitigações
- **Wayland Sandbox:** Ambientes Wayland puros restringem ferramentas como `xdotool`. O adaptador Linux opera com fallback resiliente e captura de eventos AT-SPI2.
