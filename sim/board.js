// THE BOARD ENGINE — the sword route's three levels.
//
// Chapter 3's board game, the one you play for a rank (`scr_get_rank_letter`:
// Z C B A S T). The sword route hands you one level after each board, and
// these are those three:
//
//   1  room_board_1_sword   6220x1920   desert, trees, enemy spawners
//   2  room_board_2_sword   5184x4736   water, boats, docks
//   3  room_board_3_sword   3968x3392   the approach, and the sword manager
//
// THE MECHANIC THIS IS BUILT ON, and the thing to understand before
// changing anything: THE CAMERA NEVER MOVES. The screen is a fixed 384x256
// window at (128,64) and Kris is clamped inside it (x 128..480, y 64..288 —
// 384-32 and 256-32, because he is 32 wide). Walking off an edge does not
// pan: obj_board_camera translates THE ENTIRE WORLD — the tile layers via
// `layer_x`/`layer_y`, and every obj_board_parent instance, Kris included —
// one whole screen over, 24px a frame horizontally and 16 vertically,
// sixteen frames either way.
//
// AND KRIS GETS TWO PIXELS BACK each frame, against the drift. The camera
// moves every instance by the full movespeed and then nudges KRIS ALONE by
// 2 the other way, so over 16 frames he covers 352 of the 384 and lands on
// the opposite bound (480 - 352 = 128) — walking in at the edge of the new
// screen. Leave it out and he overshoots, re-trips the edge test, and the
// screen oscillates forever. It is four lines and the transition depends on
// them entirely.
//
// Verified against room_board_preshadowmantle in the thedevice build before
// being brought here; the numbers are all read out of obj_mainchara_board
// and obj_board_camera, never tuned.

import { createEnemies } from './enemies.js';

const VIEW_W = 640, VIEW_H = 480;      // the game window
const PANE_X = 128, PANE_Y = 64;       // where the board's screen sits in it
const PANE_W = 384, PANE_H = 256;      // obj_board_camera's gamescreenWidth/Height
const MS_PER_FRAME = 1000 / 30;        // GEN8 game speed

const WSPEED = 4;                      // obj_mainchara_board Create
const KRIS_SIZE = 32;                  // 16x16 sprite at the instance's scale 2

// obj_mainchara_board Step, lines 1-4. The pane inset by Kris's own size.
const BOUND_L = 128, BOUND_R = 480, BOUND_U = 64, BOUND_D = 288;

// obj_board_camera Step: horizontal shifts run at 24, vertical at 16 — both
// land on exactly 16 frames for their axis.
const SHIFT_H_SPEED = 24, SHIFT_V_SPEED = 16;

const FACE_DOWN = 0, FACE_RIGHT = 1, FACE_UP = 2, FACE_LEFT = 3;
const FACE_NAME = ['down', 'right', 'up', 'left'];

/* ---------------- getting hit ----------------
   obj_mainchara_board's Create, and the damage block in its Step. Kris opens
   at myhealth 999 and the Step's very first health line clamps it to
   maxhealth — that IS the initialisation, and it is why 12 is the number.

   A hit costs 2 (the contact hitbox's own `damage`), so twelve health is six
   hits — which the shadowmantle branch states out loud as
   `numberofhitskriscantake = 6`. */
const MAXHEALTH = 12;
const IFRAMES = 20;               // set on every hit
const HURTTIMER = 5;              // frames of lockout after one
const HITMOVE = 32;               // Create says 64; the hit overwrites it
const HITMOVESPEED = 16;          // so knockback is exactly two frames of 16

/* obj_board_healthbar: one bar for Kris in a sword room, at (270,34), and
   the fill is a stretched white pixel 50 wide and 6 tall at (+14,+12). */
const HEALTHBAR_X = 270, HEALTHBAR_Y = 34;
const HEALTHBAR_COLOR = '#DBFC8F';

/* obj_board_death_event_sword. `red` is a GameMaker BGR literal, so 6609 is
   0x0019D1 and reads back as rgb(209,25,0). It steps down twice and then to
   black while Kris spins. */
const DEATH_REDS = [
  { t: 0,  css: 'rgb(209,25,0)' },   // red = 6609
  { t: 40, css: 'rgb(167,27,0)' },   // red = 7079
  { t: 50, css: 'rgb(121,20,0)' },   // red = 5241
  { t: 60, css: 'rgb(0,0,0)' },      // red = 0
];
const DEATH_END = 120;            // room_goto(room_board_sword_intro)

/** GameMaker's point_direction: degrees CCW from east, y inverted. */
function pointDirection(x1, y1, x2, y2) {
  const d = Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
}

/** A sprite multiplied by a solid colour, the way image_blend does it.
 *  Multiply, then restore the original alpha so the margins stay clear. */
const tintCache = new Map();
function tinted(img, css) {
  const key = `${img.src}|${css}`;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = css;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`${src} missing`));
    i.src = src;
  });
}

/**
 * Run one level.
 *
 * @param canvas  the 640x480 frame
 * @param level   a level object from assets/levels/<n>.json
 * @param opts    base — where the shared art lives, relative to the page
 */
export async function runBoard(canvas, level, opts = {}) {
  const base = opts.base ?? 'assets/';
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;

  const room = level;
  const [tileset, ...krisFrames] = await Promise.all([
    loadImage(`${base}tileset.png`),
    ...['down', 'right', 'up', 'left'].flatMap((d) =>
      [0, 1].map((f) => loadImage(`${base}kris_${d}_${f}.png`))),
  ]);
  const monsterIdle = await Promise.all([0, 1].map((f) =>
    loadImage(`${base}monster_outline_docile_${f}.png`).catch(() => null)));
  const monsterAngry = await Promise.all([0, 1].map((f) =>
    loadImage(`${base}monster_angery_outline_docile_${f}.png`).catch(() => null)));
  const enemySprites = {
    idle: monsterIdle.filter(Boolean),
    angry: monsterAngry.filter(Boolean),
  };
  // The bar's frame, if it has been extracted; the fill is drawn either way.
  const healthbarFrame = (await Promise.all([0, 1].map((f) =>
    loadImage(`${base}healthbar_${f}.png`).catch(() => null)))).filter(Boolean);

  const krisSprite = {
    down: [krisFrames[0], krisFrames[1]],
    right: [krisFrames[2], krisFrames[3]],
    up: [krisFrames[4], krisFrames[5]],
    left: [krisFrames[6], krisFrames[7]],
  };

  /* ---------------- the world ----------------
     obj_board_camera's Create:
         moveX = 128 - roomStartingX - originX
         moveY = 64  - roomStartingY - originY
     and then it moves the layers AND every board instance by that. The
     layers start at 0,0 here, so this room opens shifted (0, -256) — which
     is what puts Kris's starting cell inside the screen. */
  const moveX = PANE_X - room.roomStartingX;
  const moveY = PANE_Y - room.roomStartingY;

  const world = { x: moveX, y: moveY };   // the tile layer's origin
  const solids = room.solids.map((s) => ({ x: s.x + moveX, y: s.y + moveY, w: s.w, h: s.h }));

  /* THE ENEMIES. Their spawners live in world space like everything else,
     so they are translated with the room and then tested against the
     player's bounds — which is what the camera does at con 98. */
  const spawners = (room.spawners ?? []).map((sp) => ({ ...sp, x: sp.x + moveX, y: sp.y + moveY }));
  /* VIOLENCE — whether an enemy's hitbox is live at all.
     obj_board_controller's Create is `violence = true`, except
     `if (room == room_board_1_sword) violence = false`. Level 2's manager
     then forces it false until Kris has the sword and true once he does.
     The sword is not built, so the game's own answer for all three levels
     right now is "off"; the host page exposes it because otherwise none of
     the code below this line could ever run. */
  const levelViolence = room.number !== 1;
  let violence = opts.violence ?? (levelViolence && (opts.sword ?? false));
  const foes = createEnemies(room, { solids, swordlv: opts.swordlv ?? 1, violence });

  const kris = {
    x: room.kris.x + moveX,
    y: room.kris.y + moveY,
    facing: FACE_DOWN,
    imageIndex: 0,
    walkbuffer: 0,
    canfreemove: true,
    nowx: 0, nowy: 0,
    // The damage state, all of it from obj_mainchara_board's Create.
    myhealth: 999,          // clamped to maxhealth on the first step
    maxhealth: MAXHEALTH,
    iframes: 0,
    hurttimer: 0,
    hitcon: 0,
    hitmove: 0,
    hitx: 0, hity: 0,
    blend: 'white',         // image_blend, toggled red while iframes run
  };

  /** `place_meeting(x, y, obj_board_solid)` — Kris's 32x32 box against them. */
  function meets(x, y) {
    for (const s of solids) {
      if (x < s.x + s.w && x + KRIS_SIZE > s.x && y < s.y + s.h && y + KRIS_SIZE > s.y) return true;
    }
    return false;
  }

  /* ---------------- input ---------------- */
  const held = new Set();
  const KEYMAP = {
    arrowup: 'u', arrowdown: 'd', arrowleft: 'l', arrowright: 'r',
    w: 'u', s: 'd', a: 'l', d: 'r',
  };
  const onKey = (e) => {
    const k = KEYMAP[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    held.add(k);
  };
  const onKeyUp = (e) => {
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) held.delete(k);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  /* ---------------- the shift ---------------- */
  let shift = 'none';
  let moving = 0;
  let healthbarFlash = 0;   // the bar goes red for 2 frames on a hit

  /** Translate EVERYTHING — the world origin, the walls, Kris, the enemies. */
  function translate(dx, dy) {
    world.x += dx; world.y += dy;
    for (const s of solids) { s.x += dx; s.y += dy; }
    for (const sp of spawners) { sp.x += dx; sp.y += dy; }
    foes.translate(dx, dy);
    kris.x += dx; kris.y += dy;
  }

  function stepShift() {
    if (shift === 'none') return;
    const horizontal = shift === 'left' || shift === 'right';
    const speed = horizontal ? SHIFT_H_SPEED : SHIFT_V_SPEED;
    const total = horizontal ? PANE_W : PANE_H;
    const dx = shift === 'right' ? -speed : shift === 'left' ? speed : 0;
    const dy = shift === 'down' ? -speed : shift === 'up' ? speed : 0;
    translate(dx, dy);

    // AND THEN KRIS GETS TWO PIXELS BACK, every frame, against the drift.
    //
    // This is the line that makes the transition work, and it is easy to
    // miss: obj_board_camera moves every board instance by the full
    // movespeed and then nudges KRIS ALONE by 2 the other way. Over the 16
    // frames of a horizontal shift he travels 352 instead of 384 — from one
    // bound to exactly the other (480 - 352 = 128), so he walks in at the
    // edge of the new screen. Without it he overshoots past the opposite
    // bound, trips the edge test again, and the screen shifts back and
    // forth forever.
    if (shift === 'right') kris.x += 2;
    if (shift === 'left') kris.x -= 2;
    if (shift === 'down') kris.y += 2;
    if (shift === 'up') kris.y -= 2;

    moving += speed;
    if (moving >= total) {
      // con 99: the world settles on whole pixels and control comes back.
      kris.x = Math.round(kris.x);
      kris.y = Math.round(kris.y);
      shift = 'none';
      moving = 0;
      kris.canfreemove = true;
      // obj_board_camera con 98: every spawner standing on the new screen
      // fires now, before control comes back.
      foes.spawnVisible(spawners);
    }
  }

  /* ---------------- Kris ----------------
     obj_mainchara_board's Step: read the four keys, set facing by the rules
     that make a held direction win over the one you just released, then
     resolve movement one axis at a time with a corner slip. */
  function stepKris() {
    kris.nowx = kris.x;
    kris.nowy = kris.y;
    if (!kris.canfreemove) return;

    const pr = held.has('r') ? 1 : 0, pl = held.has('l') ? 1 : 0;
    const pd = held.has('d') ? 1 : 0, pu = held.has('u') ? 1 : 0;

    let px = 0, py = 0, pressdir = -1;
    if (pr) { px = WSPEED; pressdir = FACE_RIGHT; }
    if (pl) { px = -WSPEED; pressdir = FACE_LEFT; }
    if (pd) { py = WSPEED; pressdir = FACE_DOWN; }
    if (pu) { py = -WSPEED; pressdir = FACE_UP; }

    // The facing rules, verbatim: while facing one way, the opposite key
    // takes over immediately, and letting go of the current one hands
    // facing to whatever is still held.
    const f = kris.facing;
    if (f === FACE_UP) {
      if (pd) kris.facing = FACE_DOWN;
      if (!pu && pressdir !== -1) kris.facing = pressdir;
    } else if (f === FACE_DOWN) {
      if (pu) kris.facing = FACE_UP;
      if (!pd && pressdir !== -1) kris.facing = pressdir;
    } else if (f === FACE_LEFT) {
      if (pr) kris.facing = FACE_RIGHT;
      if (!pl && pressdir !== -1) kris.facing = pressdir;
    } else if (f === FACE_RIGHT) {
      if (pl) kris.facing = FACE_LEFT;
      if (!pr && pressdir !== -1) kris.facing = pressdir;
    }

    const x = kris.x, y = kris.y;

    // X AXIS. Blocked? First try to slip up or down by g — this is what
    // lets you round a corner without catching on it — then walk px back
    // toward zero until it fits.
    if (px !== 0 && meets(x + px, y)) {
      for (let g = WSPEED; g > 0; g -= 1) {
        if (!pd && !meets(x + px, y - g)) { kris.y -= g; py = 0; break; }
        if (!pu && !meets(x + px, y + g)) { kris.y += g; py = 0; break; }
      }
      let bkx = 0;
      if (px > 0) {
        for (let i = px; i >= 0; i -= 1) if (!meets(x + i, kris.y)) { px = i; bkx = 1; break; }
      } else {
        for (let i = px; i <= 0; i += 1) if (!meets(x + i, kris.y)) { px = i; bkx = 1; break; }
      }
      if (!bkx) px = 0;
    }

    // Y AXIS, the same shape.
    if (py !== 0 && meets(kris.x, y + py)) {
      for (let g = WSPEED; g > 0; g -= 1) {
        if (!pr && !meets(kris.x - g, y + py)) { kris.x -= g; px = 0; break; }
        if (!pl && !meets(kris.x + g, y + py)) { kris.x += g; px = 0; break; }
      }
      let bky = 0;
      if (py > 0) {
        for (let i = py; i >= 0; i -= 1) if (!meets(kris.x, y + i)) { py = i; bky = 1; break; }
      } else {
        for (let i = py; i <= 0; i += 1) if (!meets(kris.x, y + i)) { py = i; bky = 1; break; }
      }
      if (!bky) py = 0;
    }

    // DIAGONAL: walk both components down together until the pair fits.
    if (px !== 0 && py !== 0 && meets(kris.x + px, kris.y + py)) {
      let i = px, j = py, ok = 0;
      while (j !== 0 || i !== 0) {
        if (!meets(kris.x + i, kris.y + j)) { px = i; py = j; ok = 1; break; }
        if (Math.abs(j) >= 1) j += j > 0 ? -1 : 1; else j = 0;
        if (Math.abs(i) >= 1) i += i > 0 ? -1 : 1; else i = 0;
      }
      if (!ok) { px = 0; py = 0; }
    }

    kris.x += px;
    kris.y += py;

    // THE EDGE. Clamp to the screen, and hand over to the camera only if
    // there is somewhere to arrive: a solid one cell beyond the boundary
    // means this edge is a wall, not a way out.
    if (kris.x > BOUND_R) {
      kris.x = BOUND_R;
      if (!meets(kris.x + 32, kris.y)) { kris.facing = FACE_RIGHT; kris.canfreemove = false; shift = 'right'; }
    }
    if (kris.x < BOUND_L) {
      kris.x = BOUND_L;
      if (!meets(kris.x - 32, kris.y)) { kris.facing = FACE_LEFT; kris.canfreemove = false; shift = 'left'; }
    }
    if (kris.y > BOUND_D) {
      kris.y = BOUND_D;
      if (!meets(kris.x, kris.y + 32)) { kris.canfreemove = false; shift = 'down'; }
    }
    if (kris.y < BOUND_U) {
      kris.y = BOUND_U;
      if (!meets(kris.x, kris.y - 32)) { kris.facing = FACE_UP; kris.canfreemove = false; shift = 'up'; }
    }
  }

  /* ---------------- getting hit ----------------
     obj_mainchara_board's Step, in its own order: the health clamp and the
     iframe tick come first, then the hazard test, then the knockback, then
     the hurt timer. Movement (stepKris) happens above all of it, exactly as
     it does in the Step. */

  let death = null;   // the death event, once myhealth reaches 0

  function stepDamage() {
    // `if (myhealth > maxhealth) myhealth = maxhealth;` — the line that
    // turns Create's 999 into a full bar on frame one.
    if (kris.myhealth > kris.maxhealth) kris.myhealth = kris.maxhealth;
    // `if (iframes > -5) iframes--;`
    if (kris.iframes > -5) kris.iframes -= 1;

    // The gate. Without a sword, a boat or the player camera the game's
    // long condition reduces to canfreemove — so no hit lands mid-shift or
    // mid-recoil, which is what makes a single touch cost exactly one hit.
    if (kris.canfreemove && kris.iframes <= 0 && kris.myhealth > 0) {
      const hazard = foes.touching(kris);
      if (hazard) {
        kris.iframes = IFRAMES;
        kris.blend = 'red';                    // image_blend = c_red
        kris.myhealth -= hazard.damage;        // 2
        healthbarFlash = 2;                    // scr_delay_var("mycolor", …, 2)
        foes.stun(kris);

        kris.hurttimer = HURTTIMER;
        kris.canfreemove = false;
        kris.hitmove = HITMOVE;
        kris.hitcon = 1;
        kris.hitx = 0;
        kris.hity = 0;

        // AWAY FROM WHERE THE HAZARD WAS, not where it is: the game takes
        // the direction to `hazard.xprevious, hazard.yprevious`. Each
        // quadrant tries its own axis first and falls back to sliding along
        // the wall if a solid is in the way.
        const dir = pointDirection(kris.x, kris.y, hazard.px, hazard.py);
        const free = (dx, dy) => !meets(kris.x + dx, kris.y + dy);
        if (dir >= 135 && dir < 225) {            // hazard to the left
          if (free(16, 0)) kris.hitx += HITMOVESPEED;
          else if (hazard.py > kris.y && free(0, -16)) kris.hity -= HITMOVESPEED;
          else if (free(0, 16)) kris.hity += HITMOVESPEED;
        }
        if (dir >= 315 || dir < 45) {             // to the right
          if (free(-16, 0)) kris.hitx -= HITMOVESPEED;
          else if (hazard.py > kris.y && free(0, -16)) kris.hity -= HITMOVESPEED;
          else if (free(0, 16)) kris.hity += HITMOVESPEED;
        }
        if (dir >= 45 && dir < 135) {             // above (y grows downward)
          if (free(0, 16)) kris.hity += HITMOVESPEED;
          else if (hazard.px < kris.x && free(-16, 0)) kris.hitx -= HITMOVESPEED;
          else if (free(16, 0)) kris.hitx += HITMOVESPEED;
        }
        if (dir >= 225 && dir < 315) {            // below
          if (free(0, -16)) kris.hity -= HITMOVESPEED;
          else if (hazard.px < kris.x && free(-16, 0)) kris.hitx -= HITMOVESPEED;
          else if (free(16, 0)) kris.hitx += HITMOVESPEED;
        }
      }
    }

    // THE RECOIL. hitmove 32 at hitmovespeed 16 is two frames, and the
    // third falls through to the else — which is where death is decided.
    if (kris.hitcon === 1) {
      if (kris.hitmove > 0) {
        kris.hitmove -= HITMOVESPEED;
        if (!meets(kris.x + kris.hitx, kris.y + kris.hity)) {
          kris.x += kris.hitx;
          kris.y += kris.hity;
        }
      } else {
        kris.blend = 'white';
        if (kris.myhealth <= 0) {
          kris.myhealth = 0;
          kris.hitcon = 99;
          startDeath();
        } else {
          kris.hitcon = 0;
        }
      }
    }

    // `if (hurttimer == 1) canfreemove = 1;` then the decrement — and the
    // clamp back inside the screen, so a knockback can never push Kris over
    // an edge and trip the camera.
    if (kris.hurttimer === 1) kris.canfreemove = true;
    if (kris.hurttimer > 0) {
      kris.hurttimer -= 1;
      kris.x = Math.min(BOUND_R, Math.max(BOUND_L, kris.x));
      kris.y = Math.min(BOUND_D, Math.max(BOUND_U, kris.y));
    }

    // The flash, from the Draw: every second frame the blend flips between
    // white and red, so it reads as red-two-frames, white-two-frames.
    if (kris.iframes > 0) {
      if (kris.iframes % 2 === 0) kris.blend = kris.blend === 'white' ? 'red' : 'white';
    } else {
      kris.blend = 'white';
    }
  }

  /* obj_board_death_event_sword. Its Step is `exit` — the whole sequence
     lives in the Draw, on a frame counter. */
  function startDeath() {
    death = { timer: 0, facing: FACE_DOWN, css: DEATH_REDS[0].css };
    foes.enemies.length = 0;         // `with (obj_board_enemy_parent) instance_destroy()`
  }

  function stepDeath() {
    death.timer += 1;
    const t = death.timer;
    // `if (timer < 48) if ((timer % 4) == 0) facing--;` — three full turns.
    if (t < 48 && t % 4 === 0) death.facing = (death.facing + 3) % 4;
    for (const r of DEATH_REDS) if (t >= r.t) death.css = r.css;
  }

  /* The game ends the sequence with `room_goto(room_board_sword_intro)`,
     which is a room this sim does not have. The level restarts instead —
     the world slides back to its opening offset, the spawners re-arm, and
     Kris starts over on full health. Labelled on the page. */
  function restart() {
    translate(moveX - world.x, moveY - world.y);
    kris.x = room.kris.x + moveX;
    kris.y = room.kris.y + moveY;
    kris.facing = FACE_DOWN;
    kris.imageIndex = 0;
    kris.walkbuffer = 0;
    kris.canfreemove = true;
    kris.myhealth = MAXHEALTH;
    kris.iframes = 0;
    kris.hurttimer = 0;
    kris.hitcon = 0;
    kris.hitmove = 0;
    kris.hitx = 0; kris.hity = 0;
    kris.blend = 'white';
    shift = 'none';
    moving = 0;
    healthbarFlash = 0;
    death = null;
    foes.reset();
    foes.spawnVisible(spawners);
    if (opts.onRestart) opts.onRestart();
  }

  /** The walk cycle: two frames, and only ACTUAL movement drives it. */
  function stepAnim() {
    if (kris.x !== kris.nowx || kris.y !== kris.nowy) kris.walkbuffer = 6;
    if (kris.walkbuffer > 3) kris.imageIndex += 0.125;
    if (kris.walkbuffer <= 0) kris.imageIndex = 0;
    kris.walkbuffer -= 0.75;
  }

  /* ---------------- drawing ---------------- */
  const { tileW, tileH, cols, border } = room.tileset;

  function drawTiles() {
    // Only the cells the screen can see — the grid is 77x30 and all but a
    // pane of it is off-screen at any moment.
    const x0 = Math.floor((PANE_X - world.x) / tileW);
    const y0 = Math.floor((PANE_Y - world.y) / tileH);
    const x1 = Math.ceil((PANE_X + PANE_W - world.x) / tileW);
    const y1 = Math.ceil((PANE_Y + PANE_H - world.y) / tileH);
    for (let ty = Math.max(0, y0); ty < Math.min(room.tilesY, y1); ty++) {
      const row = room.grid[ty];
      if (!row) continue;
      for (let tx = Math.max(0, x0); tx < Math.min(room.tilesX, x1); tx++) {
        // GameMaker packs flip/rotate flags into the high bits of the id.
        const id = row[tx] & 0x7ffff;
        if (!id) continue;
        const sx = (id % cols) * (tileW + border * 2) + border;
        const sy = Math.floor(id / cols) * (tileH + border * 2) + border;
        ctx.drawImage(tileset, sx, sy, tileW, tileH,
          world.x + tx * tileW, world.y + ty * tileH, tileW, tileH);
      }
    }
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(PANE_X, PANE_Y, PANE_W, PANE_H);
    ctx.clip();

    ctx.fillStyle = room.bgColor;
    ctx.fillRect(PANE_X, PANE_Y, PANE_W, PANE_H);
    drawTiles();

    foes.draw(ctx, enemySprites);

    const frames = krisSprite[FACE_NAME[kris.facing]];
    const frame = frames[Math.floor(kris.imageIndex) % frames.length];
    // image_blend: white is the sprite untouched, red is the hit flash.
    const art = kris.blend === 'red' ? tinted(frame, '#ff0000') : frame;
    ctx.drawImage(art, Math.round(kris.x), Math.round(kris.y), KRIS_SIZE, KRIS_SIZE);

    ctx.restore();

    // The screen's edge. The game frames this area with the show's set;
    // this is a plain bezel in its place.
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 2;
    ctx.strokeRect(PANE_X - 1, PANE_Y - 1, PANE_W + 2, PANE_H + 2);

    drawHealthbar();

    // The death event draws over everything, at 640x480 — the whole window,
    // not the pane.
    if (death) drawDeath();
  }

  /* obj_board_healthbar's Draw. In a sword room obj_ch3_gameshow makes ONE
     of these, for Kris, at (270,34) in #DBFC8F — the party bars at
     (128/222/316, 32) are the non-sword layout. The fill is spr_whitepx
     stretched to (healthamt * 50) x 6 at (+14,+12), which is a rectangle
     and needs no art; only the bar's own frame is a sprite. */
  function drawHealthbar() {
    const amt = Math.max(0, Math.min(1, kris.myhealth / kris.maxhealth));
    if (healthbarFrame.length) {
      const f = healthbarFrame[kris.myhealth <= 0 ? 1 : 0] ?? healthbarFrame[0];
      if (f) ctx.drawImage(f, HEALTHBAR_X, HEALTHBAR_Y, f.width * 2, f.height * 2);
    } else {
      // No frame art yet — the outline stands in for it, and says so.
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(HEALTHBAR_X + 13.5, HEALTHBAR_Y + 11.5, 51, 7);
    }
    ctx.fillStyle = healthbarFlash > 0 ? '#ff0000' : HEALTHBAR_COLOR;
    ctx.fillRect(HEALTHBAR_X + 14, HEALTHBAR_Y + 12, Math.round(amt * 50), 6);
  }

  /* The death event's Draw: flood the window, put Kris on top as a black
     silhouette (image_blend = c_black), and spin him. */
  function drawDeath() {
    ctx.fillStyle = death.css;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (death.timer < 61) {
      const f = krisSprite[FACE_NAME[death.facing]][0];
      ctx.drawImage(tinted(f, '#000000'), Math.round(kris.x), Math.round(kris.y),
        KRIS_SIZE, KRIS_SIZE);
    }
  }

  /* ---------------- the clock ---------------- */
  let raf = 0, acc = 0, last = performance.now();
  function frame(now) {
    acc += now - last;
    last = now;
    let guard = 0;
    while (acc >= MS_PER_FRAME && guard++ < 8) {
      acc -= MS_PER_FRAME;
      if (death) {
        // `global.interact = 1` — the board stops dead and only the death
        // event runs.
        stepDeath();
        if (death.timer >= DEATH_END) restart();
        continue;
      }
      stepShift();
      stepKris();
      stepAnim();
      foes.step(kris);
      stepDamage();
      if (healthbarFlash > 0) healthbarFlash -= 1;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  // The screen you start on gets the same treatment the camera would give
  // it on arrival.
  foes.spawnVisible(spawners);

  raf = requestAnimationFrame(frame);

  // Exposed for debugging and automated checks, like the sim's window.__sim.
  window.__board = {
    get kris() { return kris; },
    get shift() { return shift; },
    get world() { return world; },
    get health() { return kris.myhealth; },
    get dying() { return death !== null; },
    solids,
    get foes() { return foes; },
    /** The controller's flag. Setting it re-arms every hitbox on the board. */
    get violence() { return violence; },
    set violence(v) { violence = !!v; foes.violence = violence; },
    restart,
    press: (k, on = true) => { if (on) held.add(k); else held.delete(k); },
    stop() { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); },
  };
  return window.__board;
}
