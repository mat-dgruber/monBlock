#!/usr/bin/env sh
# install_dep.sh <comando> [gerenciador:pacote ...]
#
# Instala <comando> com o gerenciador de pacotes disponível no SO (macOS, Linux ou Windows).
# Idempotente: se o comando já está no PATH (inclui ~/.local/bin), sai 0 sem fazer nada.
# O nome do pacote é o próprio <comando>, salvo sobrescrita por gerenciador:
#   install_dep.sh make winget:GnuWin32.Make choco:make
# Sem gerenciador utilizável (ou sudo indisponível), sai 1 com a instrução manual — nunca em silêncio.
set -eu

cmd=${1:?uso: install_dep.sh <comando> [gerenciador:pacote ...]}
shift
specs=$*
PATH="$HOME/.local/bin:$PATH"
export PATH

if command -v "$cmd" >/dev/null 2>&1; then
  echo "já instalado: $cmd ($(command -v "$cmd"))"
  exit 0
fi

pkg_for() {
  for s in $specs; do
    case "$s" in "$1":*) printf '%s' "${s#*:}"; return 0 ;; esac
  done
  printf '%s' "$cmd"
}

# sudo só quando necessário e sem prompt interativo (um agente não tem como digitar a senha)
as_root() {
  if [ "$(id -u 2>/dev/null || echo 1)" = 0 ]; then "$@"; return; fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo "$@"; return; fi
  echo "sudo indisponível sem senha — rode manualmente: sudo $*" >&2
  return 1
}

for mgr in brew winget scoop choco apt-get dnf yum pacman zypper apk; do
  command -v "$mgr" >/dev/null 2>&1 || continue
  p=$(pkg_for "$mgr")
  echo "instalando $cmd via $mgr ($p)…"
  case "$mgr" in
    brew)    brew install "$p" || true ;;
    winget)  winget install --silent --accept-package-agreements --accept-source-agreements --id "$p" || true ;;
    scoop)   scoop install "$p" || true ;;
    choco)   choco install -y "$p" || true ;;
    apt-get) as_root apt-get update -qq && as_root apt-get install -y "$p" || true ;;
    dnf|yum) as_root "$mgr" install -y "$p" || true ;;
    pacman)  as_root pacman -S --noconfirm "$p" || true ;;
    zypper)  as_root zypper install -y "$p" || true ;;
    apk)     as_root apk add "$p" || true ;;
  esac
  command -v "$cmd" >/dev/null 2>&1 && { echo "ok: $cmd instalado ($(command -v "$cmd"))"; exit 0; }
done

echo "não foi possível instalar '$cmd' automaticamente (gerenciadores testados: brew, winget, scoop, choco, apt-get, dnf, yum, pacman, zypper, apk)." >&2
echo "Instale manualmente e rode o /setup de novo." >&2
exit 1
