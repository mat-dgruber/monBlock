#!/bin/sh
# E2E do monblockd como root (spec §13/§14). Roda na CI macOS: `sudo sh tests/e2e/root/run.sh`.
# Pré-requisito: `npm run build:pkg` (gera build/monblockd.pkg e dist/). Destrutivo: só em máquina descartável.
set -eu

[ "$(id -u)" = 0 ] || { echo "rode como root (sudo)" >&2; exit 1; }

REPO=$(cd "$(dirname "$0")/../../.." && pwd)
PKG="$REPO/build/monblockd.pkg"
HELPER=/Library/PrivilegedHelperTools/com.ccat.monblockd
APPSUP="/Library/Application Support/monBlock"
DB=/var/db/monblock
RUN=/var/run/monblock
SOCK=$RUN/monblockd.sock
LABEL=system/com.ccat.monblockd
TEST_USER=mbtest$$
PASSWORD="Aa1#$(openssl rand -hex 12)" # gerada por execução, nunca fixa no código

step() { printf '\n== %s\n' "$1"; }
fail() { echo "FALHOU: $1" >&2; [ -f /var/log/monblockd.log ] && tail -20 /var/log/monblockd.log >&2; exit 1; }
ipc() { node "$REPO/tests/e2e/root/ipc.mjs" "$1"; }
expect_status() { # $1=status esperado, $2=comando JSON, $3=descrição
  out=$(ipc "$2") || fail "$3: daemon offline"
  echo "$out" | grep -q "\"status\":$1" || fail "$3: esperado $1, recebido $out"
  echo "ok: $3 ($1)"
}
mode() { stat -f '%Su:%Sg %Lp' "$1"; }
daemon_pid() { pgrep -f "^$HELPER/monblockd" | head -1; }
wait_for() { # $1=descrição, $2=segundos, resto=condição
  what=$1; secs=$2; shift 2
  i=0
  until "$@"; do
    i=$((i + 1)); [ "$i" -le "$secs" ] || fail "timeout esperando $what"
    sleep 1
  done
}
socket_up() { [ -S "$SOCK" ] && ipc '{"type":"GET_STATE"}' >/dev/null 2>&1; }
cleanup() {
  sysadminctl -deleteUser "$TEST_USER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

install_pkg() {
  installer -allowUntrusted -pkg "$PKG" -target / >/dev/null || fail "installer"
  wait_for "socket do daemon" 30 socket_up
}

step "1. Instalação"
install_pkg
launchctl print "$LABEL" | grep -q 'state = running' || fail "job não está rodando"
echo "ok: daemon rodando (pid $(daemon_pid))"

step "2. Permissões (spec §4.1)"
[ "$(mode "$APPSUP")" = "root:wheel 700" ] || fail "Application Support: $(mode "$APPSUP")"
[ "$(mode "$DB")" = "root:wheel 700" ] || fail "/var/db/monblock: $(mode "$DB")"
[ "$(mode "$RUN")" = "root:monblock 750" ] || fail "/var/run/monblock: $(mode "$RUN")"
[ "$(mode "$SOCK")" = "root:monblock 660" ] || fail "socket: $(mode "$SOCK")"
[ "$(stat -f '%Lp' "$APPSUP/vault.key")" = 600 ] || fail "vault.key não é 0600"
[ "$(mode "$HELPER/monblockd")" = "root:wheel 755" ] || fail "binário: $(mode "$HELPER/monblockd")"
[ -z "$(find "$HELPER" -name '._*')" ] || fail "arquivos ._* instalados"
echo "ok: donos e modos conferem; nenhum ._*"

step "3. Imposição no sistema"
grep -q '# >>> MONBLOCK START >>>' /etc/hosts || fail "bloco do monBlock ausente em /etc/hosts"
stat -f '%Sf' /etc/hosts | grep -q uchg || fail "/etc/hosts sem uchg"
[ -f /Library/Preferences/org.mozilla.firefox.plist ] || fail "plist do Firefox ausente"
echo "ok: hosts com bloco + uchg; Firefox com política"

step "4. kill -9 → launchd relança"
OLD_PID=$(daemon_pid)
kill -9 "$OLD_PID"
new_pid_differs() { p=$(daemon_pid); [ -n "$p" ] && [ "$p" != "$OLD_PID" ] && socket_up; }
wait_for "relançamento pelo launchd" 20 new_pid_differs
echo "ok: relançado (pid $OLD_PID → $(daemon_pid))"

step "5. Usuário Standard não desfaz o bloqueio"
sysadminctl -addUser "$TEST_USER" -password "$(openssl rand -hex 16)" >/dev/null 2>&1 || fail "criar usuário de teste"
as_user() { sudo -u "$TEST_USER" sh -c "$1" >/dev/null 2>&1; }
as_user "rm -rf '$APPSUP'" || true # a negação é o esperado; o set -e não pode encerrar aqui
[ -f "$APPSUP/vault.key" ] || fail "Standard apagou os cofres"
as_user "kill -9 $(daemon_pid)" && fail "Standard matou o daemon"
as_user "echo '0.0.0.0 x' >> /etc/hosts" && fail "Standard escreveu no /etc/hosts"
# Controle positivo: o mesmo comando conecta como root; sem isso, um nc quebrado passaria o teste.
nc -U "$SOCK" </dev/null >/dev/null 2>&1 || fail "controle: root não conectou no socket com nc"
as_user "nc -U '$SOCK' </dev/null" && fail "usuário fora do grupo monblock conectou no socket"
echo "ok: rm, kill, hosts e socket negados"
CONSOLE_USER=$(stat -f%Su /dev/console)
if dseditgroup -o checkmember -m "$CONSOLE_USER" monblock >/dev/null 2>&1; then
  echo "info: usuário do console ($CONSOLE_USER) está no grupo monblock"
else
  echo "info: usuário do console ($CONSOLE_USER) NÃO está no grupo monblock"
fi

step "6. Desinstalação autorizada"
expect_status 200 "{\"type\":\"PAIR_PARTNER\",\"password\":\"$PASSWORD\"}" "pareamento"
expect_status 403 '{"type":"UNINSTALL_AUTHORIZED","password":"errada"}' "desinstalação com senha errada"
expect_status 200 "{\"type\":\"UNINSTALL_AUTHORIZED\",\"password\":\"$PASSWORD\"}" "desinstalação autorizada"
helper_gone() { [ ! -e "$HELPER" ] && ! launchctl print "$LABEL" >/dev/null 2>&1; }
wait_for "remoção pelo uninstall.sh" 30 helper_gone
grep -q MONBLOCK /etc/hosts && fail "bloco do monBlock ficou no /etc/hosts"
for p in "$APPSUP" "$DB" "$RUN" /Library/LaunchDaemons/com.ccat.monblockd.plist /Library/Preferences/org.mozilla.firefox.plist; do
  [ ! -e "$p" ] || fail "sobrou $p"
done
echo "ok: hosts limpo, job descarregado, arquivos removidos"

step "7. Cofres apagados por Admin → Fail-Closed e re-pareamento bloqueado (D1-B)"
install_pkg
expect_status 200 "{\"type\":\"PAIR_PARTNER\",\"password\":\"$PASSWORD\"}" "pareamento"
rm -f "$APPSUP/state.primary" "$DB/state.mirror" "$DB/partner.seal"
out=$(ipc '{"type":"GET_STATE"}') || fail "daemon offline após apagar cofres"
echo "$out" | grep -q '"tamperLockdown":true' || fail "sem tamperLockdown: $out"
expect_status 423 "{\"type\":\"PAIR_PARTNER\",\"password\":\"Aa1#$(openssl rand -hex 12)\"}" "novo pareamento após perda dos cofres"

step "Limpeza"
sh "$HELPER/uninstall.sh"
echo
echo "E2E root: todos os passos passaram."
