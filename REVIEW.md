# What a reviewer checks in this repository

Read by every reviewer, through [docs/review-checklist.md](docs/review-checklist.md)
(which the `code-reviewer` agent works from), and by Claude's managed Code Review where
that is switched on (the same rules, not a second reviewer), always from the base branch. Each item has a TRIGGER that can be read from a diff, a CHECK, and the
incident or pull request behind it. A reviewer checks only the items whose trigger
matches. An item earns its place by having happened twice, or once at real cost; one that
has not fired for months is removed.

The project's general checklist is [docs/review-checklist.md](docs/review-checklist.md)
(determinism, recordings, what a side may know, rules fidelity). This file holds only the
items this repository has actually paid for; where the two overlap, the checklist explains
and this file triggers.

## Always

- New behaviour has a test that fails with the change switched off.
- Nothing weakens a check to make it pass (a skipped test, a sleep, a retry, a looser
  assertion).
- `npm run check` was run on the final tree and its result quoted (AGENTS.md).

## Items

### The fight inside a building
- **Trigger:** the diff touches `src/engine/interior/`, `src/engine/data/interior.ts`, or
  the interior parts of `src/app/drill.ts` (teams, trails, posts, breaching).
- **Check:** every timer that holds a team (consolidating, a halt for casualties, the
  roof, a charge being laid) pushes `lastProgress` forward, after setup only with
  `Math.max`, so a
  long legitimate wait is not read as a standoff; a wound or a man is never lost or made
  twice when he changes team, trail or post; nothing scores once its pool has run out;
  distance is read from where a force is, not from its mark; the drill aims by the same
  sight line the resolver resolves with. The commit says `npm run interior-sim` was run
  after the change and what it showed.
- **Why:** 2026-10-16 to 20, five reviews of the floor plans, resolver, top-down, smoke
  and coupling found two stalls, lost wounds, a free move, a fog-of-war leak and three
  silent no-ops; decision 98's first review found nine more (phantom hits from an
  exhausted pool, a room burst measured from the force's mark, the drill aiming by a
  different sight line); a second review fixed a rallied leader made twice (`0c58165`,
  2026-10-21). The tests passed every time (docs/handoff.md, *Traps that cost real time*).

### What a side is told
- **Trigger:** the diff touches `src/app/debriefView.ts`, `src/app/debriefText.ts`,
  `sideView`/`contactsFor`, `casualtyReport`, a `pushLog`/`pushPerSide` call, an engine
  refusal reason, or adds any line a player reads about the enemy.
- **Check:** for each new or changed line, who will *read* it (not who is looking when it
  is written); whether it reads `game.units` (the truth) where it should read the side's
  marks; whether a refusal or a log line tells a side something the enemy did that it
  could not see. When `outcomeVisibleTo` (whether a line appears) changes, read
  `describeOutcome` (what it may say), and the other way round.
- **Why:** `29e1cfe` (2026-09-16): the debrief hid fire under standing orders from the
  side being shot at, told the side under fire the firer's exact strength and hit chance,
  and told the defender what the attacker's own grenades did to the attacker. `604be21`
  (2026-10-21): the support-set hold was judged on the truth, not the side's marks.
  2026-11-17, decision 124: a refusal to lay a charge told a player the enemy had charged
  that house (README, decision 124, *Holes, one a wall*).

### One rule, two halves
- **Trigger:** the diff changes a condition, a distance or a geometry in one place where a
  rule is applied, and the rule is applied somewhere else too (a search and its trigger,
  a filter and its text, a bonus and the arc it is measured on, cover written at
  placement and read mid-bound).
- **Check:** find the other half and read it; say in the review whether it still agrees.
  A comment claiming the two "cannot disagree" is checked, not trusted. A test applies
  both halves at once and asserts the wrong combinations are not produced.
- **Why:** three of the five decisions settled on 2026-08-16 had defects of this shape,
  and eleven across three features on 2026-09-16, one of them a comment claiming two
  different expressions were the same (docs/handoff.md, *A rule with two halves*;
  docs/handoff-archive.md for that day's list).

### A new member of a union, a `switch` with a `default`
- **Trigger:** the diff adds a member to a union type (an echelon, a `RecordedAction`, a
  vehicle class, a gait), or adds a `switch` with a `default:` over such a type.
- **Check:** every place that maps the type is a `Record<TheUnion, …>` or a switch ending
  in a `never` guard, so the compiler names each one; grep for switches over the type
  that end in `default` and would swallow the new member silently.
- **Why:** `4bd3f6b` (2026-10-11): the `team` echelon of decision 89 fell into a
  `default` in `symbols.ts`, so every fire team and machine gun team drew with no echelon
  amplifier, indistinguishable from an unsized force, and nothing failed. The three
  `Record<Echelon, …>` maps were named by the compiler.

### Recordings and saves that no longer replay
- **Trigger:** the diff touches `src/engine/recording.ts`, `src/app/session.ts`,
  `src/app/recordingFile.ts`, a `RecordedAction`, or changes which candidates a loop
  draws from the rng (the number or order of draws).
- **Check:** a recording or a save that cannot be replayed, or replays to another state
  (`stateDigest`), is refused with a reason (a `RecordingError`, the picker's message),
  never crashed on and never rebuilt during render. A change that makes older recordings
  diverge is deliberate and said so in the README or handoff.
- **Why:** `a2e15d3` (2026-10-05): a save that would not replay blanked the page on every
  reload. `7b62442` (2026-10-03): a recording with an unknown vehicle class crashed
  instead of being refused.

### A change a player can see, driven in the app
- **Trigger:** the diff touches `src/app/components/`, `src/app/App.tsx`,
  `src/app/hotseat.ts`, `src/app/debriefText.ts`, a scenario spec under
  `tools/scenarios/`, or changes a rule whose result shows on a card or in the log.
- **Check:** the commit or the pull request says what was driven in the dev server
  (AGENTS.md, *Verifying a change in the actual game*) and what showed: the scenario, the
  situation reached, the log or card text read back. Tests alone are not the evidence.
- **Why:** 2026-10-11, the first drive after three days of doctrine work found the
  fire-team symbol fault and machine gun teams named in mixed script (`4bd3f6b`), and that
  a player had no way to form a fire team at all (docs/handoff.md, *Drive the browser as
  you go*). `5e54b81` (2026-11-17): driving decision
  124 found three faults the suite had passed: the card offered only the nearest house
  (BLUE's own cover house), a force fighting inside could lay a charge, and the blast was
  never told.

### A figure or a conclusion from the harness
- **Trigger:** the diff changes a rate, a win percentage or a measured figure in
  `docs/balance.md`, `docs/validation.md` or the README's rules decisions, or draws a
  conclusion from a harness table.
- **Check:** the row is at 100 seeds or more; a surprising row was rerun on a disjoint
  seed window (`--seed`), not with `--swap`; the down and out-of-time columns were read
  before the win rate; the mechanism was seen working (the forces were in range, sighted,
  and fired), not inferred from the table.
- **Why:** round 34's "holding short wins 10%" did not reproduce at its own commit (65%),
  and three rounds reasoned from it (corrected 2026-10-01, docs/handoff-archive.md). Three
  days of tables were measured through a drill whose forces never fired, all internally
  consistent and all wrong (docs/handoff.md, recorded 2026-10-11 in `9696f48`). A `--swap`
  run put a bias that was not there at the top of the 2026-09-23 handoff.

### An optional-chained call whose argument does something
- **Trigger:** the diff adds or changes a call of the form `x?.f(…)` or `x?.[k](…)` whose
  argument does work: an engine call (`advanceToPhase`, `beginTurn`, any `game.` method
  that changes state), a draw, a log line, an assignment.
- **Check:** when `x` is undefined JavaScript skips the call *and its arguments*. The
  work is done in its own statement first, and only the result is passed:
  `const r = game.advanceToPhase(p); x?.heard(r.resolved);`.
- **Why:** twice in one change (decision 129, 2026-11-23): `asked?.heard(g.advanceToPhase(…))`
  in the headless runner stopped every battle without an asked commander at its first
  phase, caught by comparing `scenario-sim` before and after; and
  `ordered.current?.heard(game.advanceToPhase("targeting"))` in `App.tsx` skipped the
  turn's first advance in hotseat and against the computer, caught by review.
