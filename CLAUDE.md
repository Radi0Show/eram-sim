# CLAUDE.md — Eram (sword route) Simulator

**FIRST: read docs/PLAYBOOK.md, all of it.** It is the distilled method and
trap catalog from knight-sim (the reference implementation, one directory
over at ~/knight-sim). This project follows it exactly.

**THEN: docs/RECON.md** — if its checkboxes are empty, recon is the task.
No code before the fight table exists.

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
