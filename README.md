# ERAM — the sword route

The three levels DELTARUNE Chapter 3 hands you on the sword route, one after
each board of its ranked board game, rebuilt from the rooms themselves.

**Status: the levels are walkable.** Tiles, collision and the board's real
camera are in; enemies, the sword and the warps are not. See
[docs/RECON.md](docs/RECON.md) for what is done and what is next, in order.

```sh
python3 tools/devserver.py        # http://localhost:8411
```

| # | room | size |
|---|---|---|
| 1 | `room_board_1_sword` | 6220x1920 — desert |
| 2 | `room_board_2_sword` | 5184x4736 — water |
| 3 | `room_board_3_sword` | 3968x3392 — the approach |

The level data is **generated**, not authored: `tools/build-levels.py` reads
the room dumps and writes `assets/levels/*.json`. If a number looks wrong,
fix the script and re-run — do not edit the JSON.

**The mechanic worth knowing before changing anything:** the camera never
moves. The screen is a fixed 384x256 window and Kris is clamped inside it;
crossing an edge translates the entire world one screen over, and Kris is
nudged 2px back each frame so he lands on the opposite bound. `sim/board.js`
documents it where it happens.

A fan project, unaffiliated with Toby Fox. DELTARUNE © Toby Fox —
[support the official release](https://deltarune.com).

## Rebuilding the assets

The full asset pack (sprites, sounds, music, the font) IS committed, per
the project's asset posture. To regenerate it from your own copy of the
game:

```sh
tools/extract-assets.sh         # one CLI run -> assets/{sprites,audio,font}
python3 tools/build-levels.py   # rooms -> assets/levels/*.json
```

`build-levels.py` owns the level files completely — tiles, solids, enemy
spawners and the sword pickup. **Do not hand-edit `assets/levels/*.json`**;
it has already been done once and the next regeneration silently dropped
every spawner.
