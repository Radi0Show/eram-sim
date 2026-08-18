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
// so LEVEL 1 IS HARMLESS. Nothing in level 1 ever turns it back on: the only
// writers of `violence` in the whole chapter are that Create and
// obj_b2s_swordmanager (level 2), which forces it false while `scon == 0`
// and flips it true the moment `kris.sword` is true — and again on
// `kris.xp > 0`. Level 1's own manager never touches it. So contact damage
// is level 2's, and it arrives with the sword.
//
// Constants are from `scr_board_enemy_init` and the monster's own Create:
//
//   hp 1 · xp_given 1 · spd 3 (2 in level 1 at swordlv 1)
//   the contact hitbox carries damage 2 — not the enemy's own `damage = 1`
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
const ENEMY_SIZE = 32;            // 16x16 art at scale 2

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
  // Level 1 at swordlv 1 slows the monster to 2 and its animation to 0.1;
  // above that it is 3 and 0.2 (monster Create).
  const monsterSpeed = level.number === 1 && (opts.swordlv ?? 1) === 1 ? 2 : 3;

  const enemies = [];
  const spawned = new Set();

  const blocked = (x, y) => solids.some((s) =>
    x < s.x + s.w && x + ENEMY_SIZE > s.x && y < s.y + s.h && y + ENEMY_SIZE > s.y);

  /**
   * Fire every spawner standing on the screen that just arrived.
   * Called once per landed shift, and once when the level opens.
   */
  function spawnVisible(spawners) {
    for (let i = 0; i < spawners.length; i++) {
      const sp = spawners[i];
      if (spawned.has(i) || !sp.kind) continue;
      if (sp.x < SPAWN_BOUNDS.x1 || sp.x > SPAWN_BOUNDS.x2
        || sp.y < SPAWN_BOUNDS.y1 || sp.y > SPAWN_BOUNDS.y2) continue;
      spawned.add(i);
      enemies.push({
        kind: sp.kind, variant: sp.variant,
        x: sp.x, y: sp.y,
        // The hitbox tracks its parent every step at (x+16, y+16) at scale
        // 2, so it covers the enemy's own 32x32 box; these are last frame's
        // coordinates, which is what the knockback direction is taken from.
        px: sp.x, py: sp.y,
        hp: 1, damage: CONTACT_DAMAGE,
        delay: 0,
        spd: sp.kind === 'monster' ? monsterSpeed : 3,
        angry: false,
        imageIndex: 0,
        movedir: Math.floor(rng() * 4),
        movetimer: 0,
        // Only the monster chases; the rest hold station until their own
        // behaviour is translated. They are drawn and they still hurt.
        chases: sp.kind === 'monster',
      });
    }
  }

  /** Everything moves with the screen, exactly like the walls do. */
  function translate(dx, dy) {
    for (const e of enemies) { e.x += dx; e.y += dy; }
  }

  function step(kris) {
    for (const e of enemies) {
      e.px = e.x; e.py = e.y;

      // `if (delay > 0) delay--;` and every movement branch is gated on
      // `delay == 0` — the monster's Step. This is the stun it takes for
      // having hit you.
      if (e.delay > 0) { e.delay -= 1; e.imageIndex += 0.1; continue; }

      // The contact hitbox is offset (+16,+16) from the enemy's own corner.
      const dx = (kris.x + 16) - (e.x + 16);
      const dy = (kris.y + 16) - (e.y + 16);
      const dist = Math.hypot(dx, dy);
      e.angry = e.chases && dist < AGGRO;

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

      // image_speed 0.1 idle, 0.2 once it has noticed you.
      e.imageIndex += e.angry ? 0.2 : 0.1;
    }
  }

  /**
   * `instance_place(x, y, obj_board_hazard)` — but a hazard whose
   * `active_hitbox` is false is not a hazard at all, which is the whole of
   * why level 1 cannot hurt you.
   */
  function touching(kris) {
    if (!violence) return null;
    return enemies.find((e) =>
      kris.x < e.x + ENEMY_SIZE && kris.x + ENEMY_SIZE > e.x
      && kris.y < e.y + ENEMY_SIZE && kris.y + ENEMY_SIZE > e.y) ?? null;
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
      const set = e.angry ? sprites.angry : sprites.idle;
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
  }

  return { enemies, spawnVisible, translate, step, touching, stun, draw, reset,
           get violence() { return violence; },
           set violence(v) {
             // active_hitbox is re-read from `aggressive` every time the
             // controller's flag moves; enemies already standing pick it up.
             violence = !!v;
           },
           get count() { return enemies.length; } };
}
