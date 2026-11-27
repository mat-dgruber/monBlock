# Plano: Spike S0 — validação de premissas do Windows

- **Data:** 2026-11-27
- **Status:** APROVADO (2026-11-27). `/plan-criticize`: 0/100. Pendente: definir a máquina do E2 (P8, P11).
- **Spec de origem:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v2, §4 "S0")
- **Saída:** `docs/ai/reports/2026-11-XX-spike-s0-windows.md`, com PASSOU/FALHOU por premissa + variante D2 escolhida
- **Duração máxima:** 2 dias úteis (timebox). Se estourar, para e reporta o que ficou sem resposta.

---

## 1. Objetivo e não objetivos

Responder com evidência (comando + saída) as premissas que a spec v2 tira de conhecimento sem teste. **Nenhuma linha de `src/` muda.** O código do spike é descartável.

Fora do escopo: corrigir os problemas encontrados (isso é a F1 em diante); build de produção; instalador Inno.

## 1.1 Alternativas consideradas

| Abordagem | Como | Prós | Contras | Escolha |
|-----------|------|------|---------|---------|
| A. Lean — pular o spike e corrigir direto na F1 | Implementar com as suposições da spec | Zero tempo extra | Premissas críticas não testadas (prefixo `.reg`, pipe, WinSW) podem invalidar F1–F4 e gerar retrabalho | ❌ |
| **B. Spike CI + 1 máquina gráfica (este plano)** | Scripts descartáveis no `windows-latest` + checagens interativas num Windows x64 | Evidência reproduzível, timebox de 2 dias, sem tocar `src/` | Precisa de uma máquina Windows x64 para P8/P11 | ✅ |
| C. Robusta — laboratório de VMs (Win10 22H2, Win11, com e sem Defender/AppLocker) | Matriz de VMs com snapshots | Cobre versões e políticas corporativas | Dias de setup e licenças; excesso para validar premissas | ❌ (fica para o checklist de release) |

## 2. Onde roda

| Ambiente | Uso | Por quê |
|----------|-----|--------|
| **E1 — GitHub Actions `windows-latest`** (workflow manual `workflow_dispatch` numa branch de spike) | P1–P7, P9, P10 | Descartável, x64, admin sem senha, reproduzível. Sem desktop interativo |
| **E2 — Windows 11 x64 com sessão gráfica** (máquina ou VM do usuário) | P8, P11, P10 com Defender em tempo real | Precisa de janela em primeiro plano, navegador aberto e `chrome://policy` |

O Mac do usuário é Apple Silicon; uma VM x64 emulada é lenta e o alvo da spec não inclui ARM64. **Decisão pendente do usuário:** qual máquina é o E2. Sem E2, P8/P11 ficam "NÃO TESTADO" no relatório e voltam como risco para a F5.

## 3. Artefatos do spike (branch `spike/windows-s0`, nunca vai para `main`/`dev`)

```
spikes/windows/
  .github-workflow-spike.yml   -> copiado para .github/workflows/spike-windows.yml só na branch
  reg/                         P1–P3: manifestos .reg de teste e reg-probe.ps1
  pipe/                        P4–P5: server.mjs, client.mjs, remote-probe.ps1, owner-probe.ps1
  service/                     P6, P9: monblockd-spike.xml (WinSW), sea-build.ps1, spike-daemon.mjs
  redirect/                    P7: open-url.mjs (Electron mínimo) e explorer-exit.ps1
  helper/                      P8: probe-loop.ps1
  defender/                    P10: hosts-8k.txt gerado de src/domain/lists
  run-all.ps1                  executa P1–P7, P9, P10 e grava results.json
```

O relatório final é a única coisa que entra em `dev` (via PR de docs). A branch de spike é apagada depois.

## 4. Premissas e procedimento

Cada premissa tem critério binário. "Fallback" diz o que a spec usa se FALHAR.

| # | Premissa | Procedimento | PASSOU se | Fallback |
|---|----------|--------------|-----------|----------|
| P1 | O `.reg` exige `HKEY_LOCAL_MACHINE\`; `HKLM\` é ignorado/rejeitado | Importar dois `.reg` idênticos, um com `[HKLM\SOFTWARE\Policies\MonBlockSpike]`, outro com `[HKEY_LOCAL_MACHINE\...]`; `reg query` em cada um; anotar `$LASTEXITCODE` | Registrar o comportamento real dos dois. A spec segue com `HKEY_LOCAL_MACHINE` em qualquer caso; P1 só confirma se a Camada 2 atual está quebrada | — |
| P2 | `reg import` aceita UTF-8 sem BOM com `Windows Registry Editor Version 5.00` | Importar o mesmo manifesto em UTF-8 sem BOM, UTF-8 com BOM e UTF-16LE com BOM | UTF-8 sem BOM importa todos os valores | W17: UTF-16LE com BOM |
| P3 | `[-chave]` seguido da recriação no mesmo arquivo remove valores antigos | Importar lista com 3 valores; importar manifesto com `[-chave]` + 1 valor; `reg query` | Só `"1"` existe | Emitir `"N"=-` para os índices excedentes |
| P4 | `listen({ readableAll, writableAll })` deixa usuário comum escrever em todas as instâncias e acesso de rede é negado | `server.mjs` como SYSTEM (via `schtasks /ru SYSTEM`); `net user spike /add`; `client.mjs` como `spike` (tarefa com `/ru spike`) abrindo 10 conexões simultâneas e mandando uma linha; `remote-probe.ps1` abrindo `\\localhost\pipe\monblockd-spike` (passa pelo redirecionador SMB = logon de rede) | 10/10 respostas e acesso remoto negado | Remoto aceito → D2-A não serve sozinha: avaliar ACE explícita via helper; se não houver forma sem addon → **D2-B** |
| P5 | O cliente sem privilégio identifica o processo servidor do pipe (W21) | `owner-probe.ps1` como `spike`: `GetNamedPipeServerProcessId` por P/Invoke; comparar o PID com o filho do serviço (`Win32_Process.ParentProcessId` == `Win32_Service.ProcessId`); repetir com um pipe impostor criado por `spike` | Distingue servidor legítimo do impostor sem elevação | D2-B com prova do servidor (desafio HMAC por chave pública gravada pelo instalador) |
| P6 | WinSW v2.12.0: Ctrl+C chega como `SIGINT`; preshutdown dá tempo de gravar; parar o serviço mata a árvore de filhos; tarefa `schtasks` sobrevive | `spike-daemon.mjs` grava `C:\spike\events.log` em `SIGINT` e cria filho `sleep 300`; `Stop-Service`; verificar log e se o filho morreu; repetir disparando `schtasks /create /ru SYSTEM /sc once` + `/run` antes do stop e ver se a tarefa termina | `SIGINT` logado; filho morto; tarefa conclui | `SIGINT` não chega → tratar `SIGBREAK`/`process.on('message')`; filho não morre → spawn direto basta (W12 fica mais simples) |
| P7 | `explorer.exe <url>` sai com código 1; `shell.openExternal` preserva `&` e `,` | `explorer-exit.ps1` com URL de teste; `open-url.mjs` (Electron mínimo) apontando para um servidor local que grava a query recebida | `openExternal` entrega a query intacta | Usar `rundll32 url.dll,FileProtocolHandler` |
| P8 | Helper PowerShell persistente (loop `ReadLine` + `GetForegroundWindow`/`GetWindowText`) responde em < 100 ms p95 e < 1% de CPU em repouso; com Constrained Language Mode o `Add-Type` falha de forma detectável | E2: abrir Chrome/Edge/Firefox; 1.000 probes a cada 1,5 s; medir latência e CPU (`Get-Counter`); depois `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'` numa sessão e repetir | Metas atingidas e erro de CLM capturado | Helper nativo pequeno (C# compilado no build) → **vira ADR** |
| P9 | SEA em PE via `postject` sem `--macho-segment-name` roda como SYSTEM sob WinSW; `whoami /groups` mostra `S-1-16-16384` | `sea-build.ps1` com Node fixado; instalar com WinSW; o daemon de spike grava a saída do `whoami /groups` | Serviço `Running` e SID presente | Ajustar flags do `postject`; se não rodar, empacotar `node.exe` + script (sem SEA) |
| P10 | Defender não remove/bloqueia hosts com ~8,6 k domínios das listas atuais | Gerar hosts de `src/domain/lists/*.domains.txt`; gravar como SYSTEM; aguardar 10 min; `Get-MpThreatDetection` | Nenhuma detecção | Identificar domínios que disparam e somar à `CRITICAL_INFRA_ALLOWLIST` |
| P11 | Chrome, Edge e Firefox aplicam as políticas importadas (com o prefixo que passar no P1) | E2: importar manifesto real gerado pelo `generateWindowsRegistryManifest` (corrigido localmente no spike); abrir `chrome://policy`, `edge://policy`, `about:policies`; tentar abrir um domínio bloqueado | Política listada como ativa e domínio bloqueado nos 3 | Registrar por navegador; ajustar chaves |

## 5. Segurança durante o spike

- Usuário `spike` criado só no runner/VM e removido no fim (`net user spike /delete`).
- Chaves de teste ficam sob `HKLM\SOFTWARE\Policies\MonBlockSpike` (P1–P3), nunca nas chaves reais dos navegadores, exceto P11 no E2, que termina com `reg delete` das subchaves gerenciadas.
- Nenhum segredo real: sem token do Telegram, sem senha do Ajudante. O workflow de spike não usa `secrets`.
- Downloads (WinSW, `postject`) com versão e SHA-256 fixados no `run-all.ps1`; recusa se o hash divergir.

## 6. Resiliência e casos de borda do próprio spike

- Cada premissa roda isolada em `try/finally` com limpeza (chaves, serviço, usuário, hosts restaurado do backup). Falha de uma não impede as outras; `results.json` marca `ERRO` com a mensagem.
- Timeouts: 60 s por premissa no E1 (P10: 15 min), job inteiro com `timeout-minutes: 45`.
- P4/P5 incluem os casos de borda: servidor ainda não aberto (cliente recebe `ENOENT`), impostor abrindo antes do servidor (`EADDRINUSE` no servidor), linha maior que o limite.

## 7. Rollback

- E1: runner descartável; apagar a branch `spike/windows-s0` remove o workflow.
- E2: `run-all.ps1 -Cleanup` remove serviço, usuário, chaves e restaura o hosts do `.monblock-spike.bak`.
- Repositório: só o relatório entra em `dev`; reverter é `git revert` de um commit de docs.

## 8. Entregáveis e definição de pronto

- [ ] `docs/ai/reports/2026-11-XX-spike-s0-windows.md` com tabela P1–P11: PASSOU / FALHOU / NÃO TESTADO, comando, trecho da saída e consequência para a spec.
- [ ] Variante **D2-A ou D2-B** escolhida com base em P4/P5.
- [ ] Lista das mudanças que o resultado impõe à spec v2 (se houver, a spec vai para v3 e volta para aprovação antes da F1).
- [ ] Rascunho da ADR-0016 com D1–D4 preenchidas pelos resultados (aprovação separada).
- [ ] Branch `spike/windows-s0` apagada; usuário/chaves de teste removidos do E2.

## 9. Sequência

1. Criar a branch e os scripts de P1–P3 e P10 (sem dependência de serviço) → rodar no E1.
2. P9 (build SEA + WinSW) → P6 (comportamento do serviço) no E1.
3. P4 → P5 (pipe, depende do serviço do P9 rodando como SYSTEM) no E1.
4. P7 no E1.
5. P8 e P11 no E2.
6. Consolidar o relatório; propor v3 da spec se necessário.
