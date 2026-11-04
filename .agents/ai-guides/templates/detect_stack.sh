#!/usr/bin/env sh
# detect_stack.sh <alvo> [--list]
#
# Responde se o projeto tem <alvo>, procurando manifests até 3 níveis abaixo da raiz
# (monorepos: apps/web, backend/, services/api, packages/*). Exit 0 = encontrado.
# Com --list, imprime um diretório por linha (a raiz de cada subprojeto que casou).
#
# Alvos: python node php go rust java backend frontend api mobile game desktop docker ci legacy
#   java   = build da JVM (Maven ou Gradle) fora do Android; Android e Xcode são mobile.
#   legacy = stack que o /setup só configura com os guias de harness e Graphify: JVM até o Java 8 ou sem versão
#            declarada (nem no build pai), Ant, PHP até o 7 no composer.json ou sem Composer, Delphi. Diretório
#            legado sai dos outros alvos (docker e ci descrevem o repositório e ficam): guia moderno não toca nele.
# Fonte canônica: templates/detect_stack.sh — usado nos `when`/`verify` das heurísticas dos guias.
set -u

alvo=${1:?uso: detect_stack.sh <alvo> [--list]}
listar=${2:-}
PRUNE='-name node_modules -o -name .venv -o -name venv -o -name vendor -o -name dist -o -name build -o -name .git -o -name .agents -o -name target -o -name Pods -o -name bower_components'
# ponytail: cortes fixos, tirados da org (os pom.xml ativos declaram Java 1.6–1.8; o PHP ativo moderno é 8.x).
# Suba o corte se o Java 11 ou o PHP 8.0 virarem legado.
JAVA_LEGADO_ATE=8
PHP_LEGADO_ATE=7

find_manifest() {  # $1 = nome do arquivo (aceita glob: '*.dpr')
  find . -maxdepth 4 \( $PRUNE \) -prune -o -type f -name "$1" -print 2>/dev/null
}

# imprime o diretório de cada manifest ($1) cujo conteúdo casa com o regex ($2; vazio = qualquer)
match() {
  find_manifest "$1" | while read -r f; do
    if [ -z "${2:-}" ] || grep -Eq "$2" "$f" 2>/dev/null; then dirname "$f"; fi
  done
}

PY_WEB='fastapi|django|flask|starlette|litestar|sanic|tornado|aiohttp'
NODE_API='"(express|fastify|@nestjs/core|koa|hono|@hapi/hapi)"'
NODE_UI='"(react|react-dom|vue|@angular/core|svelte|next|nuxt|solid-js|astro|preact|lit)"'
JVM_WEB='spring-boot|quarkus|micronaut|io\.ktor|jakarta\.|javax\.servlet|dropwizard|io\.vertx|helidon'
JVM_API='spring-boot-starter-web|quarkus-rest|quarkus-resteasy|micronaut-http-server|ktor-server|jakarta\.ws\.rs|javax\.ws\.rs'
ANDROID='com\.android|plugins\.android|^[[:space:]]*android[[:space:]]*\{'   # plugin, alias do version catalog ou bloco android {}

jvm() {  # builds da JVM fora do Android (build Android = app mobile)
  { match pom.xml; match build.gradle; match build.gradle.kts; } | sort -u | while read -r d; do
    grep -Eqs "$ANDROID" "$d/build.gradle" "$d/build.gradle.kts" || echo "$d"
  done
}

jvm_com() {  # builds da JVM (fora do Android) cujo conteúdo casa com o regex $1
  jvm | while read -r d; do grep -Eqs "$1" "$d/pom.xml" "$d/build.gradle" "$d/build.gradle.kts" && echo "$d"; done
}

java_ver() {  # maior versão de Java que o build $1 declara, sem o "1." (1.8 → 8); vazio se não declara
  grep -oE '(java\.version|maven\.compiler\.(source|target|release))>[[:space:]]*[0-9.]+|<(release|source|target)>[[:space:]]*[0-9.]+|(source|target)Compatibility[^0-9]*[0-9._]+|JavaLanguageVersion\.of\([0-9]+|jvmTarget[^0-9]*[0-9._]+' "$1" 2>/dev/null |
    grep -oE '[0-9][0-9._]*$' | sed -E 's/^1[._]([0-9]+).*/\1/; s/[._].*//' | sort -n | tail -1
}

java_dir_ver() {  # versão de Java do subprojeto $1; sem declaração nele, a do build pai (multi-módulo)
  d=$1
  while :; do
    v=$(for f in "$d/pom.xml" "$d/build.gradle" "$d/build.gradle.kts"; do java_ver "$f"; done | sort -n | tail -1)
    if [ -n "$v" ] || [ "$d" = . ]; then echo "$v"; return; fi
    d=$(dirname "$d")
  done
}

php_legado() {  # composer.json cujo "php" só aceita até o 7, ou index.php sem composer.json no diretório nem acima
  match composer.json | while read -r d; do
    v=$(grep -oE '"php"[[:space:]]*:[[:space:]]*"[^"]*"' "$d/composer.json" | sed -E 's/^"php"[[:space:]]*:[[:space:]]*//' |
      grep -oE '(^|[^0-9.])[0-9]+' | tr -dc '0-9\n' | sort -n | tail -1)
    [ -n "$v" ] && [ "$v" -le "$PHP_LEGADO_ATE" ] && echo "$d"
  done
  find_manifest index.php | while read -r f; do
    d=$(dirname "$f"); c=$d
    while [ ! -f "$c/composer.json" ]; do
      [ "$c" = . ] && { echo "$d"; break; }
      c=$(dirname "$c")
    done
  done
}

legado() {
  { jvm | while read -r d; do v=$(java_dir_ver "$d"); [ "${v:-0}" -le "$JAVA_LEGADO_ATE" ] && echo "$d"; done
    match build.xml '<javac'
    php_legado
    match '*.dpr'; match '*.dproj'; match '*.dpk'
  } | sed '/^$/d' | sort -u
}

case "$alvo" in
  python)   dirs=$(match pyproject.toml; match requirements.txt; match setup.py) ;;
  node)     dirs=$(match package.json) ;;
  php)      dirs=$(match composer.json) ;;
  go)       dirs=$(match go.mod) ;;
  rust)     dirs=$(match Cargo.toml) ;;
  java)     dirs=$(jvm) ;;
  backend)  dirs=$(match pyproject.toml "$PY_WEB"; match requirements.txt "$PY_WEB"; match package.json "$NODE_API"; match composer.json 'laravel/framework|symfony/'; match go.mod; match Cargo.toml 'actix-web|axum|rocket'; jvm_com "$JVM_WEB") ;;
  frontend) dirs=$(match package.json "$NODE_UI") ;;
  api)      dirs=$(match pyproject.toml 'fastapi'; match requirements.txt 'fastapi'; match package.json "$NODE_API"; match composer.json 'laravel/framework'; jvm_com "$JVM_API") ;;
  mobile)   dirs=$(match pubspec.yaml; match package.json '"(react-native|expo)"'; match Package.swift; match build.gradle "$ANDROID"; match build.gradle.kts "$ANDROID"; match project.pbxproj | sed 's#/[^/]*\.xcodeproj$##') ;;
  game)     dirs=$(match project.godot; match ProjectVersion.txt; match '*.uproject') ;;
  desktop)  dirs=$(match electron-builder.yml; match electron-builder.json; match electron.vite.config.ts; match electron.vite.config.js; match tauri.conf.json; match wails.json; match package.json '"(electron|@tauri-apps/api|tauri)"') ;;
  docker)   dirs=$(match Dockerfile; match docker-compose.yml; match compose.yaml) ;;
  ci)       dirs=$(find . -maxdepth 4 \( $PRUNE \) -prune -o -type d -name workflows -path '*/.github/*' -print 2>/dev/null) ;;
  legacy)   dirs=$(legado) ;;
  *)        echo "alvo desconhecido: $alvo" >&2; exit 2 ;;
esac

# diretório legado sai dos alvos de stack; docker e ci descrevem o repositório inteiro. O find curto evita os
# finds do legado() em repositório sem nenhum manifest candidato (o caso comum).
case "$alvo" in
  legacy|docker|ci) ;;
  *) if find . -maxdepth 4 \( $PRUNE \) -prune -o -type f \( -name pom.xml -o -name 'build.gradle*' -o -name build.xml -o -name composer.json -o -name index.php -o -name '*.dp[rk]' -o -name '*.dproj' \) -print 2>/dev/null | grep -q .; then
       leg=$(legado); [ -n "$leg" ] && dirs=$(printf '%s\n' "$dirs" | grep -vxF "$leg")
     fi ;;
esac

dirs=$(printf '%s\n' "$dirs" | sed '/^$/d' | sort -u)
[ -n "$dirs" ] || exit 1
[ "$listar" = "--list" ] && printf '%s\n' "$dirs"
exit 0
