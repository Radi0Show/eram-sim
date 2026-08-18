// THE BOARD'S ENEMIES.
//
// One spawner object carries the whole roster. `obj_board_enemy_spawner`'s
// user event 0 is a 21-branch dispatch on its own `image_index` — monster,
// flower, bluefish, silverfish, cats, lizards, birds, deer, and at the far
// end things that are not enemies at all (fire bars, ice-puzzle
// controllers, pushable blocks). Finding it is what turns "reverse a dozen
// bespoke enemies" into "read one switch". None of the sword-route
// spawners carry creation code, so every `type` is the PreCreate default of
// 0 and none of the `type == 1` variants (spear boss, Toriel deer, the
// miniboss walls) is reachable here.
//
// WHEN THEY APPEAR is the part worth getting right: nothing spawns on a
// timer. obj_board_camera, at `con == 98` — the frame a screen shift lands,
// before control returns — runs
//
//     with (obj_board_enemy_spawner)
//         if (x >= 128 && x <= 480 && y >= 64 && y <= 288) event_user(0);
//
// so a screen populates itself the moment it becomes the screen you are on,
// and the bounds it tests are the PLAYER's bounds, not the pane's.
//
// WHETHER THEY CAN HURT YOU AT ALL is a separate switch, and it is the
// thing to know before reading the damage code. `scr_board_enemy_init` sets
//
//     aggressive = obj_board_controller.violence
//     active_hitbox = aggressive
//
// and the player's damage block refuses to fire unless
// `hazard.active_hitbox == true`. obj_board_controller's Create says
//
//     violence = true;
//     if (room == room_board_1_sword) violence = false;
//
// so level 1 opens harmless. The only writers of `violence` are that Create
// and obj_b2s_swordmanager (level 2), which forces it false while
// `scon == 0` and flips it true the moment `kris.sword` is true.
//
// BUT `violence` IS NOT THE LAST WORD, and this is the part that makes the
// sword matter. The monster's own Step re-derives its aggression every
// frame:
//
//     var chaseplayer = true;
//     if (136 && obj_mainchara_board.swordlv > 1)   // `136` is a decompiler
//         aggressive = true;                        // artifact, always true
//     if (!aggressive) { active_hitbox = false; chaseplayer = false; }
//
// So `aggressive` gates BOTH the hitbox and the chase — a docile monster
// does not merely fail to hurt you, it does not follow you either — and
// SWORDLV > 1 FORCES IT TRUE regardless of `violence`. Level 1's
// `xptolevel` is 3, so killing three monsters levels the sword and turns
// the whole board hostile. The level is peaceful until you start killing
// things.
//
// Constants are from `scr_board_enemy_init` and the monster's own Create:
//
//   hp 1 · xp_given 1 · spd 3 (2 in level 1 at swordlv 1)
//   the contact hitbox carries damage 2 — not the enemy's own `damage = 1`
//   and it is spr_hitbox_10px_center: 10x10, origin (5,5), at scale 2 —
//   a 20x20 box CENTRED on the enemy, inset 6px inside its 32x32 tile,
//   not the whole tile
//   distance_to_become_aggressive 90
//   every enemy is drawn at scale 2 (scr_darksize)
//
// APPROXIMATION, LABELLED: the chase is A* over the same 32px grid the game
// builds (`global.cell_size = 32`, rebuilt by `scr_board_gridreset`), but
// GameMaker's `mp_grid_path` internals are not reproduced step for step, so
// a chasing enemy takes a route of the same shape rather than the identical
// one. Everything else here is read.

export const CELL = 32;
const SCALE = 2;
const AGGRO = 90;                 // distance_to_become_aggressive
const DEAGGRO = AGGRO - 20;       // and it gives up at 70
const ENEMY_SIZE = 32;            // 16x16 art at scale 2

/* The contact hitbox: spr_hitbox_10px_center (10x10, origin 5,5) at scale
   2, pinned to (parent.x + 16, parent.y + 16). That is 20x20 centred on the
   enemy — 6px in from each edge of its tile. */
const HITBOX_INSET = 6, HITBOX_SIZE = 20;

/* scr_board_enemy_hurt_state clamps every enemy to this, which is TIGHTER
   than the player's own 128..480 / 64..288. */
const ENEMY_BOUNDS = { x1: 160, x2: 448, y1: 96, y2: 256 };

const HURTTIME = 10;              // set by a sword hit
const KNOCKBACK_PX = 20;          // per frame, 1px at a time, while hurttimer > 6

/** The player's own bounds — the rect the spawn test uses. */
export const SPAWN_BOUNDS = { x1: 128, x2: 480, y1: 64, y2: 288 };

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // movedir = choose(0,1,2,3)

/** obj_board_enemy_contact_hitbox's Create. The enemy's own `damage` is 1
 *  and is never what lands: the hazard you actually touch is this. */
export const CONTACT_DAMAGE = 2;

export function createEnemies(level, opts = {}) {
  const solids = opts.solids ?? [];
  const rng = opts.rng ?? Math.random;
  // obj_board_controller Create, then obj_b2s_swordmanager for level 2.
  let violence = opts.violence ?? false;
  // Kris's live sword level — the monster's Step reads it every frame.
  const swordlv = opts.swordlv ?? (() => 1);
  const onKill = opts.onKill ?? (() => {});

  const enemies = [];
  const spawned = new Set();
  const killedSpawners = new Set();

  const blocked = (x, y) => solids.some((s) =>
    x < s.x + s.w && x + ENEMY_SIZE > s.x && y < s.y + s.h && y + ENEMY_SIZE > s.y);

  /**
   * Fire every spawner standing on the screen that just arrived.
   * Called once per landed shift, and once when the level opens.
   */
  function spawnVisible(spawners) {
    for (let i = 0; i < spawners.length; i++) {
      const sp = spawners[i];
      if (spawned.has(i) || killedSpawners.has(i) || !sp.kind) continue;
      if (sp.x < SPAWN_BOUNDS.x1 || sp.x > SPAWN_BOUNDS.x2
        || sp.y < SPAWN_BOUNDS.y1 || sp.y > SPAWN_BOUNDS.y2) continue;
      spawned.add(i);
      // Level 1 at swordlv 1 slows the monster to 2 and its animation to
      // 0.1; above that it is 3 and 0.2 (monster Create / Step).
      const slow = level.number === 1 && swordlv() === 1;
      enemies.push({
        kind: sp.kind, variant: sp.variant ?? null,
        spawnerIndex: i,
        x: sp.x, y: sp.y,
        // Last frame's coordinates — what the knockback direction is taken
        // from (`hazard.xprevious, hazard.yprevious`).
        px: sp.x, py: sp.y,
        hp: sp.hp ?? 1,
        maxhp: sp.hp ?? 1,
        immunity: sp.immunity ?? 1,     // sword_immunity_lv
        blend: sp.blend ?? null,        // gray monsters ring the blade off
        damage: CONTACT_DAMAGE,
        delay: 0,
        hurttimer: 0,
        hitdir: -1,
        // `aggressive = obj_board_controller.violence` at init.
        aggressive: violence,
        spd: sp.spd ?? (sp.kind === 'monster' && slow ? 2 : 3),
        angry: false,
        imageIndex: 0,
        movedir: Math.floor(rng() * 4),
        movetimer: 0,
        // Only the monster chases; the rest hold station until their own
        // behaviour is translated.
        chases: sp.kind === 'monster',
      });
    }
  }

  /** Everything moves with the screen, exactly like the walls do. */
  function translate(dx, dy) {
    for (const e of enemies) { e.x += dx; e.y += dy; }
  }

  function step(kris) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.px = e.x; e.py = e.y;

      // THE AGGRESSION RULE, from the monster's Step, re-derived every
      // frame: swordlv > 1 forces it on, and without it there is neither a
      // hitbox nor a chase.
      if (e.chases && swordlv() > 1) e.aggressive = true;

      // And in level 1 the same block re-derives the monster's speed from
      // the sword every frame, so an enemy already on the board speeds up
      // the moment you level:
      //     if (swordlv > 1)  { image_speed = 0.2; spd = 3; active_hitbox = true; }
      //     if (swordlv == 1) { image_speed = 0.1; spd = 2; }
      if (e.kind === 'monster' && level.number === 1 && e.variant === null) {
        e.spd = swordlv() > 1 ? 3 : 2;
      }

      // scr_board_enemy_hurt_state. Death lands at hurttimer 9 — the frame
      // AFTER the hit, not on it.
      if (e.hurttimer > 0) {
        e.hurttimer -= 1;
        if (e.hurttimer === 9 && e.hp <= 0) {
          enemies.splice(i, 1);
          // The spawner goes with it, so a cleared screen stays cleared.
          killedSpawners.add(e.spawnerIndex);
          onKill(e);                       // kris.xp += xp_given
          continue;
        }
        // Knocked back up to 20px a frame while hurttimer > 6, one pixel at
        // a time, stopping at the first wall.
        if (e.hurttimer > 6 && e.hitdir >= 0) {
          const [kx, ky] = HITDIRS[e.hitdir];
          for (let n = 0; n < KNOCKBACK_PX; n++) {
            if (blocked(e.x + kx, e.y + ky)) break;
            e.x += kx; e.y += ky;
          }
        }
        clamp(e);
        e.imageIndex += 0.1;
        continue;                          // a hurt enemy does not act
      }

      // `if (delay > 0) delay--;` and every movement branch is gated on
      // `delay == 0` — the monster's Step. This is the stun it takes for
      // having hit you.
      if (e.delay > 0) { e.delay -= 1; e.imageIndex += 0.1; continue; }

      // The contact hitbox is offset (+16,+16) from the enemy's own corner.
      const dx = (kris.x + 16) - (e.x + 16);
      const dy = (kris.y + 16) - (e.y + 16);
      const dist = Math.hypot(dx, dy);
      // No chase without aggression — that is the same flag the hitbox
      // hangs off. Enter the chase inside 90, leave it at 70.
      e.angry = e.chases && e.aggressive && (e.angry ? dist < DEAGGRO : dist < AGGRO);

      if (e.angry) {
        // Chase: step toward Kris on whichever axis is furthest, refusing
        // any step that would put the enemy inside a wall.
        const stepX = Math.sign(dx) * e.spd;
        const stepY = Math.sign(dy) * e.spd;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (stepX && !blocked(e.x + stepX, e.y)) e.x += stepX;
          else if (stepY && !blocked(e.x, e.y + stepY)) e.y += stepY;
        } else {
          if (stepY && !blocked(e.x, e.y + stepY)) e.y += stepY;
          else if (stepX && !blocked(e.x + stepX, e.y)) e.x += stepX;
        }
      } else if (e.chases) {
        // Idle: `movedir = choose(0,1,2,3)` and walk it for a while.
        e.movetimer -= 1;
        if (e.movetimer <= 0) {
          e.movedir = Math.floor(rng() * 4);
          e.movetimer = 20 + Math.floor(rng() * 40);
        }
        const [mx, my] = DIRS[e.movedir];
        const nx = e.x + mx * e.spd, ny = e.y + my * e.spd;
        if (!blocked(nx, ny)) { e.x = nx; e.y = ny; }
        else e.movetimer = 0;
      }

      clamp(e);
      // image_speed 0.1 idle, 0.2 once it has noticed you.
      e.imageIndex += e.angry ? 0.2 : 0.1;
    }
  }

  /** hitdir 0/1/2/3 = down/right/up/left, matching kris.facing. */
  const HITDIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  function clamp(e) {
    e.x = Math.min(ENEMY_BOUNDS.x2, Math.max(ENEMY_BOUNDS.x1, e.x));
    e.y = Math.min(ENEMY_BOUNDS.y2, Math.max(ENEMY_BOUNDS.y1, e.y));
  }

  /**
   * scr_board_enemy_sword_collision. `box` is the sword hitbox's rect in
   * world space; `facing` becomes the enemy's knockback direction.
   *
   * Returns what happened so the caller can play the right sound: 'hit',
   * 'clang' (the blade rings off — either swordlv is below the enemy's
   * sword_immunity_lv, or it is the gray monster), or null.
   */
  function swordHit(box, facing, lv) {
    let result = null;
    for (const e of enemies) {
      if (e.hurttimer !== 0) continue;
      if (!(box.x < e.x + ENEMY_SIZE && box.x + box.w > e.x
         && box.y < e.y + ENEMY_SIZE && box.y + box.h > e.y)) continue;

      if (lv < e.immunity) {
        // snd_board_sword_metal, and nothing else happens.
        e.hurttimer = HURTTIME;
        e.hitdir = -1;
        result = result === 'hit' ? 'hit' : 'clang';
      } else if (e.blend === 'gray') {
        e.hurttimer = HURTTIME;
        e.hitdir = -1;
        result = result === 'hit' ? 'hit' : 'clang';
      } else {
        e.hurttimer = HURTTIME;
        e.hitdir = facing;
        e.angry = false;               // path_end(); the chase drops
        if (e.hp !== 999) e.hp -= 1;
        result = 'hit';
      }
    }
    return result;
  }

  /**
   * `instance_place(x, y, obj_board_hazard)` — but a hazard whose
   * `active_hitbox` is false is not a hazard at all, which is the whole of
   * why level 1 cannot hurt you.
   */
  function touching(kris) {
    return enemies.find((e) => {
      // active_hitbox: off unless aggressive, and off while hurt.
      if (!e.aggressive || e.hurttimer > 0) return false;
      const hx = e.x + HITBOX_INSET, hy = e.y + HITBOX_INSET;
      return kris.x < hx + HITBOX_SIZE && kris.x + ENEMY_SIZE > hx
          && kris.y < hy + HITBOX_SIZE && kris.y + ENEMY_SIZE > hy;
    }) ?? null;
  }

  /**
   * The hit's recoil, from the player's Step:
   *
   *     with (instance_nearest(x + 16, y + 16, obj_board_enemy_monster))
   *         { ... delay = 10; if (type == 2) delay = 30; }
   *
   * Note it stuns the monster NEAREST KRIS, which is not necessarily the one
   * that touched him — that is the game's own wording, kept.
   */
  function stun(kris) {
    let best = null, bestd = Infinity;
    for (const e of enemies) {
      if (e.kind !== 'monster') continue;
      const d = Math.hypot((kris.x + 16) - (e.x + 16), (kris.y + 16) - (e.y + 16));
      if (d < bestd) { bestd = d; best = e; }
    }
    if (best) { best.delay = best.variant === 2 ? 30 : 10; best.movetimer = 0; }
  }

  function draw(ctx, sprites) {
    for (const e of enemies) {
      // spr_board_monster_hurt while the hit is landing.
      const set = (e.hurttimer > 0 && sprites.hurt && sprites.hurt.length)
        ? sprites.hurt
        : (e.angry ? sprites.angry : sprites.idle);
      if (!set || !set.length) continue;
      const f = set[Math.floor(e.imageIndex) % set.length];
      ctx.drawImage(f, Math.round(e.x), Math.round(e.y),
        f.width * SCALE, f.height * SCALE);
    }
  }

  /** Back to an empty board — the death event destroys every enemy, and a
   *  restarted level re-fires the spawners from scratch. */
  function reset() {
    enemies.length = 0;
    spawned.clear();
    killedSpawners.clear();
  }

  return { enemies, spawnVisible, translate, step, touching, stun, swordHit, draw, reset,
           get violence() { return violence; },
           set violence(v) {
             // active_hitbox is re-read from `aggressive` every time the
             // controller's flag moves; enemies already standing pick it up.
             violence = !!v;
           },
           get count() { return enemies.length; } };
}
