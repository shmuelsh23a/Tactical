# Suppression: fire that pins, and an assault that arrives in time — a design

**Status: a proposal for the author, 2026-09-30. Nothing here is built.**
The author asked for it after the day's research ("adopt the factors, and
design suppression"). It extends the suppression layer he shaped in rules
decision 19, and every number in it is ours unless a source is named.

## Why

Three findings from the same day point at one missing mechanism:

- **No attack on the tel ever closes** (balance.md, twenty-second to
  twenty-fourth rounds). Over hundreds of battles the nearest attacker ends
  150–250 m from the defence; the defender's reserve (decision 60) never
  gets a position to retake.
- **Pace is not the cause** (validation.md, *Infantry pace under fire*): the
  attack already advances at the sources' 15–30 m a minute.
- **Fire that only kills cannot decide the fight the way the sources say it
  is decided** (validation.md, *Mortars against men dug in*). With full cover
  by the sources (decision 62) the dug-in defender loses few men to the
  mortars, and the attacker, in the open under the defender's mortars, breaks
  first or runs out of time.

What the sources say decides it:

- Fire on men dug in mostly **suppresses**: "suppression usually lasts only
  as long as the fires are continued" (FM 6-30), "and for some brief,
  indeterminate period thereafter" (Dupuy).
- An 81 mm bomb suppresses **well beyond where it kills**: probably within
  30 m of the burst, a 50% chance at 75 m, little beyond 125 m (FM 7-90,
  B-7). Suppression is strongest when fire first falls, and men under
  overhead cover are harder to suppress (same).
- **The assault succeeds by arriving while the defence is still
  suppressed**. In Operation Veritable (1945) casualties on both sides were
  under 5%, about 20 Germans surrendered for each casualty, and success came
  from assaulting as the fire lifted (Swann's operational research, as
  reanalysed by Rooney).

## What the game has (decision 19)

A force-level count, added as fire arrives (a shell 25, a burst 10 + 5 a
hit, an assault 30), **halved at every end of turn**. At 15 or more a force
is *suppressed*: half pace, ¾ accuracy, −5 to its men's nerve. At 40 or more
it is *pinned*: it moves only to withdraw, shoots at half accuracy, −10.

Measured on the tel (40 battles of the 3:1, decision 62's cover), sampled at
each movement phase:

| Squads | Neither | Suppressed | Pinned |
|---|---|---|---|
| Defender's, attacker beyond 300 m | 86% | 2% | 11% |
| Defender's, attacker 150–300 m | 49% | 22% | 28% |
| Defender's, attacker inside 150 m | 11 squad-turns in 40 battles | | |
| Attacker's, within 250 m of a defender | 58% | 21% | 21% |

## The gaps

1. **Reach.** A shell suppresses only the forces its lethal blast reaches —
   for the 81 mm, about 37 m from a force's centre (its 12 m lethal radius
   plus the 25 m its men stand over). FM 7-90 puts suppression at 30 m
   likely, 75 m even odds. A mission that misses by the median 22 m still
   suppresses in the game; one that misses by 50 m suppresses nobody.
2. **What pinned means.** A pinned force still watches, still reports what
   it sees, still serves as the eyes its side's mortars fire by, and still
   shoots, at half accuracy. The sources' pinned soldier has his head down:
   he neither observes nor fires to effect.
3. **Cover.** A force under a roof takes the same suppression as one in the
   open. FM 7-90 says it is harder to suppress.
4. **Timing.** Nothing is called within 150 m of the attacker's own squads
   (danger close), so the fires fall silent on a position once the
   assaulting squads are 150 m from it (a commander who answers the
   questions may also hold them 200 m out until he lifts the fires,
   decision 59). A pinned force (100) is down to *suppressed* after two turns and
   free after three. The last 150–200 m, at the sources' 20–30 m a minute,
   takes 5–10 turns. **The window has shut before the assault arrives.**
5. **The assault on a pinned force** is resolved as fire and grenades. Its
   morale test comes after, like any other fire. Veritable's defenders gave
   up when the infantry was on them.

## The proposal

Each item is a switch on `GameOptions` so it can be measured on its own,
and a recording made before it replays without it.

**S1 — Suppression reaches further than death** (gap 1). Each indirect-fire
weapon gets a suppression reach apart from its lethal one, measured from the
burst to the nearest of a force's men (its centre less the 25 m footprint):
for the 81 mm the full 25 inside 30 m, half (12) out to 75 m, nothing beyond
(FM 7-90's 30 m, 75 m; the half is ours). Other weapons scaled by the square
root of their lethal areas (ours). Direct fire is unchanged.

**S2 — Pinned means heads down** (gap 2). A pinned force:
- makes no new sightings beyond 50 m, and refreshes none, so it reports
  nothing to its side's picture and cannot be the observer a fire mission
  is adjusted or called by (ours: 50 m, the assault's neighbourhood);
- fires only at an enemy within 100 m (ours), at half accuracy as now.

A suppressed force keeps its eyes, at half its detection chances (ours).
This is what makes counter-fire pay: pin the defender's observers and its
mortars go blind.

**S3 — A roof halves suppression from above** (gap 3). A force under a roof
(a building, a prepared position) takes half the suppression of indirect
fire (FM 7-90's "harder to suppress"; the half is ours). Direct fire and
assault unchanged.

**S4 — The window, and who times it** (gap 4). Two parts:
- **Danger close becomes a risk, not a wall.** A fire mission may be called
  on a mark within 150 m of the caller's own squads; each of its rounds
  then threatens them as it threatens the enemy (the engine already rolls
  every force in reach). The caller chooses the risk. No rule of the
  document or the author forbids it; the 150 m prohibition is ours, from
  the browser tool. Doctrine accepts danger close; it does not forbid it.
- **Lifting the fires stays the company commander's decision** (Jev's, as
  decision 59 already asks it). The scripted company, which the balance is
  measured with, lifts when its assaulting squads are within 100 m of the
  objective and goes in at a run; the fires shift to depth. The squad drill
  already runs the last bound.

**S5 — Assaulted while pinned** (gap 5). A force assaulted while pinned
tests its nerve before the assault is resolved, at a heavy penalty (ours:
−20); a force that fails gives itself up or runs (decision 19's machinery),
and the assault falls on what is left. A suppressed force tests at −10; a
force neither is unchanged.

## What is not proposed

- No new decay. Halving at every end of turn already matches "as long as
  the fire, and a brief period after".
- No change to lethality. Decision 62 settled that from the sources.
- No change to the breakpoints (decision 44).

## How it would be built and measured

In order, each measured on the tel's 3:1 and 2:1 (200 battles, the
twenty-fourth round's company) before the next, and on the balance
harness's flat ground:

1. S1 and S3: reach and roofs (engine only). Expect the defender pinned
   more often while the fire lasts, and roofs to hold it back.
2. S2: heads down (engine; the side's picture). Expect the defender's
   mortars to fire less, and less accurately, while their observers are
   pinned.
3. S4: danger close as a risk (engine) and the scripted lift at 100 m
   (`company.ts`). Expect attacks to close for the first time, and some of
   the attacker's own casualties from its own fire.
4. S5: the assault on a pinned force (engine, morale). Expect surrenders
   over casualties where the assault arrives in time, and the reserve
   (decision 60) to go in for the first time.

The design principles are the test at every step: a prepared position gives
the defender its superiority, 3:1 wins against it (the author's ceiling is
85%), 2:1 does not.

## Questions for the author

1. **The shape: S1–S5 as a whole.** Anything to drop or add?
2. **S2: how blind is pinned?** No sightings beyond 50 m and no fire beyond
   100 m, or something softer?
3. **S4: danger close as a risk the caller takes**, or keep the 150 m
   prohibition?
4. **S5: surrender or rout** for a pinned force assaulted — which, or a roll
   between them as decision 19 has it?
