#!/bin/sh
# Gera build/monBlock.app: Electron.app do node_modules + código do app + monblockd.pkg em Resources
# (o botão "Reinstalar serviço" abre process.resourcesPath/monblockd.pkg). Sem dependência nova:
# o app não tem dependências de runtime (spec 2026-11-06-empacotamento-app-macos-design.md).
# Assinatura: MONBLOCK_CODESIGN_ID="Developer ID Application: ..." (padrão: ad-hoc "-").
set -eu

VERSION=$(node -p "require('./package.json').version")
APP=build/monBlock.app
RES="$APP/Contents/Resources"
PLIST="$APP/Contents/Info.plist"

# Sempre: o .pkg embutido sai da mesma versão do código (o SEA do daemon é reaproveitado).
sh scripts/build-pkg.sh

rm -rf "$APP"
cp -R node_modules/electron/dist/Electron.app "$APP"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app/docs"
cp package.json "$RES/app/"
cp -R dist "$RES/app/"
# index.html carrega ../../docs/design/tokens.css; o main abre docs/design/blocked-page.html.
cp -R docs/design "$RES/app/docs/"
cp build/monblockd.pkg "$RES/"

# ponytail: CFBundleExecutable fica "Electron" (os helpers são achados por esse nome); renomear = renomear os 4 helpers.
plutil -replace CFBundleName -string monBlock "$PLIST"
plutil -replace CFBundleDisplayName -string monBlock "$PLIST"
plutil -replace CFBundleIdentifier -string com.ccat.monblock "$PLIST"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$PLIST"
plutil -replace CFBundleVersion -string "$VERSION" "$PLIST"

xattr -cr "$APP" 2>/dev/null || true
# ponytail: --deep serve ao ad-hoc; release com Developer ID assina de dentro para fora + notarização.
codesign --force --deep --sign "${MONBLOCK_CODESIGN_ID:--}" "$APP"
codesign --verify --deep --strict "$APP"
echo "ok: $APP ($VERSION)"
