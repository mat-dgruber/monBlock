# Plano: F1 do Windows — Camadas 1/2 e correções locais

- **Data:** 2026-11-27
- **Status:** APROVADO (2026-11-27). `/plan-criticize`: 0/100.
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v3, aprovada) — itens **W9, W10, W13, W14, W15**
- **Branch:** `feat/windows-f1-f3` (a partir de `dev`, `d054c37`). Um PR por fase, empilhados: F1 → F2 → F3.
- **Pré-condição da spec para fechar a F1:** P11 (E2) ✅ Chrome e Edge (relatório do S0, 2026-11-27).

## 1. Objetivo

Fazer a Camada 2 (políticas no Registro) gravar de verdade, detectar quando ela falha ou é removida, e corrigir os detalhes locais do app (bandeja, notificações, caminhos). Tudo testável com mocks; a validação real é o `reg query` + navegador nesta máquina.

Fora do escopo: serviço, IPC, build (F3/F4) e Camada 3 (F5).

## 1.1 Restrições

- Windows 10 22H2+ / 11 x64; Node 22+ (o SEA da F3 fixa a versão).
- O contrato `PlatformEnforcer` e o comportamento no macOS/Linux **não mudam** (CI ubuntu + macOS precisam continuar verdes).
- `verifyApplied` é síncrono (contrato) e roda a cada `tick` (60 s): custo alvo < 300 ms no caso normal, pior caso limitado por timeout.
- Políticas: máximo `POLICY_DOMAIN_LIMIT` domínios por lista (já existente).
- Sem HTTP novo: os erros continuam pelos Problem Details (RFC 9457) já existentes no daemon (`buildProblem`); a F1 não cria rota.

## 2. Alternativas

| Abordagem | Prós | Contras | Escolha |
|---|---|---|---|
| A. Só trocar o prefixo `HKLM\` → `HKEY_LOCAL_MACHINE\` | 1 linha | Valores antigos seguem valendo (allowlist velha libera site); falha silenciosa continua | ❌ |
| **B. W9 + W10 como na spec** (prefixo, `[-chave]` antes de recriar, executor que lança, drift lendo o Registro) | Corrige e **detecta**; validado no S0 (P1–P3, P11) | `verifyApplied` passa a rodar `reg query` (5 chaves × 3 subchaves, timeout 5 s cada) | ✅ |
| C. Escrever o Registro direto (`reg add` por valor ou addon N-API) | Sem arquivo `.reg` | Milhares de processos `reg add`, ou compilação nativa | ❌ |

## 3. Passos (TDD: teste vermelho → código → verde, commit por item)

### W9 — prefixo e limpeza (`src/enforcers/windows-platform-enforcer.ts`)
1. Separar constantes: `REG_FILE_ROOT = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies'` (para o `.reg`) e `REG_CLI_ROOT = 'HKLM\\SOFTWARE\\Policies'` (para `reg query`/`reg delete`).
2. `generateWindowsRegistryManifest`: para cada navegador, emitir `[-…\URLBlocklist]`, `[-…\URLAllowlist]` e, no Firefox, `[-…\WebsiteFilter]` **antes** da recriação.
3. Testes: nenhuma linha `[HKLM\`; ordem `[-X]` antes de `[X]`; o manifesto não começa com `EF BB BF` (bytes do arquivo gravado); allowlist de 3 → 1 gera só o `"1"`.

### W10 — falhas e drift do Registro
1. `defaultWindowsCommandExecutor`: no `win32` **lança** (`execFile` com `timeout: 30_000`); fora do `win32` segue sem efeito.
2. `applyWebRules` executa hosts, `icacls`, `flushdns` e `reg import` mesmo se um passo falhar; acumula em `private lastApplyFailures: string[]` (`hosts`, `hosts:acl`, `dns:flush`, `registry:import`).
3. `verifyApplied` (síncrono): inclui `lastApplyFailures`; para cada chave gerenciada, `execFileSync('reg', ['query', key, '/s'], { timeout: 5000 })` com `regQuery` injetável; parse dos valores `REG_SZ`/`REG_DWORD`; chave ausente, valor divergente ou erro/timeout → `registry:<chave>`.
4. Sem mudar o contrato `PlatformEnforcer` (macOS/Linux intactos).
5. Testes: import com código ≠ 0 → hosts aplicado e drift `registry:import`; chave apagada → drift; valor divergente → drift; timeout → drift (fail-closed); tudo igual → `[]`.

### W15 — caminhos absolutos (`src/daemon/entry.ts:resolveLayout`)
1. Assinatura `resolveLayout(rootDir?, platform = process.platform, env = process.env)`.
2. `win32` sem `rootDir`: `path.win32.join(env.ProgramData ?? 'C:\\ProgramData', 'monBlock')` e `path.win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32\\drivers\\etc\\hosts')`. Com `rootDir` (dev/CI): `path.win32.join(rootDir, …)`.
3. darwin/linux: `path.posix.join(rootDir ?? '/', …)` (comportamento igual ao atual nesses hosts).
4. Teste: `ProgramData=D:\PD` → `D:\PD\monBlock`; sem env → `C:\ProgramData\monBlock`.
5. **Coordenação:** a sessão do CI (`ci/windows`) só troca `path.join` por `path.posix`/`path.win32` sem mudar o padrão; o W15 é desta fase. Quem mergear depois resolve o conflito trivial.

### W13 — ícone da bandeja (`src/main/main.ts:681`)
1. Extrair `trayIconFor(platform)`: `darwin` mantém o template; `win32` usa o PNG do escudo em 16×16 (32×32 em DPI alto), sem `setTemplateImage`.
2. Teste unitário da escolha.

### W14 — notificações
1. `app.setAppUserModelId('com.ccat.monblock')` antes do `ready` no `win32`.
2. Teste unitário com `app` falso; validação manual do toast fica para a F4 (app instalado).

### Fechamento
- `CHANGELOG.md` (`[Unreleased]`: Corrigido — Camada 2 no Windows), sem bump (o `0.10.0` sai na F4).
- Validação real nesta máquina (admin, UAC): script descartável fora do repositório que instancia o `WindowsPlatformEnforcer` com um hosts temporário (o hosts real não é tocado na F1) e regras de teste bloqueando só `example.com`. Conferir `reg query`, `edge://policy` e `ERR_BLOCKED_BY_ADMINISTRATOR` como no P11, apagar uma chave e ver o drift, depois `restoreSystemCleanState()`.

## 4. Resiliência e casos de borda

- `reg import` parcial/negado: hosts continua aplicado (Camada 1 independente); drift avisa o Ajudante pelo watchdog existente.
- `reg query` lento/travado: timeout de 5 s por chave → drift (fail-closed, não falso negativo). Custo máximo por `tick`: 6 chaves × 5 s no pior caso; normal < 200 ms.
- Janela de lista vazia durante o import (risco aceito na spec): o hosts cobre.
- Políticas corporativas pré-existentes nessas subchaves são sobrescritas (documentado na ADR-0016).
- Lista com 0 itens: emitir só a deleção, sem `[chave]` vazia — teste.
- **Modo dev sem admin** (`MONBLOCK_DEV_ROOT_DIR`): o `reg import` passa a lançar → drift `registry:import` a cada `tick` e aviso ao Ajudante. Mitigação: em dev, o executor só registra (o `flushDns`/privilégio da F2 decide); teste cobre que o aviso só sai com o daemon privilegiado.
- **Pre-mortem (3h da manhã):** um `reg query` com parse errado acusa drift em toda máquina → reimport a cada minuto + spam no Telegram. Proteção: o throttle de aviso de 1×/hora já existente no watchdog (`monblockd.ts`) e teste de parse com a saída real capturada desta máquina (pt-BR: `REG_SZ`/`REG_DWORD` não são localizados, os nomes de chave também não).

## 5. Segurança

- Nada de segredo envolvido. `execFile` com argumentos em array (sem shell). Domínios vêm das listas validadas pelo `gen-lists` (regex de host), sem aspas — o teste garante escape de `"` e `\` mesmo assim.

## 6. Rollback

- Código: `git revert` dos commits da F1 (atômicos por item).
- Máquina de teste: `restoreSystemCleanState()` + `reg delete` das subchaves gerenciadas (como o `p11-manifest.ps1 -Cleanup`).

## 7. Definição de pronto

- [ ] `npx vitest run tests/enforcers tests/daemon tests/main` verde no Windows e sem regressão no macOS/Linux (CI ubuntu).
- [ ] `tsc --noEmit` limpo.
- [ ] Validação real: `reg query` + Edge/Chrome bloqueando um domínio de teste, e drift detectado após `reg delete` manual.
- [ ] CHANGELOG atualizado; PR `feat/windows-f1` → `dev`.
