# RECON — the sword route's three levels

Answered from the Chapter 3 dump (`~/knight-research/gml_dump/CodeEntries/`).
Nothing below is from a wiki.

## What this project is

**Not a bullet-hell fight.** The scaffold assumed a boss on the knight-sim
model. What the sword route actually is: Chapter 3's **board game** — the one
ranked `Z C B A S T` by `scr_get_rank_letter` — with one extra level handed
to you after each of the three boards. That is the "S rank game", and those
three levels are the scope.

## [x] Which chapter

Chapter 3. `chapter3_mac/game.ios`.

## [x] The route, and its progress counter

`global.flag[1055]`, written only in these places:

| value | written by |
|---|---|
| 1 | `obj_puzzlecloset_manager`, `obj_board_swordroute_icekey` |
| 1.5 | `obj_b2d_intro` |
| 2 | `obj_b2d_icedoor`, `obj_b2d_dungeonend` |
| 3 | `obj_b3s_swordmanager`, `obj_b2d_dungeonend` |
| 4 | `obj_b3s_swordmanager` |
| 5 | `obj_board_warptopreshadowmantle` |
| 6 | `obj_shadow_mantle_enemy_outro` |

`scr_swordroom()` is the authority on which rooms belong to the route.

## [x] The three levels

| # | room | size | tiles | notable contents |
|---|---|---|---|---|
| 1 | `room_board_1_sword` | 6220x1920 | 195x60 | 155 tree spawners, 43 enemy spawners, 38 cacti, waterfalls, 4 warp entrances |
| 2 | `room_board_2_sword` | 5184x4736 | 162x148 | 172 boat solids, 103 green-tree solids, docks, shallow water, 10 enemy spawners |
| 3 | `room_board_3_sword` | 3968x3392 | 124x106 | stanchions, `obj_b3s_swordmanager` |

All three use `bg_board_adventure_tileset` at 32px.

Camera start, from `obj_board_camera`'s Create: level 1 (896,64), level 2
(2432,3648), level 3 (1280,320).

## [x] The movement and camera model

Read from `obj_mainchara_board` and `obj_board_camera`; already implemented
and verified in `sim/board.js`:

- `wspeed = 4`, 8-directional, per-axis resolution with a corner slip
- Kris is 16x16 at instance scale 2 = 32x32
- bounds x 128..480, y 64..288 (the 384x256 pane inset by his own size)
- **the camera never moves** — crossing an edge translates the whole world
  one screen, 24px/frame horizontally and 16 vertically, 16 frames either way
- **Kris is nudged 2px back per frame** during a shift, so he covers 352 of
  the 384 and arrives on the opposite bound. Without it the screen
  oscillates forever.
- the shift is refused if a solid sits one cell beyond the boundary

## [ ] Still to do — in order

1. **Enemies.** `obj_board_enemy_spawner` (43 in level 1, 10 in level 2) and
   the enemy family. Read the spawner before the enemies.
2. **The sword.** `obj_mainchara_board`'s Create carries `sword`, `swordlv`,
   `xp`, `xptolevel` — and level 2 sets `xptolevel = 10`, the dungeons 4 and
   68. The attack itself is `swordbuffer` / `swordhitbox` in its Step.
3. **Decoration that moves.** Tree spawners, waterfalls, `screenColorChanger`
   (118 in level 2 — it tints per screen).
4. **Warps.** `obj_board_warpentrance` / `obj_board_warptouch`, and the
   camera's `shift = "warp"` branch.
5. **Hazards and damage.** `obj_board_hazard`, `myhealth`, the iframes block.
6. **The rank.** What actually scores a board.

## Deliberately out of scope

The Shadow Mantle encounter itself (`obj_shadow_mantle_*`, hp 30, with
burstwave / enemywave / flamewave / dash) and the boards proper. Only the
three sword levels.
