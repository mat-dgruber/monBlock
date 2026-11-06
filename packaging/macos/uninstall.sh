#!/bin/sh
# Disparado pelo monblockd só depois de UNINSTALL_AUTHORIZED (token do Ajudante ou cooldown de 72h).
# O daemon já restaurou /etc/hosts e removeu as políticas; aqui só saem os arquivos do monBlock.
# Quem tem sudo consegue rodar este script direto: é o limite aceito contra Admin (ADR-0007).
set -u

/bin/launchctl bootout system/com.ccat.monblockd 2>/dev/null || true
/bin/rm -f /Library/LaunchDaemons/com.ccat.monblockd.plist
/usr/bin/profiles remove -identifier com.ccat.monblock.browsers >/dev/null 2>&1 || true
/bin/rm -rf "/Library/Application Support/monBlock" /var/db/monblock /var/run/monblock
/usr/sbin/dseditgroup -o delete monblock >/dev/null 2>&1 || true
/usr/sbin/pkgutil --forget com.ccat.monblock.daemon >/dev/null 2>&1 || true
/bin/rm -rf /Library/PrivilegedHelperTools/com.ccat.monblockd
exit 0
