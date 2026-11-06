# Spec — Empacotar `monBlock.app` (macOS) com o `monblockd.pkg` embutido

- **Data:** 2026-11-06
- **Status:** aprovada (2026-11-06)
- **Plano:** `docs/ai/plans/2026-11-06-empacotamento-app-macos.md`
- **Relacionado:** ADR-0007, spec `2026-11-05-daemon-root-design.md` §8 D3

## 1. Problema

O botão "Reinstalar serviço" (`src/main/main.ts:322`, handler `monblock:reinstall-service`) abre
`path.join(process.resourcesPath, 'monblockd.pkg')`. Esse caminho só existe num `.app` empacotado,
e o app não é empacotado em lugar nenhum: hoje roda só via `electron .` (onde `resourcesPath`
aponta para `node_modules/electron/dist/Electron.app/Contents/Resources` e o botão falha).
`npm run build:pkg` gera apenas `build/monblockd.pkg` (daemon).

## 2. Objetivo

1. `npm run build:app` gera `build/monBlock.app` com `Contents/Resources/monblockd.pkg`.
2. CI (`macos-package`) gera o `.app` assinado ad-hoc, valida e publica como artefato.
3. No `.app` instalado em `/Applications`, "Reinstalar serviço" abre o Instalador do macOS com o `.pkg`.

Fora de escopo: Developer ID, notarização, DMG, auto-update, ícone próprio (fica o do Electron).

## 3. Ferramenta de empacotamento

| Opção | Custo | Veredito |
|---|---|---|
| `electron-builder` | dep grande (~centenas de pacotes), config própria, assina/notariza | excesso para o MVP |
| `@electron/packager` | dep oficial menor | ainda dep nova para o que são ~20 linhas |
| **Script shell copiando `Electron.app`** *(recomendada)* | zero dep nova | escolhido |

Por que o script basta: o app **não tem dependência de runtime** (só `devDependencies`), então o
bundle é `Electron.app` de `node_modules/electron/dist` + `Contents/Resources/app/` com
`package.json`, `dist/` e `docs/design/` (o `index.html` usa `../../docs/design/tokens.css` e o
main permite `docs/design/blocked-page.html`). Mesmo padrão de `scripts/build-pkg.sh`
(shell + ferramentas do macOS: `plutil`, `codesign`). Sem dependência nova → **sem ADR**
(a regra do AGENTS.md pede ADR ao adicionar dependência ou padrão difícil de reverter; trocar o
script por `@electron/packager` depois é barato).

Detalhes:
- `CFBundleExecutable` continua `Electron` (os helpers `Electron Helper*.app` são achados pelo nome
  do executável; renomear exige renomear os 4 helpers). Muda só `CFBundleName`,
  `CFBundleDisplayName`, `CFBundleIdentifier=com.ccat.monblock`, versões do `package.json`.
  Custo: o processo aparece como "Electron" no Monitor de Atividade. Aceito.
- Remove `Contents/Resources/default_app.asar`. Sem `asar` (o app é pequeno; `asar` é otimização).
- Assina com `codesign --force --deep --sign "${MONBLOCK_CODESIGN_ID:--}"` (mesma variável do daemon).
- Arquitetura: a do runner (o `electron` do `npm ci` só baixa a fatia local). Universal fica para
  quando houver release com Developer ID (`@electron/universal`).

## 4. Decisão D3 — o `.pkg` instala também o `.app`?

**Recomendação: não. `monblockd.pkg` continua só daemon; o `.app` é distribuído à parte (zip) e
leva o `.pkg` dentro.**

Motivos:
1. **Recursão:** se o `.pkg` instala o `.app` e o `.app` leva o `.pkg`, um contém o outro. Resolver
   exige dois pacotes (daemon-only embutido + distribuição app+daemon), dobrando build e CI.
2. **Ganho de segurança nulo hoje:** o daemon **não autentica o processo cliente** do socket (sem
   checagem de peer/assinatura em `src/daemon/ipc-server.ts`); qualquer processo do usuário no grupo
   `monblock` fala com o socket. Toda regra vive no daemon root. Trocar o código do `.app` não dá
   ao usuário protegido nada que um `nc -U` já não dê. O `.app` `root:wheel` só protegeria o
   cliente contra adulteração, e o cliente não é fronteira de confiança.
3. **Fluxo de instalação único:** arrasta o `.app` → abre → "Proteção não verificada" →
   "Reinstalar serviço" → Instalador. O mesmo botão serve à primeira instalação.

Revisitar se o daemon passar a validar a assinatura do cliente (aí o `.app` precisa ser
`root:wheel` e o `.pkg` passa a instalá-lo).

## 5. Critérios de aceite (BDD)

- **Dado** `npm run build:app` num Mac, **então** existe `build/monBlock.app/Contents/Resources/monblockd.pkg`,
  `codesign --verify --deep --strict build/monBlock.app` passa e `CFBundleIdentifier` é `com.ccat.monblock`.
- **Dado** a CI `macos-package`, **então** o artefato `monBlock-app` (zip via `ditto`) é publicado e um
  smoke abre o app por 10 s sem crash.
- **Dado** o `.app` em `/Applications` sem daemon, **quando** clico "Reinstalar serviço", **então** o
  Instalador abre o `monblockd.pkg` (verificação manual, não automatizável na CI).

## 6. Casos de borda e restrições

- **`.pkg` velho embutido:** `build-app.sh` sempre roda `build-pkg.sh` (o SEA é reaproveitado se existir),
  então o `.pkg` dentro do `.app` é da mesma versão do `package.json`.
- **Build repetido:** `rm -rf build/monBlock.app` antes de copiar; idempotente.
- **`.pkg` ausente no `.app`** (ex.: `electron .` em dev): o handler já devolve `500` com a mensagem
  do `shell.openPath` e a UI mostra o erro; sem mudança de UI/IPC nesta entrega.
- **Restrição:** só macOS (precisa `codesign`, `plutil`, `pkgbuild`); a CI Linux não roda o script, só o `shellcheck`.
- Sem segredos novos: assinatura ad-hoc por padrão; Developer ID só por variável de ambiente.

## 7. Rollback

Aditivo: remover `scripts/build-app.sh`, o script `build:app` e os passos da CI. Daemon e `.pkg` intactos.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Gatekeeper bloqueia app ad-hoc baixado da CI | Documentar `xattr -dr com.apple.quarantine`; release real usa Developer ID + notarização (fora de escopo). |
| `--deep` é desaconselhado pela Apple | Aceito para ad-hoc; release assina de dentro para fora. |
| Caminho relativo de `tokens.css` quebrar no bundle | Copia `docs/design/` para `Resources/app/docs/design/`; smoke + verificação manual. |
| `.pkg` dentro do `.app` com quarentena | `shell.openPath` abre no Instalador, que respeita a assinatura do `.pkg`; o `.pkg` ad-hoc pede "Abrir mesmo assim" — limite de MVP. |
