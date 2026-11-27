<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-18 | Ambrósio / Matheus Diniz | Criação da ADR 0013: Fundação Arquitetural Multiplataforma (Linux & Windows).
================================================================================
-->

# ADR 0013: Fundação Arquitetural Multiplataforma (Linux & Windows) com Fábrica Abstrata de Imposição e Layout de Sistema

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-18); IPC no Windows **corrigido pela ADR-0016** (2026-11-27) |
| **Decisores** | Matheus Diniz, Ambrósio |
| **Tags** | `architecture`, `multiplatform`, `linux`, `windows`, `daemon`, `ipc`, `enforcer` |
| **Impacto Sistêmico** | Alto (`platform-enforcer.ts`, `entry.ts`, `ipc-server.ts`, `main.ts`, `daemon-client.ts`) |
| **ADRs Relacionadas** | Extende ADR-0001, ADR-0002 e ADR-0007 para Linux e Windows; corrigida por [ADR-0016](0016-servico-ipc-e-correcoes-do-suporte-windows.md) |

---

## 1. Contexto

O monBlock foi originalmente concebido e implementado estritamente para o ecossistema macOS (`darwin`), utilizando primitivas específicas da Apple como:
1. `LaunchDaemon` root (`/Library/LaunchDaemons/com.ccat.monblockd.plist`) e `LaunchAgent` Aqua (`com.ccat.monblock.watcher.plist`).
2. Trava imutável de sistema via `chflags uchg` no arquivo `/etc/hosts`.
3. Perfis corporativos de gerenciamento `.mobileconfig` e manifestos `.plist` sob `/Library/Managed Preferences/`.
4. Inspeção de abas ativas e redirecionamento via eventos AppleScript (`osascript`).

Com a expansão do produto para atender usuários em **Linux** e **Windows**, o monBlock precisa manter seus axiomas fundamentais de segurança (Defesa em 3 Camadas, Catraca Append-Only, Fail-Closed, Imunidade a manipulação de relógio e Isolamento de Privilégios), adaptando as camadas de imposição às primitivas nativas de cada sistema operacional.

---

## 2. Decisão de Arquitetura

1. **Fábrica Abstrata `createPlatformEnforcer(platform, options)`:**
   - O contrato `PlatformEnforcer` torna-se a abstração canônica de imposição web (`applyWebRules`, `protectCriticalPaths`, `restoreSystemCleanState`, `verifyApplied`).
   - O `MacOSPlatformEnforcer` é isolado como implementação concreta de macOS.
   - Implementações correspondentes `LinuxPlatformEnforcer` e `WindowsPlatformEnforcer` assumem a imposição em suas respectivas plataformas.

2. **Resolução de Layout de Diretórios e Arquivos (`resolveLayout(rootDir, platform)`):**
   - O layout físico do daemon é abstraído por SO:
     - **macOS (`darwin`):** `/Library/Application Support/monBlock`, `/var/db/monblock`, socket UNIX em `/var/run/monblock/monblockd.sock`, hosts em `/etc/hosts`.
     - **Linux (`linux`):** `/etc/monblock`, `/var/lib/monblock`, socket UNIX em `/run/monblock/monblockd.sock`, hosts em `/etc/hosts`.
     - **Windows (`win32`):** `%ProgramData%\monBlock`, `%ProgramData%\monBlock\db`, Named Pipe em `\\.\pipe\monblockd`, hosts em `%SystemRoot%\System32\drivers\etc\hosts`.

3. **Canal IPC Multiplataforma:**
   - Mantém-se o protocolo NDJSON com RFC 9457 Problem Details.
   - Em POSIX (macOS e Linux), utiliza-se UNIX Domain Socket com controle de grupo `monblock` e permissão `0750`.
   - No Windows, utiliza-se Windows Named Pipe `\\.\pipe\monblockd` com DACL restrita ao grupo de Administradores e SYSTEM. O módulo nativo `node:net` suporta Named Pipes de forma transparente.

4. **Matriz de Defesa por Plataforma:**
   - **Camada 1 (Hosts):**
     - macOS: `/etc/hosts` com `chflags uchg` e `dscacheutil -flushcache`.
     - Linux: `/etc/hosts` com `chattr +i` e `resolvectl flush-caches`.
     - Windows: `%SystemRoot%\System32\drivers\etc\hosts` com ACLs NTFS restritas e `ipconfig /flushdns`.
   - **Camada 2 (Políticas de Navegadores):**
     - macOS: `.mobileconfig` e plists.
     - Linux: Drop-in de JSONs em `/etc/opt/chrome/policies/managed/`, `/etc/firefox/policies/`, etc.
     - Windows: Chaves em `HKLM\SOFTWARE\Policies\Google\Chrome`, etc.
   - **Camada 3 (Watcher de Abas):**
     - macOS: Apple Events via `osascript`.
     - Linux: D-Bus AT-SPI2 / X11.
     - Windows: Win32 UI Automation (`IUIAutomation`).

---

## 3. Consequências

- **Positivas:**
  - Código desacoplado e aderente ao Princípio da Inversão de Dependência (DIP / Clean Architecture).
  - O núcleo de regras, relógio confiável e servidor de bloqueio continuam 100% compartilhados entre os três sistemas.
  - Testes de macOS continuam funcionando sem regressão.
- **Negativas:**
  - Necessidade de pipelines de CI/CD matriciais (`macos-latest`, `ubuntu-latest`, `windows-latest`) para compilação SEA e testes específicos de cada SO.
