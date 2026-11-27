# Spike S0 — Windows (descartável)

Plano: `docs/ai/plans/2026-11-27-spike-s0-windows-plan.md`. Esta pasta vive só na branch `spike/windows-s0`
e é apagada no fim; o que entra em `dev` é o relatório em `docs/ai/reports/`.

## E1 — CI (`.github/workflows/spike-windows.yml`, dispara no push da branch)

Ordem: P1–P3 → P10 → P9 (build SEA + WinSW, serviço sobe) → P4/P5 (pipe com o serviço rodando) → P7 → P6 (para o serviço).
Resultados em `spikes/windows/results/*.json` (artifact `spike-s0-results`).

## E2 — máquina Windows x64 com sessão gráfica (manual)

- **P8:** com um navegador em primeiro plano, `node helper\p8-bench.mjs 200 1500`; em paralelo, medir CPU com o
  `Get-Counter` que o script imprime. Para CLM: abrir PowerShell, `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'`
  e rodar `& .\helper\probe-loop.ps1` — deve imprimir `{"error":"add-type",...}` e sair com 3.
- **P11:** PowerShell como admin, `.\manual\p11-manifest.ps1`; conferir `chrome://policy`, `edge://policy`, `about:policies`
  e tentar abrir `https://example.com`. Depois `.\manual\p11-manifest.ps1 -Cleanup`.
- **P10 com Defender ativo** (se o runner tiver proteção em tempo real desligada): `.\defender\p10.ps1 -WaitSec 600` como admin.

Limpeza do E2: `net user spike /delete` (se criado), `reg delete HKLM\SOFTWARE\Policies\MonBlockSpike /f`, apagar `C:\spike`.
