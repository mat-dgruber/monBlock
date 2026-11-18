<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-18 | Ambrósio / Matheus Diniz | Criação da ADR 0015: Políticas Corporativas e Imposição no Windows.
================================================================================
-->

# ADR 0015: Políticas Corporativas de Navegadores e Imposição de Sistema no Windows (Registro HKLM, icacls e Windows Service)

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-18) |
| **Decisores** | Matheus Diniz, Ambrósio |
| **Tags** | `architecture`, `windows`, `enforcer`, `registry`, `icacls`, `browser-policies`, `watcher`, `windows-service` |
| **Impacto Sistêmico** | Alto (`windows-platform-enforcer.ts`, `windows-watcher.ts`, `platform-enforcer.ts`, `main.ts`) |
| **ADRs Relacionadas** | Complementa ADR-0007, ADR-0013 e ADR-0014 |

---

## 1. Contexto

A expansão do monBlock para o sistema operacional Windows exige compatibilidade com as primitivas nativas de segurança e políticas corporativas do ecossistema Microsoft:
1. No macOS, as políticas utilizam perfis `.mobileconfig` e o arquivo `/etc/hosts` recebe `chflags uchg`.
2. No Linux, as políticas utilizam drop-in JSON em `/etc/` e o arquivo `/etc/hosts` recebe `chattr +i`.
3. No Windows, não existem flags `uchg` nem diretórios drop-in JSON para Chromium/Edge; navegadores corporativos leem exclusivamente o **Registro do Windows** sob a colmeia `HKLM\SOFTWARE\Policies`, e o controle de arquivos é exercido via **NTFS DACLs (Discretionary Access Control Lists)**.

---

## 2. Decisão de Arquitetura

### 2.1 Camada 1: Hosts no Windows com DACLs NTFS Restritas (`icacls`)
- **Caminho:** `%SystemRoot%\System32\drivers\etc\hosts`.
- **Integridade e Anti-Tampering:** Para impedir edição ou substituição por usuários comuns, o daemon aplica regras de segurança via `icacls`:
  ```cmd
  icacls %SystemRoot%\System32\drivers\etc\hosts /grant:r "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" "*S-1-5-32-545:(R)"
  ```
  Isso garante que apenas `NT AUTHORITY\SYSTEM` (SID `S-1-5-18`) e Administradores (SID `S-1-5-32-544`) possuam controle total, enquanto usuários regulares (SID `S-1-5-32-545`) possuem apenas permissão de leitura (`R`).
- **Descarga de Cache DNS:** Executada via comando nativo `ipconfig /flushdns`.

### 2.2 Camada 2: Políticas no Registro do Windows (`HKLM\SOFTWARE\Policies`)
Políticas para todos os navegadores corporativos no Windows são centralizadas em `HKEY_LOCAL_MACHINE\SOFTWARE\Policies`:
- **Google Chrome:** `HKLM\SOFTWARE\Policies\Google\Chrome`
- **Microsoft Edge:** `HKLM\SOFTWARE\Policies\Microsoft\Edge`
- **Brave Browser:** `HKLM\SOFTWARE\Policies\BraveSoftware\Brave`
- **Chromium:** `HKLM\SOFTWARE\Policies\Chromium`
- **Vivaldi:** `HKLM\SOFTWARE\Policies\Vivaldi`
- **Mozilla Firefox:** `HKLM\SOFTWARE\Policies\Mozilla\Firefox`

**Valores e Subchaves Aplicadas:**
- `URLBlocklist`: Subchave contendo valores enumerados (`"1"="dominio1.com"`, `"2"="dominio2.com"`...).
- `URLAllowlist`: Subchave com exceções permitidas.
- `DnsOverHttpsMode`: `REG_SZ` = `"off"`.
- `IncognitoModeAvailability`: `REG_DWORD` = `1` (se `lockIncognito` ativo).
- `WebsiteFilter` e `DNSOverHTTPS` (`Enabled` = `0`, `Locked` = `1`) no Firefox.

O `WindowsPlatformEnforcer` gera arquivos `.reg` formatados de forma idempotente e os importa via `reg.exe import <arquivo.reg>`, sem necessidade de bibliotecas nativas de C++, mantendo o executável leve e imune a incompatibilidades de compilação.

### 2.3 Camada 3: Watcher Windows (`WindowsBrowserWatcher`)
- A inspeção de janela em primeiro plano identifica executáveis suportados (`chrome.exe`, `msedge.exe`, `brave.exe`, `firefox.exe`, `opera.exe`, `vivaldi.exe`) via chamadas PowerShell / Win32 `GetForegroundWindow`.
- O redirecionamento é disparado de forma padronizada via `cmd.exe /c start "" "http://127.0.0.1:49152/blocked?..."`.
- Mantém-se o motor com debounce de 150ms, cache `lastCheckedKey` e validação Zero-PII.

### 2.4 Ciclo de Vida e Serviço Windows
- O daemon roda como um Serviço Windows nativo (`monblockd`), executando como `NT AUTHORITY\SYSTEM`.
- Configuração de recuperação via `sc.exe failure monblockd reset= 86400 actions= restart/5000`.
- IPC via Windows Named Pipe: `\\.\pipe\monblockd`.

---

## 3. Consequências

### Positivas
- **Paridade Multiplataforma Total:** O monBlock alcança suporte nativo completo em macOS, Linux e Windows com rigor idêntico de 3 camadas.
- **Zero Dependências Nativas Externas:** Manipulação de registro via `reg.exe` e ACLs via `icacls.exe`.
- **Governança Unificada:** O mesmo `startDaemon` e `MonBlockDaemon` orquestram as três plataformas através do contrato `PlatformEnforcer`.
