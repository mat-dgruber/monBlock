#!/bin/sh
# Gera build/monblockd.deb com o daemon, unidade systemd e página de bloqueio para Linux.
set -eu

VERSION=$(node -p "require('./package.json').version")
PKG_DIR=build/linux-deb
ARCH="amd64"

echo "Preparando pacote Debian para monblockd v$VERSION ($ARCH)..."

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/usr/libexec/monblock/design"
mkdir -p "$PKG_DIR/lib/systemd/system"
mkdir -p "$PKG_DIR/etc/monblock"
mkdir -p "$PKG_DIR/var/lib/monblock"

# Copia serviço systemd
cp scripts/linux/monblockd.service "$PKG_DIR/lib/systemd/system/"

# Copia arquivos estáticos de design
cp docs/design/blocked-page.html docs/design/tokens.css "$PKG_DIR/usr/libexec/monblock/design/"

# Manifest de controle Debian
cat <<EOF > "$PKG_DIR/DEBIAN/control"
Package: monblockd
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: monBlock Team <dev@monblock.local>
Description: monBlock background protection daemon and web enforcer
 Multi-layer web blocking and distraction protection daemon.
EOF

# Script postinst (executado após instalação)
cat <<'EOF' > "$PKG_DIR/DEBIAN/postinst"
#!/bin/sh
set -e

# Cria grupo monblock se não existir
if ! getent group monblock >/dev/null; then
    groupadd -r monblock
fi

# Cria diretório de runtime com permissões corretas
mkdir -p /run/monblock
chown root:monblock /run/monblock
chmod 0750 /run/monblock

# Registra e inicia o serviço systemd
if [ -d /run/systemd/system ]; then
    systemctl daemon-reload || true
    systemctl enable --now monblockd.service || true
fi

exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/postinst"

# Script prerm (executado antes de remover)
cat <<'EOF' > "$PKG_DIR/DEBIAN/prerm"
#!/bin/sh
set -e

if [ -d /run/systemd/system ]; then
    systemctl stop monblockd.service || true
    systemctl disable monblockd.service || true
fi

exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/prerm"

if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb --build "$PKG_DIR" "build/monblockd_${VERSION}_${ARCH}.deb"
    echo "ok: build/monblockd_${VERSION}_${ARCH}.deb"
else
    echo "Aviso: dpkg-deb não encontrado no ambiente. Estrutura montada em $PKG_DIR."
fi
