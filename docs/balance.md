# Balance sheet — every number that was chosen

The document's own figures are transcribed verbatim in
[`src/engine/data/`](../src/engine/data) and are **not** on this list: they are
not ours to tune. This is everything the game needs that the document does not
give, gathered in one place because the author has twice said *tentatively —
until we work on balance*.

Each row says who chose it and where it lives. "Author" means he gave the
figure; "ours" means the code needed one and the README records the reasoning.

## Detection and concealment (rules decision 12)

[`src/engine/data/concealment.ts`](../src/engine/data/concealment.ts)

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `OBSERVATION.stationaryBonus` | **+10%** | author | A force in position observes continuously and is not distracted by its own movement. Makes a defender see an attack coming. |
| `OBSERVATION.runningExposure` | **+10%** | ours | How much easier a running force is to find. The author gave the direction only. |
| `OBSERVATION.contactExpiryTurns` | **3 turns** | author | A contact nobody refreshes falls off the map. |
| `COVER_CONCEALMENT.partial` / `.full` | **-10% / -20%** | ours | How much harder cover makes a force to find. The author gave the direction only. |
| `DIG_IN.startsAfterTurns` | **3 turns** | author | Stationary turns before a force in the open starts digging. |
| `DIG_IN.turnsPerLevel` | **2 turns** | author | Work per level of protection, capped at "behind cover". |
| `CAMOUFLAGE.perStep` / `.turnsPerStep` / `.max` | **-10% / 2 turns / -50%** | author | Camouflage accrues while the force stays put, and is lost the moment it moves. |
| `CAMOUFLAGE.floorIsConcealedChargeChance` | **on** | author | A camouflaged force is never harder to find than a buried charge (30% walking, 5% running, inside 20 m). Without it, full camouflage made a force literally unfindable. |
| Scout beats the floor | **by its own bonus** | author | So looking properly stays the answer to a camouflaged position. |
| `SCOUTING.detectionBonus` | **+10%** | ours | What scouting is worth. The author gave the direction only. |
| `SCOUTING.maxGait` | **normal** | author | A scouting force walks. |

**Interactions worth knowing before tuning any of these.**

- The hidden band's base is **30%**, and the camouflage floor is that same
  figure — so at full camouflage, cover and camouflage cancel an observer's
  bonuses and no more. Lower the floor and a camouflaged position becomes very
  hard to find again; raise the scouting bonus and scouts become the only way to
  find one.
- Hidden means *stationary*, so a defender that never moves is only findable
  inside **20 m**, by fire, or by a UAV. That is the single biggest lever on how
  an attack plays: it is why the demo's BLUE advances blind.
- Digging in reaches full cover at **7 stationary turns**. A demo battle runs
  4–6 turns, so in practice only a force that started in cover ever has it.

## Sectors of observation (rules decision 14) — settled, not open

[`src/engine/data/concealment.ts`](../src/engine/data/concealment.ts)

Listed for completeness rather than for tuning: the document has no sector rule
at all, so every figure here was invented — but the author settled the shape
*and* the sizes on 2026-08-16, so none of it is awaiting a verdict the way
decision 12's `tentative` figures are.

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `OBSERVATION_SECTOR.attentionBudget` | **13.5 %·°** | author | Divided by the arc's width: **+23% at 60°, +15% at 90°, +8% at 180°**. |
| `OBSERVATION_SECTOR.outsidePenalty` | **-20%** | author | Flat, whatever the width — the cost of looking elsewhere. |
| `OBSERVATION_SECTOR.maxBonus` | **+30%** | author | However thin the arc is drawn, watching it is never a certainty. |
| `OBSERVATION_SECTOR.defaultWidth` | **90°** | author | The frontage a sector covers unless narrowed or widened. |

**The one interaction to preserve if any of these ever moves.** The bonus is
divided by the width and the penalty is not, which is the only thing making the
width a decision. An earlier cut paid a **flat** bonus at every width, and the
widest arc then dominated every narrower one outright — widening only converted
a penalised direction into a bonused one, so the control existed solely to
punish a player for using it. Any change that decouples the bonus from the width
brings that back. Two guards are already in the data: a **360° arc is worth
zero** (otherwise it collects the bonus everywhere with no ground outside to pay
the penalty) and the sector **raises the camouflage floor but never lowers it**
(otherwise a running observer facing away has a floor of exactly zero, and
decision 12 says a camouflaged force can never be impossible to find).

## What a player is told (rules decision 13)

[`src/app/debriefText.ts`](../src/app/debriefText.ts) — `casualtyReport`

| Figure | Value | Whose |
|---|---|---|
| Casualty bands | **0 / 1–2 / 3–5 / 6+** → `ללא נפגעים שנצפו` / `נפגעים בודדים` / `מספר נפגעים` / `אבידות כבדות` | ours (that reports are banded is ✅; where the bands fall is not) |
| "No observation" line | `N יורים ב-X% — ללא תצפית על המטרה` | ✅ author, decision 13 | Fire at a force the side held no contact on: its own shooters and chance, no effect. The wording, not a number — but it is the one place the disclosure line is visible to a player, so keep it saying nothing about the target. |

Two properties to keep in mind if these move: the bands are **honest** (a player
is told less, never told something false), and they apply to the live combat log
during play as well as to a per-side debrief. The umpire's view is exact and is
where the tally belongs.

## Elevation and objects (rules decision 15)

[`src/engine/data/terrain.ts`](../src/engine/data/terrain.ts)

The author settled the shape on 2026-09-06 and said of every figure "we will
tweak later when we get to balancing — write it down". So: written down.

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `EYE_HEIGHT.infantry` | **1.5 m** | author (tentative) | Where a standing force sees from, and how tall it stands to be seen. |
| `EYE_HEIGHT.vehicle` | **2.5 m** | author (tentative) | A tank looks out of its hatches, and is that much easier to see over a rise. |
| `EYE_HEIGHT.fullCover` | **0.5 m** | author (tentative) | A force in full cover keeps its head down: harder to see over a crest, sees less over it. The cost digging in never had. |
| Sight is binary and symmetric | **on** | author (tentative) | No hull-down or partial-defilade state; whoever can see can be seen. |
| `OBJECT_COVER` | **building full / wall partial / tree partial** | author (tentative) | The cover a force takes from what it stands in or against. |
| `OBJECT_COVER_REACH_M` | **3 m** | ours | How near counts as "against" — the reach that gives a force an object's cover, and that marks the object as its own on a sight line. |
| `OWN_OBJECT_SIGHT_M` | **6 m** (twice the reach) | ours | How far along its line a force ignores its own object's faces: both faces of the wall it lies behind, never the far wall of the building it stands against. A force deep inside a large building therefore cannot see out past a wall more than 6 m off — a windowless reading, his to change. |
| `OBJECT_HEIGHT_M` | **building 6 / wall 1.5 / tree 4 m** | ours | What an object blocks when the map gives it no height of its own. |
| `LOS_SAMPLE_STEP_M` | **5 m** | ours | How finely the ground is sampled along a line; objects are tested exactly. |

**Settled 2026-09-06 (he picked from our suggestions; figures tentative):**

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `SLOPE.climbCostPerMetre` | **8 m** of the bound per metre climbed (Naismith); descent free | author (tentative) | Makes the high ground cost what it is worth. A 10% slope costs 1.8 m of budget per metre, so a walking bound uphill is ~28 m, not 50. |
| `SLOPE.vehicleMaxGradeDeg` | **30°**, up or down | author (tentative) | A vehicle refuses a steeper bound, descending as well as climbing; a standing order across such a patch reports `grade too steep` every turn until replaced, since an order stands until it is. Infantry takes anything. On the demo map about one 50 m bound in 500 exceeds it. |
| Height and hit chance | **none, for now** | author | The sight lines already reward height; the alternative kept on file is +10% additive for a shooter ≥ 10 m above its target. Revisit at balance. |

**Interactions to keep in mind.**

- Eye height and cover are one rule read twice: full cover *lowers* the eye.
  Change `EYE_HEIGHT.fullCover` and both the protection and the blindness of a
  dug-in force move together — which is the point.
- The demo's dead ground is measured: BLUE-2 running straight at RED-1's
  position from the northern low ground was seen by nobody on turn 1 at 176 m
  (**0/200 seeds**, inside the 300 m band) and by someone on turn 2 at 76 m
  (**200/200**, RED-1 itself in 185). Change the eye heights and re-measure.
- Object cover is taken at placement and at upkeep, and **outlives the object
  until upkeep**: a force that leaves a building and runs keeps the building's
  full cover — and its 0.5 m eye — for that turn's fire phase. That is the
  dig-in shape (decision 12 clears at upkeep) applied to a thing more
  conspicuous than a scrape; worth revisiting with the eye heights.
- A recording carries its ground. Replaying an older, groundless recording on a
  map with ground is not a thing the code does — it replays flat, as played.

## Rules the document is silent on

| Figure | Value | Whose | Where |
|---|---|---|---|
| Smoke screen radii | **25 / 50 / 100 m** (grenade / mortar / artillery) | ours, decision 9 | [`data/smoke.ts`](../src/engine/data/smoke.ts) |
| Charge trigger radius | **10 m** of the path walked | ✅ author, decision 10 | [`combat/mines.ts`](../src/engine/combat/mines.ts). Keep it **below** the 20 m search band: the gap between the two is the ground where a walking force finds a charge without treading on it, which is the only thing its 30% roll buys. Raise it to 20 m and the search stops being a hedge and becomes the sole guard. |
| Assault reach | **25 m** | ✅ author, decision 11 | [`combat/assault.ts`](../src/engine/combat/assault.ts) |
| Grenades per assault | **0–3, no ammunition tracked** | ours, decision 11 | UI |
| Indirect fire | **one mission + one screen per side per turn** | ✅ author, decision 8 | UI limit over an engine that models `roundsPerTurn`. Correct *for the platoon-leader slice* — a platoon commander calls for fire, he does not own a battery. Replaced by a real battery unit at battalion and above (backlog 3), so retune this only within the current echelon. |
| Laying a charge in play | **2 turns** of work | ✅ author, decision 16 | [`data/engineering.ts`](../src/engine/data/engineering.ts). "Tentatively 2 turns" — his word, 2026-09-16. What the turns *cost* was ours and is now his (confirmed 2026-09-16): a turn in which it moves, fires, **is hit** or is neutralised loses the work outright rather than banking it, and starting the work replaces the force's standing order. Shorten the work and a charge becomes a routine move; let the work be banked across interruptions and the cost stops being two quiet turns at all. **Unbounded**: no stock, no cooldown — a force that keeps surviving may keep laying, and for a force that was going to sit still anyway the two turns are free. Raised with the author 2026-09-16 and **deferred to ammunition (backlog 12)** at his word — the limit belongs there, not here. |
| Who may lay one in play | **an insurgent or special force** | ✅ author, decision 16 | A `canLayCharges` flag the scenario sets, until force *types* arrive with echelon scaling (backlog 3). The demo gives it to RED-1 so the rule can be played — ⚠️ ours, and one line to delete when types land. |
| Covering-fire sampling step | **5 m** along the bound | ours, decision 18 | [`combat/covering.ts`](../src/engine/combat/covering.ts). How finely a bound is walked looking for the first place a covering force could shoot. It is an occlusion question, not a cover one: a gap between two objects narrower than 5 m can be stepped over by the sampler, so a mover can cross a narrow slot unshot. Smaller is more faithful and costs a sight test per step. |
| Fog-of-war fallback radius | **300 m** (`SPOT_RANGE_M`) | ours | [`app/hotseat.ts`](../src/app/hotseat.ts) — only used when `trackIntel` is off |
| What-if runs | **20** | ours | [`app/whatIf.ts`](../src/app/whatIf.ts) — a UI choice, not a rule |

## Morale and suppression (rules decision 19)

**The whole section is ours.** The document has no morale; the author gave the
shape on 2026-09-22 — six traits of 1–10, leadership as INT + WIS + CHA, a
starting pool between the scenario's minimum and 100, a live leader bonus up
to battalion, the 50 / 30 / 10 thresholds, a separate suppression layer, states
on screen, hard and capped recovery, charisma ÷ 2 as the fallback — and every
magnitude below filled it in. All of it lives in
[`data/morale.ts`](../src/engine/data/morale.ts).

| Figure | Value | Whose | What it does |
|---|---|---|---|
| Thresholds | **50 / 30 / 10** | author | Wavering (tested every few turns) / shaken (every turn) / broken. |
| Fallback bonus | **charisma ÷ 2** | author | Out of every leader's reach. |
| Leadership | **INT + WIS + CHA** | author | Leaders only. |
| `TRAIT_DICE` | **⌈(d10 + d10) ÷ 2⌉** | ours | Traits 1–10, mostly average. |
| `MOTIVATION_FLOOR` | **40 / 50 / 60 / 70 / 85** | ours | The scenario's minimum, by motivation (poor → fanatic); the pool is the mean of two draws from there to 100. |
| `EXPERIENCE` | **−10 / 0 / +10 / +15** to tests; suppression **×1.25 / 1 / 0.8 / 0.7** | ours | Green → elite. |
| `WAVERING_TEST_INTERVAL` | **3 turns** | ours | The author's "every few turns". |
| `TEST` | pass on d100 ≤ **E + 30 + 2 × WIS** + experience | ours | ~90% at 50, ~70% at 30 for an average man. |
| `EVENT_TEST_LOSS` | **12** | ours | A turn that costs a man this much tests him at once. |
| `HEROIC` | d100 ≤ **2 × luck**; **3 turns**; +10 pool; squad +5; aim ×1.25 | ours | A failed test turned to heroism. |
| `LEADER_BONUS` | leadership **÷ 3**, halved per link, **±15** cap | ours | The live chain-of-command bonus. |
| `LEADER_REACH_M` | **300 / 500 / 1000 m** | platoon and company from the פו"ש table; battalion ours | How far a commander's bonus carries. |
| `FALLBACK_RADIUS_M` | **50 m** | ours | Who counts as "closest" for the fallback. |
| `LOSS` | fired on **1**, shelled **5**, hit **6**, comrade hit **1**, comrade down **6**, friend nearby down **2**, squad leader down **15**, commander down **10**, flanked **8**, outnumbered **3**, enemy armour **4**, friends broke **8**, comrade broke **4**, rout **10**; cap **30**/turn | ours | What a turn takes from a man. |
| `GAIN` | drew blood **3**, put a force out **6**, quiet **2**, rest **4**, own armour beside **1** | ours | Never past the ceiling. |
| `PERMANENT_LOSS_SHARE` | **½** | ours | Share of every loss that lowers the ceiling for good. At ceiling ≤ 10 a man is dry. |
| `RALLY` | **2 × leadership** + experience − **15** per earlier rally − **20** under fire; commander within **50 m**; back to **20 + leadership ÷ 2** | ours | "Hard", the author's word. ~33% for an average leader, once. |
| `CORNERED_M` | **50 m** | ours | Twice the assault range: break here and surrender. |
| `ROUT_DISTANCE_M` | **200 m** | ours | How far a force with no commander runs. |
| `FORCE_BREAK_SHARE` | **½** | ours | Broken + down; the document's own attrition fraction. |
| `SIDE_BREAK_SHARE` | **⅔** | ours | The side's breaking point. |
| `SUPPRESSION` | burst **10 + 5/hit**, MG **×1.5**, RPG **15 (+15 hit)**, shells **25**, charge **20**, assault **30**; max **100**; suppressed **15**, pinned **40**; halved every turn | ours | The fast layer. |
| `SUPPRESSION_EFFECT` | suppressed aim **×0.75**, nerve **−5**; pinned **×0.5**, **−10** | ours | |
| `STATE_ACCURACY` | wavering **×0.9**, shaken **×0.75** | ours | Morale changes performance. |

**Measured, 2026-09-22** (300 seeds, two squads trading rifle fire at 150 m,
command groups 200 m back): without morale the loser is neutralised at a median
turn 12 (p10 9, p90 16), 4.1 men down; with it, median turn 11 (p10 7, p90 14),
**273/300 routs**, 2.3 down and 2.5 broken. A sustained MG at 150 m: turn 4
either way, 124/300 routs. **The first cut priced every 1d4 hit as a serious
wound and routed squads at turn 7 with 0.9 men down** — morale out-killing the
dice. That ratio is the thing to re-measure after any change to `LOSS`.

## The balance harness: 2,400 battles, 2026-09-22

`npm run balance` plays headless battles between **Western (NATO-organised)
forces** and prints the table below. The harness is
[`src/sim/balance.ts`](../src/sim/balance.ts) (checked by the suite), and the
runner is [`tools/balance-sim.ts`](../tools/balance-sim.ts). Its options are
listed at the top of the runner. **Rerun it after any change to a number on this
page.**

**The forces.**
- Squad: 9 men.
- Platoon: 3 squads, a 6-man weapons squad and a 3-man HQ, 36 men.
- Company: 3 platoons, a 5-man HQ and one 60 mm mortar mission a turn, 113 men.

The weapons squad fires small arms, because the document's table is
נק"ל\מקלעים.

**The doctrine** is a script, not a player:
- Out of contact, everyone advances.
- In contact, half the force bounds while the other half is the base of fire.
- Every force fires at the nearest enemy its side knows of, and assaults inside
  25 m.
- Command groups follow 80 m behind their forces.
- A defender holds a prepared position (partial cover, digging in from there)
  and covers its front (חיפוי) when nothing is in reach.

Fog of war and C2 are both on. The ground is **flat and open**, so what is being
measured is the rules alone, played plainly: no smoke, no flanking, no use of
ground.

**The fights.**
- `meeting`: mirror forces advance on each other.
- `attack3`: about 3–4:1 on a prepared position — a squad on a fire team (9 v 4),
  a platoon on a squad (36 v 9), a company on a platoon (113 v 36).
- `attack2`: about 2:1 — 9 v 5, 36 v 18, 113 v 72.
- `attack1`: 1:1.

Each cell is 100 battles, seeds 1000–1099.

**How a battle ends.**
- `broke`: the loser's side broke.
- `wiped`: every one of its units is out, the game's own rule.
- `fightersGone`: every fighting force is out but a command group lives — see
  finding 4.
- `both`: both sides went in the same step, a draw.

| Kind | Echelon | Morale | Men (B v R) | BLUE / RED / draw | Endings | Turns, median (p10–p90) | Loser down | Winner down | Routs | Surrenders | Heroes | Rallied | Pinned share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| meeting | squad | on | 9 v 9 | 49% / 43% / 8% | broke 92, both 8 | 11 (8–13) | 35% | 11% | 0.51 | 0.44 | 0.64 | 0.21 | 27% |
| meeting | squad | off | 9 v 9 | 56% / 43% / 1% | wiped 99, both 1 | 12 (9–15) | 61% | 25% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| meeting | platoon | on | 36 v 36 | 30% / 67% / 3% | broke 97, both 3 | 10 (9–11) | 36% | 20% | 0.11 | 1.59 | 1.20 | 0.09 | 62% |
| meeting | platoon | off | 36 v 36 | 40% / 59% / 1% | fightersGone 98, wiped 1, both 1 | 11 (10–14) | 59% | 35% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| meeting | company | on | 113 v 113 | 53% / 35% / 12% | both 12, broke 88 | 10 (10–11) | 32% | 24% | 4.83 | 2.55 | 3.29 | 1.93 | 71% |
| meeting | company | off | 113 v 113 | 55% / 42% / 3% | both 3, fightersGone 97 | 17 (15–20) | 73% | 64% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | squad | on | 9 v 4 | 96% / 4% / 0% | broke 100 | 15 (13–18) | 35% | 2% | 0.46 | 0.15 | 0.23 | 0.09 | 5% |
| attack3 | squad | off | 9 v 4 | 100% / 0% / 0% | wiped 100 | 15 (12–19) | 65% | 4% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | platoon | on | 36 v 9 | 100% / 0% / 0% | broke 100 | 12 (11–13) | 36% | 0% | 0.53 | 0.23 | 0.31 | 0.20 | 55% |
| attack3 | platoon | off | 36 v 9 | 100% / 0% / 0% | wiped 100 | 13 (12–14) | 65% | 1% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | company | on | 113 v 36 | 100% / 0% / 0% | broke 100 | 11 (11–12) | 34% | 8% | 2.59 | 0.01 | 1.30 | 0.88 | 64% |
| attack3 | company | off | 113 v 36 | 100% / 0% / 0% | fightersGone 62, wiped 38 | 13 (12–14) | 60% | 13% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | squad | on | 9 v 5 | 86% / 11% / 3% | broke 97, both 3 | 17 (14–21) | 44% | 6% | 0.59 | 0.12 | 0.23 | 0.17 | 6% |
| attack2 | squad | off | 9 v 5 | 97% / 3% / 0% | wiped 100 | 17 (15–21) | 69% | 10% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | platoon | on | 36 v 18 | 100% / 0% / 0% | broke 100 | 15 (14–16) | 41% | 4% | 0.75 | 0.21 | 0.74 | 0.47 | 37% |
| attack2 | platoon | off | 36 v 18 | 100% / 0% / 0% | wiped 100 | 16 (15–17) | 66% | 10% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | company | on | 113 v 72 | 21% / 74% / 5% | broke 95, both 5 | 15 (14–16) | 27% | 22% | 8.80 | 0.03 | 3.96 | 3.83 | 55% |
| attack2 | company | off | 113 v 72 | 53% / 43% / 4% | fightersGone 75, both 4, wiped 21 | 21 (19–23) | 71% | 57% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | squad | on | 9 v 9 | 15% / 81% / 4% | broke 96, both 4 | 18 (15–22) | 27% | 8% | 0.93 | 0.09 | 0.38 | 0.49 | 8% |
| attack1 | squad | off | 9 v 9 | 19% / 80% / 1% | wiped 99, both 1 | 22 (18–25) | 58% | 21% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | platoon | on | 36 v 36 | 1% / 99% / 0% | broke 100 | 17 (15–18) | 26% | 15% | 1.85 | 1.20 | 1.45 | 1.26 | 60% |
| attack1 | platoon | off | 36 v 36 | 7% / 93% / 0% | fightersGone 98, wiped 2 | 20 (19–23) | 59% | 29% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | company | on | 113 v 113 | 0% / 99% / 1% | broke 99, both 1 | 14 (13–15) | 26% | 16% | 9.83 | 0.04 | 4.19 | 3.75 | 65% |
| attack1 | company | off | 113 v 113 | 0% / 100% / 0% | fightersGone 100 | 19 (17–21) | 63% | 34% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |

**What it says.**

1. **Morale does what it was built for.** Without it:
   - The loser of an even fight is destroyed to 59–73% of his men, and at
     company scale the winner loses 64% as well, over 17 turns.
   - With it, the loser breaks at **32–36%** at every echelon. The winner loses
     11–24%, and battles last about 10 turns.

   Breaking at about a third is the right order of magnitude for real units.
2. **No side is favoured.** The mirror fights split within chance at 300
   battles a cell (`--n 300 --kinds meeting --morale on`):

   | | squad | platoon | company |
   |---|---|---|---|
   | as played | 43 / 49 / 8 | 41 / 53 / 5 | 46 / 42 / 12 |
   | `--swap` | 43 / 49 / 8 | 43 / 52 / 5 | 44 / 41 / 15 |
   | `--fair-ties` | 41 / 53 / 6 | 48 / 47 / 5 | 51 / 41 / 8 |
   | `--fair-ties --swap` | 41 / 53 / 6 | 47 / 46 / 8 | 50 / 36 / 13 |

   BLUE / RED / draw, in percent. The standard error on a share is about 3
   points, and no lean survives both the swap and the fair ties. **The
   initiative tie-break does favour RED**: `rollInitiative` gives a tie to the
   side listed first, so RED moves and fires first on **55%** of turns. But
   what that is worth in wins is below what 300 battles can detect (under ~5
   points). It is still a bias with no reason behind it, and is ⚠️ open: the
   document says 1d10 a side and nothing about ties.
3. **An attack is close to a switch, and the attacker who wins barely
   bleeds.**
   - A dug-in defender holds 81–99% of the time at 1:1.
   - At 2:1 the attack succeeds 86–100% at squad and platoon.
   - At company level, 1.6:1 fails (21%) and 3:1 succeeds (100%). That is the
     textbook 3:1 rule, but the platoon and squad fights tip at about 2:1.
   - Worse, a successful attacker at 3–4:1 loses **0–8%** of his men against a
     defender's 34–36%. Three rules combine to do it:
     - **An assault is one-sided** (`resolveAssault`): only the attacker fires.
       The defender does not reply unless it happened to be covering.
     - **Ordinary fire never applies the document's movement modifier** (+30%
       against a walker, −20% against a runner). Only covering fire does
       (rules decision 18), so a bounding attacker is no easier to hit than a
       stationary one.
     - **Cover is lost the moment a defender fires**: the document's own rule
       drops full cover to partial, −10%. A defender that shoots back is barely
       protected.

   All three are rules questions — ask the author, do not tune around them.
4. **A battle without morale cannot end while a command group lives.**
   `sideDefeated` ([`app/hotseat.ts`](../src/app/hotseat.ts)) wants **every**
   unit neutralised, command groups included, and a hidden HQ with nobody left
   to command is never found. **62–100%** of the platoon and company battles
   without morale ended that way (`fightersGone`); the game itself would have
   played on for ever. With morale on, `sideBroken` leaves command groups out
   and catches it — and both scenarios play with morale — so this bites only a
   game built without it. The fix is the same exclusion. ⚠️ Not made: it
   changes a victory condition, which is backlog 18's and the author's.
5. **Suppression piles up with numbers.** Every force shoots at the nearest
   enemy, so several bursts land on the same one. In platoon and company
   fights **55–71%** of the force-turns spent under suppression were pinned,
   against 5–27% in squad fights. If that feels wrong in play, the lever is
   `SUPPRESSION` (a cap per turn, or diminishing returns per extra firer), not
   the thresholds.
6. **Surrender is common where forces break at close range**: 1.6 squads in
   an average platoon meeting engagement, against 0.1 routs, because the
   bounding closes inside the 50 m `CORNERED_M` before the break comes. In
   attacks the defender routs instead. Whether that is the feel wanted is the
   author's call.
7. **The rare events are rare**, as asked:
   - Heroes: 0.2–4 per battle, rising with the number of men.
   - Rallies: 0.1–3.8 men per battle, and mostly at company scale, where a
     command group is near enough to get to them.

## Rulings 1–3 on trial: the sweep, 2026-09-23

The author asked for three of the harness's questions to be settled by
measurement. Each candidate answer is a switch in
[`engine/data/variants.ts`](../src/engine/data/variants.ts), off by default:

- **Ruling 1, the assault.** Does the defender fire back?
  - 1a: yes, at the assault's 70%.
  - 1b: yes, at its ordinary 30% inside 100 m.
  - Both are simultaneous: the defender replies with the men it had before the
    assault landed.
- **Ruling 2, the movement table's +30% / −20% in ordinary fire.**
  - 2b: added, with a 5% floor so a runner cannot become unhittable.
  - 2c: multiplied instead, ×1.3 walking and ×0.8 running.
- **Ruling 3, firing from full cover.**
  - 3b: it keeps −30% instead of dropping to −10%.
  - 3a: the document's "previous turn", read literally.

`npm run balance -- --sweep` plays every combination against the rules as they
stand. It uses morale on, the three attack sizes, 100 battles a cell, and the
ruling-4 tie rerolls. The **targets were written down before the run** (`TARGETS`
in [`sim/balance.ts`](../src/sim/balance.ts), ⚠️ ours, standard planning
figures):
- at 1:1 the attacker wins **≤ 30%**;
- at ~2:1, **30–70%**;
- at 3–4:1, **≥ 70%**, losing **10–30%** of his men.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| as it stands | squad | 11% | 89% | 96% | 3% | 2/4 |
| as it stands | platoon | 1% | 100% | 100% | 0% | 2/4 |
| as it stands | company | 0% | 21% | 100% | 8% | 2/4 |
| **as it stands** | **all** | | | | | **6/12** |
| 1a 2b 3b | squad | 4% | 78% | 98% | 4% | 2/4 |
| 1a 2b 3b | platoon | 16% | 100% | 100% | 1% | 2/4 |
| 1a 2b 3b | company | 1% | 4% | 100% | 10% | 2/4 |
| **1a 2b 3b** | **all** | | | | | **6/12** |
| 1a 2b 3a | squad | 17% | 91% | 98% | 3% | 2/4 |
| 1a 2b 3a | platoon | 52% | 100% | 100% | 0% | 1/4 |
| 1a 2b 3a | company | 0% | 12% | 100% | 9% | 2/4 |
| **1a 2b 3a** | **all** | | | | | **5/12** |
| 1a 2c 3b | squad | 15% | 85% | 94% | 4% | 2/4 |
| 1a 2c 3b | platoon | 3% | 100% | 100% | 0% | 2/4 |
| 1a 2c 3b | company | 0% | 17% | 99% | 8% | 2/4 |
| **1a 2c 3b** | **all** | | | | | **6/12** |
| 1a 2c 3a | squad | 28% | 90% | 98% | 2% | 2/4 |
| 1a 2c 3a | platoon | 22% | 100% | 100% | 0% | 2/4 |
| 1a 2c 3a | company | 0% | 30% | 100% | 7% | 3/4 |
| **1a 2c 3a** | **all** | | | | | **7/12** |
| 1b 2b 3b | squad | 4% | 79% | 98% | 4% | 2/4 |
| 1b 2b 3b | platoon | 27% | 100% | 100% | 1% | 2/4 |
| 1b 2b 3b | company | 0% | 5% | 100% | 10% | 2/4 |
| **1b 2b 3b** | **all** | | | | | **6/12** |
| 1b 2b 3a | squad | 18% | 91% | 98% | 2% | 2/4 |
| 1b 2b 3a | platoon | 48% | 100% | 100% | 0% | 1/4 |
| 1b 2b 3a | company | 0% | 11% | 100% | 9% | 2/4 |
| **1b 2b 3a** | **all** | | | | | **5/12** |
| 1b 2c 3b | squad | 15% | 85% | 94% | 4% | 2/4 |
| 1b 2c 3b | platoon | 2% | 100% | 100% | 0% | 2/4 |
| 1b 2c 3b | company | 0% | 18% | 99% | 8% | 2/4 |
| **1b 2c 3b** | **all** | | | | | **6/12** |
| 1b 2c 3a | squad | 27% | 90% | 98% | 2% | 2/4 |
| 1b 2c 3a | platoon | 17% | 100% | 100% | 0% | 2/4 |
| 1b 2c 3a | company | 0% | 30% | 100% | 7% | 3/4 |
| **1b 2c 3a** | **all** | | | | | **7/12** |

**None of them works.** Every configuration scores 5–7 of 12 against 6 for the
rules as they stand, and in every one a winning attacker at 3–4:1 still loses
0–10%. Instrumenting the platoon attack (36 v 9, per battle) shows why the three
rulings barely touch the problem:

- **The assault almost never happens: 0.2–0.3 per battle.** The defender breaks
  before the attacker is within 25 m, so ruling 1 has almost nothing to act on.
- **The defender fires at a running target 70–79% of the time.** The doctrine
  rushes in contact, so ruling 2 — which punishes walking and rewards running —
  makes the defender's fire *worse*.
- **56–59% of the defender's shots are fired pinned**, at half accuracy: four
  times the shooters pile four times the suppression on it.
- **Damage spreads thin over the bigger force.** The attacker lands 18.5 hits on
  9 men and puts 3.2 of them down. The defender lands 4.8 hits across 36 men,
  and at 1d4 a hit against the 8 points a man takes to go down, that is 0.1–0.2
  men. This is the document's own casualty model working as written: it rewards
  concentration, like Lanchester's square law.

A lever of ours was tried the same way and did not fix it either. Making
dug-in troops harder to suppress (×½ in full cover, ×¾ in partial) still left
the attacker at 0–10% (**6–8 of 12**). It was measured and reverted, not kept.

**What is left is the author's.**
- **The casualty model (1d4 a hit, 8 points to go down)** is transcribed, not
  chosen.
- **What `ירי מקביל` is.** The engine reads it as a sustained machine gun (the
  70 / 50 / 20% table) and the hotseat offers it as "מקלע". The harness fires
  every weapon on the small-arms table, so a Western defence's machine guns
  have not been measured at all. If a defender's gun teams fire on that table,
  the picture may change entirely.
- **Whether a prepared defender should be steadier under morale**, which is
  ours to propose.
- **What the ground adds.** All of this is flat and open. Dead ground, and
  buildings that give full cover, are what the real maps have.

## Second round: the defender's reply, and steadiness, 2026-09-23

The author ruled 2c (the movement modifier as a factor, decision 22) and 3b
(firing from full cover keeps −30%, decision 23). He also ruled that a
prepared defender is steadier (decision 24) and that a defender facing an
assault returns fire (ruling 1), with the rate to be measured. This sweep plays
the new rules with every reply rate (none, 30%, 50%, 70%) against three sizes
of steadiness:
- off;
- the default, +15 to tests and ×0.75 on losses;
- strong, +25 and ×0.5.

It uses the same targets as before.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| reply none · steady off | squad | 15% | 83% | 94% | 4% | 2/4 |
| reply none · steady off | platoon | 4% | 100% | 100% | 0% | 2/4 |
| reply none · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply none · steady off** | **all** | | | | | **6/12** |
| reply none · steady +15 ×0.75 | squad | 8% | 84% | 95% | 5% | 2/4 |
| reply none · steady +15 ×0.75 | platoon | 5% | 100% | 100% | 0% | 2/4 |
| reply none · steady +15 ×0.75 | company | 0% | 5% | 100% | 11% | 3/4 |
| **reply none · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply none · steady +25 ×0.5 | squad | 2% | 80% | 93% | 5% | 2/4 |
| reply none · steady +25 ×0.5 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply none · steady +25 ×0.5 | company | 0% | 4% | 96% | 12% | 3/4 |
| **reply none · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 30% · steady off | squad | 15% | 85% | 94% | 4% | 2/4 |
| reply 30% · steady off | platoon | 2% | 100% | 100% | 0% | 2/4 |
| reply 30% · steady off | company | 0% | 18% | 99% | 8% | 2/4 |
| **reply 30% · steady off** | **all** | | | | | **6/12** |
| reply 30% · steady +15 ×0.75 | squad | 6% | 86% | 95% | 5% | 2/4 |
| reply 30% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 30% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 30% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 30% · steady +25 ×0.5 | squad | 3% | 83% | 93% | 5% | 2/4 |
| reply 30% · steady +25 ×0.5 | platoon | 1% | 100% | 100% | 1% | 2/4 |
| reply 30% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 30% · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 50% · steady off | squad | 14% | 84% | 94% | 4% | 2/4 |
| reply 50% · steady off | platoon | 6% | 100% | 100% | 0% | 2/4 |
| reply 50% · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply 50% · steady off** | **all** | | | | | **6/12** |
| reply 50% · steady +15 ×0.75 | squad | 6% | 86% | 95% | 5% | 2/4 |
| reply 50% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 50% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 50% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 50% · steady +25 ×0.5 | squad | 2% | 85% | 94% | 5% | 2/4 |
| reply 50% · steady +25 ×0.5 | platoon | 1% | 100% | 100% | 1% | 2/4 |
| reply 50% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 50% · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 70% · steady off | squad | 15% | 85% | 94% | 4% | 2/4 |
| reply 70% · steady off | platoon | 3% | 100% | 100% | 0% | 2/4 |
| reply 70% · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply 70% · steady off** | **all** | | | | | **6/12** |
| reply 70% · steady +15 ×0.75 | squad | 6% | 86% | 96% | 5% | 2/4 |
| reply 70% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 70% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 70% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 70% · steady +25 ×0.5 | squad | 2% | 85% | 94% | 5% | 2/4 |
| reply 70% · steady +25 ×0.5 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 70% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 70% · steady +25 ×0.5** | **all** | | | | | **7/12** |

**What it says.**
- **The reply rate makes no difference at all.** The assault still almost
  never happens: the defender breaks first. The rate stays on trial, off by
  default, until something changes that.
- **Steadiness helps a little.** It moves the company fights to 3 of 4
  targets: a winning attacker at 3:1 loses 10–12%. It does not move the squad
  and platoon fights.
- **A prepared position starting in full cover changes nothing**
  (`--prepared-cover full`). The results are identical to the digit, because
  the defenders dig in to full cover by turn 7, before the attack arrives. The
  prepared defender already fights from the best cover the rules have.

**Why: the square law.** When every man can fire at every enemy, a force's
fighting power goes as the **square** of its numbers, so 2:1 in men is 4:1 in
power and 3–4:1 is 9–16:1. For a 2:1 attack to be a real fight and a 3:1 attack
to succeed — the planning figures — a prepared defender has to be roughly
**4–9 times as effective per man** as an attacker in the open. Under these
rules he is about 1.5–2 times: cover halves the chance of hitting him, less
when he shoots. That is why the outcome flips between 1:1 and 2:1, and why no
modifier of a few tens of percent moves it.

**The casualty model, measured** (the rules as they stand after decisions
22–24, 100 battles a cell, the threshold changed temporarily and reverted):

| A man is out of the fight at | Targets met | Squad: attacker down at 3:1 | Mirror, loser / winner down |
|---|---|---|---|
| 8 points (the document) | 7/12 | 5% | 32–39% / 15–24% |
| 5 points (the document's serious wound) | 7/12 | 7% | 36–50% / 13–26% |
| 4 points (one heavy hit) | 8/12 | 11% | 39–53% / 16–26% |

A deadlier hit makes the small force's fire count for more, but on its own it
does not close a factor of 2–4. See the handoff note for the options put to
the author.

## Observations from play, for when the balance pass happens

- **Casualties are rare in a short battle.** Hits accumulate damage points and a
  soldier needs 8 to go down, so a 5-turn skirmish often ends 0–1 casualties.
  The what-if spread reads `0–1 (חציון 0)` for that reason, not because the
  re-roll is broken. If the balance pass wants visible outcomes sooner, the
  lever is the casualty thresholds, not the hit chances.
- **The defender's advantage is large.** Continuous observation, hidden while
  stationary, and an ambush that springs itself compound: in the demo RED sees
  everything and BLUE sees nothing until it is fired on. That may be correct for
  a prepared defence; it is worth playing an attack that uses smoke and scouts
  before deciding.
- **Covering fire has not been measured against a real attack.** The posture
  holds until something sets it off, which on the demo map meant a squad
  watched for six turns while the attacker climbed. It is not free — holding it
  spends that force's action every one of those turns (decision 18) — but
  whether "watch indefinitely" is too strong against an attack that has to
  cross open ground is exactly the sort of thing only play will say. The lever
  if it is: an expiry, or a cost to re-declare.
- **A charge laid in play has not been measured yet.** Nobody has played the
  two turns out against a moving attack, so whether 2 turns is cheap or
  expensive is an open question rather than a recorded figure. The thing to
  measure when the balance pass comes: how often a layer survives two
  uninterrupted turns within reach of the enemy's axis at all.
- **Morale has not been played against a real attack.** It has been
  measured in a symmetric firefight (above) and driven through the demo, where
  RED's forward squad lost men to breaks after the attrition rule had already
  taken it. Nobody has yet played an attack that uses the withdrawal order, a
  commander walking up to rally, or the side breaking before it is wiped out.
- **Full camouflage at setup is strong.** The demo's forward RED squad starts at
  the -50% cap, which is the author's prepared-position reading. Against it, a
  walking searcher has 30% inside 20 m and a scout 40%.
