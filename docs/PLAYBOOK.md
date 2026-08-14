# THE BOSS-SIM PLAYBOOK

How to build a frame-accurate browser practice simulator for a DELTARUNE
boss, end to end, distilled from the Roaring Knight project (knight-sim).
That project is the reference implementation — when this document says "copy
X", X lives there and is boss-agnostic.

- Reference sim (public): https://github.com/Radi0Show/knight-sim
- Reference research repo (PRIVATE, local only): `~/knight-research/`
- The finished thing: a Bad-Time-Simulator-style page — drop the player into
  the real bullet patterns, instant restart, no story. Free, non-commercial.

Read this whole file once before doing anything. Every rule in it was paid
for in hours; the traps section is a list of real incidents, not
hypotheticals.

---

## 0. THE POSTURE (decide these up front, they shape everything)

- **Two repos.** `<boss>-sim` is public: JS, docs, extracted sprites, the
  suites. `<boss>-research` is PRIVATE AND LOCAL — the GML dump, oracle
  patches, traces, instrumented bundles. Never publish it, never commit the
  game's data files or the dump anywhere. The pre-commit hook in knight-sim
  (rejects whole `.gml` files and original data) is worth copying on day one.
- **Scope: dodge-only first.** No ACT menu, no items, no turn economy at the
  start. Party HP and damage reduction as constants. Soul movement + ONE
  attack is a publishable tool; ship it, then widen. knight-sim later grew
  the full FIGHT bar, items, TP, swoon, cutscenes — all of it landed
  incrementally on a page that already worked.
- **Translate GML to JS by hand, preserving arithmetic.** No GameMaker HTML5
  export (different runtime, zero fidelity gained). GML reals and JS numbers
  are both f64; preserving operation order preserves bits.
- **A claim is only true if a suite checks it.** The method is: translate,
  then prove against the real game (the oracle, §3). "Looks right" is how
  three wrong attacks shipped early in knight-sim.
- **Nothing invented ships.** If a placeholder is unavoidable, label it in
  the UI where the player sees it, and mark approximations `LABELLED` in
  code comments. Player-visible honesty is what makes bug reports usable —
  the knight project's best fixes all started from a player saying "that's
  not what the real one does", which only works if you haven't quietly
  invented things they'd mistake for the real one.

## 1. TOOLING ON THIS MACHINE (macOS specifics that bit us)

- The data file is `game.ios`, not `data.win` — same FORM/GEN8 container,
  different name. Every chapter has its own:
  `DELTARUNE.app/Contents/Resources/chapter<N>_mac/game.ios`. The boss you
  are porting lives in ONE chapter's file; establish which in recon.
- There are TWO data files in play: the top-level `Resources/game.ios` is
  the LAUNCHER (chapter select); the chapter file is the game. A bundle
  that must boot unattended into a chapter needs the launcher patched too
  (knight-research has `launcher_patch.csx`). Forgetting this leaves the
  game sitting at chapter select forever.
- UndertaleModTool CLI at `~/tools/utmt-cli` (Intel binary, Rosetta). **Never
  run two UndertaleModCli processes at once — they wedge.** `pkill -f
  UndertaleModCli` and re-run solo. Every load+script+save cycle is minutes;
  batch work into one script when possible.
- Patched bundles must be re-signed or they won't launch:
  `codesign --force --deep --sign - <app>`.
- Node is NOT on PATH: `export PATH="$HOME/tools/node/bin:$PATH"` first in
  every session and every script.
- UTMT scripting notes: GML inside C# verbatim strings needs doubled quotes
  (`""`) INCLUDING inside comments; replacing a decompiled entry drops
  anything else declared in it (the `enum e__VW` tail is the usual
  casualty); the working import API is `new CodeImportGroup(Data)` +
  `QueueReplace`/`QueueAppend` + `Import()`.

## 2. RECON (before writing any code)

1. **Dump the chapter's GML** (research repo, `gml_dump/CodeEntries/`).
   Then account for it: every code entry either has a file or is a nested
   function inside one (knight-research's T1 method). Until the accounting
   closes, a negative grep proves nothing.
2. **Find the fight's ground truth.** The boss enemy object's attack
   SELECTOR (usually an Other_1x user event) is the only authority on what
   the fight does. The dispatch table and the roster of attack-shaped
   objects both lie:
   - knight-sim shipped two fully verified "attacks" that the selector can
     never choose (debug/unused content), because we read the dispatch
     table instead of the control flow through it.
   - The reverse trap too: an attack looked dead because ONE of its
     creators was dead. **Trace every creator to a selector-reachable root
     before calling anything unreachable.**
3. **Find the shared spawner.** DELTARUNE bosses tend to launch attacks
   through one controller object switching on a `type` field (the knight's
   `obj_dbulletcontroller`). Finding it converts "reverse 14 bespoke
   objects" into "reverse one switch".
4. **Write the fight table into CLAUDE.md immediately** — phases, turn
   order, per-attack parameters (type, invulnerability, box geometry), the
   phase-advance and fight-end conditions. Everything else derives from it.
   Watch for: phase reassignment INSIDE a turn block (turns that look
   reachable but aren't), HP gates that fire at the end of ANY turn (not at
   phase boundaries), and endings that fire on a HIT rather than at 0 HP.
5. **Read flag semantics from their writers, not their names.** In
   knight-sim the room variable literally named `defeated` meant "the BOSS
   was violenced" — the wrong cutscene shipped because the name was trusted.
6. **The wiki is a hypothesis, never a source.** It corroborated most of the
   knight's numbers and was flatly wrong about three (damage values, a
   party-wide mechanic that is actually one character's). Check claims
   against the dump; never settle with the wiki.

## 3. THE ORACLE (the verification instrument — this is the whole method)

Patch the player's own copy into a measuring instrument; never ship it.

- **Recipe per attack:** patch the chapter data so an in-game recorder
  writes one CSV row per frame (positions, state fields, per-bullet
  columns); play a scripted input table; translate the attack in `sim/`;
  replay the same inputs headless; byte-diff the CSVs. Done = row-exact
  across the window, and stable across 50 replays.
- **Trace format rules** (each one has a failure story):
  - GML side prints `string_format(value, 0, 10)` — never `string()`, which
    rounds to 2dp and hides exactly the divergences you hunt.
  - JS side needs GML's tie-to-even formatting, not `toFixed` (ties round
    away from zero; identical bits, different text, false diff).
  - Sort bullets by spawn order, never instance id.
  - Comparison is exact string equality. No tolerances — a tolerance is a
    divergence you've stopped hunting. Where bit-exactness is genuinely
    impossible (see RNG/shuffle below), fix the INPUT instead and label.
  - `file_text_*` is buffered; a crash loses everything unflushed. Flush
    periodically in every recorder.
- **Never pin a value the game sequences itself with.** Pinning `mnfight`,
  the attack choice, or the turn timer each cost hours: they are INPUTS the
  game drives itself with, and freezing them silently disables init paths,
  spawn conditions, whole attack phases. Give a starting value; let the
  game drive. Grep for readers before pinning ANYTHING.
- **A shortcut must carry every side effect of what it replaces.** Forcing
  one flag to skip a talk phase dropped six side effects and produced three
  bugs that each presented as something else entirely. Before standing in
  for a branch, list everything it assigns.
- **Instrument before theorising.** Three guesses at a stall = three wasted
  game runs; one diagnostic printing eight variables found it in one run.
  Guard every instance read (`variable_instance_exists`) — diagnostics see
  objects before their fields exist.
- **Positive execution assertions.** Track counters (collision checks,
  motion steps, alarm fires) and assert on them, or a dead code path hides
  behind all-negative results forever. Sabotage-test every suite:
  deliberately reintroduce the bug and watch it fail.
- **Green answers "did I break something", never "did my change do
  anything".** Verify behavioural changes by observing the behaviour.

## 4. ENGINE FACTS (verified in knight-sim; carry them, don't re-derive)

Copy the engine skeleton from knight-sim — it is boss-agnostic:
`sim/clock.js` (fixed 30Hz accumulator), `sim/entity.js` (entities, alarms,
phase order, f32 accessors), `sim/rng.js`, `sim/trace.js`, `sim/masks.js` +
`sim/collision.js`, `tools/run-trace.mjs`, `tools/diff-trace.mjs`, the
verify-suite runner, `tools/devserver.py`, `render/font.js`, the audio
layer, and `web/` driver patterns. Then the facts:

- **30Hz fixed timestep.** Accumulate real time, step in whole 1/30s units.
  No rAF delta ever reaches sim code.
- **Step order is explicit**: Begin Step → alarms → Step → built-in motion →
  Collision → End Step. Alarms between Begin and Step. Collapsing an alarm
  into a counter costs exactly one frame. `!alarm[0]` is TRUE for idle (-1):
  translate as `!(alarm[0] > 0.5)`.
- **Float32 built-ins.** Every built-in instance field (x, y, speed,
  direction, image_*) narrows to f32 ON STORE; GML variables stay f64. This
  is enforced structurally (spawn() installs narrowing accessors) so no
  translation can forget. Positions that are integer-valued hide this for
  weeks; the first fractional speed ramp exposes it.
- **RNG is WELL512** (Lomont), seeded by 16 rounds of an LCG, `random` = 1
  draw, `irandom` = 2 draws composed 63-bit then modulo. Validated against
  in-game probes. The catch: **call order includes Draw events** — cosmetic
  draws consume. Matching the live stream across a whole fight is
  impossible (engine noise burns draws), so both sides re-anchor the seed
  per attack launch, and results are reported as "mechanics one-to-one, RNG
  re-anchored per launch".
- **`ds_list_shuffle` is unsolved** (16 draws per element, algorithm
  unknown; not Fisher-Yates). Translate with your own shuffle; for
  verification, patch the ORACLE to a fixed order; label.
- **Collision**: precise masks, positions floored before the test, B's
  rotated bbox as an integer pre-check, corner+floor inverse sampling. An
  axis-aligned mask thinner than 1px never registers; rotation is decisive.
  The model is calibrated in `sim/masks.js` — port it, and oracle-spot-check
  any new angle/scale combination.
- **Custom arenas**: a box whose max scale isn't exactly 2x2 swaps its
  collision sprite and quantises scale to 1/37.5. The box is created fresh
  each turn; a persistent sim box must re-arm its init per arena open.
- **Damage is a system, not a number**: placeholder 10 flows from bullet
  init unless the real value arrives (hardcoded in the bullet's damage
  event or walked down the spawn chain by inheritance). A bullet that never
  inherits looks WEAK, not broken — a suite must guard every live attack's
  damage. Who gets hit is its own set of rules (target redirection, tank
  items, per-attack exemptions) — read them, don't assume.
- **Swoon/down is five globals, not an HP sign** — and the display label,
  the pose gate, and the targeting gate are three DIFFERENT authorities.
- **Write-only variables are original bugs.** Hand-written GML is full of
  assigned-never-read typos (`destroy_on_hit` vs `destroyonhit`). Scan for
  them per object; mark each `ORIGINAL BUG:` at the site so a cleanup pass
  can't "fix" them into divergences. Fun subcase: intended fades that are
  dead code because a timer is already past the window — port the EFFECTIVE
  behaviour and note the dead intent.

## 5. PRESENTATION (sprites, audio, UI — where most player reports live)

- **Sprites come from the player's own data file.** Ship only what the boss
  code references. `manifest.json` carries origin/size/frames/bbox per
  sprite — GameMaker positions every draw relative to the origin, and
  without it art sits offset from physics.
- **THE TRIM.** Texture-page items are trimmed to inked content. An
  extractor that exports the item raw loses the margins and every draw
  shifts by (TargetX, TargetY) — this single bug produced WEEKS of "sprite
  X is not in the correct place" reports in knight-sim. Export WITH padding
  (`TextureWorker.ExportAsPNG(..., includePadding: true)`), and **verify
  PNG dims == manifest dims for every sprite after every extraction** —
  the check is three lines of node; the mismatch is the whole bug.
- **A sprite set on the OBJECT DEFINITION is invisible to code greps** — and
  so is `depth`. Dump object definitions when an object draws "itself" and
  nothing says what that is, or when `e.depth + N` has an unassigned base
  (NaN depth = arbitrary paint order, no crash, no failing suite).
- **Numeric asset ids** (`sprite = 1930`, `instance_create(x, y, 46)`,
  `loopsfx 169`): resolve with tiny id→name dump scripts (knight-research
  has sprite/object/sound resolvers). Never guess.
- **GML draw semantics that differ from a naive canvas port:**
  - `draw_rectangle` is INCLUSIVE of both corners (off-by-one traps in
    cutout regions).
  - The draw-colour argument MULTIPLIES; GPU fog REPLACES. A white tint on
    dark art is a silent no-op — fog draws need a replace-mode helper.
  - Draw order within an event is layer order; read the event top to
    bottom before assuming (a first pass had a sword under the body).
  - Anything random in a Draw event re-rolls at the game's 30Hz. A renderer
    calling it per monitor frame doubles the perceived intensity — every
    Draw-random must be a pure function of the sim frame.
- **Fonts**: extract the page PNG + glyph table. `shift` (advance) and `w`
  (inked width) are different numbers; a space has w=0, shift>0. Text
  wrapping, per-typer metrics (font, chars-per-line, letter advance, line
  height, reveal rate) all come from the game's text-type script.
- **Audio**: SFX and music extraction per the project's permission posture;
  audio files live in the repo per knight-sim's precedent. **The audio index
  is load-bearing**: the layer plays only names listed in
  `assets/audio/index.json` — extracted-but-unlisted files are SILENCE with
  no error. Run a two-direction coverage suite: every sound the real fight
  plays must be cued somewhere, and every cue name the sim can emit must
  resolve to a file. Some SFX ship as loose `.ogg` in the app bundle rather
  than in the audiogroup.
- **UI is dump-sourced like everything else**: menu geometry, the item
  economy's snapshot/restore semantics, the attack bar's real schedule
  generator (the obvious formula is usually the DEAD branch), damage number
  colors/types, the boss's own game-over variant. Two recurring input traps:
  battle menus are edge-triggered but a fresh `held` map reads a still-down
  key as a new press (mask held input across EVERY transition — title→game,
  cutscene→fight, a ~100ms human press spans four 30Hz frames), and a
  once-per-bar press latch reads as "the mechanic isn't wired up".

## 6. CUTSCENES (intro/victory) — DRIVER-SIDE, ALWAYS

Run story sequences in the web driver BETWEEN phases (title → intro →
fight → ending → menu), never as sim entities. This keeps replay tokens,
oracle diffs, and every suite byte-identical with or without them. (The
first attempt at an intro inside the sim shifted every replay token by the
intro's length and was rebuilt.)

- Port the room controller's cutscene script (`con` chains + the c_ command
  queue) as a frame-indexed timeline with dialogue gates; the room's helper
  blocks (per-flag one-shots in its Step) are the effects library.
- Watch for: first-run vs revisit staging branches (different coordinates!),
  world-anchored vs camera-anchored draws, camera clamps that saturate
  (making the composition static), rooms that are BLACK VOIDS composed at
  runtime by a parallax object rather than tiles (dump the room to know —
  knight-research has `dump_room.csx`).
- Hand off positions exactly: the fight's actors start at deterministic
  positions/phases (a hover starting at sin(0) has a knowable first-frame
  y) — glide cutscene actors ONTO those exact coordinates or the swap frame
  pops.
- Add a deterministic frame-driver for every scene
  (`window.__intro.drive(t)` pattern): create the scene, step to t with
  auto-confirmed gates, paint once, freeze the loop. Screenshot tooling
  stalls rAF and the clock drain then blasts through the timeline — you
  cannot watch a cutscene in a driven browser tab; you inspect frames.

## 7. VERIFYING IN THE BROWSER (the dev-loop traps)

- **The module-graph cache.** Browsers reuse instantiated ES module graphs
  across reloads per origin; an edited module can run stale code while the
  server serves the new bytes, and the symptom looks like your change had
  no effect. Use knight-sim's `tools/devserver.py` (stamps module URLs per
  page load) on its own port. The app's built-in preview server does NOT do
  this — never use it.
- Synthetic keys: dispatch KeyboardEvents via JS (the pane's key tool
  doesn't reach the page). Remember the held-across-transition mask exists:
  a synthetic 120ms press can skip your own cutscene.
- Unfocused tabs throttle rAF to a crawl; sim-rate readouts lie there.
  Verify timelines headless; verify LOOKS via the frame-drivers.
- The loading gate: check the page's real ready signal, not a stale HUD
  string.

## 8. GROUND TRUTH CAPTURES (when the dump isn't enough)

Static analysis first — placing frames at their GML anchors and
pixel-scanning answered in minutes what a capture pipeline was being built
to answer. When you truly need to SEE the real game: build a capture bundle
(clean chapter data + a hook that stages the moment + `screen_save` every
Nth frame — the game writes its own framebuffer, no macOS screen-recording
permission needed, pixel-perfect and native-res). Needs the patched
launcher; back up and restore the user's save files around every run.
knight-research has the working `intro_capture.csx` pattern.

## 9. SHIPPING

- GitHub Pages via the workflow in knight-sim (`pages.yml`). Push = deploy.
- `?seed=` and `?frames=` URL params: deterministic reproduction of any
  moment through the same code path as the headless verifier.
- Replay tokens ARE the bug-report format: seed + mode + inputs. One key
  copies it; everything else is recoverable by replaying.
- A debug damage key (E in knight-sim: a big hit through the REAL damage
  path, listed in the HUD, fight-phase only) makes ending/cutscene testing
  a two-minute loop instead of a fifteen-minute fight. Do this early.
- HANDOFF.md discipline: every session appends what it learned, what's
  open, and the traps it hit. It is the difference between sessions that
  compound and sessions that re-learn.

## 10. THE ORDER OF WORK (what worked, start to finish)

1. Recon + dump accounting + the fight table (§2). Static only.
2. Engine skeleton copied from knight-sim; determinism suite green
   (same seed = same trace, different seed = different trace).
3. Soul movement, verified against a recorded trace (movement constants,
   focus-slow semantics, diagonals, box collision — measure, don't assume).
4. ONE attack end to end through the oracle recipe. This drags in the
   battle box, spawners, damage path — that work is needed anyway.
5. Attack by attack, each with its own suite, in the fight's real order.
6. The fight scheduler from the selector (phases, gates, the ending).
7. Presentation passes: sprites (with the dims check!), fonts/text
   metrics, audio (with the index suite!), menus/UI, damage numbers.
8. Playable page + replay tokens + Pages deploy. SHIP HERE, at the latest.
9. Cutscenes driver-side (intro, ending), boss-specific game over.
10. Player feedback loop: every "that looks/sounds wrong" report gets
    verified against the dump before fixing — the reports in knight-sim
    were consistently RIGHT, and half of them exposed systemic bugs
    (the trim, the audio index, the tint no-op).

## 11. WHAT TO EXPECT FROM THIS BOSS (fill in during recon)

See `docs/RECON.md` in this repo — a template with the questions §2 needs
answered before any code: chapter data path, encounter room + controller
object, the enemy object + selector event, the spawner + type table, HP and
phase gates, how the fight ends, cutscene branch flags, and the boss's own
game-over behaviour if any.
