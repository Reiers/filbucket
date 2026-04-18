#!/usr/bin/env bash
# Build Icon.icns from the FilBucket SVG mark.
# Requires rsvg-convert (brew install librsvg) + sips + iconutil (system).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG_DEFAULT="$ROOT/../web/public/brand/filbucket-mark.svg"
SVG_PATH="${1:-$SVG_DEFAULT}"
OUT="$ROOT/Icon.icns"

if [[ ! -f "$SVG_PATH" ]]; then
  echo "ERROR: Source SVG not found at $SVG_PATH" >&2
  exit 1
fi

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "ERROR: rsvg-convert not found. Install with: brew install librsvg" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ICONSET="$TMP/Icon.iconset"
mkdir -p "$ICONSET"

MASTER="$TMP/master_1024.png"
# Render the SVG at 1024 onto a transparent background.
rsvg-convert -w 1024 -h 1024 -a "$SVG_PATH" -o "$MASTER"

declare -a sizes=(16 32 64 128 256 512 1024)
for sz in "${sizes[@]}"; do
  sips -z "$sz" "$sz" "$MASTER" --out "$ICONSET/icon_${sz}x${sz}.png" >/dev/null
  if [[ "$sz" -ne 1024 ]]; then
    dbl=$((sz * 2))
    sips -z "$dbl" "$dbl" "$MASTER" --out "$ICONSET/icon_${sz}x${sz}@2x.png" >/dev/null
  fi
done
cp "$MASTER" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT"
echo "Created $OUT"

# Also drop a copy into Sources/FilBucket/Resources so SwiftPM bundles it
# (package_app.sh also copies Icon.icns to the bundle root, so this is belt-and-braces).
cp "$OUT" "$ROOT/Sources/FilBucket/Resources/Icon.icns"
echo "Copied to Sources/FilBucket/Resources/Icon.icns"
