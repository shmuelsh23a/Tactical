# Handoff archive — what past sessions built

[docs/handoff.md](handoff.md) is the live note and holds **current state only**.
This file is where its history goes, newest first, so the working note stays
short without losing the reasoning behind decisions someone may want to reopen.

Durable facts do not live here either: rules go to the README's **Rules
decisions**, conventions and traps go to [AGENTS.md](../AGENTS.md), and chosen
numbers go to [balance.md](balance.md). What is left — "this is what happened
and why" — is what belongs below.

---

## 2026-08-16 — sectors of observation, and the last five rules decisions

Ended at `d61a646`. 281 tests, typecheck clean. The session closed rules
decisions **7, 8, 10, 13 and 14**, emptying the README's ⚠️ list for the first
time, and shipped one new feature.

### Sectors of observation (decision 14)

A force can be told which way to look: an arc with a bearing and a width, worth
a bonus inside it and −20% outside. The bearing is absolute, so displacing a
force does not re-aim it. It raises the concealed-charge floor the way scouting
does but never lowers it, it goes into the recording as a decision, and the
per-side debrief shows it to its owner only (the umpire sees both). The hotseat
lays one by picking a width and clicking the map, and draws the wedge out to
300 m.

**The width is the bet, and getting there took two goes.** The first cut paid a
flat +15% at any width, which made the control a trap — widening only ever
converted a penalised direction into a bonused one, so 180° strictly dominated
60° and there was no decision to take. The author caught it by asking what the
tradeoff was. The fix: attention is a fixed budget spread over the arc, so the
bonus is `13.5 ÷ width` (+23% / +15% / +8% at 60° / 90° / 180°).

> **Worth remembering as a shape, not just a number:** a modifier that applies
> to a region has to be checked against that region's *size*, or the control
> that sets the size is decoration.

Driven in the browser before it was called done: wedge drawn at each width, log
line, posture line, the sector surviving a move, and release back to all-round.

### Decision 7 — cover is proportional

Settled on the **grammar**, not the arithmetic. The document writes the cover
modifier with the partitive מ־ and the definite article (`-50% מסיכויי הפגיעה`)
and the movement-table modifier without either (`+30% סיכויי פגיעה`) — the same
kind of quantity, in the same document, phrased two ways on purpose. That also
confirmed the movement modifiers as additive, which had been sitting separately
in the "reasonable assumption" list. No code changed; the reading was already
the implemented one.

> **Worth reusing:** when the document is ambiguous, look for the *same quantity
> phrased twice*. This had been open since 2026-08-12 on an arithmetic argument
> alone, and a two-line grep across two tables closed it.

### Decision 8 — indirect fire is scoped, not provisional

It had been recorded as a stopgap ("the game has no battery piece; a battery
unit would replace it"), which invited someone to build one as a missing
feature. It is not missing: the playable slice is the platoon-leader view, and a
platoon commander *calls for* fire rather than owning a battery. Off-map is
correct at this echelon and stops being correct at battalion. The battery
therefore arrives with **echelon scaling** (backlog 3) and is recorded on both
ends — the decision says when, the backlog item says what it inherits.

### Decision 10 — the search has to cover the ground the trigger does

Settling it found a real bug. Charges were triggered along the **whole path**
walked while the search for them was rolled from the **endpoint alone** — two
halves of one rule measured off different geometry. Measured: a charge 5 m off
the route at the midpoint of a 50 m walk went off **200/200 seeds and was found
0/200**, so the document's 30%-walking / 5%-running split was doing nothing on a
mined approach — the one decision it exists to price.

The ruling: a walking force searches the ground it crossed; a runner gets no
look on the way and its 5% applies only where it halts. Trigger radius stays
10 m, deliberately below the 20 m search band.

The **same hole existed for a hidden enemy** (0/400 beside the midpoint against
~26% beside the halt), and the same ruling closed it — the document names
charges, shafts and hidden enemy in one 20 m clause. Only the *range* is swept;
chance and line of sight are still judged from where the bound finished. Checked
that this does not undo the ambush: the defender observes continuously at 300 m
and sees the attacker several bounds out, and camouflage still holds the
attacker to the concealed-charge floor.

Verified in play: `דרך על מטען נ"א — לא הופעל` fired 40 m behind where the bound
ended. A sweep-caused *detection* was never observed in the browser — the demo's
squad failed three 30% rolls and was then shot — so that half rests on the
measured tests.

### Decision 13 — two leaks in opposite directions

The disclosure line was mine and is now the author's, with two corrections:

- **The לקחים panel leaked the order of battle.** *How many enemy forces were
  never identified* was shown before the truth reveal — the only line in that
  panel that was umpire knowledge rather than the side's own experience. Since a
  side knows what it *did* detect, a bare count gives away the enemy's total. It
  now waits for the reveal.
- **A shot at an unseen force reported nothing at all**, contradicting the
  already-confirmed half of the same decision: a force always knows how many of
  its own men fired and at what chance. It now reads
  `N יורים ב-X% — ללא תצפית על המטרה`.

> **The shape behind both:** `outcomeVisibleTo` decides whether a line appears;
> `describeOutcome` decides what it may say. Putting an observation test in the
> first of those suppresses things a side plainly knows. The fix moved the test
> down a layer rather than loosening it.

### Also this session

The `.claude/` scaffold — permissions, the two hooks, the `code-reviewer`
subagent — had been in use for several sessions without ever being committed. It
is in the repo now; `settings.local.json` stays ignored.

---

## 2026-09-06 — the map is real ground

Ended at `056d056`. 325 tests. Rules decision 15 in one day, settled in two
rounds with the author, twelve commits, each driven in the browser:

1. **The proposal that was withdrawn.** Terrain *types* — wood, built-up,
   with cover, a 20 m sight rule and a double movement cost — went to him
   first. His steer: the game scales from soldier to brigade with metre-level
   resolution underneath, so the map carries **objects** and **elevation**,
   not types. Recorded under *do not re-propose*.
2. **Real ground** (`347b3e2`, `56055d7`, `520d527`) — a heightfield cut
   from public terrain tiles by `tools/fetch-dtm.py`, objects with a height on
   it, one binary symmetric sight test from an eye to a silhouette, eye height
   by posture (1.5 / 2.5 / 0.5 m), object cover as the ground's own
   `baseCover`. The review caught the first sight-line exclusion letting a
   force be seen straight through a building; fixed to near faces only.
3. **Naismith** (`34e7e5b`) — 8 m of the bound per metre climbed, descent
   free, vehicles refuse 30° up or down, no hit modifier for now. The review
   caught `reachAlong` judging the climb on the whole order line while
   `moveUnit` costs the bound: one order in 260 on the real map threw out of
   the execution loop. Judged on the bound taken, with a regression test that
   holds the failing field.
4. **The reach drawn** (`7379bbf`) — the movement ring became the true shape
   of the bound over the ground, a fan of `reachAlong` on 72 bearings.
5. **Real objects** (`f19e2a5`, `09c72e6`) — `tools/fetch-osm.py` pulled 249
   houses and two woods from OpenStreetMap; the invented farm and walls went.
   The street names settled where the ground really is: the southern edge of
   Yokneam Illit, not "near Elyakim". The ground taught its own lesson: the
   tank's 2.5 m hatches see over the shoulder to the far low ground 440 m off
   and not the slope just below it. `scenario.test.ts` pins it.
6. **Roads drawn** (`35c1943`) — a line layer the recording carries and no
   rule reads, with a digest-equality test to keep it that way; the licence
   carve-out for the ODbL data (`056d056`) at his word.

Measured and recorded: the demo's dead ground, 0/200 seeds on turn 1 and
200/200 on turn 2. The session's own lesson, twice over: the two halves of a
rule — cover reach and sight exclusion, order-line climb and bound cost — were
where both real bugs lived, and both were found by the reviewer, not the
tests. Run it before committing.

---

## 2026-08-13 — knowledge, posture, ambush and the debrief

Ended at `4c01fa8`, handed over at `e42205e`. 248 tests. One arc in six commits,
each verified in play:

1. **Orders carry a task** (`5b2c660`) — an order is an objective *and* what to
   do about the enemy there: advance, engage a named force, hold fire.
2. **A knowledge model** (`eb5be1b`, `830b510`) — the engine keeps per-side
   contacts (`intel.ts`); the hotseat draws contacts, not forces.
3. **Posture** (`d9a5bfc`, `e88ca59`, `9cc72eb`, `b55b197`) — hidden while
   stationary, continuous observation from position, digging in, camouflage,
   scouting, and the concealed-charge floor under camouflage.
4. **Ambush** (`1c27683`, `056518f`) — hold fire with an engagement range that
   springs itself on the nearest enemy, or on a designated one.
5. **Per-side debrief** (`ca9e18f`, `dd34261`, `901e4a0`) — the review reads
   through the umpire's eyes or either side's, with banded reports, a לקחים
   panel and a truth reveal.
6. **What-if** (`4c01fa8`) — re-fight the same decisions under other dice,
   skipping decisions the alternate history has made impossible and reporting
   how many were skipped.


## 2026-09-16 — the day of the two-halves bugs

Six rulings in one day (decisions 16, 17, 18, and two riders on 12), and almost
every defect found along the way was the same shape: one rule applied in two
places, off different state, each half defensible alone. Kept here because the
pattern is the point, not the individual bugs.

### Covering fire (decision 18)

It was the most expensive feature yet to get right, and every cost was a rule
with two halves:

- The live log keyed *how exactly losses are counted* off the force that
  **fired** rather than the force that was **hit**, so a side read "no
  casualties observed" about its own men. Found by driving it in the browser,
  not by a test.
- The shot was resolved against `unit.cover`, which is written only at
  placement and at upkeep — so a force that had broken out of a prepared
  position was shot at mid-bound as though still in it. Covering fire is the
  exception the end-of-turn cover ruling anticipated, and the README paragraph
  that predicted it had been deleted rather than acted on.
- `MOVEMENT_PROFILES.enemyHitModifier` — the document's own +30%/-20% for
  shooting at a moving force — had **no consumer in the engine** until this.
  Without it, running under covering fire was never worse than walking.
- Three of the four attack paths carried the rule and `fireExplosive` carried
  neither half, so a force could declare חיפוי and still fire an RPG.
- The interrupt was only half built: a bound was interrupted at the point of
  exposure, but a shot and an assault were *replied to* after the fact, so a
  coverer that was itself the target could be dead before it answered. Both
  are interrupts now (author, 2026-09-16).
- "Spends the force's action" was true only on the turn it was declared,
  because `firedThisTurn` is cleared at upkeep while the posture is not. The
  economy is derived now (`Game.actionSpent`), which also stops a watching
  force being treated as one that has fired — that flag is read by two other
  rules, and borrowing it stood the force up and halved its cover.

### The live log's side filter (decision 17)

Chasing it turned up four things the filter alone would not have fixed, each
worth knowing because each was a rule with two halves:

- The log **baked exact-vs-banded losses from whoever was viewing** when the
  line was written, then showed that line to everybody.
- The fire line printed `${shooters} יורים` — the firer's **exact fit
  strength** — to the target, which makes banding its casualties pointless.
- The debrief hid `executeStandingOrders` from the enemy **wholesale**, so a
  force shot at under a standing order was never told; and the **לקחים** panel
  read only explicit `fire` / `assault` actions, so the same ambush left
  `hitByUnseen` at nought.
- Filtering to `viewingSide` at a **handoff** shows the outgoing player the
  incoming side's private log — `viewingSide` is already the incoming side
  there. The panel takes a nullable reader for exactly this.
- **A shot has three readers, not two.** The debrief's `exact` means "the
  reader owns the target", which is true of the umpire *and* of the force being
  shot at — so the side under fire read the firer's exact strength, its hit
  chance and the damage it took. `Lens.side` is required now (`null` is the
  umpire) so a lens has to say which it is; before, a lens built without one
  silently became the umpire.
- **`knows` is not "is looking now".** It says a contact record exists. Reading
  it as a sighting let a side read `נראה מנוטרל` off a three-turn-old mark its
  own map still drew alive — decision 13 had already ruled the other way.

**Backlog 6 is closed.** A battle is laid out by describing it:
`tools/make-scenario.py` takes a JSON spec and writes the scenario module, and
the demo is its output — which is what keeps the tool honest, since the suite
plays the generated battle.

**There are two maps now.** The second, Tel Azeka over the Elah valley
(`tools/scenarios/tel-azeka.json`), was written to test the claim that a
scenario is a spec file and nothing else, and it is also the only run so far of
`--fetch-map` on a window nobody had fetched before. It teaches out of relief
alone — one tree, no buildings — and it teaches the opposite of the demo: the
tel cannot see its own eastern face, so the covered route up is the one
Naismith charges 250–360 m of bound per 100 m of ground. Its test pins those
claims the way the demo's does.

Read the ground before placing anything on it. The lesson that map actually
teaches was the opposite of the one it was picked for, and a throwaway probe
over sight lines, heights and bound costs is what said so — half an hour, and
it changed the whole battle.

**The app still opens exactly one battle**, though: `src/app/scenario.ts` names
the demo, and choosing between scenarios is UI that does not exist. Tel Azeka
is generated, tested and unreachable in the hotseat — the smallest piece of
work on this list, and the one that makes the second map worth having.

Small things noticed and left: for an **ordered tank-round** engagement,
`engaged.newCasualties` sums every unit caught in the blast against the
target's id (`game.ts`), so the firer's own men caught in its own burst land in
the debrief's `inflicted` rather than `suffered` — pre-existing normalisation,
newly visible now that the לקחים panel counts ordered engagements; a tank round
that hits reports no casualties in the live log at all (`handleFireAt`'s `fireExplosive` branch) — pre-existing,
and now a two-line fix since `logLosses` exists; the debrief has no *height*
readout for a force; `fetch-osm.py` keeps a way whole when any vertex is inside, so Route 6
carries 1.3 km of off-map points that the SVG clips — file size only.

Two I would *not* rush: **echelon scaling** (backlog 3) touches the C2 model
everywhere and has since picked up the artillery battery, which makes it larger
rather than more urgent; and **OPORD mode** (backlog 13) is a research project
with a section of its own in the README.


