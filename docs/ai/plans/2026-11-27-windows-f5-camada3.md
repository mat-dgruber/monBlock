# Plano: F5 do Windows — Camada 3 (vigia de abas)

- **Data:** 2026-11-27
- **Status:** APROVADO (2026-11-27). `/plan-criticize`: 0/100.
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v3) — **W5, W6, W7, W8, W11a** juntos; depois **W11b**
- **ADR:** 0016 (D4 / D6)
- **Pré-condição (spec):** P8 ✅ (E2: p95 9,9 ms; ~0,4% de um núcleo). Achado do P8: em CLM o helper sai com 0 sem imprimir nada, então sucesso só com handshake.
- **Depende de:** F3 (IPC com o `GET_STATE`). Pode andar em paralelo à F4: só toca `src/main/` e `src/enforcers/windows-watcher.ts`.
- **Branch:** `feat/windows-f5`

## 1. Objetivo

Ligar no Windows a terceira camada: quando a janela em primeiro plano é de um navegador e o título indica um conteúdo bloqueado, abrir a página de bloqueio. Ela cobre o que as Camadas 1 e 2 não pegam, como o título de uma busca ou de um site fora das listas que bate com uma palavra-chave.

Fora do escopo: URL exata por UI Automation e redirecionar a mesma aba (**W11b**, passo posterior, com checklist manual). Também fica fora uma extensão forçada por política.

## 1.1 Restrições

- **CPU:** menos de 1% de um núcleo em repouso (P8 mediu 0,4%). Um único processo helper, sem `powershell` por tick.
- **Latência:** probe < 100 ms p95 (P8: 9,9 ms). Ciclo a cada 1,5 s com o backoff atual (até 5 s sob carga).
- **Ambiente:** sem elevação (roda no app, como usuário). O UIPI impede inspecionar janela elevada, o que é aceito.
- **CLM/AppLocker:** se o `Add-Type` não puder rodar, a Camada 3 fica desligada, com um aviso único. Nada de loop.
- **Sem rota HTTP nova:** a página de bloqueio (`127.0.0.1:49152/blocked`) e os erros dela, em Problem Details (RFC 9457), já existem e não mudam.

## 2. Alternativas

| Abordagem | Prós | Contras | Escolha |
|---|---|---|---|
| A. `powershell` por tick (o código atual) | já existe | ~300 ms e um processo novo a cada 1,5 s; bug do `$pid` | ❌ |
| **B. Helper PowerShell persistente** (D4, validado no P8) | 1 processo, p95 9,9 ms, sem dependência nova | precisa de handshake (CLM) e de recriação se travar | ✅ |
| C. Helper nativo C# compilado no build | sem PowerShell, imune a CLM | toolchain .NET no build e binário não assinado | ❌ por ora (vira ADR se o CLM aparecer em campo) |

## 3. Passos (TDD)

### W8 — helper persistente (`src/enforcers/windows-foreground-helper.ts`)
1. Classe `ForegroundHelper` com `spawnFn` injetável:
   - inicia `powershell.exe` (caminho absoluto, sem `PSModulePath`, como o `runPowerShellJson` da F3) com `-EncodedCommand` do loop;
   - o loop compila o `Add-Type` (`GetForegroundWindow`, `GetWindowThreadProcessId` com `[uint32]`, `GetWindowText`) e **imprime `{"ready":true}`**;
   - depois responde `probe` → `{"proc":"chrome","title":"..."}`.
2. **Handshake:** sem `ready` em 10 s, ou se o processo sai antes, o estado vira `unavailable` (CLM/AppLocker). A Camada 3 fica desligada até o próximo início do app, com aviso único no log e na UI.
3. Timeout de 2 s por probe: mata e recria no próximo tick, sem backoff. Três recriações seguidas sem `ready` → `unavailable`.
4. `dispose()` no `will-quit`.
5. Testes com `spawnFn` falso: 100 probes = 1 processo; probe travado → recriado; sem `ready` → `unavailable` sem loop; saída inválida → probe nulo.

### W6 — bug do `$pid` e título certo
- Corrigido dentro do helper (`[uint32]$procId`, `[ref]`, `GetWindowText(hwnd)` em vez de `MainWindowTitle`). O `WindowsBrowserTabAdapter.getActiveTab` passa a usar o helper.
- Mapeamento `proc` → navegador pela lista `SUPPORTED_WINDOWS_BROWSERS`. Processo fora da lista → `null`.

### W7 — avaliação por título
1. `cleanBrowserTitle(title, browser)` tira os sufixos (` - Google Chrome`, ` — Mozilla Firefox`, ` - Microsoft Edge`, ` - Brave`, ` - Vivaldi`, ` - Opera`, incluindo variações com " e mais N páginas").
2. Sem URL: `evaluateUrlAndTitle({ url: limpo, title: limpo })`. Grant: só `*` se aplica. O redirecionamento usa `domain=<ruleLabel>`.
3. Testes: "Pornhub - Google Chrome" com Adulto → bloqueia; as frases de `tests/domain/fixtures/frases-legitimas.tsv` → não bloqueiam; título vazio ou "Nova guia" → nada.

### W11a — redirecionamento seguro
- `redirectActiveTab` recebe `openExternal` injetado (o `shell.openExternal` do Electron). Só aceita URLs que começam com `http://127.0.0.1:49152/blocked?` (validação no Node antes de chamar). O `cmd.exe /c start` sai.
- Teste: a URL com `&reason=…&rule=…` chega inteira; outra origem é recusada.

### W5 — ligar o watcher
1. Extrair do `main.ts` `startBrowserWatcherLoop(watcher, getRules, opts): () => void`, com a guarda de concorrência, o backoff (1,5 a 5 s) e o grant `*` atuais. O macOS continua igual (refatoração sem mudança de comportamento, coberta pelos testes do watcher macOS).
2. `win32`: cria o `WindowsBrowserWatcher` com o `ForegroundHelper` e o `openExternal`. Só liga se o helper ficar `ready`.
3. Anti-repetição: a mesma aba e o mesmo título não redirecionam de novo em menos de 10 s (evita loop se o navegador mantiver o título).
4. Testes com timers falsos: `inspectOnce` periódico; grant `*` → não inspeciona; helper `unavailable` → o loop não liga.

### Validação real (nesta máquina, sem admin)
- Chrome e Edge abertos com uma aba cujo título contenha um termo bloqueado → abre a página de bloqueio em ≤ 3 s.
- CPU do app + helper em repouso por 10 min < 1% de um núcleo.
- CLM simulado (`__PSLockdownPolicy=4` no ambiente do helper) → a Camada 3 desligada com um aviso, sem loop.

### W11b (depois, plano próprio)
- UI Automation para a URL real e o redirecionamento na mesma aba. Checklist manual por navegador e medição do custo de CPU da árvore de acessibilidade.

## 4. Resiliência e borda

- **Helper morre:** recriado no próximo tick. Três falhas seguidas → `unavailable` (sem martelar o sistema).
- **Título com caracteres especiais/emoji:** o `GetWindowText` em Unicode (`CharSet.Unicode`) e o JSON escapado pelo `ConvertTo-Json`.
- **Janela elevada ou do sistema:** `proc` não é navegador → ignorada.
- **Falso positivo:** o rule engine já tem o fast-path e as fixtures de frases legítimas. A pessoa tem o caminho do pedido de liberação na página de bloqueio.
- **Pre-mortem:** um termo comum demais bloqueia o trabalho. A anti-repetição limita o dano a 1 redirecionamento a cada 10 s por título, e a regra se ajusta na lista de palavras.

## 5. Segurança

- O helper aceita só o comando fixo `probe`, e o `-EncodedCommand` vem de uma constante do código, sem entrada externa.
- O redirecionamento só para `127.0.0.1:49152/blocked`. Nenhuma URL vinda do título é aberta.
- Títulos não saem da máquina e não vão para o log (podem conter dados pessoais). O log registra só "bloqueado por <regra>".

## 6. Rollback

- O `startBrowserWatcherLoop` só liga no `win32` com o helper `ready`. Para desligar: `git revert` dos commits da F5. O macOS fica coberto pela refatoração testada.

## 7. Pronto quando

- [ ] Testes unitários do helper, do título e do loop verdes; os do watcher macOS sem regressão.
- [ ] Validação real: Chrome e Edge redirecionam, CPU < 1%, CLM desliga sem loop.
- [ ] CHANGELOG e relatório.
