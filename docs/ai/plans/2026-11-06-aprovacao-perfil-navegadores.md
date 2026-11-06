# Plano — Guiar a aprovação do perfil dos navegadores

- **Spec:** `docs/ai/specs/2026-11-06-aprovacao-perfil-navegadores-design.md`
- **Status:** aprovado (2026-11-06)

Objetivo, alternativas (§4), critérios (§5), casos de borda (§6) e riscos (§7) estão na spec.

## Tarefas

0. **Spike (você roda 2 comandos com sudo):** saída de `sudo profiles list -all` e teste da URL do
   painel. Resultado anotado em `docs/ai/reports/`. Se a URL não abrir o painel certo, troco por abrir
   os Ajustes na raiz e reforço os passos no texto.
1. **Daemon (TDD):** `checkBrowserProfile(exec)` em `src/enforcers/platform-enforcer.ts` → `true | false | null`
   (exec injetado, timeout 5 s). Testes: saída com o identificador → `true`; sem → `false`; erro/timeout → `null`.
   Watchdog guarda o valor; `toPublicState` expõe `browserProfileInstalled`.
2. **Main:** IPC `monblock:open-profile-settings` (URL fixa + reabrir `.mobileconfig` de `HELPER_DIR`);
   ponte no `preload-bridge.cjs`.
3. **Renderer:** faixa de aviso + `<dialog>` em `index.html`/`renderer-init.js`, só com tokens CCAT existentes;
   mostra quando `browserProfileInstalled === false`.
4. **Instalador:** `packaging/macos/distribution.xml` + `packaging/macos/resources/conclusion.html`;
   `build-pkg.sh` passa a `productbuild --distribution ... --resources ...`; `postinstall` abre o painel.
   CI: `pkgutil --expand` confirma o `conclusion.html` no `.pkg`; `shellcheck` cobre o `postinstall`.
5. **Verificação:** `npm test`, `typecheck`, CI verde. Manual: reinstalar pelo botão com o perfil removido →
   página de conclusão + painel aberto; app mostra o aviso; aprovar → aviso some em ≤ 60 s.
6. **Docs/commits:** CHANGELOG, `tech-design.md` do daemon; commits por camada; PR → `main`.

## Rollback

Ver spec §8.
