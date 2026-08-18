# CLAUDE.md — Eram (sword route) Simulator

**FIRST: read docs/PLAYBOOK.md, all of it.** It is the distilled method and
trap catalog from knight-sim (the reference implementation, one directory
over at ~/knight-sim). This project follows it exactly.

**THEN: docs/RECON.md** — recon is DONE and the level table is in it.

**WHAT THIS IS.** Not a bullet-hell fight: the sword route is Chapter 3's
board game (the one ranked Z C B A S T) with one level handed to you after
each of the three boards. Those three levels are the scope. The Shadow
Mantle encounter and the boards proper are out of it.

**WHERE IT IS.** `sim/board.js` is the engine — movement, the fixed-camera
screen shift, collision — ported from the verified thedevice build and
carrying its comments. `tools/build-levels.py` regenerates
`assets/levels/*.json` from the research dumps; the level files are
generated, never hand-edited. `tools/devserver.py` serves on port 8411, its
own port on purpose.

`sim/enemies.js` is the roster and the damage-side of contact. **Before
changing anything about damage, read RECON.md's "Contact damage" section:
enemies only hurt you when `obj_board_controller.violence` is on, the game
turns that on with the sword, and it is NEVER on in level 1 — so the host
page carries a debug VIOLENCE switch purely to make the code reachable
before the sword exists. Do not "fix" harmless level-1 enemies.**

Next work is listed at the end of RECON.md, in order. The sword is next,
and it is what makes the damage reachable for real.

Session basics (same machine as knight-sim):

    export PATH="$HOME/tools/node/bin:$PATH"   # Node is NOT on PATH

- Chapter data: TBD in recon — locate the boss by grepping the chapter dumps (chapters 3-5 present in the bundle); do not trust secondhand chapter claims.
- UTMT CLI at ~/tools/utmt-cli — SOLO RUNS ONLY (concurrent runs wedge).
- Research repo: ~/eram-research/ — PRIVATE AND LOCAL. The dump,
  oracle patches, traces. Never published, never committed here.
- knight-research/tools/patches/ holds every working script template:
  extraction (SPR_LIST file → padded PNGs — ALWAYS verify PNG dims ==
  manifest dims after), id resolvers, room/object dumps, the universal
  oracle harness, the capture bundle.
- Dev server: tools/devserver.py pattern on its own port — NEVER the app's
  preview server (stale module graphs; PLAYBOOK §7).

The five rules that cost the most, restated because they will be tested:

1. Read the dump before launching the game. A grep is seconds; a run is
   minutes.
2. Never pin a value the game sequences itself with. Grep for readers
   first.
3. The SELECTOR decides what is real, not the dispatch table — and trace
   every creator before calling anything dead.
4. Nothing invented ships; approximations are LABELLED where the player
   sees them.
5. A claim is only true if a suite checks it — and green only answers
   "did I break something", never "did my change do anything".
