# Relatório: F4 do Windows — instalador, atualização, desinstalação e CI

- **Data:** 2026-11-27
- **Plano:** `docs/ai/plans/2026-11-27-windows-f4-instalador-ciclo.md` (aprovado)
- **Branch:** `feat/windows-f4` (sobre a `feat/windows-f5`)
- **Versão:** 0.10.0

## Resultado

| Item | Estado | Evidência |
|------|--------|-----------|
| Pipe próprio em dev | ✅ | `MONBLOCK_DEV_PIPE_NAME` (só com `rootDir`); a suíte local passa inteira com o serviço instalado na máquina (435 testes) |
| W12 — desinstalação | ✅ unitário · ⏳ E2E no CI | Tarefa `monBlock\Uninstall` (SYSTEM, `onstart`) + `/run`; `uninstall.ps1` idempotente; o `restoreSystemCleanState` remove todos os valores gerenciados |
| W16 — atualização | ✅ | Instalador por plataforma; **download só do que o processo principal verificou** (antes URL e hash vinham do renderer); **repositório padrão corrigido** (`matheus-diniz/monBlock` não existe, a verificação sempre falhava) |
| W3 — pacote e instalador | ✅ local | `@electron/packager` 20.3.0 + Inno Setup 6.7.4 (hash do digest do GitHub + Authenticode da Pyrsys B.V.). `monBlock-Setup-0.9.1.exe` de 137 MB gerado nesta máquina |
| W19 — autostart | ✅ no `.iss` · ⏳ logon real | Atalho em `{commonstartup}` com `--hidden` e o AppUserModelID |
| W18 — CI do pacote | ⏳ primeira execução no PR | Job `windows-package`: instala, serviço SYSTEM, IPC como usuário comum (< 2 s), W21 real e impostor, `taskkill`, desinstalação até a máquina limpa (serviço, pastas, tarefa, hosts pelo hash, Registro, atalhos) |

## Pendências

- Validação manual nesta máquina (com o usuário presente para o UAC): instalar o Setup, logon/autostart, toast, atualização 0.10.0 → 0.10.1 de teste e desinstalação autorizada pelo Ajudante (precisa do Telegram pareado).
- P10 com o Defender ativo (checklist de release).
- Assinatura Authenticode (risco aceito: o SmartScreen avisa).
