# Indirect fire and suppression: doctrine and data (2026-10-12)

The review the author asked for after decision 91 measured out as not the
lever: "revisit indirect fire suppression according to doctrine and real
data." Decision 91's instrumented battles showed the 3:1 defence pinned
in about 60% of its turns in contact, two-thirds of that by the
attacker's shells alone (balance.md, *Suppression by volume*). This is
the evidence and a proposal. **Nothing in the engine has changed yet.**

## What the game does now

Every round that lands near a force adds suppression by how close it fell
(decision 63, S1; decision 79's checked radii): **25** within 30 m of an
81 mm burst, **12.5** within 75 m, **6.25** within 125 m (65 / 125 / 200 m
for artillery); a force its blast reached takes 25; a roof halves it
(S3). Suppression caps at 100 and halves every end of turn.

A mortar mission is 24 bombs for effect from three tubes, landing over a
turn or two. Every bomb counts in full, the first or the twentieth, so a
squad position under one mission goes to **100** at once, and halving
holds it at 50 (pinned) the next turn and 25 (suppressed) the one after.
**One mission buys about three turns of a pinned or suppressed defence**,
and the 3:1 attacker has twelve.

## The reading that settles most of it

FM 7-90's radii, which the game took as **amounts**, are stated as
**probabilities** — "If an 81-mm mortar round lands within 75 meters of a
target, there is a 50 percent chance that the target will be suppressed.
Beyond 125 meters, little suppression takes place" (FM 7-90, 1992, B-7;
the same in ATP 3-21.9, 2025, B-36). Within 30 m it "will probably be
suppressed". Adding 25 + 12.5 + 6.25 for every round treats a chance of
being suppressed as a quantity of suppression. A chance does not add up
past certainty; it combines: P = 1 − Π(1 − pᵢ).

## Doctrine

- **It lasts only while the fire lasts.** "The effects of suppressive
  fires are immediate, but they only last as long as the fires continue"
  (ATP 3-21.90, 2019, para 1-12). "The effect of suppressive fires
  usually lasts only as long as the fires are continued … [it] requires
  little ammunition" (TC 3-09.81, 2016, ch. 3). The same in TC 3-22.91
  para 3-140 for smoke.
- **The first rounds count most.** "Suppression is most effective when
  mortar fires first fall; as they continue, their suppressive effects
  lessen" (ATP 3-21.9 B-36). Posture sequencing: men go to a more
  protective posture after the first volley, which "causes considerable
  degradation of effects as additional volleys are fired" — analysis
  takes a defence as half prone, half in holes for the first volley, all
  in holes after (TC 3-09.81 para 3-84).
- **Surprise.** "A high-casualty rate can be achieved with only two
  rounds against an enemy platoon standing in the open … 10 to 15
  rounds to duplicate the casualty rate when a platoon was warned"
  (ATP 3-21.90 A-30). Mortars demoralise most "by delivering as many
  rounds as possible in the shortest period possible" (TC 3-22.91 1-8).
- **Cover.** "Soldiers in the open are much more easily suppressed than
  those with OHC" (ATP 3-21.9 B-36). Casualties under a test barrage:
  prone in the open 100%, open fighting positions 30%, overhead cover
  under 10% (FM 7-90 p. 7-16) — lethality, which the game already has.
- **Neutralisation** is a casualty threshold — "ten percent or more
  casualties usually neutralize most units" (TC 3-22.91 3-141) — and
  is not suppression.

## Real numbers

| Finding | Source |
|---|---|
| 81 mm: suppression probable within 30 m, 50% within 75 m, little beyond 125 m; heavy mortar (proximity) 65 / 125 / 200 m | FM 7-90 B-7 — read |
| Distance for P = .5 / .9, CDEC's DAR: 81 mm 72 / 34 m; 155 mm 144 / 77 m (SUPEX gives other figures; the table is OCR-garbled in places) | Fort Sill symposium (1979), ADA081134, III-C Table I — read secondhand through the agent, partly checked |
| 81 mm: no significant difference between an open and a closed foxhole; 155 mm: the closed hole significantly less suppressive | same, SUPEX IIIA, III-C-19 — read |
| A burst in front suppresses far more than one behind (60 mm at 50 m: .47 against .11); a volley about twice a single round at the same distance | same, SUPEX IIIB, App. B — read |
| Time down per round: about 3 s (81 mm), 3 s (105 mm), 4 s (155 mm), at most about 16 s | Mueller & Pietsch (1978), ADA061417, pp. 80–81 — read |
| Models of the time: effect per **volley per 100 m square by density** (AMSAA/RARDE), a target staying suppressed for an interval unless another volley lands; RARDE suppression starts at 0.11 and is total at 0.46 equivalent-105 mm rounds per 100 m square per minute; CARMONETTE 14 rounds of 155 mm a square a minute keeps troops pinned; DIVLEV S = 1 − e^(−0.693·batteries/300 m segments) | same, App. C–D, III-D — read |
| WWII: "Effect of bombardment disappeared after 3 minutes" (prisoner, Il Casone 1944); the Germans at Cassino had 3–5 minutes after the preparation ended; infantry should be on the objective about 5 minutes after the fire lifts; 10 minutes' delay can mean a vigorous defence | Frame et al. (1989), ADA206606, App. E; DePuy in ADA081134; UK Artillery Notes 19 (secondhand) |
| British OR separated **neutralisation**, which lasts only during the fire, from **demoralisation**, which outlasts it and takes hours of heavy fire | Frame 1989 §7.2.1 — read |
| "The thing that counts most of all is the number of bangs" | 2 ORS, quoted by Dupuy in ADA081134 III-H |

## What it says about our rule

1. **Rounds combine as probabilities, not amounts.** Every model of the
   period saturates — by density or by 1 − Π(1 − p). Ours adds.
2. **Diminishing returns** come with that for free: the twentieth bomb on
   a force that is already down adds almost nothing. Doctrine says so
   (B-36, posture sequencing); no source puts a number on it beyond that.
3. **Duration: halving every turn is right.** Down 3–4 s a round, back up
   in about 3–5 minutes after a barrage: on 60 s turns, pinned on the
   turn the fire falls, a little left for a turn or two, gone by the
   third. That is the halving. What is wrong is how high one mission
   starts it.
4. **Cover against suppression from shells is weakly evidenced.** The
   roof's half (decision 63, S3) has doctrine behind it (B-36); an open
   hole against an 81 mm has data against any factor (SUPEX IIIA). Leave
   both as they are.

## The proposal (⚠️ for the author)

For each force, each turn a mission lands, combine its rounds:

```
pᵢ = 1 within the blast; 0.9 within `full`; 0.5 within `half`; 0.1 within `little`   (FM 7-90 B-7)
P  = 1 − Π(1 − pᵢ)                       over the turn's rounds of the mission
add g × P × (100 − S)                     g = 0.5; × the roof's 0.5 as now
```

| Figure | Value | From |
|---|---|---|
| p by distance | 0.9 / 0.5 / 0.1 | FM 7-90 B-7, as written |
| `g`, the share a sure suppression adds of what is left | 0.5 | ⚠️ ours: one sure mission on a fresh force gives 50 — pinned that turn, suppressed the next, clear the third, as the WWII minutes and the 3–4 s a round say |
| Radii | unchanged (30/75/125 m, 65/125/200 m) | decision 79 |
| Halving every turn, the roof's 0.5 | unchanged | |

What it does, by arithmetic:

| Fire on a force | Now | Proposed |
|---|---|---|
| One 81 mm bomb at 50 m, fresh force | 12.5 — none | 25 — suppressed |
| One bomb within 30 m | 25 — suppressed | 45 — pinned |
| A whole mission (24 bombs) | 100, then 50, 25 — **two turns pinned** | 50, then 25, 12 — **one turn pinned** |
| Missions every turn, without end | 100 every turn | settles near 67 — pinned |
| An even chance every turn | — | settles near 40 — on the edge of pinned |

**The effect expected**, not yet measured: a few rounds do *more* than
now — a single near bomb pins — but a mission does about half, and a
defence comes up a turn sooner after every one. Against the attacker,
whose twelve missions are what pins the 3:1 defence. Measured exactly
as decision 91 was.

**Not proposed**, for want of numbers: a burst behind a force
suppressing less (SUPEX IIIB has it, but the game would need the
force's facing for every shell); a factor for an open fighting position
(SUPEX IIIA found none for the 81 mm); demoralisation that outlasts the
fire (British OR: hours of heavy fire — the slow pool of will, decision
64, already carries a bombardment's nerve).
