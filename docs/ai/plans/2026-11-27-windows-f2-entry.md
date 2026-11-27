# Plano: F2 do Windows — entry multiplataforma

- **Data:** 2026-11-27
- **Status:** APROVADO (2026-11-27). `/plan-criticize`: 0/100.
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v3) — itens **W1, W20**
- **Depende de:** F1 (W15, `resolveLayout` com `env`)
- **Branch:** `feat/windows-f1-f3`, PR empilhado sobre o da F1

## 1. Objetivo

O `monblockd` passa a reconhecer que roda privilegiado no Windows (SYSTEM/High) e sobe sem `MONBLOCK_DEV_ROOT_DIR`, e protege o `DATA_DIR` porque o `umask` não vale no Windows.

## 1.1 Restrições e fronteiras

- Muda só `src/daemon/entry.ts` (funções puras novas `isPrivileged`, `shouldCheckBrowserProfile`, `ensureDataDirAcl`, todas com `execFn` injetável). `MonBlockDaemon`, `state-store` e IPC não mudam; nenhum módulo novo depende de `entry.ts`.
- Boot do daemon: no máximo +15 s no pior caso (5 s `whoami` + 10 s `Get-Acl`), normal < 1 s.
- **ADR:** não precisa de nova. W1/W20 estão na spec v3 e entram na ADR-0016 (D1–D4 já cobrem serviço/IPC); a F2 adiciona à ADR-0016 uma linha "privilégio no Windows por SID de integridade".

## 2. Alternativas (W1)

| Abordagem | Prós | Contras | Escolha |
|---|---|---|---|
| **A. `whoami /groups` (caminho absoluto) e SID de integridade** | Sem dependência; validado no S0 (P9: `S-1-16-16384`) | Um `execFileSync` no boot | ✅ |
| B. `net session` (só admin consegue) | Simples | Depende do serviço Server (LanmanServer); falso negativo se desligado | ❌ |
| C. Addon nativo (`GetTokenInformation`) | Exato | Compilação nativa | ❌ |

## 3. Passos (TDD)

### W1 — `isPrivileged` (`src/daemon/entry.ts`)
1. `export function isPrivileged(platform = process.platform, execFn = execFileSync, env = process.env): boolean`.
   - `darwin`/`linux`: `process.getuid?.() === 0`.
   - `win32`: `execFn(path.win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32\\whoami.exe'), ['/groups'], { encoding: 'utf8', timeout: 5000 })`; `true` se contiver `S-1-16-16384` ou `S-1-16-12288`. Qualquer erro → `false`.
2. `main()` usa `isPrivileged()` no lugar de `getuid`. `flushDns` e o gate do `onUninstalled` passam a usar o mesmo valor.
3. `checkBrowserProfile` só quando `process.platform === 'darwin' && privileged` (extrair `shouldCheckBrowserProfile(platform, privileged)` para testar).
4. `chownSync` do socket e `lookupMonblockGid` seguem só em POSIX (já protegidos).
5. `onUninstalled` no `win32`: **até a F4 (W12)** só registra "desinstalação autorizada: remoção manual pendente" e **não** chama `/bin/sh` (hoje daria `ENOENT` sem listener e derrubaria o daemon). Adicionar `.on('error', log)` no spawn POSIX.
6. Testes: `execFn` falso com saída System, High, Medium e erro; `shouldCheckBrowserProfile` (darwin true; win32/linux false); `onUninstalled` no win32 não chama spawn.

### W20 — ACL do `DATA_DIR` no boot
1. `export function ensureDataDirAcl(dir, execFn = execFileSync): 'ok' | 'fixed' | 'failed'` (só `win32` + privilegiado).
   - Proibidos: `S-1-5-32-545` (Users), `S-1-1-0` (Everyone), `S-1-5-11` (Authenticated Users). A saída do `icacls` é localizada ("BUILTIN\Usuários" nesta máquina), então a leitura é por **SID**: `powershell -NoProfile -NonInteractive -Command "(Get-Acl -LiteralPath '<dir>').Access | % { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value }"` com timeout de 10 s.
   - Se houver SID proibido: `icacls <dir> /inheritance:r /grant:r *S-1-5-18:(OI)(CI)(F) *S-1-5-32-544:(OI)(CI)(F)` e reler. Persistiu → `failed`.
2. No `startDaemon`, chamar **antes** de `loadOrCreateRootVaultKey`. `failed` → lança `Error('DATA_DIR com ACL insegura')` (fail-closed: não lê o cofre); o WinSW reinicia e o log registra. O aviso ao Ajudante não é possível sem ler o estado — documentado.
3. Testes: `execFn` falso — limpo → `ok`; com Users → aplica e `fixed`; correção não pega → `failed`; erro do PowerShell → `failed`.
4. Linux/macOS: inalterado (`umask` + `chmod`).

### Ajuste do E2E local (sem SEA ainda)
- Validar nesta máquina: `node dist/daemon/entry.js` numa sessão **elevada** sem `MONBLOCK_DEV_ROOT_DIR` usaria os caminhos reais. **Não fazer na F2**: a validação real como SYSTEM fica para a F3 (serviço). Na F2, validar `isPrivileged()` com um script que imprime o resultado em sessão comum (`false`) e elevada (`true`), e o `ensureDataDirAcl` sobre uma pasta de teste com `Users:F`.

## 4. Resiliência e borda

- `whoami` ausente/AppLocker: `false` → daemon sai com código 1 e mensagem clara (fail-closed, sem rodar com privilégio pela metade).
- Execução como admin **High** fora do serviço (ex.: dev elevado) conta como privilegiado — igual ao `sudo` no macOS. Aceito (spec W1).
- `Get-Acl` em CLM: falha → `failed` → não sobe. Risco: máquinas corporativas com CLM ficariam sem daemon. Mitigação: fallback que aceita a pasta se `icacls` (sem parse) não listar nenhuma linha com `(I)` herdada **e** o instalador marcou `DATA_DIR\.acl-ok`; avaliar no review se vale (YAGNI: começar sem fallback, documentar o risco).

## 5. Rollback

`git revert` dos commits da F2. Nenhum estado da máquina é alterado fora da pasta de teste.

## 6. Pronto quando

- [ ] Testes novos verdes no Windows; macOS/Linux sem regressão.
- [ ] `isPrivileged()` = `false` em sessão comum e `true` em sessão elevada nesta máquina.
- [ ] `ensureDataDirAcl` corrige uma pasta de teste com `Users:F`.
- [ ] CHANGELOG atualizado.
