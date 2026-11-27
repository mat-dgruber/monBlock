# Relatório: Spike S0 — premissas do Windows

- **Data:** 2026-11-27
- **Plano:** `docs/ai/plans/2026-11-27-spike-s0-windows-plan.md`
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v2)
- **Código do spike:** branch `spike/windows-s0`, em `spikes/windows/`. Ela fica viva até o E2 terminar e não vai para `dev`.
- **E1:** GitHub Actions `windows-latest` (Windows Server 2025 Datacenter, Node 22.23.5), 6 rodadas. A última é a [46004091361](https://github.com/mat-dgruber/monBlock/actions/runs/46004091361); as rodadas 1–5 corrigiram o próprio spike.
- **E2:** máquina gráfica ainda não definida. Por isso P8, P10 (com Defender ativo) e P11 estão pendentes.

## Resultado

| # | Premissa | Resultado | Evidência | Consequência |
|---|----------|-----------|-----------|--------------|
| P1 | O `.reg` exige `HKEY_LOCAL_MACHINE\`; `HKLM\` não funciona | ✅ **CONFIRMADA** | `reg import` do `.reg` com `[HKLM\…]` sai com **código 0** ("The operation completed successfully"), mas a chave **não existe** depois (`reg query` → "unable to find"). Com `HKEY_LOCAL_MACHINE\` funciona | **A Camada 2 não funciona hoje no Windows** e falha em silêncio. O W9 corrige; o W10 só detecta isso lendo o Registro (o código de saída não ajuda) |
| P2 | `reg import` aceita UTF-8 sem BOM | ✅ PASSOU | UTF-8 sem BOM: ok. **UTF-8 com BOM: falha.** UTF-16LE com BOM: ok | O W17 sai da spec. Fica um teste garantindo que o `.reg` **nunca** é gravado com BOM UTF-8 |
| P3 | `[-chave]` + recriação no mesmo arquivo remove valores antigos | ✅ PASSOU | 3 valores → reimport com `[-…URLBlocklist]` + 1 valor → `reg query` mostra só `"1"` | O W9 funciona como especificado |
| P4 | Usuário comum escreve no pipe e a rede é negada | ⚠️ **PARCIAL** — ver abaixo | DACL padrão: usuário comum recebe `EPERM` (confirma o W4). `readableAll/writableAll`: 10/10 ok, mas abre para Everyone. **DACL explícita aplicada pelo dono (SYSTEM) via `SetSecurityInfo`: 30/30 ok em 3 rodadas**, então a DACL vale para todas as instâncias | **D2-A muda:** criar com o DACL padrão (fail-closed) e o daemon aplica a DACL explícita logo depois do `listen`. Sem reaplicação periódica |
| P5 | O cliente sem privilégio distingue o daemon real de um impostor | ✅ PASSOU | Como `spike`: `GetNamedPipeServerProcessId` ok. Legítimo: PPID = PID do serviço. Impostor: PPID ≠ PID do serviço, dono `spike`. `GetOwner`/`ExecutablePath` de processo SYSTEM são **negados** ao usuário comum | O W21 verifica **PPID == `Win32_Service.ProcessId`**. A checagem de "dono S-1-5-18" da spec v2 não é viável |
| P6 | WinSW: sinal, árvore de processos, tarefa agendada | ✅ PASSOU | `SIGINT` recebido, parada em 0,4 s, `clean exit`. O filho `powershell` foi **morto**. O spawn `detached` também foi **morto**. A tarefa `schtasks /ru SYSTEM` **sobreviveu** e concluiu. Com o pipe ocupado por `spike`, o serviço registrou `listen error … EADDRINUSE` | Confirma o W12 (tarefa agendada) e o achado do goldfish. O W2 (`EADDRINUSE` → avisar e sair) se confirma |
| P7 | `shell.openExternal` preserva `&` e `,`; `explorer.exe` falha | ✅ PASSOU | `openExternal`: query recebida intacta (`?domain=a.com&reason=CATEGORY&rule=Categoria%3A%20Adulto,x`). `explorer.exe`: **código 1** e nada chegou em 15 s. `cmd /c start` não foi medido (timeout do teste) | O W11a usa `shell.openExternal`, como especificado. Os resultados JSON marcam FALHOU por um bug de timeout do script; a evidência é a acima |
| P8 | Helper PowerShell persistente: latência, CPU e CLM | ⏸️ NÃO TESTADO | Precisa de sessão gráfica (E2). Scripts prontos: `helper/probe-loop.ps1`, `helper/p8-bench.mjs` | Risco permanece na F5 |
| P9 | SEA em PE roda como SYSTEM sob WinSW | ✅ PASSOU | `postject@1.0.0-alpha.6` sem `--macho-segment-name`: ok. `--selftest` ok. Serviço `Running` (auto). `whoami /groups` contém **S-1-16-16384** | O W1 (`isPrivileged` por SID de integridade) e o W3 funcionam |
| P10 | Defender não reage ao hosts com as listas | ⏸️ NÃO TESTADO | O runner tem `RealTimeProtectionEnabled=false`. Mesmo assim: 7.989 domínios (15.980 linhas) ficaram no hosts por 5 min, sem detecção | Repetir no E2 com proteção em tempo real |
| P11 | Navegadores aplicam as políticas | ⏸️ NÃO TESTADO | Precisa de E2. Script pronto: `manual/p11-manifest.ps1` | Risco permanece na F1 (validar antes de fechar a fase) |

## Detalhes do P4 (IPC)

| Variante | Usuário comum local | Acesso por `\\localhost\pipe\…` |
|----------|--------------------|-------------------------------|
| DACL padrão do libuv | ❌ `EPERM` (cliente abre só leitura e a escrita falha) | — |
| `listen({ readableAll, writableAll })` | ✅ 10/10 | ✅ aceito (Everyone) |
| **DACL padrão + `SetSecurityInfo` pelo dono** com `D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)` | ✅ 30/30 (3 rodadas de 10) | ✅ aceito — **inconclusivo** |

- **Por que o acesso remoto é inconclusivo:** o `\\localhost` passa pelo SMB, mas a autenticação NTLM de loopback reaproveita o token local do chamador (ainda com `INTERACTIVE`, S-1-5-4). Então o teste não simula um cliente realmente remoto, e o `(D;;GA;;;NU)` não chega a ser exercitado. Um teste de verdade precisa de uma segunda máquina na rede (E2 ou laboratório). Mitigações atuais:
  - a ACE de negação `NU` (vale para logons de rede de verdade);
  - o firewall do Windows bloqueia a porta 445 de entrada no perfil público;
  - a autorização continua sendo a credencial do Ajudante.
- **Detalhes de implementação descobertos:**
  - o `PipeSecurity.SetAccessControl` do .NET falha ("unauthorized operation") mesmo como SYSTEM, porque tenta regravar owner/group. É preciso chamar `SetSecurityInfo` só com `DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION`;
  - os flags `0x80060000` precisam ser `[uint32]` no PowerShell, senão estouram o inteiro com sinal;
  - a aplicação abre um handle do pipe e consome uma instância; o libuv cria outra.
- **Janela entre `listen` e a DACL:** cerca de 3,5 s (o `Add-Type` do helper compila C#). Nesse intervalo vale o DACL padrão, em que o usuário comum só lê. É fail-closed: a UI apenas não consegue conectar ainda.

## Hashes e versões observados (para fixar na F3/F4)

- **WinSW v2.12.0** `WinSW-x64.exe`: SHA-256 `05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da`. Foi observado no download da release oficial (confiança no primeiro uso). Conferir com outra fonte antes de fixar.
- `postject@1.0.0-alpha.6` via npm (integridade pelo lockfile do npm).
- Node 22.23.5 (do `setup-node` com `node-version: 22`).

## Mudanças que o resultado impõe à spec (v2 → v3)

1. **W9:** passa a ser **bloqueador da F1**, porque a Camada 2 está quebrada hoje (P1).
2. **W17:** remover. No lugar, um teste "o `.reg` não tem BOM UTF-8" (P2).
3. **D2 / W4:** a D2-A passa a ser "DACL padrão no `listen` + `SetSecurityInfo` pelo daemon, com a SDDL acima", e não `readableAll`.
   - Isso precisa de um helper nativo para chamar `SetSecurityInfo`. A opção usada no spike, PowerShell + `Add-Type` executado pelo daemon (SYSTEM) uma vez no boot, funcionou.
   - Risco: WDAC/CLM em máquinas corporativas. Fallback: D2-B.
   - Sem reaplicação periódica.
   - O acesso remoto real fica como item de validação no E2 ou laboratório.
4. **W21:** a verificação do servidor passa a ser `PPID == Win32_Service(monblockd).ProcessId`, via o mesmo helper. A spec v2 pedia "dono S-1-5-18", que o usuário comum não consegue consultar.
   - Risco residual: reuso de PID entre a consulta e o envio (janela de milissegundos). Mitigação: consultar de novo depois da conexão.
5. **W12:** confirmado o disparo por tarefa agendada. O spawn `detached` não sobrevive.
6. **W2:** confirmado o tratamento de `EADDRINUSE`. O preshutdown foi aceito pelo WinSW (o XML instalou), mas **não foi testado com reboot**; isso fica no W18.
7. **§8 (riscos):** acrescentar "a Camada 2 falha em silêncio (`reg import` com código 0)", com mitigação pelo W10.

## Pendências do E2

- P8 (helper: latência, CPU e CLM).
- P10 com proteção em tempo real.
- P11 (`chrome://policy`, `edge://policy`, `about:policies`).
- P4 com cliente realmente remoto (segunda máquina).
- Depois do E2: apagar a branch `spike/windows-s0`, o usuário `spike` e as chaves de teste.
