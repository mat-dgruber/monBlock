#!/bin/sh
# Gera build/daemon/monblockd: Node SEA universal (arm64 + x86_64), hardened runtime + allow-jit.
# Assinatura: MONBLOCK_CODESIGN_ID="Developer ID Application: ..." (padrão: ad-hoc "-").
# Receita validada no spike S3 (docs/ai/reports/2026-11-05-spikes-daemon-root.md).
set -eu

OUT=build/daemon
SIGN_ID="${MONBLOCK_CODESIGN_ID:--}"
NODE_BIN=$(command -v node)
mkdir -p "$OUT"

# 1. Bundle CommonJS único (SEA não carrega ESM multi-arquivo). `import.meta.url` vira constante:
#    o guard de "arquivo principal" do entry fica falso e quem chama main() é o stdin abaixo.
echo "import { main } from './src/daemon/entry.ts'; main().catch((e) => { console.error('[monblockd]', e?.message); process.exit(1); });" |
  npx esbuild --bundle --platform=node --format=cjs --target=node22 \
    --define:import.meta.url='"file:///monblockd-sea"' \
    --sourcefile=sea-entry.ts --loader=ts --outfile="$OUT/monblockd.cjs"

cat > "$OUT/sea-config.json" <<JSON
{ "main": "$OUT/monblockd.cjs", "output": "$OUT/sea-prep.blob", "disableExperimentalSEAWarning": true, "useCodeCache": false }
JSON
node --experimental-sea-config "$OUT/sea-config.json"

# 2. Um binário por arquitetura (o universal tem o sentinel 2x e o postject recusa).
SLICES=""
for ARCH in arm64 x86_64; do
  if ! lipo "$NODE_BIN" -verify_arch "$ARCH" 2>/dev/null; then
    echo "aviso: node local não tem a fatia $ARCH; o binário sai sem ela" >&2
    continue
  fi
  BIN="$OUT/monblockd-$ARCH"
  lipo "$NODE_BIN" -thin "$ARCH" -output "$BIN" 2>/dev/null || cp "$NODE_BIN" "$BIN"
  codesign --remove-signature "$BIN"
  npx --yes postject@1.0.0-alpha.6 "$BIN" NODE_SEA_BLOB "$OUT/sea-prep.blob" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
  ENT=packaging/macos/monblockd.entitlements
  [ "$ARCH" = x86_64 ] && ENT=packaging/macos/monblockd-x86_64.entitlements
  codesign --force --sign "$SIGN_ID" --options runtime --timestamp=none --entitlements "$ENT" "$BIN"
  SLICES="$SLICES $BIN"
done

# shellcheck disable=SC2086 # SLICES é uma lista de caminhos sem espaços.
lipo -create $SLICES -output "$OUT/monblockd"
codesign --verify --strict "$OUT/monblockd"
echo "ok: $OUT/monblockd ($(lipo -archs "$OUT/monblockd"))"
