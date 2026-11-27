# Relatório: F5 do Windows — Camada 3 (vigia de abas)

- **Data:** 2026-11-27
- **Plano:** `docs/ai/plans/2026-11-27-windows-f5-camada3.md` (aprovado)
- **Máquina:** Windows 11 x64, serviço `monblockd` instalado como SYSTEM, app via `npm run electron` (usuário comum), navegador padrão: Dia
- **Branch:** `feat/windows-f5`

## Resultado

| Item | Estado | Evidência |
|------|--------|-----------|
| W8 — helper persistente | ✅ | `powershell.exe` real: sobe em 478 ms; **p95 6,7 ms** (p50 5,2 ms). Unitários: 100 probes = 1 processo; probe travado → recriado; sem handshake → `unavailable` |
| W8 — CLM | ✅ | Sessão em `ConstrainedLanguage` real: `unavailable` depois de 3 tentativas, 1,2 s, sem loop. (O `__PSLockdownPolicy` como variável do processo não força CLM no 5.1; só como variável de máquina) |
| W6 — `$pid`/título | ✅ | `[uint32]$procId` + `GetWindowText(hwnd)` no helper |
| W7 — avaliação por título | ✅ | "Pornhub - Google Chrome" bloqueia; título que começa por domínio é avaliado como domínio; as 81 frases legítimas não bloqueiam; "Nova guia"/vazio ignorados; sem domínio só o grant `*` libera |
| W11a — `shell.openExternal` | ✅ | URL com `&` e `,` chega inteira; outra origem é recusada (inclusive `127.0.0.1:49152.evil.example`) |
| W5 — loop no app | ✅ | Loop comum macOS/Windows (`watcher-loop.ts`), mesmo comportamento no macOS; para de vez se o helper ficar indisponível |
| **Teste real** | ✅ | Página local com `<title>Pornhub videos teste monBlock</title>` no Edge → log `Camada 3 bloqueou em msedge: Palavra-chave: pornhub` → **"Página pausada — monBlock" aberta no Dia em primeiro plano**. Um único bloqueio em 30 s com o Edge aberto. Um único processo helper |
| CPU em repouso | ✅ | 60 s: helper **0,49%** + Electron **0,29%** de um núcleo (< 1%) |

## Achados do teste real (corrigidos)

1. O título do Edge traz o perfil e as abas: `… e mais 1 página - Perfil 1 — Microsoft​ Edge` (com espaço de largura zero). A limpeza passou a tirar os perfis padrão e o "e mais N páginas".
2. Depois do redirecionamento o título muda; a anti-repetição por título abriria abas em sequência. Agora, no caminho por título, ela vale por navegador (10 s).
3. O navegador padrão desta máquina é o **Dia**, que não estava na lista do vigia do Windows (estava só na do macOS). Dia, Arc e Chromium entraram.

## Limites conhecidos

- **W11b (mesma aba):** hoje a página de bloqueio abre pelo navegador padrão; a aba original fica aberta por trás. Redirecionar a mesma aba exige UI Automation (plano próprio).
- **Dia na Camada 2:** não há chave de política do Dia no Registro (Camada 2); ele fica coberto pelo hosts (Camada 1) e agora pela Camada 3.
- O aviso de "Camada 3 desligada" (CLM) vai para o log; ainda não aparece na UI.
