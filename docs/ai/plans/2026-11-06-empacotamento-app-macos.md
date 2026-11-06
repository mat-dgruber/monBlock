# Plano — Empacotar `monBlock.app` com `monblockd.pkg`

- **Spec:** `docs/ai/specs/2026-11-06-empacotamento-app-macos-design.md`
- **Status:** aprovado (2026-11-06)

Objetivo, alternativas (§3), decisão D3 (§4), casos de borda (§6) e riscos (§8) estão na spec.

## Tarefas

1. **`scripts/build-app.sh`** (novo, ~25 linhas, `set -eu`, passa no `shellcheck`):
   - `sh scripts/build-pkg.sh` sempre (já roda `npm run build`; reaproveita o SEA) — evita `.pkg` velho embutido.
   - `rm -rf build/monBlock.app && cp -R node_modules/electron/dist/Electron.app build/monBlock.app`.
   - `RES=build/monBlock.app/Contents/Resources`; `rm -f $RES/default_app.asar`;
     `mkdir -p $RES/app/docs`; copia `package.json`, `dist/`, `docs/design/` para `$RES/app/`;
     copia `build/monblockd.pkg` para `$RES/`.
   - `plutil -replace` em `Info.plist`: `CFBundleName`/`CFBundleDisplayName=monBlock`,
     `CFBundleIdentifier=com.ccat.monblock`, `CFBundleShortVersionString`/`CFBundleVersion` = versão do `package.json`.
   - `xattr -cr`; `codesign --force --deep --sign "${MONBLOCK_CODESIGN_ID:--}" build/monBlock.app`;
     `codesign --verify --deep --strict`.
2. **`package.json`:** `"build:app": "sh scripts/build-app.sh"`.
3. **CI `.github/workflows/ci.yml`, job `macos-package`**, depois do E2E root:
   - `npm run build:app`
   - checagens: `test -f build/monBlock.app/Contents/Resources/monblockd.pkg`,
     `codesign --verify --deep --strict build/monBlock.app`,
     `plutil -extract CFBundleIdentifier raw build/monBlock.app/Contents/Info.plist | grep -qx com.ccat.monblock`.
   - smoke: sobe `build/monBlock.app/Contents/MacOS/Electron` em background, `sleep 10`, `kill -0 $PID` (vivo), `kill`.
   - `ditto -c -k --keepParent build/monBlock.app build/monBlock-app.zip` + `upload-artifact` `monBlock-app`.
   - job `node-ci`: `scripts/*.sh` já cobre o novo script no `shellcheck`.
4. **Docs:** `CHANGELOG.md` (Unreleased: `.app` empacotado); nota curta em `docs/domains/daemon_persistence/tech-design.md`
   sobre a D3 (`.pkg` não instala o `.app`, e por quê). Atualizar o status de D3 na spec de 2026-11-05.
5. **Verificação:** local `npm run build:app` + `open build/monBlock.app` (copiado para `/Applications`), clicar
   "Reinstalar serviço" e confirmar que o Instalador abre; CI verde. `npm test` + `typecheck` sem regressão.
6. **Commits:** `build(app): empacotar monBlock.app com monblockd.pkg embutido`, `ci(app): gerar e validar o .app no macOS`,
   `docs(app): registrar decisão D3 do empacotamento`. PR → `main`.

## Rollback

Tudo aditivo: remover `scripts/build-app.sh`, o script `build:app` e os passos da CI. Nada muda no daemon nem no `.pkg`.

## Não faz

ADR (sem dep nova), universal, ícone, DMG, notarização, renomear executável.
