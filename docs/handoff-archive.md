# Handoff archive — what past sessions built

[docs/handoff.md](handoff.md) is the live note and holds **current state only**.
This file is where its history goes, newest first, so the working note stays
short without losing the reasoning behind decisions someone may want to reopen.

Durable facts do not live here either: rules go to the README's **Rules
decisions**, conventions and traps go to [CLAUDE.md](../CLAUDE.md), and chosen
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
