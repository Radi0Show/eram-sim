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

**THE BUILD IS COMPLETE** — all three levels playable start to end: every
enemy kind at the game's own half-frame cadence, projectiles, warps (touch
AND entrance — an entrance converts an edge shift into a warp), the tree
loop, the boat (embark is the INTERACT — Z on a dock), the cactus, candy,
the TV set with per-screen colours, the real HUD strip (event_user 0 — NOT
obj_board_healthbar, which never instantiates in sword rooms), audio, and
the three endings. RECON.md's "The full build" section is the ledger;
its "Labelled approximations" list is mirrored on the page.

`sim/enemies.js` is the roster, contact damage and the sword's victims.
**Before changing anything about whether an enemy is dangerous, read
RECON.md's "The sword" section.** Two flags decide it and they are not the
same flag: `obj_board_controller.violence` (off in level 1, turned on in
level 2 with the sword) sets an enemy's `aggressive` when it SPAWNS, but the
monster's own Step then forces `aggressive = true` whenever `swordlv > 1`,
in every room. `aggressive` gates the hitbox AND the chase. So level 1 opens
peaceful and turns hostile after three kills — that is the design, not a
bug. Do not "fix" docile enemies, and do not assume `violence` is the whole
story.

**LEVEL FILES ARE GENERATED.** `tools/build-levels.py` owns
`assets/levels/*.json`, spawners and pickup included. Editing those JSONs by
hand works right up until someone regenerates — which has already happened
once here and silently dropped every spawner. Change the generator.

**UndertaleModCli blocks on stdin when its output is redirected.** Run it
with `< /dev/null` or it hangs forever at 0% CPU looking exactly like the
"concurrent runs wedge" failure. Two 40-minute stalls came from this.

Remaining niceties (CRT filter, caterpillar followers, set-piece text)
are listed at the end of RECON.md under "Still to do, if ever".

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
