<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-27 | Matheus Diniz (com Claude) | Rascunho da ADR 0016: serviço, IPC, empacotamento e correções do Windows, com base no spike S0.
================================================================================
-->

# ADR 0016: Serviço WinSW, IPC por Named Pipe com DACL Explícita e Empacotamento do monBlock no Windows

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-27) |
| **Decisores** | Matheus Diniz |
| **Tags** | `windows`, `windows-service`, `ipc`, `named-pipe`, `security`, `packaging`, `registry` |
| **Impacto Sistêmico** | Alto (`entry.ts`, `ipc-server.ts`, `daemon-client.ts`, `windows-platform-enforcer.ts`, `windows-watcher.ts`, `main.ts`, `updater.ts`, scripts e CI) |
| **ADRs Relacionadas** | Corrige a ADR-0015 (§2.2, §2.3 e §2.4) e a ADR-0013 (IPC no Windows) |

## Contexto

A ADR-0015 declarou paridade das 3 camadas no Windows, mas o caminho nunca rodou fora de mocks. A revisão (`docs/ai/reports/2026-11-25-revisao-funcionalidade-windows.md`) e o spike S0 (`docs/ai/reports/2026-11-27-spike-s0-windows.md`, Windows Server 2025, Node 22) mostraram que três premissas eram falsas.

### Premissas da ADR-0013/0015 que se mostraram falsas

1. **"Serviço Windows nativo via `sc.exe`":** um executável SEA do Node não implementa o protocolo do SCM (erro 1053).
2. **"Named Pipe com DACL restrita":** nenhum código aplicava DACL. Com o DACL padrão, o usuário comum só lê e o cliente recebe `EPERM` ao escrever (S0, P4). O único recurso do `node:net`, `readableAll`/`writableAll`, abre o pipe para Everyone, inclusive logons de rede.
3. **"Políticas via `.reg` + `reg import`":** o gerador usa `HKLM\`. O `reg import` aceita esse arquivo com **código 0** e não grava nada (S0, P1). A Camada 2 nunca funcionou no Windows.

### Riscos identificados

1. **Impostura do IPC:** a UI envia em claro a senha do Ajudante (`PAIR_PARTNER`, `SET_BOT_TOKEN`) e códigos de desafio. Um usuário comum que crie `\\.\pipe\monblockd` com o serviço parado captura esses segredos.
2. **Desinstalação sem o Ajudante:** no Windows doméstico o usuário costuma ser administrador. Um desinstalador no Painel de Controle anularia o produto.
3. **Falha silenciosa da imposição:** `reg import` com código 0 e o executor que engolia erros escondiam a quebra da Camada 2.

---

## 2. Decisão de Arquitetura

### D1 — Serviço: WinSW v2.12.0

- `monblockd.exe` (SEA) roda sob `monblockd-service.exe` (WinSW v2.12.0, MIT), com versão e SHA-256 fixados no build.
  - SHA-256 observado no S0: `05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da`. Conferir com outra fonte antes de fixar.
- XML:
  - recuperação: `restart` ×3 com 5 s, `resetfailure 1 day`;
  - parada: `stoptimeout 10 sec` e `preshutdown`;
  - log com rotação em `%ProgramData%\monBlock\logs`.
- **Validado no S0:**
  - P9: o SEA em PE é gerado com `postject` sem `--macho-segment-name` e roda como SYSTEM (`S-1-16-16384`).
  - P6: o `SIGINT` chega e a parada leva 0,4 s; o WinSW mata a árvore de filhos.
  - **Não validado:** o preshutdown num reboot real.

### D2 — IPC: Named Pipe com DACL explícita aplicada pelo daemon

1. `listen({ path: '\\\\.\\pipe\\monblockd' })` **sem** `readableAll`/`writableAll`. O pipe nasce fail-closed: o usuário comum só lê.
2. Logo depois, o daemon (SYSTEM, dono) executa o helper `pipe-acl` (PowerShell + `Add-Type` com P/Invoke). Ele chama `SetSecurityInfo(SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION)` com:

   ```
   D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)
   ```

   - SYSTEM e Administradores: tudo.
   - Interactive Users: leitura e escrita.
   - NETWORK: negado.
3. **Validado no S0 (P4):** 30/30 conexões de usuário comum em 3 rodadas. A DACL vale para todas as instâncias criadas depois, então **não há reaplicação periódica**.
4. O `PipeSecurity.SetAccessControl` do .NET **não** serve: falha mesmo como SYSTEM porque tenta regravar owner/group.
5. Se o helper falhar, o pipe fica fail-closed, entra drift `ipc:dacl` e o Ajudante é avisado.
6. **Fallback (D2-B):** TCP `127.0.0.1` + token de sessão (ACL `SY:F BA:F IU:R`), com prova do servidor primeiro e recusa de linhas HTTP. É usado só se políticas WDAC/CLM bloquearem o helper.

### D2.1 — Anti-impostura no cliente (W21)

- Antes de qualquer comando com segredo, o `daemon-client` obtém `GetNamedPipeServerProcessId` e exige que o **PPID do servidor seja igual a `Win32_Service(monblockd).ProcessId`** (o WinSW). Validado no S0 (P5).
- O usuário comum não consegue ler o dono nem o caminho de um processo SYSTEM, então essa alternativa foi descartada.
- Comandos sem segredo (`GET_STATE`) seguem sem a verificação.
- Erros do transporte e da verificação seguem o contrato atual do daemon: Problem Details (RFC 9457) via `buildProblem`, sem stack trace.

### D3 — Empacotamento

- `@electron/packager` (dev dependency) + **Inno Setup 6**.
- `PrivilegesRequired=admin`.
- **`Uninstallable=no`**: a remoção acontece só pela desinstalação autorizada pelo Ajudante.
- `PrepareToInstall` para o serviço no upgrade.
- AppUserModelID `com.ccat.monblock`.
- Atalho em `{commonstartup}`.
- Node fixado em `package.json#engines` + `.nvmrc`.

### D4 — Desinstalação por tarefa agendada única

- O daemon registra `schtasks /create /ru SYSTEM /sc once …` + `/run`, executando `uninstall.ps1` fora da árvore do serviço.
- **Validado no S0 (P6):** a tarefa sobrevive à parada do serviço; um spawn `detached` é morto.

### D5 — Políticas no Registro

- O manifesto `.reg` usa `HKEY_LOCAL_MACHINE\`, em UTF-8 **sem BOM** (S0, P2: com BOM o import falha).
- Cada lista é precedida de `[-chave]`, para remover os valores antigos (S0, P3).
- `verifyApplied` lê o Registro com `reg query` (o código de saída do `reg import` não é confiável).
- **Pendente (S0-E2, P11):** confirmar que Chrome, Edge e Firefox aplicam as políticas.

### D6 — Camada 3

- Helper PowerShell persistente (`GetForegroundWindow` + `GetWindowText`), ligado junto com o watcher.
- Redirecionamento via `shell.openExternal`. **Validado no S0 (P7):** preserva `&` e `,`; o `explorer.exe` sai com código 1 sem abrir nada.
- UI Automation para a URL real fica num passo posterior.
- **Pendente (P8):** latência, CPU e CLM.

### Matriz de Avaliação de Alternativas

| Critério | Serviço: WinSW (eleita) | Serviço: NSSM | Serviço: Tarefa agendada | Serviço: addon N-API |
| :--- | :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Baixo | Baixo | Alto |
| **Segurança** | Média (binário de terceiro fixado) | Média (sem manutenção) | Média | Alta |
| **Complexidade Operacional** | Baixa (SCM real) | Baixa | Média (sem semântica de parada) | Alta (build nativo por versão do Node) |

| Critério | IPC: pipe + DACL pelo daemon (eleita) | IPC: `readableAll` | IPC: TCP + token | IPC: addon nativo |
| :--- | :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Mínimo | Médio | Alto |
| **Segurança** | Alta (IU só, rede negada, fail-closed) | **Baixa** (Everyone, inclusive rede) | Média (token lido por qualquer interativo) | Alta |
| **Dependência de política (WDAC/CLM)** | Sim (`Add-Type`) | Não | Não | Não |

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

| Camada | Mudança |
| :--- | :--- |
| Daemon (`entry.ts`) | `isPrivileged()` por SID de integridade; caminhos por `ProgramData`/`SystemRoot`; ACL do `DATA_DIR` verificada no boot; `onUninstalled` com `schtasks`; `checkBrowserProfile` só em `darwin` |
| IPC (`ipc-server.ts`, `daemon-client.ts`) | `pipe-acl` depois do `listen` no `win32`; drift `ipc:dacl`; gate anti-impostura por tipo de comando |
| Enforcer (`windows-platform-enforcer.ts`) | Prefixo `HKEY_LOCAL_MACHINE`, `[-chave]`, executor que lança no `win32`, `lastApplyFailures`, `verifyApplied` com `reg query` |
| App (`main.ts`, `windows-watcher.ts`, `updater.ts`) | Ícone da bandeja, AppUserModelID, watcher + helper persistente, `shell.openExternal`, asset `.exe` no updater |
| Build/CI | `build-daemon-sea.ps1`, WinSW XML, `monblock.iss`, job `windows-package` com E2E |

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Impostor no pipe captura a senha do Ajudante | Alto | Verificação de PPID == serviço antes de enviar segredo; serviço sobe no boot; `EADDRINUSE` → avisar o Ajudante e sair |
| Camada 2 falha em silêncio | Alto | Prefixo correto + `reg query` no `verifyApplied` |
| Helper `pipe-acl` bloqueado por WDAC/CLM | Médio | Fail-closed + drift `ipc:dacl` + fallback D2-B |
| Acesso ao pipe por rede | Médio | `(D;;GA;;;NU)`; firewall padrão bloqueia a porta 445 no perfil público. **Validação com cliente remoto real pendente (S0-E2)** |
| Admin remove serviço/chaves à mão | Médio | `Uninstallable=no` + drift (Registro, hosts, inatividade) avisando o Ajudante. Não há promessa de resistir a admin |
| Políticas corporativas prévias nas subchaves `URLBlocklist`/`URLAllowlist`/`WebsiteFilter` são sobrescritas e não restauradas | Baixo | Documentado; produto é para uso doméstico |
| Janela de milissegundos com lista vazia durante o `reg import` | Baixo | A Camada 1 (hosts) cobre |
| Binário WinSW de terceiro (supply chain) | Médio | Versão e SHA-256 fixados; build recusa divergência |

## 7. Consequências e Resultados

### Positivas
- O Windows passa a ter as 3 camadas funcionando e verificáveis, com IPC restrito ao usuário interativo.
- Nenhuma dependência nativa compilada; os componentes de terceiros são o WinSW e o Inno, ambos fixados.
- O drift do Registro passa a ser detectado e avisado ao Ajudante.

### Mitigações e Desafios Gerenciados
- **Pendências do S0-E2:**
  - P11 (políticas nos navegadores) bloqueia o fim da F1.
  - P4 remoto real bloqueia o fim da F3.
  - P10 (Defender) bloqueia o release.
  - P8 (helper) bloqueia o início da F5.
- O instalador sem assinatura Authenticode gera aviso do SmartScreen. É uma dívida registrada fora do escopo.
- A ADR-0015 deve receber nota "§2.2–2.4 corrigidas pela ADR-0016" quando esta for aprovada.
