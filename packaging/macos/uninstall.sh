#!/bin/sh
# Disparado pelo monblockd só depois de UNINSTALL_AUTHORIZED (token do Ajudante ou cooldown de 72h).
# O daemon já restaurou /etc/hosts e removeu as políticas; aqui só saem os arquivos do monBlock.
# Quem tem sudo consegue rodar este script direto: é o limite aceito contra Admin (ADR-0007).
set -u

CONSOLE_USER=$(/usr/bin/stat -f%Su /dev/console 2>/dev/null || echo "")
if [ -n "$CONSOLE_USER" ] && [ "$CONSOLE_USER" != "root" ] && [ "$CONSOLE_USER" != "loginwindow" ]; then
  CONSOLE_UID=$(/usr/bin/id -u "$CONSOLE_USER" 2>/dev/null || echo "")
  USER_HOME=$(/usr/bin/dscl . -read "/Users/$CONSOLE_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')
  if [ -n "$CONSOLE_UID" ]; then
    /bin/launchctl bootout "gui/$CONSOLE_UID/com.ccat.monblock.watcher" 2>/dev/null || true
  fi
  if [ -n "$USER_HOME" ]; then
    /bin/rm -f "$USER_HOME/Library/LaunchAgents/com.ccat.monblock.watcher.plist"
  fi
fi

/bin/launchctl bootout system/com.ccat.monblockd 2>/dev/null || true
/bin/rm -f /Library/LaunchDaemons/com.ccat.monblockd.plist
/usr/bin/profiles remove -identifier com.ccat.monblock.browsers >/dev/null 2>&1 || true
/bin/rm -rf "/Library/Application Support/monBlock" /var/db/monblock /var/run/monblock
/usr/sbin/dseditgroup -o delete monblock >/dev/null 2>&1 || true
/usr/sbin/pkgutil --forget com.ccat.monblock.daemon >/dev/null 2>&1 || true
/bin/rm -rf /Library/PrivilegedHelperTools/com.ccat.monblockd
exit 0
