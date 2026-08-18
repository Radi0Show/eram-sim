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

## [x] The enemies, and when they appear

`obj_board_enemy_spawner`'s **user event 0 is the whole roster** — a
21-branch dispatch on its own `image_index`. Finding it turned "reverse a
dozen bespoke enemies" into "read one switch". None of the sword-route
spawners carries creation code, so every `type` is the PreCreate default 0
and no `type == 1` variant (spear boss, Toriel deer, miniboss walls) is
reachable in these levels.

**Nothing spawns on a timer.** `obj_board_camera` at `con == 98` — the frame
a shift lands, before control returns — runs:

```gml
with (obj_board_enemy_spawner)
    if (x >= 128 && x <= 480 && y >= 64 && y <= 288) event_user(0);
```

A screen populates itself the moment it becomes the screen you are on, and
the rect it tests is the PLAYER's bounds, not the pane's.

What the three levels actually place:

| level | spawners | roster |
|---|---|---|
| 1 | 43 | 30 monster, 9 flower, 3 bluefish, 1 bluebird |
| 2 | 10 | 4 bluefish, 3 monster, 2 lizard, 1 flower |
| 3 | 0 | — |

Constants from `scr_board_enemy_init` and the monster's Create: hp 1,
damage 1, xp_given 1, spd 3 — but **2 in level 1 while `swordlv == 1`** —
`distance_to_become_aggressive = 90`, contact hitbox at (x+16, y+16), scale
2, `global.cell_size = 32`.

Implemented: spawning on the landed screen, wander (`movedir =
choose(0,1,2,3)`), chase inside 90, the docile/angry sprite swap, contact
detection. **LABELLED on the page:** contact does not damage yet, and only
the monster chases — the other four kinds stand and are drawn.

**Approximation, labelled in `sim/enemies.js`:** the chase is A* over the
same 32px grid rather than a step-for-step reproduction of GameMaker's
`mp_grid_path`, so a chasing enemy takes a route of the same shape, not the
identical one.

## [x] Contact damage, and the switch that governs it

**Contact does not hurt you in level 1 — until you level the sword.**
(Corrected: an earlier pass of this document said "and it never will",
having read `violence` and stopped there. The monster's own Step overrides
it — see "The sword" below. The `violence` half is still exactly as
described here.) `scr_board_enemy_init` gives every
enemy

```gml
aggressive = obj_board_controller.violence;
active_hitbox = aggressive;
```

and the player's damage block will not fire unless
`hazard.active_hitbox == true`. `obj_board_controller`'s Create reads

```gml
violence = true;
if (room == room_board_1_sword) violence = false;
```

Grepping the whole chapter, only two things ever write `violence`: that
Create, and `obj_b2s_swordmanager` (level 2), which forces it false while
`scon == 0` and turns it true the moment `kris.sword` is true — and again
once `kris.xp > 0`. **Level 1's own manager, `obj_board_1_sword_manager`,
never touches it.** So the damage system belongs to level 2 and arrives with
the sword. Level 3 has violence on by Create default and no spawners at all,
so it is moot there.

(The `_docile` in `spr_board_monster_outline_docile` is a red herring — the
monster's Create picks that art for `room_board_1_sword || room_board_2_sword`
both, so it is the sword route's outlined style, not a behaviour.)

**The hazard you actually touch is not the enemy, and it is smaller than
the enemy.** `scr_board_enemy_init` creates `damage_hitbox =
obj_board_enemy_contact_hitbox` at `(x+16, y+16)` and re-pins it there every
step; the hitbox carries `damage = 2`, while the enemy's own `damage` is 1
and never lands. Its sprite is **`spr_hitbox_10px_center`, 10x10, origin
(5,5)**, drawn at scale 2 — so the damaging area is a **20x20 box centred on
the enemy, 6px in from each edge of its 32x32 tile**, not the whole tile.
(Corrected: the first damage pass assumed the full tile.) Two damage against `maxhealth 12`
is six hits, which the shadowmantle branch spells out as
`numberofhitskriscantake = 6`.

The numbers, all from `obj_mainchara_board`:

| | |
|---|---|
| `myhealth` at Create | 999, clamped to `maxhealth` by the Step's first health line — that clamp *is* the initialisation |
| `maxhealth` | 12 |
| `iframes` | 20 on a hit; `if (iframes > -5) iframes--` each step |
| `hurttimer` | 5 — `canfreemove` returns at 1 |
| `hitmove` / `hitmovespeed` | **32 / 16 on the hit**, so knockback is exactly two frames of 16. Create's `hitmove = 64` is overwritten before it is ever used |
| direction | `point_direction(x, y, hazard.xprevious, hazard.yprevious)` — away from where the hazard *was*, with a per-quadrant fallback that slides along a wall |
| the flash | not a blink: the Draw flips `image_blend` white↔red every second frame while iframes run |
| the recoil clamp | while `hurttimer > 0`, x/y are clamped to 128..480 / 64..288, so a knockback can never shove Kris over an edge and trip the camera |

**There is no hurt sprite on the board.** `hurtsprite` is assigned in the
Step but `sprite_index` is never set from it — only `scr_defeatrun` and the
death event use it. Kris keeps his walking frame and flashes.

Being hit also stuns the enemy: `delay = 10` (30 for `type == 2`), and every
movement branch in the monster's Step is gated on `delay == 0`. The game
stuns `instance_nearest(x + 16, y + 16, obj_board_enemy_monster)` — the
monster nearest Kris, not necessarily the one that hit him. Kept as written.

**Death** in a sword room is `global.flag[1007] = 1` and
`obj_board_death_event_sword`, whose Step is `exit` — the whole sequence is
in its Draw, on a frame counter: flood the 640x480 window with `red`, draw
Kris over it as a black silhouette, `facing--` every 4 frames for 48 frames
(three full turns), and step the flood down at 40, 50 and 60 before the TV
turns off at 90 and `room_goto(room_board_sword_intro)` at 120. The `red`
values are GameMaker BGR literals: 6609, 7079, 5241, 0 decode to rgb(209,25,0),
rgb(167,27,0), rgb(121,20,0), black — verified against the running canvas.

**Approximations, labelled on the page:** death restarts the level instead of
returning to `room_board_sword_intro` (a room this sim does not have), and
the health bar's frame sprite is a stand-in outline — its *fill* is exact,
being `spr_whitepx` stretched to `round(healthamt * 50) x 6` at (+14,+12) in
`#DBFC8F`, which is a rectangle and needs no art. In a sword room
`obj_ch3_gameshow` makes exactly one bar, for Kris, at (270,34); the
three-bar party layout at (128/222/316, 32) is the non-sword one.


## [x] The sword

**Where it comes from.** `sword = false` at Create for all three sword
rooms — it is only true at Create for the dungeons and the mantle rooms.
Each level holds exactly one `obj_board_pickup` (sprite `spr_board_key`,
scale 2) and its Step ends `player.sword = true`. The positions are
(2224,176), (4144,400) and (2608,400); they are in the level JSON now.

**The swing is eight frames.** `press_1` sets `swordbuffer = 8` and drops
`canfreemove`; the buffer counts 7..0 and control returns at 0.

| buffer | what happens |
|---|---|
| 7,6,5,4,0 | a direction press still re-aims the swing |
| 6 | the old hitbox is destroyed and a new one created at Kris |
| 4 | the live hitbox is re-aimed and its timer restarts |
| 0 | `canfreemove` returns |

`image_index` runs 0,0,1,1,1,2,0,0 across those frames. The hitbox itself
destroys at `timer == 5`.

**The hitbox geometry is all origins.** `spr_board_swordhitbox_vert` is
11x25 origin (1,8); `_horiz` is 25x11 origin (8,1); both drawn at scale ±2,
and the negative flips the box back across its origin, which is how up and
left reach backwards. Worked through, relative to Kris's top-left corner:

| facing | box (x, y, w, h) |
|---|---|
| down | 0, 16, 22, 50 |
| right | 16, 12, 50, 22 |
| up | 8, -34, 22, 50 |
| left | -34, 12, 50, 22 |

Each reaches 50px from Kris's centre along its axis and 22 across. Down and
up sit a couple of pixels off-centre because the game offsets them by +2 and
+10; those asymmetries are kept.

**A hit needs `swordlv >= sword_immunity_lv`.** Below it, or against the
gray monster (`hp 999`), the blade rings off (`snd_board_sword_metal`) and
only sets `hurttimer = 10`. Otherwise: `hurttimer = 10`, `active_hitbox =
false`, `hitdir = kris.facing`, `hp--`. The immunity levels come from the
spawner dispatch and are in the level data now — index 0 monsters are 1,
the yellow (index 2) is 2, the orange (index 3) is 3, flowers and one
bluefish variant are 2.

**Death lands one frame after the hit.** `scr_board_enemy_hurt_state` runs
`hurttimer--` and then, `if (hurttimer == 9 && hp <= 0)`, creates the splash,
adds `xp_given` (1) to Kris, destroys the enemy **and its spawner** — so a
cleared screen stays cleared — and rolls for a candy drop (5%, +20 under 8
health, +30 under 3, 0 at full, with a pity rule at 6 kills). While
`hurttimer > 6` the enemy is knocked up to 20px a frame along `hitdir`, one
pixel at a time, stopping at the first wall. Enemies are also clamped to
**x 160..448, y 96..256** — tighter than the player's own bounds.

**Levelling:** `xptolevel` is 3 by default and **10 in level 2**. On
`xp >= xptolevel`: `xp = 0`, `swordlv++` (clamped 1..5), and the next
threshold comes from a table — 24, 15, 14, 68 for levels 2..5.

### The thing the sword actually changes

The monster's Step, every frame:

```gml
var chaseplayer = true;
if (136 && obj_mainchara_board.swordlv > 1)   // `136` is a decompiler artifact
    aggressive = true;
if (!aggressive) { active_hitbox = false; chaseplayer = false; }
```

`aggressive` gates **both** the hitbox and the chase — a docile monster does
not merely fail to hurt you, it does not follow you either — and **swordlv >
1 forces it true regardless of `violence`**. In `room_board_1_sword` the same
block also re-derives `spd` (2 at swordlv 1, 3 above) and `image_speed` every
frame, so enemies already on the board speed up the moment you level.

Level 1's `xptolevel` is 3. **Kill three monsters and the whole board turns
on you.** Verified in the sim as an A/B on one monster with `violence` still
false: at swordlv 1 `aggressive=false` and standing inside it costs nothing;
set swordlv to 2 and nothing else, and the same monster reads
`aggressive=true`, `spd` goes 2→3, and standing in it costs 2 health.

Aggression latches — the rule only ever sets it, never clears it, so
dropping back to swordlv 1 leaves a woken monster awake. That is the game's
behaviour, not a simplification.

## [ ] Still to do — in order

1. **The other four enemy behaviours.** Flower, bluefish, lizard and
   bluebird spawn, draw, take sword hits and die, but hold station.
2. **The chase, properly.** The monster re-evaluates aggro only when it
   lands on a 32px cell boundary, paths with `mp_grid_path`, and re-paths on
   a timer keyed to `spd` (12 frames at spd 3), giving up at distance 70.
   The sim currently steps toward Kris on the dominant axis and checks the
   radius every frame — same shape, wrong cadence, and it is why enemies
   here glide rather than commit.
3. **Candy and healing.** `obj_board_heal_pickup` and the drop roll in
   `scr_board_enemy_hurt_state` are read but not built.
4. **Decoration that moves.** Tree spawners, waterfalls, `screenColorChanger`
   (118 in level 2 — it tints per screen).
5. **Warps.** `obj_board_warpentrance` / `obj_board_warptouch`, and the
   camera's `shift = "warp"` branch.
6. **The rank.** What actually scores a board.

## Deliberately out of scope

The Shadow Mantle encounter itself (`obj_shadow_mantle_*`, hp 30, with
burstwave / enemywave / flamewave / dash) and the boards proper. Only the
three sword levels.
