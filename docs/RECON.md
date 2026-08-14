# RECON — fill this in before writing any code

Answers come from the chapter's GML dump (build it first — see PLAYBOOK §1
and §2). Every entry cites the file:line it came from. The wiki may suggest
where to look; it settles nothing.

## The data

- [ ] Chapter data file: `DELTARUNE.app/Contents/Resources/chapter?_mac/game.ios`
- [ ] Dump built into `~/<boss>-research/gml_dump/CodeEntries/`
- [ ] Dump accounting closed (every code entry has a file or a parent —
      see knight-sim's T1 method). Until then, negative greps prove nothing.

## The fight

- [ ] Encounter room + its controller object (the `con` state machine)
- [ ] How the fight is entered (trigger, flags set, `scr_battle` args)
- [ ] The enemy object; which event is the attack SELECTOR
- [ ] The shared spawner/controller object and its type table
- [ ] The fight table: phases, turn order, per-attack parameters
      (type, invulnerability window, arena geometry per attack)
- [ ] Phase gates: HP thresholds? turn counts? WHERE do they fire
      (end of any turn? phase boundary? on a hit?)
- [ ] How the fight ENDS — and on what exactly (a hit? HP 0? a spare
      condition? multiple outcomes?). Read the flag writers, not the
      flag names.
- [ ] Attacks the selector can never choose (debug/unused) — list them so
      nobody translates them. Trace every creator before declaring dead.
- [ ] Enemy stats: HP, AT, DF, damage reduction schedule
- [ ] The soul: modes used (red/blue/yellow?), speed constants, focus
      semantics — measured, not assumed

## The presentation

- [ ] Battle background object and what drives it (HP readout? scroll?)
- [ ] The boss's hurt/strobe/block animations and their gates
- [ ] Battle messages per turn (the flavour line table)
- [ ] The boss's own game-over variant, if any (flag-gated?)
- [ ] Cutscenes: intro chain, outcome chains (WHICH branch is which —
      verify against flag writers), staging coordinates first-run vs
      revisit
- [ ] Music/SFX inventory for the fight (names, where played, pitches)

## Oracle plan

- [ ] What the universal harness needs for THIS boss (knight-research's
      `tools/patches/universal/` is the template): boot warp, selector
      seeding knobs, per-frame recorder columns
- [ ] RNG consumption sites in Draw events (they consume from the same
      stream — see PLAYBOOK §4)
- [ ] Which attacks need fixed-order oracle patches (shuffles)
