// THE SHADOW MANTLE — obj_shadow_mantle_enemy, translated from its
// 1170-line Step_2 and its satellites (bomb, cloud, fire controller,
// groundfire, dash hitbox, the obj___ summons).
//
// THE SHAPE OF THE FIGHT: hp 30, four phases breaking at 22 / 13 / 4. An
// attack window opens every 20 idle frames and picks burstwave (bomb
// volleys onto random grid cells), flamewave (a six-flame ring armed
// around him while he drifts along the path point, then launched), or
// enemywave (five summoned chasers; the wave ends after he takes five
// hits). At hp <= 4 everything is the dash — gravity-arc charges that
// trail groundfire, resetting from the top of the arena when he leaves it.
//
// THE OPENING IS THE LAUGH: after a wave he laughs (telegraphtimer 61,
// hittable), and the laugh cuts short after one hit (<= 31). Sword damage
// follows the game's diminishing schedule per attack window
// (timeshitthisphase: 2, 1.5, 1, 0.75, 0.5, then 0.2) with the recovery
// bonus (windows without damage step it back up), 0.1 while below 5 unless
// dashing (1), 0.2 during phase transitions, and a floor of hp 4 until
// phase 4. He cannot be killed early.
//
// THE WIN: hp < 1 -> the outro. He is not slain — he taunts ("There!
// That's what I wanted to see!"), floats up and away with the MANTLE, and
// leaves you the room. Approximations: the arena background's diagonal
// darkening wave is simplified to the border ring + surround retints; the
// phase-4 clone rain and the type-8 ultimate ring are reduced to their
// hazards (bombs + the triple fireball spiral); mercy scaling from
// global.shadow_mantle_losses is not tracked across sessions.

const ARENA = { x1: 160, x2: 480, y1: 96, y2: 288 };   // the fight floor

export function createMantle(host) {
  const { kris, snd, S, writer, retint, onWin } = host;

  const boss = {
    x: 304, y: 160, hp: 30, hpMax: 30,
    phase: 1, hurttimer: 0, telegraph: 0, attacktimer: 10,
    timeshit: 0, damagetaken: 0,
    burstUsed: 0, enemyUsed: 0, flameUsed: 0, dashUsed: 0, lastused: 'none',
    burstCon: 0, burstTimer: 0,
    flameCon: 0, flameTimer: 0,
    spawnCon: 0, spawnTimer: 0, hitsDuringEnemies: 0,
    dashCon: 0, dashTimer: 0, dashCount: 0, dashHitboxTimer: 0,
    transCon: 0, transTimer: 0,
    moveStyle: 'none', moveCon: 0, moveTimer: 0, targetx: 304, targety: 160,
    vx: 0, vy: 0, speed: 0, dir: 270, grav: 0, gravDir: 270, fric: 0,
    siner: 0, sprite: 'idle', imageIndex: 0, imageSpeed: 1 / 3,
    blend: null, onFire: false, alive: true, won: false,
  };

  const bombs = [];        // {x,y,sx,sy,tx,ty,t,con}
  const clouds = [];       // {x,y,t}
  const bullets = [];      // cloud bullets {x,y,dir,spd}
  const fires = [];        // ring flames {place,len,lenSpeed,con,alpha,launched}
  let fireCtl = null;      // {type,count,timer,armed}
  const groundfires = [];  // {x,y,t}
  const summons = [];      // obj___ chasers {x,y,t,hurt,alive}
  const particles = [];
  const clones = [];       // phase 4's diving copies
  let outro = null;

  const PATHX = 304, PATHY = 128;      // obj_shadow_mantle_path's spot

  function cell(nx, ny) { return { x: 160 + nx * 32, y: 96 + ny * 32 }; }
  const irandom = (n) => Math.floor(Math.random() * (n + 1));
  const choose = (...a) => a[Math.floor(Math.random() * a.length)];

  /* ---------------- the sword ---------------- */
  function swordHit(box) {
    if (!boss.alive || boss.hurttimer > 0 || outro) return false;
    if (!(box.x < boss.x + 32 && box.x + box.w > boss.x
      && box.y < boss.y + 32 && box.y + box.h > boss.y)) return false;
    snd('snd_board_bosshit');
    host.glitch?.(6, 8);
    boss.hurttimer = 8;
    if (boss.transCon === 1) boss.hp -= 0.2;
    else if (boss.hp < 5) boss.hp -= boss.dashCon !== 0 ? 1 : 0.1;
    else {
      const t = boss.timeshit;
      boss.hp -= t === -2 ? 2 : t === -1 ? 1.5 : t === 0 ? 1 : t === 1 ? 0.75 : t === 2 ? 0.5 : 0.2;
      boss.damagetaken += 1;
      boss.timeshit += 1;
      if (boss.spawnCon === 1) boss.hitsDuringEnemies += 1;
    }
    if (boss.phase !== 4 && boss.hp < 4) boss.hp = 4;
    if (boss.hp < 1) beginWin();
    return true;
  }

  function beginWin() {
    boss.alive = false;
    boss.won = true;
    bombs.length = 0; clouds.length = 0; bullets.length = 0;
    fires.length = 0; groundfires.length = 0; summons.length = 0;
    clones.length = 0;
    fireCtl = null;
    outro = { t: 0, phase: 0, y: boss.y };
    host.audio?.stopMusic();
  }

  /* ---------------- the step ---------------- */
  function step() {
    if (outro) { stepOutro(); return; }
    boss.siner += 1;
    boss.y += Math.sin(boss.siner / 3);
    if (boss.hurttimer > 0) boss.hurttimer -= 1;
    if (boss.telegraph > 0) boss.telegraph -= 1;

    const idle = fires.length === 0 && !fireCtl && boss.burstCon === 0
      && boss.spawnCon === 0 && boss.dashCon === 0 && boss.flameCon === 0
      && boss.telegraph === 0 && boss.transCon === 0 && summons.length === 0;
    if (idle) { boss.vx = 0; boss.vy = 0; boss.speed = 0; boss.attacktimer += 1; }

    // Phase breaks reset everything.
    if ((boss.hp <= 22 && boss.phase === 1) || (boss.hp <= 13 && boss.phase === 2)
      || (boss.hp <= 4 && boss.phase === 3)) {
      boss.burstCon = 0; boss.burstTimer = 0; boss.spawnCon = 0; boss.spawnTimer = 0;
      boss.dashCon = 0; boss.dashTimer = 0; boss.dashUsed = 0; boss.dashCount = 0;
      boss.flameCon = 0; boss.flameTimer = 0; boss.telegraph = 0; boss.transCon = 0;
      boss.attacktimer = 20;
      boss.sprite = 'idle'; boss.imageSpeed = 1 / 3;
      boss.speed = 0; boss.grav = 0; boss.fric = 0; boss.vx = 0; boss.vy = 0;
      fires.length = 0; fireCtl = null;
    }

    if (boss.attacktimer >= 20) pickAttack();

    stepBurst();
    stepSpawn();
    stepFlame();
    stepTransition();
    stepDash();
    stepMove();
    stepProjectiles();
    stepSummons();
  }

  function pickAttack() {
    if (boss.timeshit > 0) boss.timeshit = 0;
    else if (boss.timeshit === 0) boss.timeshit = -1;
    else if (boss.timeshit === -1) boss.timeshit = -2;
    fires.length = 0;
    boss.attacktimer = 0;
    boss.damagetaken = 0;
    boss.moveCon = 0; boss.moveTimer = 0; boss.dashCount = 0;
    boss.telegraph = 0; boss.hitsDuringEnemies = 0;
    boss.vx = 0; boss.vy = 0; boss.speed = 0;
    let chosen = false;
    if (boss.hp > 22) {
      if (boss.burstUsed === 0 && boss.flameUsed === 0) {
        if (choose(1, 2) === 1) boss.burstUsed = 1; else boss.flameUsed = 1;
      }
      if (boss.burstUsed === 0) {
        boss.burstUsed = 1; boss.flameUsed = 0; boss.burstCon = 1; boss.moveStyle = 'cardinal';
      } else if (boss.flameUsed === 0) {
        boss.flameUsed = 1; boss.burstUsed = 0; boss.flameCon = 1;
      }
    } else if (boss.hp > 13) {
      if (boss.phase === 1) {
        boss.phase = 2; boss.transCon = 1; boss.transTimer = 0;
        boss.moveStyle = 'to point and stop'; boss.enemyUsed = 1;
      } else {
        if (boss.dashUsed === 0 && boss.enemyUsed === 0) {
          if (choose(1, 2) === 1) boss.enemyUsed = 1; else boss.dashUsed = 1;
        }
        if (boss.enemyUsed === 0) { boss.enemyUsed = 1; boss.dashUsed = 0; boss.spawnCon = 1; }
        else { boss.dashUsed = 1; boss.enemyUsed = 0; boss.dashCon = 2; boss.moveStyle = 'to point and stop'; }
      }
    } else if (boss.hp > 4) {
      if (boss.phase === 2) {
        boss.phase = 3; boss.transCon = 1; boss.transTimer = 0;
        boss.moveStyle = 'to point and stop';
      } else {
        let attack = 2;
        if (boss.burstUsed && boss.enemyUsed && boss.flameUsed) {
          if (boss.lastused !== 'burstwave') boss.burstUsed = 0;
          if (boss.lastused !== 'enemywave') boss.enemyUsed = 0;
          if (boss.lastused !== 'flamewave') boss.flameUsed = 0;
        }
        for (let r = 0; r < 4 && !chosen; r++) {
          if (attack === 0 && boss.burstUsed === 0) {
            boss.burstUsed = 1; chosen = true; boss.burstCon = 1;
            boss.moveStyle = 'cardinal'; boss.lastused = 'burstwave';
          } else if (attack === 1 && boss.enemyUsed === 0) {
            boss.enemyUsed = 1; chosen = true; boss.spawnCon = 1; boss.lastused = 'enemywave';
          } else if (attack === 2 && boss.flameUsed === 0) {
            boss.flameUsed = 1; chosen = true; boss.flameCon = 1; boss.lastused = 'flamewave';
          } else { attack = (attack + 1) % 3; }
        }
      }
    } else {
      if (boss.phase === 3) {
        boss.phase = 4; boss.transCon = 1; boss.transTimer = 0;
        boss.moveStyle = 'to point and stop';
      } else {
        boss.dashCon = 2; boss.moveStyle = 'to point and stop';
      }
    }
  }

  /* ---------------- burstwave: the bomb volleys ---------------- */
  function dropBomb(tx, ty) {
    bombs.push({ x: boss.x + 16, y: boss.y + 29, sx: boss.x + 16, sy: boss.y + 29,
      tx, ty, t: 0, con: 1, fuse: 0 });
    snd('snd_board_throw', { volume: 0.7, pitch: 0.8 });
  }

  function stepBurst() {
    if (boss.burstCon !== 1) return;
    boss.burstTimer += 1;
    const bt = boss.burstTimer;
    const release = () => { boss.sprite = 'release'; boss.imageSpeed = 0.5; boss.imageIndex = 0; };
    if (boss.hp > 13) {
      if (bt === 1 || bt === 121) release();
      if (bt === 17 || bt === 27 || bt === 137 || bt === 147) release();
      if (bt === 11 || bt === 131) dropBomb(160 + irandom(9) * 32 + 16, 96 + irandom(1) * 32 + 29);
      if (bt === 21 || bt === 141) dropBomb(160 + irandom(9) * 32 + 16, 160 + irandom(1) * 32 + 29);
      if (bt === 31 || bt === 151) dropBomb(160 + irandom(9) * 32 + 16, 224 + irandom(1) * 32 + 29);
    } else {
      if (bt === 1 || bt === 81) release();
      if ([17, 27, 37, 97, 107, 117].includes(bt)) release();
      if (bt === 11 || bt === 91) dropBomb(160 + irandom(4) * 32 + 16, 96 + irandom(2) * 32 + 29);
      if (bt === 21 || bt === 101) dropBomb(320 + irandom(4) * 32 + 16, 96 + irandom(2) * 32 + 29);
      if (bt === 31 || bt === 111) dropBomb(160 + irandom(4) * 32 + 16, 192 + irandom(2) * 32 + 29);
      if (bt === 41 || bt === 121) dropBomb(320 + irandom(4) * 32 + 16, 192 + irandom(2) * 32 + 29);
    }
    const end = boss.hp > 13 ? 182 : 152;
    if (boss.burstTimer >= end) {
      boss.moveStyle = 'none'; boss.vx = 0; boss.vy = 0;
      if (boss.telegraph === 0 && boss.damagetaken === 0) {
        boss.sprite = 'laugh'; boss.imageSpeed = 0.1;
        snd('snd_board_mantle_laugh_mid', { pitch: 1.3 });
        boss.telegraph = 61;
      }
      if (boss.telegraph <= 1 || (boss.damagetaken >= 1 && boss.telegraph > 0 && boss.telegraph <= 31)) {
        boss.burstCon = 0; boss.burstTimer = 0;
        boss.sprite = 'idle'; boss.imageSpeed = 1 / 3;
      }
    }
  }

  /* ---------------- enemywave: the summons ---------------- */
  function stepSpawn() {
    if (boss.spawnCon !== 1) return;
    boss.spawnTimer += 1;
    const st = boss.spawnTimer;
    if (st === 1) { boss.sprite = choose('side_r', 'side_l'); boss.imageSpeed = 1 / 3; }
    if ([15, 30, 45, 60, 75].includes(st)) {
      snd('snd_board_summon');
      const spot = { x: 160 + irandom(9) * 32, y: 96 + irandom(5) * 32 };
      summons.push({ x: spot.x, y: spot.y, t: 0, hurt: 0, alive: true,
        spd: 5 + irandom(2), moveT: 0 });
    }
    if (st === 75) boss.hitsDuringEnemies = 0;
    if (st === 77) {
      boss.hitsDuringEnemies += 1;
      boss.sprite = 'laugh'; boss.imageSpeed = 0.1;
      snd('snd_board_mantle_laugh_mid', { pitch: 1.3 });
    }
    if (st === 106) { boss.sprite = 'idle'; boss.imageSpeed = 1 / 3; }
    if (st === 126) boss.spawnTimer = 76;
    if (st >= 77 && boss.hitsDuringEnemies > 4) {
      boss.sprite = 'idle'; boss.imageSpeed = 1 / 3;
      boss.spawnCon = 0; boss.spawnTimer = 0;
      boss.dashCount = 0; boss.dashUsed = 1; boss.enemyUsed = 0;
      boss.damagetaken = 0; boss.timeshit = 0;
      boss.dashCon = 2; boss.dashTimer = -1; boss.telegraph = 0;
      boss.moveStyle = 'to point and stop';
    }
  }

  /* ---------------- flamewave: the launched rings ---------------- */
  function stepFlame() {
    if (boss.flameCon !== 1) return;
    boss.flameTimer += 1;
    const ft = boss.flameTimer;
    if (ft === 1) boss.moveStyle = 'path';
    if (ft === 10 || ft === 60 || ft === 110 || ft === 160) {
      const type = ft === 10 ? 4.5 : boss.hp > 13 ? 4 : 5;
      fireCtl = { type, count: 0, timer: 0 };
    }
    if ([30, 60, 90, 120].includes(ft) && boss.hp <= 13) {
      dropBomb(160 + irandom(9) * 32 + 16, 96 + irandom(5) * 32 + 29);
    }
    if (ft === 210) { boss.flameCon = 0; boss.flameTimer = 0; }
  }

  /* ---------------- phase transitions ---------------- */
  function stepTransition() {
    if (boss.transCon === 1) {
      boss.transTimer += 1;
      if (boss.transTimer === 25) {
        snd('snd_board_mantle_move', { pitch: 0.7 });
        // The arena darkens a step: the bg's diagonal wave, reduced to the
        // surround retint (colours from obj_shadow_mantle_bg, BGR decoded).
        const cols = { 2: '#282061', 3: '#33235e', 4: '#0b1509' };
        retint(cols[boss.phase] ?? '#000000', 5);
      }
      if (boss.transTimer === 46 && boss.phase === 4) {
        boss.sprite = 'dash'; boss.onFire = true;
        boss.transCon = 2; boss.transTimer = 0;
        return;
      }
      if (boss.transTimer >= 47 && !fireCtl) {
        boss.transCon = 0; boss.transTimer = 0; boss.attacktimer = 20;
      }
    } else if (boss.transCon === 2) {
      // Phase 4's ignition: torch bursts, particles, the fireball spiral.
      boss.transTimer += 1;
      const t = boss.transTimer;
      if (t === 1) { snd('snd_board_torch_high'); boss.onFire = true; }
      if (t % 5 === 0 && t < 52) snd('snd_board_torch_high');
      if (t % 2 === 0 && t < 45) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: boss.x + 16 + Math.cos(a) * 42, y: boss.y + 16 + Math.sin(a) * 42, t: 0 });
      }
      if (t === 42) fireCtl = { type: 8, count: 0, timer: 0, angle: 0, spinA: 0, fireballs: 0 };
      if (t >= 83 && !fireCtl) {
        boss.transCon = 0; boss.transTimer = 0; boss.attacktimer = -10; boss.onFire = false;
        boss.sprite = 'idle';
      }
    }
  }

  /* ---------------- the dash ---------------- */
  function stepDash() {
    if (boss.dashCon === 1) {
      boss.dashTimer += 1;
      if (boss.dashTimer === 1) {
        if ((boss.dashCount > 2 || (boss.damagetaken > 2 && boss.dashCount > 1)) && boss.hp > 4) {
          boss.vy = 16; boss.x = 224 + irandom(5) * 32;
          boss.dashCon = 1.5; boss.dashTimer = 0;
        } else {
          const aim = choose(1, 2) === 1 ? kris.x + 16 : kris.x + 16 + choose(66, -66);
          boss.dir = Math.atan2(-(kris.y + 16 - (boss.y + 16)), aim - (boss.x + 16)) * 180 / Math.PI;
          boss.grav = 0.24; boss.gravDir = boss.dir;
          snd('snd_board_mantle_dash_slow', { pitch: 0.95 + Math.random() * 0.1 });
          boss.speed = 2; boss.dashTimer = 28; boss.dashCon = 2; boss.dashCount += 1;
        }
      }
    }
    if (boss.dashCon === 1.5) {
      if (boss.y > 152 || boss.telegraph > 0) {
        boss.grav = 0; boss.speed = 0; boss.vy = 0; boss.onFire = false;
        if (boss.telegraph === 0) {
          boss.sprite = 'laugh'; boss.imageSpeed = 0.1;
          snd('snd_board_mantle_laugh_mid', { pitch: 1.3 });
          boss.telegraph = 46;
        }
        if (boss.telegraph === 1) {
          boss.sprite = 'idle'; boss.imageSpeed = 1 / 3;
          boss.attacktimer = 19; boss.dashCon = 0; boss.telegraph = 0;
        }
      }
    }
    if (boss.dashCon === 0 && boss.transCon === 0) boss.onFire = false;
    if (boss.dashCon === 2) {
      boss.dashTimer += 1;
      if (boss.dashTimer === 10 && boss.fric === 0) {
        boss.sprite = 'dash'; boss.imageSpeed = 0.5;
        snd('snd_board_mantle_dash_prepare', { volume: 1.2 });
        boss.onFire = true;
        const aim = choose(1, 2) === 1 ? kris.x + 16 : kris.x + 16 + choose(66, -66);
        let d = Math.atan2(-(kris.y + 16 - (boss.y + 16)), aim - (boss.x + 16)) * 180 / Math.PI;
        if (d < 0) d += 360;
        if (d < 200 || d > 330) d = 200 + irandom(130);
        boss.dir = d; boss.gravDir = d;
        const dist = Math.hypot(kris.x - boss.x, kris.y - boss.y);
        if (dist >= 70) { boss.fric = 0.4; boss.speed = -6; }
        else { boss.fric = 0.14; boss.speed = -4; boss.dashTimer = 0; }
      }
      if (boss.dashTimer === 28) {
        snd('snd_board_mantle_dash_slow', { pitch: 0.95 + Math.random() * 0.1 });
        boss.fric = 0; boss.grav = 0.5; boss.speed = 10;
      }
      if (boss.dashTimer >= 30 && boss.dashTimer % 2 === 0) {
        boss.grav += 0.03;
        groundfires.push({ x: boss.x + 16, y: boss.y + 16, t: 0 });
      }
      // Phase 4's clone rain: copies of him dive from the top at
      // dashtimer 44 and 58, trailing their own groundfire.
      if (boss.dashCount > 0 && boss.hp <= 4) {
        if (boss.dashTimer === 44 || boss.dashTimer === 58) {
          const cx = 160 + irandom(9) * 32;
          const aim = 170 + irandom(295);
          let d = Math.atan2(-(270 - 36), aim - cx) * 180 / Math.PI;
          if (d > 0) d -= 360;
          clones.push({ x: cx, y: 20, dir: d, spd: 2, grav: 0.24, t: 0 });
          snd('snd_board_mantle_dash_slow', { pitch: 0.95 + Math.random() * 0.1 });
        }
      }
      if (boss.y > 384 || boss.y < -36 || boss.x < 160 || boss.x > 512) {
        boss.dashTimer = 0; boss.dashCon = 1;
        boss.speed = 0; boss.grav = 0; boss.dir = 270; boss.gravDir = 270;
        boss.x = 160 + irandom(9) * 32; boss.y = 54;
      }
      if (boss.onFire) {
        boss.dashHitboxTimer += 1;
        // the dash hitbox rides just ahead of him — folded into touching()
      } else boss.dashHitboxTimer = 0;
    }
    // physics: speed/gravity along direction (GM's built-in motion)
    if (boss.speed !== 0 || boss.grav !== 0) {
      const rad = boss.dir * Math.PI / 180;
      const grad = boss.gravDir * Math.PI / 180;
      boss.vx = Math.cos(rad) * boss.speed;
      boss.vy = -Math.sin(rad) * boss.speed;
      boss.x += boss.vx; boss.y += boss.vy;
      // gravity accelerates speed along gravDir
      const gx = Math.cos(grad) * boss.grav, gy = -Math.sin(grad) * boss.grav;
      const nvx = boss.vx + gx, nvy = boss.vy + gy;
      boss.speed = Math.hypot(nvx, nvy) * Math.sign(boss.speed || 1);
      boss.dir = Math.atan2(-nvy, nvx) * 180 / Math.PI;
      if (boss.fric > 0) {
        boss.speed = boss.speed > 0 ? Math.max(0, boss.speed - boss.fric)
          : Math.min(0, boss.speed + boss.fric);
      }
    } else if (boss.vx || boss.vy) {
      boss.x += boss.vx; boss.y += boss.vy;
    }
  }

  /* ---------------- movement styles ---------------- */
  function stepMove() {
    if (boss.moveStyle === 'to point and stop') {
      if (boss.moveTimer > 6) boss.moveTimer = 0;
      if (boss.moveCon === 0) {
        boss.vx = 0; boss.vy = 0; boss.speed = 0;
        if (boss.transCon === 1) { boss.targetx = 304; boss.targety = 174; }
        else if (boss.spawnCon === 1) { /* stays */ }
        else {
          boss.targetx = 160 + irandom(9) * 32;
          boss.targety = 96 + irandom(5) * 32;
          if (boss.dashCon === 2) {
            boss.targetx = Math.min(446, Math.max(160, kris.x - 40 + irandom(80)));
            boss.targety = 96;
          }
        }
        boss.moveCon = 1; boss.moveTimer = 0;
      }
      if (boss.moveCon === 1) {
        boss.blend = boss.blend ? null : '#a020f0';   // the purple blink
        boss.moveTimer += 1;
        boss.x += (boss.targetx - boss.x) * (boss.moveTimer / 6);
        boss.y += (boss.targety - boss.y) * (boss.moveTimer / 6);
        if (boss.moveTimer === 6) {
          boss.blend = null; boss.moveCon = 0; boss.moveTimer = 0; boss.moveStyle = 'none';
        }
      }
    } else if (boss.moveStyle === 'cardinal') {
      if (boss.moveCon === 0) {
        const spd = boss.hp <= 13 ? 7 : 5;
        const rand = choose(0, 1, 2, 3);
        boss.vx = rand === 0 ? spd : rand === 2 ? -spd : 0;
        boss.vy = rand === 1 ? -spd : rand === 3 ? spd : 0;
        if (boss.y + 16 < 150) { boss.vy = spd; boss.vx = 0; }
        if (boss.y + 16 > 228) { boss.vy = -spd; boss.vx = 0; }
        if (boss.x + 16 < 215) { boss.vx = spd; boss.vy = 0; }
        if (boss.x + 16 > 420) { boss.vx = -spd; boss.vy = 0; }
        boss.moveCon = 1;
      }
      if (boss.moveCon === 1) {
        boss.moveTimer += 1;
        boss.x += boss.vx; boss.y += boss.vy;
        if (boss.moveTimer === 20) { boss.moveCon = 0; boss.moveTimer = 0; }
      }
      if (boss.x > 608) { boss.vx = -5; boss.vy = 0; boss.moveCon = 0; boss.moveTimer = 0; }
      if (boss.x < 160) { boss.vx = 5; boss.vy = 0; boss.moveCon = 0; boss.moveTimer = 0; }
      if (boss.y > 352) { boss.vx = 0; boss.vy = -5; boss.moveCon = 0; boss.moveTimer = 0; }
      if (boss.y < 64) { boss.vx = 0; boss.vy = 5; boss.moveCon = 0; boss.moveTimer = 0; }
    } else if (boss.moveStyle === 'path') {
      boss.vx = 0; boss.vy = 0; boss.speed = 0;
      boss.x += (PATHX - boss.x) * 0.15;
      boss.y += (PATHY - boss.y) * 0.15;
    }
    if (boss.sprite === 'laugh') boss.imageSpeed = 0.6 - 0.5 * (boss.telegraph / 61);
  }

  /* ---------------- projectiles ---------------- */
  function stepProjectiles() {
    // the ring controller
    if (fireCtl) {
      const fc = fireCtl;
      fc.timer += 1;
      if (fc.type === 8) {
        // phase 4's ultimate, reduced: the triple fireball spiral + bombs.
        fc.spinA = (fc.spinA ?? 0) + 0.5;
        fc.angle = (fc.angle ?? 0) + Math.max(1.5, 1.6 + Math.sin(fc.spinA / 6) * 1.2);
        // obj_shadow_mantle_bomb_spawn at spin 40 and 100: a bomb onto a
        // random free arena cell; at 70 one at the right edge.
        if (fc.spinA === 40 || fc.spinA === 100) {
          dropBomb(160 + irandom(9) * 32 + 16, 96 + irandom(5) * 32 + 29);
        }
        if (fc.spinA === 70) dropBomb(464, 160 + irandom(2) * 32 + 29);
        if (fc.timer > 30 && fc.fireballs < 50) {
          if (fc.timer % 4 === 0) {
            snd('snd_board_torch');
            for (let i = 0; i < 3; i++) {
              const dir = i * 120 + fc.angle;
              bullets.push({ x: boss.x + 16 + Math.cos(dir * Math.PI / 180) * 24,
                y: boss.y + 16 - Math.sin(dir * Math.PI / 180) * 24,
                dir, spd: 0, grav: 0.7, kind: 'fireball', t: -10 });
              fc.fireballs += 1;
            }
          }
        }
        if (fc.fireballs >= 50) fireCtl = null;
      } else {
        // types 4 / 4.5 / 5: arm six flames around him, blink, launch.
        const interval = fc.type === 5 ? 2 : 1;
        const launchAt = fc.type === 4 ? 16 : fc.type === 4.5 ? 21 : 10;
        for (const f of fires) f.alpha = f.alpha === 1 ? 0 : 1;
        if (fc.timer >= interval && fc.count < 6 && !fc.armed) {
          fires.push({ place: 22 + fc.count * 60, len: 50, lenSpeed: 0, alpha: 1, launched: false });
          fc.timer = 0; fc.count += 1;
          if (fc.count === 6) fc.armed = true;
        }
        if (fc.armed && fc.timer >= launchAt) {
          for (const f of fires) { f.launched = true; f.lenSpeed = fc.type === 4.5 ? 5 : 10; }
          fireCtl = null;
        }
      }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i];
      if (!f.launched) { f.x = boss.x + 16 + Math.cos(f.place * Math.PI / 180) * f.len; f.y = boss.y + 16 - Math.sin(f.place * Math.PI / 180) * f.len; continue; }
      f.len += f.lenSpeed;
      f.x = boss.x + 16 + Math.cos(f.place * Math.PI / 180) * f.len;
      f.y = boss.y + 16 - Math.sin(f.place * Math.PI / 180) * f.len;
      if (f.len > 700) fires.splice(i, 1);
    }
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      if (b.con === 1) {
        b.t += 2;
        b.x = b.sx + (b.tx - b.sx) * (b.t / 60);
        b.y = b.sy + (b.ty - b.sy) * (b.t / 60);
        b.arc = -15 + Math.sin(b.t / 19) * -100;
        if (b.t >= 60) { b.con = 2; b.fuse = 0; b.arc = 0; snd('snd_bump'); }
      } else {
        b.fuse += 1;
        if (b.fuse === 20) {
          clouds.push({ x: b.x - 16 + 4, y: b.y - 30, t: 0 });
          snd('snd_board_bomb');
          bombs.splice(i, 1);
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t += 1;
      if (c.t === 12) {
        // four bullets, cardinal, speed 10
        for (const dir of [0, 90, 180, 270]) {
          bullets.push({ x: c.x + 16, y: c.y + 16, dir, spd: 10, kind: 'cloud', t: 0 });
        }
      }
      if (c.t >= 24) clouds.splice(i, 1);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.t += 1;
      if (b.kind === 'fireball') {
        b.spd += b.grav;
        if (b.t < 0) continue;
      }
      b.x += Math.cos(b.dir * Math.PI / 180) * b.spd;
      b.y -= Math.sin(b.dir * Math.PI / 180) * b.spd;
      if (b.x < 60 || b.x > 580 || b.y < 0 || b.y > 420 || b.t > 180) bullets.splice(i, 1);
    }
    for (let i = groundfires.length - 1; i >= 0; i--) {
      const gf = groundfires[i];
      gf.t += 1;
      if (gf.t >= 7) groundfires.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].t += 1;
      if (particles[i].t > 20) particles.splice(i, 1);
    }
    for (let i = clones.length - 1; i >= 0; i--) {
      const c = clones[i];
      c.t += 1;
      const rad = c.dir * Math.PI / 180;
      c.x += Math.cos(rad) * c.spd;
      c.y -= Math.sin(rad) * c.spd;
      c.spd += c.grav;
      if (c.t >= 30 && c.t % 2 === 0) {
        c.grav += 0.03;
        groundfires.push({ x: c.x + 16, y: c.y + 16, t: 0 });
      }
      if (c.y > 400 || c.y < -110 || c.x < 150 || c.x > 522) clones.splice(i, 1);
    }
  }

  /* ---------------- the summons (obj___) ---------------- */
  function stepSummons() {
    for (let i = summons.length - 1; i >= 0; i--) {
      const s = summons[i];
      s.t += 1;
      if (s.hurt > 0) {
        s.hurt -= 1;
        if (s.hurt === 0 && s.dead) { summons.splice(i, 1); host.splash?.(s.x + 16, s.y + 16); continue; }
        continue;
      }
      if (s.t < 20) continue;                     // materializing
      // chase Kris at spd, straight-line (the game paths on the grid; the
      // arena is open so the line is the path)
      const dx = kris.x - s.x, dy = kris.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = s.spd * 0.5;                    // half-rate cadence baked in
      s.x += (dx / d) * spd;
      s.y += (dy / d) * spd;
      if (s.t >= 300) { summons.splice(i, 1); continue; }
    }
  }

  function summonSwordHit(box) {
    for (const s of summons) {
      if (s.hurt > 0 || s.dead) continue;
      if (box.x < s.x + 32 && box.x + box.w > s.x && box.y < s.y + 32 && box.y + box.h > s.y) {
        s.hurt = 10; s.dead = true;
        snd('snd_board_damage');
        return true;
      }
    }
    return false;
  }

  /* ---------------- hazards vs Kris ---------------- */
  function touching(k) {
    if (outro) return null;
    // the boss on fire (dashing/ignited) hits for 2 via the dash hitbox
    if (boss.onFire && boss.dashHitboxTimer > 20) {
      if (k.x < boss.x + 32 && k.x + 32 > boss.x && k.y < boss.y + 32 && k.y + 32 > boss.y) {
        return { damage: 2, px: boss.x, py: boss.y };
      }
    }
    for (const gf of groundfires) {
      if (gf.t <= 5 && k.x < gf.x + 16 && k.x + 32 > gf.x - 16 && k.y < gf.y + 16 && k.y + 32 > gf.y - 16) {
        return { damage: 2, px: gf.x, py: gf.y };
      }
    }
    for (const b of bullets) {
      if (b.t < 5) continue;
      if (k.x < b.x + 12 && k.x + 32 > b.x - 12 && k.y < b.y + 12 && k.y + 32 > b.y - 12) {
        return { damage: b.kind === 'fireball' ? 1 : 2, px: b.x, py: b.y };
      }
    }
    for (const f of fires) {
      if (!f.launched && fireCtl) continue;        // arming flames are visual
      if (k.x < f.x + 14 && k.x + 32 > f.x - 14 && k.y < f.y + 14 && k.y + 32 > f.y - 14) {
        return { damage: 1, px: f.x, py: f.y };
      }
    }
    for (const c of clones) {
      if (k.x < c.x + 32 && k.x + 32 > c.x && k.y < c.y + 32 && k.y + 32 > c.y) {
        return { damage: 2, px: c.x, py: c.y };
      }
    }
    for (const s of summons) {
      if (s.t < 20 || s.dead) continue;
      const hx = s.x + 6, hy = s.y + 6;
      if (k.x < hx + 20 && k.x + 32 > hx && k.y < hy + 20 && k.y + 32 > hy) {
        return { damage: 2, px: s.x, py: s.y };
      }
    }
    return null;
  }

  /* ---------------- the outro ---------------- */
  function stepOutro() {
    outro.t += 1;
    if (outro.t === 60) {
      writer.open([
        "There^1! That's what I wanted to see!/",
        'Flickering red^1, like pretty little flames.../',
        "Your eyes can't hide it^1, Kris. Without play.../",
        'The knife grows dull./',
        'Haha..^1. well^1, enough of that^1! We both have work to do!/',
        'So if you want this MANTLE^1, hurry up and take it.../',
        'If you can reach it!/%',
      ], {
        onClose: () => { outro.fly = true; snd('snd_board_escaped'); },
      });
    }
    if (outro.fly) {
      boss.y -= 6;
      if (outro.t % 4 === 0) particles.push({ x: boss.x + 8 + irandom(16), y: boss.y + 24, t: 0 });
      if (boss.y < -80 && !outro.done) {
        outro.done = true;
        onWin?.();
      }
    }
  }

  /* ---------------- drawing ---------------- */
  function draw(g) {
    // the arena: dark floor ringed by the border (the bg object's grid,
    // reduced to its silhouette)
    g.fillStyle = '#0a0a12';
    g.fillRect(128, 64, 384, 256);
    g.fillStyle = '#1c1433';
    g.fillRect(160, 96, 320, 192);

    const draw2 = (name, idx, x, y, alpha = 1, tint = null) => {
      const meta = S.meta(name);
      if (!meta) return;
      let img = S.frame(name, Math.floor(idx) % meta.frames);
      if (!img) return;
      if (tint) img = S.tinted(img, tint);
      g.save();
      g.globalAlpha = alpha;
      g.drawImage(img, Math.round(x) - meta.ox * 2, Math.round(y) - meta.oy * 2, img.width * 2, img.height * 2);
      g.restore();
    };

    for (const gf of groundfires) draw2('spr_shadow_mantle_fire2', gf.t, gf.x - 16, gf.y - 16);
    for (const c of clouds) draw2('spr_shadow_mantle_cloud', c.t * 0.25, c.x, c.y);
    for (const b of bombs) draw2('spr_shadow_mantle_bomb', b.con === 2 && b.fuse > 10 ? 1 : 0, b.x - 16, b.y - 16 + (b.arc ?? 0));
    for (const b of bullets) draw2(b.kind === 'fireball' ? 'spr_shadow_mantle_fire' : 'spr_shadow_mantle_cloud_projectile', b.t * 0.25, b.x - 12, b.y - 12);
    for (const f of fires) draw2('spr_shadow_mantle_fire', f.len * 0.1, f.x - 14, f.y - 14, f.alpha ?? 1);
    for (const s of summons) {
      draw2('spr_shadow_mantle_idle', s.t / 3, s.x, s.y, s.t < 20 ? s.t / 20 : 1,
        s.hurt > 0 ? '#ffffff' : '#404040');
    }
    for (const c of clones) {
      draw2('spr_board_imonfire', Math.floor(c.t / 4) % 2, c.x - 16, c.y - 32, 1, '#ff0000');
      draw2('spr_shadow_mantle_dash', c.t / 2, c.x, c.y);
    }
    for (const p of particles) draw2('spr_shadow_mantle_fire', p.t, p.x - 8, p.y - 8, 1 - p.t / 20);

    if (boss.alive || outro) {
      boss.imageIndex += boss.imageSpeed;
      const name = {
        idle: 'spr_shadow_mantle_idle', laugh: 'spr_shadow_mantle_laugh',
        dash: 'spr_shadow_mantle_dash', release: 'spr_shadow_mantle_release',
        side_r: 'spr_shadow_mantle_side_r', side_l: 'spr_shadow_mantle_side_l',
        onfire: 'spr_shadow_mantle_onfire',
      }[boss.sprite] ?? 'spr_shadow_mantle_idle';
      if (boss.onFire) draw2('spr_board_imonfire', Math.floor(boss.siner / 4) % 2, boss.x - 16, boss.y - 32, 1, '#ff0000');
      const flash = boss.hurttimer > 0 && boss.hurttimer % 2 === 0;
      draw2(name, boss.imageIndex, boss.x, boss.y, 1, flash ? '#ffffff' : boss.blend);
      // his health, drawn the HUD's way under the strip
      const w = Math.max(0, (boss.hp / boss.hpMax)) * 120;
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(260, 70, 120, 4);
      g.fillStyle = '#c22';
      g.fillRect(260, 70, w, 4);
    }
  }

  return { boss, step, draw, touching, swordHit, summonSwordHit, get outroActive() { return !!outro; } };
}
