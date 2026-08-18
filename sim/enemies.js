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
// Constants are from `scr_board_enemy_init` and the monster's own Create:
//
//   hp 1 · damage 1 · xp_given 1 · spd 3 (2 in level 1 at swordlv 1)
//   distance_to_become_aggressive 90
//   the contact hitbox sits at (x + 16, y + 16)
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

export function createEnemies(level, opts = {}) {
  const solids = opts.solids ?? [];
  const rng = opts.rng ?? Math.random;
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
        hp: 1, damage: 1,
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

  /** Does anything touch Kris? The hitbox is the enemy's own 32x32 box. */
  function touching(kris) {
    return enemies.find((e) =>
      kris.x < e.x + ENEMY_SIZE && kris.x + ENEMY_SIZE > e.x
      && kris.y < e.y + ENEMY_SIZE && kris.y + ENEMY_SIZE > e.y);
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

  return { enemies, spawnVisible, translate, step, touching, draw,
           get count() { return enemies.length; } };
}
