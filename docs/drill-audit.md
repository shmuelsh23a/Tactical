# The drill audit: every drill against doctrine (2026-10-21)

The author's plan after decision 112 (handoff, 2026-10-21): before any
balance ruling, check every drill against doctrine, fix what diverges as
its own ruling, then re-measure. This is step 1, the reading. Nothing here
has been changed in code yet; each divergence waits on a ruling.

[doctrine-gap.md](doctrine-gap.md) (2026-10-11) was the earlier, partial
pass over the attacker's squad drill. This one covers all five places a
drill lives:

| Area | Where | What plays it |
|---|---|---|
| The plain drill | `PLAIN_SCRIPT`, `drill.ts:308` | the computer attacker and defender, the harness, the reference plans, the AI commanders |
| The Western and doctrinal drills | `WESTERN_DRILL`, `DOCTRINAL_DRILL`, `drill.ts:345`/`384` | `--drill western`/`doctrinal` only |
| The attacker's company | `company.ts`; the attacker in `computerSide.ts` | every attack |
| The defender | `computerSide.ts`, the defender's paths in `drill.ts` | every defence |
| The fight inside | `src/engine/interior/resolver.ts` | every house fight |

**Method.** Each behaviour was traced in the code, looked up in the corpus
by doctrine's own term (`tools/doctrine.py --find`, never an unconfirmed
`--semantic` hit), and given one verdict: **matches**, **diverges**,
**doctrine silent**, or **layer/plan** — a leader's (asterisked) step or a
plan choice, which is the company's or the player's and not the drill's
(doctrine-handoff.md). Impact is a judgement from the code, **not
measured**. Paragraphs are ATP 3-21.8 (2024) unless named; "BD2" is Battle
Drill 2, *Conduct a Platoon Assault*, and "2A" is the squad assault, both
TC 3-21.76 (2025) ch. 8; company paragraphs are ATP 3-21.10; interior
paragraphs are ATP 3-06.11 (2024) appendix C.

Checked by hand against the code, not only the auditors' word: the split
fire team losing its platoon (A3), the defender's guns held to 400 m (D1),
and that nothing in `src/engine` models fire hitting one's own troops
(A2). Quotes checked by hand: BD2's lift-or-shift, C-67, C-107.

## The divergences, heaviest first in each area

### The attack (drill and company)

| # | What the code does | What doctrine says | Impact |
|---|---|---|---|
| A1 | The browser attacker's plan, and any plan without a "support" platoon, sends every platoon in at once; when a support platoon exists, nothing holds the assault until it is set (`company.ts:759`, `computerSide.ts` `BROWSER_ATTACK_PLAN`) | ATP 3-21.10 2-170: "All forces supporting the assault force should be set in their support by fire positions before the assault force crosses the probable line of deployment" | high |
| A2 | `PLAIN_SCRIPT`'s base of fire keeps firing at the position being assaulted; it never lifts or shifts (`shiftToFarFlank` unset). No friendly fire exists, so this is free suppression | BD2 13b(3), unasterisked: the base of fire is signalled "to lift or shift direct fires to the opposite flank" | high, and may carry part of decision 112's jump |
| A3 | **A bug, doctrinal drill only:** a squad's split-off fire team is not in `platoonOf` (filled once, `company.ts:345`), so it defaults to "assault" (`drill.ts:1224`) — half of every support squad within 300 m goes in alone, and counts as "our assault" in `farFlankOnly`, emptying the base of fire's targets | 2A 6b: the team in contact "becomes the support by fire team" | high (doctrinal only) |
| A4 | Western and doctrinal: an attacking squad below half its ready men runs 150 m back and stays out (`breakContact: {0.5, 150}`) | Break Contact (07-PLT-D9505) begins "on orders"; a squad that cannot go on suppresses (BD2 13c) | high (W/D only); the doctrinal drill's own comment already flags it |
| A5 | Once any enemy is known, half the squads bound 100 m and half halt **where they stand**; inside 150 m a bound ends at a point, not in cover (`drill.ts:1361–1383`) | BD2 10: squads not in contact "take up covered and concealed positions in place"; 13b(6)(e): the moving team "proceeds to the next covered position" | medium–high |
| A6 | The target is the nearest enemy, all round (`sectorWidth: 360`) — both sides | BD2 11a(1): "enemy weapons that are firing most effectively against it"; A-3: "destroy the greatest threat first … crew-served weapons"; A-6: "avoid target overkill" | medium (attack), high (defence, D2) |
| A7 | `PLAIN_SCRIPT` has no consolidation; the doctrinal one triggers on distance to the objective point, not on the position being seized, and its base of fire never moves up | BD2 14 (unasterisked): local security, sectors, OPs; 14b the base of fire moves up; ATP 3-21.10 2-181–2-183 | medium (feeds decision 60's counterattack) |
| A8 | The priority target stays on the briefed point, error and all (`computerSide.ts` ~586) | ATP 3-21.10 2-173: "final adjustments … to reflect the actual versus the planned tactical situation" | medium |
| A9 | When the assault is spent, `recommit` sends the **base of fire** in and keeps the reserve back (`company.ts:816`) | ATP 3-21.10 2-130: the reserve restores "momentum to a stalled attack"; 2-176: the support element "must not reduce its suppressive fires" | medium (when a reserve is in play) |
| A10 | Doctrinal: the 2A support team holds for the rest of the battle — never shifts, never rejoins, left out of consolidation and house clearing | 2A 8c (shift), 12b (moves to designated positions) | medium (doctrinal only) |
| A11 | `returnFire` sorts by hits received, then applies the sector filter — a flanking gun is ignored while anything is in the arc | BD2 11a(1); 2A 6c(2) "crew-served weapons first" | medium |
| A12 | `WESTERN_DRILL` never got decision 112 (no `machineGuns`, no `baseOfFirePosition`) | para 3-102, C-119 | medium for any W comparison |
| A13 | Hold-short squads stop wherever they are within 200 m — in the open, unscreened | ATP 3-21.10 2-172: "deploys into covered positions, screens its positions with obscuration" | low–medium |
| A14 | Screening smoke reaches 100 m (rifle grenade), but a base of fire sits at 150 m or more, so it can never screen | BD2 11a(3) | low–medium |
| A15 | Smaller: the 2A assault team halts twice (its own overwatch and the turn alternation); `leaderForward` also moves the company HQ; `boundByPlatoon` off once contact is expected (2-16, 2-20); rear security issued at release rather than at BD2 *12b; decision 112's vantage point ignores cover (para 3-102 asks "best possible cover and concealment" too); `attackerPlan`'s frontage is laid on x whatever the axis | — | low |

Recorded and **not re-proposed**: mortars lift at 100 m, inside the
81 mm's danger close (decision 63, S4); `holdShort` against BD2's step-12
note (ruled 2026-10-11).

### The defence

| # | What the code does | What doctrine says | Impact |
|---|---|---|---|
| D1 | The hold-fire order caps **every** weapon at `openFireRange` (400 m), so a defender's machine gun, given 800 m by decision 90, never fires past 400 (`drill.ts:1169`, `game.ts:3321`) | 5-208: "separate trigger lines for each weapon or type of weapon system"; 5-123: engage at long range to disrupt the momentum | medium–high (Tel Azeka has two guns) |
| D2 | Nearest enemy, 360° (A6): every defender piles onto the leading attacker; the base of fire and its guns go unanswered | A-3, A-6 as above; 5-207 sectors by engagement priority | high |
| D3 | The mortars ignore squads breaking contact and reserves going in (`computerSide.ts:272–320`) | 5-72: fires "screen friendly movement during disengagement and counterattacks"; 5-37 | medium — may be part of why Break Contact never pays (decision 109) |
| D4 | Each squad opens fire on its own when the enemy crosses 400 m: piecemeal, the nearest gives itself away alone | 5-208: a trigger line "to initiate and mass fires"; A-32 | medium |
| D5 | An uncommitted reserve holds fire even when it is itself attacked (decision 105) | 5-67: reserves "must be prepared to react to this targeting" | low–medium; **touches decision 105** |
| D6 | Smaller: no planned fires behind the positions (B-17) or at long range; no move to the alternate position under shellfire (`displace` off; 5-22); the counterattack runs straight at the enemy (3-105 asks for "a new or unexpected direction") | — | low |

Matches: the FPF and its call (B-18, B-19), the priority target and
immediate suppression (ATP 3-21.10 D-24/25), the house defence (decision
106), Break Contact's execution (decision 107), restoring a lost position
(4-163).

### The fight inside

| # | What the code does | What doctrine says | Impact |
|---|---|---|---|
| I1 | Nobody is left in a cleared room, stair or exit; the whole team moves on. With counterattacks on (the default) a lone defender walks back in; with them off, an empty cleared room blocks defenders — free security | C-107: clearing "requires leaving forces behind to secure entrances to uncleared rooms, building exits, stairways … Even without casualties, this can quickly drain" the squad | high |
| I2 | A man put out halts his whole team for 600 s in any phase, mid-doorway included | C-63: a soldier who falls in the entryway "should stay down until the room is clear"; care comes at consolidation | high |
| I3 | #3 and #4 go to the **far** corners — the defender's own corner (the code's comment cites C-67 for it) | C-67: the four points are "the two corners on either side of the door and at least one meter to the left and to the right of the entry point" | medium–high |
| I4 | Every team clears its own room at once; nobody overwatches the hallway | C-106: teams "take turns, bounding … While one fire team clears a room, another normally provides overwatch in the hallway" | medium |
| I5 | Teams are the fit men in fours, leaders included, with a remainder (9 men → 4/4/1) that runs the four-man drill alone | C-79: the base element "remains the four-Soldier fire team"; C-108: squad leaders "do not get into stacks" | low–medium |
| I6 | All four walk into dead space at a hidden enemy | 2A/D9509 note: #1 and #2 "may move deeper … while overwatched by the other team members" | low–medium |
| I7 | Smaller: a grenade thrown up the stairs (C-103: "avoid throwing grenades upstairs"); all four always enter (no "short room"); cleared rooms not marked | — | low |

Not exposed to the player yet, though doctrine makes them the leader's:
the entry point or breach (always the front door), the room order, and
top-down by an inside stairwell (C-110).

## The author's rulings (2026-10-21, evening)

Every option the recommended one:

1. **The reference drill is the doctrinal one, fixed** (A3, A4, A10
   first). The harness, `jev-sim` and the computer move to it; the plain
   drill stays as a recorded "untrained" variant to compare against.
2. **Lift or shift as written** (A2): the base of fire drops targets within
   100 m of its own assault. ⚠️ The reason doctrine gives — the risk of
   hitting one's own men — is not modelled.
3. **The assault holds until the support is set** (A1): assault platoons
   wait at the assault position until each support platoon is in place
   with eyes on, and the browser computer's plan gets a support platoon.
4. **Inside, one man stays at each held exit** (I1): the remainder man
   first; a room is retaken only with no attacker in it.
5. **A defender's machine gun has its own trigger line** at its reach
   (D1); rifles keep theirs.
6. **Greatest threat first, both sides** (A6/D2): who is firing on us,
   then crew-served weapons and vehicles, then the nearest — before the
   sector — and no piling onto a target already pinned.
7. **A reserve fires when it is attacked** (D5), amending decision 105:
   shot at, or an enemy inside assault range.
8. **The clear-cut ones are fixed without a card each**, each recorded as
   a rules decision: I2, I3, I4, I5, I7's grenade; A5, A7, A8, A9, A14;
   D3, D4.

Not ruled, left as they are: A12 (Western is no longer the reference),
A13, A15, D6, I6, I7's short room and marking, and the plans not yet
exposed inside.

## Not checked

Turn length against "no more than five seconds" rushes; where doctrine
places a reserve; the harness's per-scenario plan flags; whether any
explosive hits friendly troops; morale inside (not a drill question).
