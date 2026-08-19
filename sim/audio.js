// THE BOARD'S SOUND. Extracted from the game per the project's asset
// posture (all extracted audio may ship). Browsers gate playback behind a
// user gesture, so the context resumes on the first keypress — the sim's
// first input is also its audio grant, same pattern as knight-sim.

const FILES = {
  snd_board_sword1: 'snd_board_sword1.wav',
  snd_board_sword2: 'snd_board_sword2.wav',
  snd_board_sword3: 'snd_board_sword3.wav',
  snd_board_damage: 'snd_board_damage.wav',
  snd_board_sword_metal: 'snd_board_sword_metal.wav',
  snd_board_playerhurt: 'snd_board_playerhurt.wav',
  snd_hurt1: 'snd_hurt1.wav',
  snd_board_ominous: 'snd_board_ominous.wav',
  snd_board_splash: 'snd_board_splash.wav',
  snd_fall: 'snd_fall.wav',
  snd_power: 'snd_power.wav',
  snd_board_kill: 'snd_board_kill.wav',
  snd_board_lift: 'snd_board_lift.wav',
  snd_board_escaped: 'snd_board_escaped.wav',
  snd_board_throw: 'snd_board_throw.wav',
  snd_bump: 'snd_bump.wav',
  snd_wallclaw: 'snd_wallclaw.wav',
  snd_link_get_key: 'snd_link_get_key.wav',
  snd_link_secret_bad: 'snd_link_secret_bad.wav',
  snd_board_mantle_move: 'snd_board_mantle_move.wav',
  snd_tv_poweron: 'snd_tv_poweron.wav',
};

export function createAudio(base) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffers = new Map();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  const musicGain = ctx.createGain();
  musicGain.connect(gain);
  let muted = localStorage.getItem('eramsim.mute') === '1';
  gain.gain.value = muted ? 0 : 1;
  let musicSrc = null;
  let currentSong = null;

  async function load(name, file) {
    try {
      const buf = await fetch(`${base}audio/${file}`).then((r) => r.arrayBuffer());
      buffers.set(name, await ctx.decodeAudioData(buf));
    } catch { /* a missing cue stays silent */ }
  }
  const ready = Promise.all([
    ...Object.entries(FILES).map(([n, f]) => load(n, f)),
    load('board_sword_music', 'board_sword_music.ogg'),
    load('board_ocean', 'board_ocean.ogg'),
  ]);

  function unlock() {
    if (ctx.state === 'suspended') ctx.resume();
  }

  function play(name, { volume = 1, pitch = 1 } = {}) {
    const buf = buffers.get(name);
    if (!buf || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g); g.connect(gain);
    src.start();
  }

  /** choose(snd_board_sword1, 2, 3) — the swing. */
  function swing() {
    play(['snd_board_sword1', 'snd_board_sword2', 'snd_board_sword3'][Math.floor(Math.random() * 3)]);
  }

  function music(name, { volume = 1, pitch = 1 } = {}) {
    if (currentSong === name) return;
    stopMusic();
    const buf = buffers.get(name);
    if (!buf) { currentSong = name; return; }   // remember intent even if not decoded yet
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = pitch;
    src.connect(musicGain);
    musicGain.gain.value = volume;
    src.start();
    musicSrc = src;
    currentSong = name;
  }

  function stopMusic() {
    if (musicSrc) { try { musicSrc.stop(); } catch { /* already stopped */ } }
    musicSrc = null;
    currentSong = null;
  }

  function fadeMusic(seconds) {
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
  }

  return {
    ready, unlock, play, swing, music, stopMusic, fadeMusic,
    get muted() { return muted; },
    set muted(v) {
      muted = !!v;
      localStorage.setItem('eramsim.mute', muted ? '1' : '0');
      gain.gain.value = muted ? 0 : 1;
    },
  };
}
