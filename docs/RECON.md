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

## [x] The full build — all three levels, and what each system really is

Everything below was read from the dump and verified against the running
sim; the traps found on the way are inline.

**Enemy lifetime (this corrected the whole earlier model).** The moment a
shift begins, `obj_board_camera` destroys EVERY enemy and projectile
(`with (obj_board_enemy_parent) instance_destroy()` plus the per-projectile
list). At con 98 every spawner still alive inside the player's bounds fires
again. Enemies are strictly per-screen; only a killed spawner stays gone.
The earlier "spawn once" set was wrong.

**Cadence.** Monster, bluefish and lizard Steps open with
`updatetimer++; if (updatetimer == 2) { updatetimer = 0; exit; }` — they act
every other frame, and all their timers count acting frames. The bluebird
has the same gate inverted. THE FLOWER HAS NO GATE and runs at full rate.
Projectiles move every third frame (pellet spd 8, spear spd 20).

**The monster, in full.** Wanders cell to cell (1px substeps, bounce off
walls and the 160..448/96..256 enemy clamp — tighter than the player's own
bounds and applied every acting frame by scr_board_enemy_hurt_state's tail).
Aggro is re-evaluated only when it lands on a cell boundary
(`distance_to_object < 90`, bbox distance); the chase is `mp_grid_path` to
Kris's cell (his y biased +18) re-pathed on a spd-keyed timer (16 at spd 2,
12 at 3, 9 at 4), giving up at 70. **Type-0 monsters never show the angry
sprite** — the angry art is the spear telegraph (`bulletimer >
shoot_wait_time`), and only type 1 increments bulletimer. Level 1 places
TEN type-1 (yellow) monsters via spawner index 2 — the earlier claim that
no variant is reachable was wrong (the variant comes from the spawner's
image_index, not creation code). Spears: spd 20, aimed by four probe
rectangles in source order (down, left, right, up — last hit wins), thrown
only while chasing with the player on screen, from 30 acting frames of
telegraph (22 threshold for the angry art).

**The flower.** Level 1: inert until swordlv > 1, then armed. Level 2:
armed the moment Kris HAS the sword, and its sword_immunity_lv drops to 0.
Shoots an aimed pellet (active at t5, dies at t160, destroyed on hit) on a
bubbletimer that resets to choose(-30,-16,-60); telegraph sprite at 16, back
at 30. Its contact hitbox is scaled to 0.25 — 2.5px; the pellets are the
threat.

**The bluefish.** Wanders cells against obj_board_solidfish (id 1066 — its
own wall set). Dash at spd 15 when row-aligned (needs `aggressive`) or
column-aligned (needs swordlv > 1) with Kris; the "line of sight" test
resolves to id 711 = **obj_nothing** in the sword rooms, so alignment alone
triggers. The dash ends on the wall: snap to cell, ~15 acting frames of
recovery. In level 1 nothing ever sets its aggression, so pond fish dash
but cannot hurt — the game's own code.

**The lizard** (level 2, index 10, type 0 — hp 2: its Create overrides
init's 1). At rest picks walk / idle-shuffle / jump with lastattack rules;
the jump telegraphs a red cell from the 11x3 grid at (128,128) and arcs
there over ~32 acting frames (only one lizard airborne at a time, 50-frame
refractory for all). Shoots pellets from its face at rest (bulletimer 28,
reset choose(-50,-25,0)).

**The bluebird** (level 1, index 13 → obj_board_enemy_bluebird_board1 in
this room). hp 8, sword_immunity_lv 4, flies between six fixed screen
points, only hittable while grounded (yoffset > -15). Its aggression is
never overridden, so in level 1 it can never hurt you — a flying decoration
you can, with a maxed sword, eventually kill.

**Warps.** `obj_board_warptouch` fires on contact: camera shift = "warp" —
10 frames of fade, the world rebased so (warpx,warpy) becomes the pane
corner, Kris at (playerX,playerY), con 98 refires on arrival, snd
board_escaped. `obj_board_warpentrance` has NO Step — Kris's own Step
converts a just-started edge shift into a warp when he overlaps one: it is
a doorway on the boundary. All targets live in per-instance creation code
(gml_RoomCC_* in the dump — the instance field is PreCreateCode, not
CreationCode, in this GM version).

**The tree loop** (level 1). Five obj_board_swordroute_treeteleportroom
regions; while global.flag[1006] < 4, stepping in warps you to the
canonical screen (1280,1088) AT THE SAME SCREEN POSITION (`plx = x - 128`),
four times, then the forest lets you through. The ghost helpers and the
chest cinematic are not reproduced (labelled).

**The boat** (level 2). Embark = the interact: Z while standing on a dock
(obj_board_boat's user event 0 via scr_interact). Riding is Kris's own
movement rules against obj_board_boatsolid — a third wall set. An engaged
boat gets the same +2/frame nudge Kris does during shifts. Disembark: Z
facing a dock one cell ahead; the boat parks beside it. The route to the
sword sails UP THE WATERFALL column (the boatsolid map opens exactly
there), into obj_board_b2sword_boatwarp: scr_quickwarp(3968,2112,
4192,2240), boat destroyed, Kris on foot.

**The cactus.** A hazard child (damage 1, always active — not gated on
violence) that makes its own solid from its bbox inset 2px, hp 3 to the
sword. TRAP FOUND HERE: the cactus solid lives in the solids list AND was
translated by a second loop — double translation drifted the wall off the
plant one screen per shift.

**Candy.** Dropped by the kill roll (5%, +20 under 8 hp, +30 under 3, 0 at
full, pity at 6 kills), blinks after 120 frames, gone at 150, heals +2 on
touch after a 10-frame grace (snd_power).

**The TV set.** obj_gameshow_swordroute: spr_gameshow_swordroutebg at
(-10,-10) (origin 5,5, scale 2), the additive tvglow at (0,320) tinted
`screencolor` at alpha 0.5, black below y 380. screencolor merges toward
each screen's obj_board_screenColorChanger colour over 16 frames — the
colour is the room instance's blend (ABGR in the room data). THE REAL HUD
is the gameshow's event_user(0), not obj_board_healthbar (obj_ch3_gameshow
never exists in sword rooms, so the (270,34) bar never instantiates —
correcting the earlier claim): black strip 128..511 x 32..63, "HP" +
a bar whose max width GROWS with sword level (110 + 30·(lv−1), hp scaled
against an absolute max of 32), "LV n"/"MAX" + a 66px XP bar + one sword
icon per level, and the ice key icon by flag 1055. All drawn in fnt_8bit.

**Level flow.** Every manager opens with a heart-shaped squaretransition
and a 60-frame screencolor fade from black — #FFD864 / #E2FF81 / #4DAFFF.
Music: board_ocean at open; the sword pickup switches to board_sword_music
(pitch 0.9 in level 2); level 2's first level-up drops back to the ocean,
as does level 1 at swordlv 4. Endings: level 1 = reaching the Mantle tease
(it flees upward; flag 1008); level 2 = the ice door, unlocked with the
key, #5AAFFF fade (room_goto dungeon_2 in the game); level 3 = the exit
trigger (fade, flag 1055 = 4, room_goto dungeon_3). The sim shows a card
and offers the next level; the dungeons are out of scope.

### Labelled approximations (also on the page)

- The story set pieces are not reproduced: the b1store shop, the shadowtease
  writer text, the tenna monologue/entrance, the heartisland and northern
  lights rooms, the tree-loop ghost helpers, the chest cinematic.
- The heart-shaped intro wipe is a plain fade.
- The monster's chase is A* over the same grid, not mp_grid_path's exact
  tie-breaks.
- The boat embark radius is "nearest boat within 200px" rather than the
  game's per-boat dock bookkeeping.
- Susie and Ralsei follow in level 3 by plain position history (target 12
  and 24); the caterpillar's exact catch-up interpolation is approximated.
- Level endings show a card instead of entering the dungeons.

## Bugs found in play (fixed 2026-08-19)

1. **The doorway ping-pong softlock.** A warp's landing overlaps the
   warptouch going the other way (level 1's pair provably does — landing
   (1200,172) vs touch (1184..1248, 160..179)), and an instant re-fire
   bounced the player between rooms forever. Guard: a warptouch Kris is
   standing on when a warp lands stays disarmed until he steps off it.
2. **Trees had no collision.** obj_board_tree's PARENT is obj_board_solid —
   every tree is a wall (and choppable only at swordlv 4; defense 3). The
   art is spr_board_b1tree_left frozen at frame 0 (its Create zeroes
   image_speed in sword rooms), not the small spr_board_tree.
3. **Embedded-at-spawn softlock.** Level 3's own room data places Kris's
   start overlapping a 10x4-cell solid (the door alcove) — so a solid Kris
   is already inside must not block him; it only blocks entry. Same guard
   protects every warp landing, plus the game's own treehelper rule (trees
   touching Kris on arrival are destroyed).
4. **The cactus solid drifted** (double translation) — its wall ended up a
   screen away from the plant.

## The CRT (added after playtest)

`obj_board_controller`'s Draw, running the game's own `shd_crt` (extracted
verbatim to assets/crt/shd_crt.frag) over the screen region (128,32)
384x288 in WebGL: the RGB triad filter (amount 0.1), chromatic aberration
(chromStrength 0.5), the vignette (scale 0.2, intensity pow(1.5,1.3)*18),
time = crttimer stepping 0.5 mod 3 — and the glitch when a sword-carrying
Kris takes a hit (crt_glitch 6, strength 10, decaying 1 a frame: jittered
stretch offsets, randomized aberration, boosted filter). A page toggle
turns it off for photosensitivity; the preference persists.

Two more corrections from the same pass:

- **Level 2 rendered the wrong tile layer.** The room has BOARD_Tiles_alt
  above BOARD_Tiles; on the sword route the alt layer is HIDDEN
  (obj_b2s_northernlightsroom, flag 1055 == 1). The builder took "the first
  Tiles layer" and got the night variant — this is what made walls look
  mirrored/wrong.
- **Ferns flip at random** — obj_board_fern's Draw: `dir = choose(0, 1)`,
  mirrored across x+32. And the sword pickup draws spr_board_sword (its
  Step's `type == "sword"` branch, static, no spin) — spr_board_key was
  only ever the object's default sprite. The cactus also pulses its spines
  (spr_board_cactus_spines merged toward #CBC83D), now drawn.

## Still to do, if ever

1. The set-piece dialogue (shopwriter/bw_make text boxes).
2. The rank screen (out of the three-level scope; scr_get_rank_letter).
3. The caterpillar catch-up interpolation, exactly.

## Deliberately out of scope

The Shadow Mantle encounter itself (`obj_shadow_mantle_*`, hp 30, with
burstwave / enemywave / flamewave / dash) and the boards proper. Only the
three sword levels.
