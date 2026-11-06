#!/bin/sh
# Gera build/monblockd.pkg com o daemon, o desinstalador, a página de bloqueio e o perfil dos navegadores.
# Assinatura do instalador: MONBLOCK_INSTALLER_ID="Developer ID Installer: ..." (opcional).
set -eu

VERSION=$(node -p "require('./package.json').version")
ROOT=build/pkgroot
HELPER="$ROOT/Library/PrivilegedHelperTools/com.ccat.monblockd"

# Recompila o daemon se não existe ou se algum fonte mudou depois dele (evita .pkg com daemon velho).
if [ ! -x build/daemon/monblockd ] || [ -n "$(find src package.json -newer build/daemon/monblockd -type f | head -1)" ]; then
  sh scripts/build-daemon-sea.sh
fi
npm run build >/dev/null

rm -rf "$ROOT"
mkdir -p "$HELPER/design" "$ROOT/Library/LaunchDaemons"
cp build/daemon/monblockd packaging/macos/uninstall.sh "$HELPER/"
cp docs/design/blocked-page.html docs/design/tokens.css docs/design/tokens-showcase.html "$HELPER/design/"
cp packaging/macos/com.ccat.monblockd.plist "$ROOT/Library/LaunchDaemons/"

# Perfil com a categoria "adult" (sempre ativa pela catraca): o perfil só muda com nova aprovação
# do usuário, então leva o que nunca sai. Demais categorias: hosts + escrita direta (ADR-0007).
node --input-type=module -e "
import { PREDEFINED_CATEGORIES } from './dist/domain/categories.js';
import { generateBrowserMobileconfig } from './dist/enforcers/platform-enforcer.js';
const adult = PREDEFINED_CATEGORIES.find((c) => c.id === 'adult');
process.stdout.write(generateBrowserMobileconfig({ blockedDomains: adult.domains, allowlistDomains: [], lockIncognito: true }));
" > "$HELPER/monblock-browsers.mobileconfig"
plutil -lint "$HELPER/monblock-browsers.mobileconfig"

# Atributos estendidos virariam entradas ._* no payload; provenance pode não sair (só em ambiente de app).
xattr -cr "$ROOT" 2>/dev/null || true
pkgbuild --root "$ROOT" --scripts packaging/macos/scripts --identifier com.ccat.monblock.daemon \
  --version "$VERSION" --install-location / build/monblockd-component.pkg
# Distribuição com página de conclusão (como aprovar o perfil dos navegadores).
set -- --distribution packaging/macos/distribution.xml --resources packaging/macos/resources --package-path build
if [ -n "${MONBLOCK_INSTALLER_ID:-}" ]; then
  productbuild "$@" --sign "$MONBLOCK_INSTALLER_ID" build/monblockd.pkg
else
  productbuild "$@" build/monblockd.pkg
fi
echo "ok: build/monblockd.pkg ($VERSION)"
