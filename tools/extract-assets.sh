#!/usr/bin/env bash
# Rebuild the ENTIRE asset pack from YOUR copy of DELTARUNE: every sprite the
# three rooms place, the board's sounds, fnt_8bit, the music, and the
# instance dumps build-levels.py reads.
#
#   tools/extract-assets.sh [path/to/chapter3_mac/game.ios]
#
# TRAP (cost two 40-minute stalls): UndertaleModCli BLOCKS ON STDIN when its
# output is redirected. `< /dev/null` is load-bearing.
set -euo pipefail

GAME="${1:-$HOME/knight-research/oracle/DELTARUNE.app/Contents/Resources/chapter3_mac/game.ios}"
MUS="$(dirname "$(dirname "$(dirname "$GAME")")")/Resources/mus"
[ -d "$MUS" ] || MUS="$(dirname "$GAME")/../../Resources/mus"
CLI="$HOME/tools/utmt-cli/UndertaleModCli"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$GAME" ] || { echo "!! no game data at $GAME" >&2; exit 1; }
[ -x "$CLI" ]  || { echo "!! no UndertaleModCli at $CLI" >&2; exit 1; }

echo "==> one solo CLI run (about a minute)"
"$CLI" load "$GAME" -s "$HERE/tools/extract-assets.csx" -o /tmp/eram_extract.ios \
  < /dev/null 2>&1 | grep -v '^\[MESSAGE\]' || true

mkdir -p "$HERE/assets/sprites" "$HERE/assets/audio" "$HERE/assets/font"
cp /tmp/eram_mega/sprites/*.png "$HERE/assets/sprites/"
cp /tmp/eram_mega/sprites.json "$HERE/assets/sprites/manifest.json"
cp /tmp/eram_mega/sounds/*     "$HERE/assets/audio/"
cp /tmp/eram_mega/font/fnt_8bit.png "$HERE/assets/font/"
cp /tmp/eram_mega/font/fnt_8bit.json "$HERE/assets/font/"
cp "$MUS/board_sword_music.ogg" "$HERE/assets/audio/" 2>/dev/null || echo "!! board_sword_music.ogg not found under $MUS"
cp "$MUS/board_ocean.ogg" "$HERE/assets/audio/" 2>/dev/null || echo "!! board_ocean.ogg not found under $MUS"

echo "==> then: python3 tools/build-levels.py   (needs /tmp/tiles_* room dumps)"
