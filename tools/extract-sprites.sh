#!/usr/bin/env bash
# Rebuild assets/ from YOUR copy of DELTARUNE.
#
# The art is deliberately not committed (see .gitignore) — it is extracted
# per machine from the game you own. This script is the whole of that step.
#
#   tools/extract-sprites.sh [path/to/chapter3_mac/game.ios]
#
# Defaults to the oracle copy under ~/knight-research.
#
# TRAP, and it cost two 40-minute stalls: UndertaleModCli BLOCKS ON STDIN
# when its output is redirected. Without `< /dev/null` it hangs at 0% CPU,
# looking exactly like the "concurrent runs wedge" failure in the playbook.
set -euo pipefail

GAME="${1:-$HOME/knight-research/oracle/DELTARUNE.app/Contents/Resources/chapter3_mac/game.ios}"
CLI="$HOME/tools/utmt-cli/UndertaleModCli"
PATCH="$HOME/knight-research/tools/patches/extract_sprite.csx"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT=/tmp/spr_out

[ -f "$GAME" ] || { echo "!! no game data at $GAME" >&2; exit 1; }
[ -x "$CLI" ]  || { echo "!! no UndertaleModCli at $CLI" >&2; exit 1; }

cat > /tmp/eram_sprites.txt <<'LIST'
spr_board_kris_walk_down
spr_board_kris_walk_up
spr_board_kris_walk_left
spr_board_kris_walk_right
spr_board_kris_strike_down
spr_board_kris_strike_up
spr_board_kris_strike_left
spr_board_kris_strike_right
spr_board_monster_outline_docile
spr_board_monster_angery_outline_docile
spr_board_monster_hurt
spr_board_healthbar
spr_board_key
LIST

rm -rf "$OUT"; mkdir -p "$OUT"
echo "==> extracting (solo run; this takes a minute)"
SPR_LIST=/tmp/eram_sprites.txt "$CLI" load "$GAME" -s "$PATCH" -o /tmp/eram_extract.ios \
  < /dev/null 2>&1 | grep -v '^\[MESSAGE\]' || true

cd "$HERE/assets"
for d in down up left right; do
  for f in 0 1; do cp "$OUT/spr_board_kris_walk_${d}_${f}.png" "kris_${d}_${f}.png"; done
  for f in 0 1 2; do cp "$OUT/spr_board_kris_strike_${d}_${f}.png" "kris_strike_${d}_${f}.png"; done
done
for f in 0 1; do
  cp "$OUT/spr_board_monster_outline_docile_${f}.png"        "monster_outline_docile_${f}.png"
  cp "$OUT/spr_board_monster_angery_outline_docile_${f}.png" "monster_angery_outline_docile_${f}.png"
  cp "$OUT/spr_board_monster_hurt_${f}.png"                  "monster_hurt_${f}.png"
  cp "$OUT/spr_board_healthbar_${f}.png"                     "healthbar_${f}.png"
done
cp "$OUT/spr_board_key_0.png" "key_0.png"

echo "==> dimensions (must match the manifest, per the playbook)"
python3 - <<'PY'
import struct, glob, os
EXPECT = {'kris_': (16,16), 'kris_strike_down': (16,32), 'kris_strike_up': (16,32),
          'kris_strike_left': (32,16), 'kris_strike_right': (32,16),
          'monster_': (16,16), 'healthbar_': (46,15), 'key_': (16,16)}
bad = 0
for f in sorted(glob.glob('*.png')):
    w, h = struct.unpack('>II', open(f,'rb').read(24)[16:24])
    key = next((k for k in sorted(EXPECT, key=len, reverse=True) if f.startswith(k)), None)
    ok = key is None or EXPECT[key] == (w, h)
    if not ok: bad += 1
    print(f'   {f:36s} {w}x{h} {"" if ok else "  *** EXPECTED " + str(EXPECT[key])}')
raise SystemExit(1 if bad else 0)
PY
echo "==> the tileset comes from the room dump, not here (tools/build-levels.py)"
