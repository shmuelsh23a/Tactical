# Balance sheet — every number that was chosen

The document's own figures are transcribed verbatim in
[`src/engine/data/`](../src/engine/data) and are **not** on this list: they are
not ours to tune. This is everything the game needs that the document does not
give, gathered in one place because the author has twice said *tentatively —
until we work on balance*.

Each row says who chose it and where it lives. "Author" means he gave the
figure; "ours" means the code needed one and the README records the reasoning.

**Since rules decisions 41–43 (2026-09-28) a new game plays the research
figures**: blast bands from each weapon's published lethal area, the tank gun
to 2 km, rates of fire drawn each turn, small arms at a third of the table and
24 bombs for effect from a mortar — calibrated so explosives cause 75% of the
losses with `--fires calibrated --defender-fires calibrated` — and a side
gives up at 30% (attacking) or 60% (defending) of its men down, broken or
fled (decision 44). The drills fire their squads' grenadiers. Every round on this page before that date was
measured on the document's tables. `npm run balance -- --lethality document`
reproduces them; without the flag the harness plays the research figures. What
the change moved, and why explosives now fall short of the 75% principle, is on
[validation.md](validation.md).

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
| `SLOPE.climbCostPerMetre` | **5 m** of the bound per metre climbed (decision 61, 2026-09-30; **8**, Naismith, before — an older recording replays at 8); descent free | author | Makes the high ground cost what it is worth. A 10% slope costs 1.5 m of budget per metre, so a walking bound uphill is ~33 m, not 50 (28 m at 8). Tobler gives 4–6 for a bound (validation.md). |
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
  *Later (rules decision 48, 2026-09-28): full is now the default, and with
  a fire plan it does change things — full cover is under a roof against
  shells from turn 1. The calibrated 2:1 company attack went from 56% to 7%
  on it alone; see validation.md.*

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

## Third round: the wound-severity roll, 2026-09-23

**ירי מקביל is the coaxial gun** (decision 25), so a prepared infantry
defender's missing edge was never going to come from that table. The author put
the **wound-severity roll** on trial (`woundSeverity` in
[`data/variants.ts`](../src/engine/data/variants.ts)). Each small-arms hit rolls
a d10 instead of the document's 1d4 of damage:
- **light**: fights on, 2 points towards the document's 8;
- **serious**: out of the fight, bleeding;
- **killed**.

It is one die either way. The sweep tries three splits of the d10 — light /
serious / killed as 4/4/2, 5/4/1 and 3/5/2 — each with and without a 50%
reply in the assault, against the same targets.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| 1d4 (document) · reply none | squad | 8% | 84% | 95% | 5% | 2/4 |
| 1d4 (document) · reply none | platoon | 5% | 100% | 100% | 0% | 2/4 |
| 1d4 (document) · reply none | company | 0% | 5% | 100% | 11% | 3/4 |
| **1d4 (document) · reply none** | **all** | | | | | **7/12** |
| 1d4 (document) · reply 50% | squad | 6% | 86% | 95% | 5% | 2/4 |
| 1d4 (document) · reply 50% | platoon | 2% | 100% | 100% | 1% | 2/4 |
| 1d4 (document) · reply 50% | company | 0% | 5% | 100% | 10% | 3/4 |
| **1d4 (document) · reply 50%** | **all** | | | | | **7/12** |
| severity 4/4/2 · reply none | squad | 6% | 65% | 94% | 17% | 4/4 |
| severity 4/4/2 · reply none | platoon | 2% | 88% | 100% | 5% | 2/4 |
| severity 4/4/2 · reply none | company | 0% | 10% | 99% | 10% | 3/4 |
| **severity 4/4/2 · reply none** | **all** | | | | | **9/12** |
| severity 4/4/2 · reply 50% | squad | 6% | 65% | 95% | 17% | 4/4 |
| severity 4/4/2 · reply 50% | platoon | 2% | 87% | 100% | 5% | 2/4 |
| severity 4/4/2 · reply 50% | company | 0% | 10% | 99% | 10% | 3/4 |
| **severity 4/4/2 · reply 50%** | **all** | | | | | **9/12** |
| severity 5/4/1 · reply none | squad | 9% | 71% | 92% | 17% | 3/4 |
| severity 5/4/1 · reply none | platoon | 1% | 87% | 100% | 5% | 2/4 |
| severity 5/4/1 · reply none | company | 0% | 10% | 96% | 10% | 2/4 |
| **severity 5/4/1 · reply none** | **all** | | | | | **7/12** |
| severity 5/4/1 · reply 50% | squad | 9% | 70% | 92% | 17% | 4/4 |
| severity 5/4/1 · reply 50% | platoon | 2% | 84% | 100% | 5% | 2/4 |
| severity 5/4/1 · reply 50% | company | 0% | 10% | 96% | 10% | 2/4 |
| **severity 5/4/1 · reply 50%** | **all** | | | | | **8/12** |
| severity 3/5/2 · reply none | squad | 6% | 69% | 90% | 15% | 4/4 |
| severity 3/5/2 · reply none | platoon | 2% | 79% | 100% | 6% | 2/4 |
| severity 3/5/2 · reply none | company | 0% | 14% | 99% | 10% | 2/4 |
| **severity 3/5/2 · reply none** | **all** | | | | | **8/12** |
| severity 3/5/2 · reply 50% | squad | 6% | 68% | 90% | 15% | 4/4 |
| severity 3/5/2 · reply 50% | platoon | 2% | 79% | 100% | 6% | 2/4 |
| severity 3/5/2 · reply 50% | company | 0% | 14% | 99% | 10% | 2/4 |
| **severity 3/5/2 · reply 50%** | **all** | | | | | **8/12** |

**What it says.**
- **4/4/2 is the first change that moves the balance: 9 of 12**, the best of
  any configuration so far.
  - The squad fights meet all four targets. A 2:1 attack wins 65%, a real
    fight, and a winning attacker at 3:1 loses **17%**, where the 1d4 cost him
    5%.
  - Each hit is now worth about the same whether it lands on 9 men or on 36,
    so a small force's fire stops being wasted.
- **The other splits do a little less**: 7–8 of 12.
- **The reply rate still makes no difference.**
- **What it still does not fix is the platoon fight.** A 2:1 attack wins 87%,
  and a winning platoon attacker loses about 5%. The square law is still two
  thirds of the problem there: four rifle squads' fire on one or two.

**What it does to an even fight** (the mirror, 100 battles a cell,
`--kinds meeting --morale on`):

| | 1d4: BLUE / RED / draw | turns | loser / winner down | 4/4/2: BLUE / RED / draw | turns | loser / winner down |
|---|---|---|---|---|---|---|
| squad | 43 / 49 / 8 | 12 | 39% / 15% | 47 / 53 / 0 | 6 | 58% / 18% |
| platoon | 39 / 53 / 8 | 10 | 35% / 19% | 47 / 49 / 4 | 8 | 44% / 22% |
| company | 41 / 47 / 12 | 10 | 32% / 24% | 40 / 50 / 10 | 9 | 37% / 24% |

- **Battles are shorter and splits no less even.**
- **Surrenders almost vanish** — 0.2 a platoon battle against 1.5 — because men
  now go down before the forces close to 50 m.
- **A losing squad goes further before it breaks: 58%.** Casualties come
  faster than the morale step, which judges once a turn.

**Adopted 2026-09-23:** 4/4/2 is the rule (decision 26), and the coaxial gun's
one roll a turn is confirmed (decision 25). The sweep now covers only the
assault reply rate, which is all that is left on trial.

## Fourth round: the squad drill, 2026-09-23

The rules were not the whole problem; **the decisions were**. The harness's
squads used to fight by a plain script. Every force shot at the nearest enemy
it knew of — and, it turned out, at where that enemy truly was rather than
where it was last seen. Half bounded while half fired, and nobody broke
contact.

Squads now fight by a **drill** ([`app/drill.ts`](../src/app/drill.ts)): a
`SquadDrill` of named numbers, carried out by one small executor that reads
only its side's view. That executor is also the one the simulated
subordinates will use (backlog 15), and its data is what the TTP editor will
edit (backlog 20). Two drills are defined:
- **The plain script**: the old doctrine, kept as the baseline.
- **The Western drill** (⚠️ ours, a first draft):
  - sectors of fire, 60° on each force's axis;
  - bounding overwatch with 50 m rushes;
  - the attacker opens fire at 300 m;
  - the defender holds its fire to 200 m, as a hold-fire order, so its
    covering fire keeps the discipline too;
  - a force breaks contact once, at half strength, falling back 150 m.

The same targets, the rules as they now stand (decisions 22–26), 100 battles a
cell, no reply in the assault:

| Drill | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| plain script | squad | 6% | 67% | 94% | 17% | 4/4 |
| plain script | platoon | 2% | 87% | 100% | 5% | 2/4 |
| plain script | company | 0% | 10% | 99% | 10% | 3/4 |
| **plain script** | **all** | | | | | **9/12** |
| western drill | squad | 4% | 48% | 76% | 16% | 4/4 |
| western drill | platoon | 0% | 63% | 100% | 8% | 3/4 |
| western drill | company | 0% | 31% | 92% | 16% | 4/4 |
| **western drill** | **all** | | | | | **11/12** |

**The Western drill meets 11 of 12**, against the plain script's 9.
- **The platoon fight is fixed**: a 2:1 attack now wins 63%, where it was 87%.
- **The one miss**: a winning platoon attacker at 3–4:1 loses 8%, against a
  target of 10–30%. That is 36 men against 9, where the square law still has
  the most to say.
- **The reply rate in the assault still changes nothing** under either drill.

The mirror stays even (`--kinds meeting --drill western`, 200 battles a cell):

| | BLUE / RED / draw | turns | loser / winner down |
|---|---|---|---|
| squad | 46 / 53 / 1 | 7 | 53% / 18% |
| platoon | 46 / 51 / 4 | 9 | 41% / 21% |
| company | 47 / 45 / 9 | 9 | 37% / 24% |

## Fifth round: one wound rule for bullets and explosives, 2026-09-23

The author wants **the same wound rule for a bullet and a fragment**. His
guiding principle: **explosives cause most of the casualties in a modern war,
about 75%**. Today the two are resolved differently. A bullet rolls the
severity d10 (decision 26), so 60% of bullet hits put a man out. A fragment
rolls its document die against 8 points, so a grenade's 1d6 never puts a man
out in one hit, a mortar's 1d8 does 12.5% of the time, and artillery's 1d10
30%.

### The principle, checked

He is right. Across the wars with good records, explosives caused about
two-thirds to three-quarters of the wounds:

| War | Explosive | Bullet | Source |
|---|---|---|---|
| WWII (US Army) | 73% | about 20–30% | Owens et al. 2008, citing the historical series; Beebe & DeBakey: shell fragments 53% of the wounded, 62% of those who died of wounds, small arms 32% and 20% |
| Korea | 69% | about 27% | Owens et al. 2008; Reister |
| Vietnam | 65% | about 30% | Owens et al. 2008 |
| Iraq and Afghanistan, 2001–2005 | 78% | 18% | Owens et al. 2008, *J Trauma* 64(2) |
| Iraq and Afghanistan, 2005–2009 | 74% | 20% | Belmont et al. 2012 |
| Ukraine, 2022–2025 | 70–80% by artillery, then by drones | small | press and intelligence estimates, not medical series |

Sources:
- [Owens et al. 2008](https://pubmed.ncbi.nlm.nih.gov/18301189/)
- [Belmont et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3862555/)
- [the Army Medical Department's WWII and Korea wound-ballistics histories](https://achh.army.mil/history/book-korea-reister-ch3/)
- [JMVH, *Understanding weapons effects*](https://jmvh.org/article/understanding-weapons-effects-a-fundamental-precept-in-the-professional-preparation-of-military-physicians/)
- [Army Technology on drones in Ukraine](https://www.army-technology.com/news/drones-now-account-for-80-of-casualties-in-ukraine-russia-war/)

One more finding bears directly on the rule. **A fragment wound is less
likely to kill than a bullet wound**: about 10–20% against about 33%, from
the wound-ballistics literature. Explosives cause most of the casualties
because they hit many men from far away, not because each hit is worse.

### The models on trial

All four were put on trial as `woundModel` in `data/variants.ts`. That switch
was deleted once A0 became the rule (decision 27).
- **As it stands**: the severity roll for a bullet, the document's die
  against 8 for a fragment.
- **A (`severity`)**: every hit rolls the d10 severity. An explosive adds a
  shift for the size of its die: 1d6 +1, 1d8 +2, 1d10 +3, 2d10 +5.
- **A0 (`flat`)**: A without the shift. Every hit, bullet or fragment, rolls
  the same d10. This follows from the lethality finding above.
- **B (`dice`)**: every hit rolls its document die, a bullet 1d4, and a man
  is out at 5 points, where he starts bleeding.

The harness now records **what put each man out** (`Soldier.outBy`). A
company can also be given a **fire plan** (`--fires shells,bombs,lift`):
rounds a turn on the objective, spread across the defender's frontage, until
the attacker comes within the lift distance. Western drill, 100 battles a
cell, the balance targets as before. *Out by HE* is the share of men put out
by a hit that explosives put out, over the three attacks.

**No fire plan.** The company still gets its one mortar bomb a turn on the
nearest enemy it has seen.

| Model | Squad | Platoon | Company: 1:1 / ~2:1 / 3–4:1 win, attacker down | Out by HE, company | Targets met |
|---|---|---|---|---|---|
| as it stands | 4/4 | 3/4 | 0% / 31% / 92%, 16% — 4/4 | 36% | **11/12** |
| A: severity + shift | 4/4 | 3/4 | 0% / 19% / 66%, 28% — 2/4 | 62% | 9/12 |
| A0: flat severity | 4/4 | 3/4 | 0% / 20% / 81%, 24% — 3/4 | 55% | **10/12** |
| B: dice, out at 5 | 3/4 | 2/4 | 0% / 3% / 52%, 23% — 2/4 | 78% | 7/12 |

**A fire plan of one mortar bomb a turn** on the objective, lifting at
400 m (company only):

| Model | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets met |
|---|---|---|---|---|---|---|
| as it stands | 1% | 59% | 100% | 3% | 59% | 3/4 |
| A: severity + shift | 1% | 49% | 100% | 2% | 81% | 3/4 |
| A0: flat severity | 1% | 50% | 99% | 4% | **76%** | 3/4 |
| B: dice, out at 5 | 0% | 36% | 98% | 4% | 86% | 3/4 |

**One artillery shell a turn** (`--fires 1,0`): the 2:1 attack wins 93–100%
under every model, and explosives put out 86–95%. One shell and two bombs
(`--fires 1,2`): 100%, and 96–98%. The first run, a battery's four shells and
a mortar section's six bombs a turn, destroyed the defender before contact
at every echelon, even at 1:1.

### What it says

- **B is out.** A bullet's 1d4 can never put a man out in one hit, so small
  arms lose their effect and small-unit fights go wrong: platoon 2:1 wins
  91%. It meets 7 of 12 targets.
- **A and A0 leave squad and platoon fights unchanged.** Those fights have
  no explosives except the assault's grenades. The whole difference is at
  company level, where the mortar is.
- **A0 is the rule the evidence supports.** It meets 10 of 12 targets
  without a fire plan, and it is truly uniform: one die for every hit. With
  one mortar bomb a turn on the objective, **explosives put out 76% of the
  men**, which matches the author's figure. A's shift makes each fragment
  deadlier than a bullet, which the wound data contradicts. It also costs
  balance: 9 of 12, and a 3–4:1 company attack wins only 66%.
- **How much weight explosives carry is decided by the blast, not the wound
  rule.** One artillery shell a turn decides a 2:1 attack under every model.
  The document's blast table catches 70% of the men within 50 m of a single
  shell, and nothing reduces it:
  - Cover does not protect against blast. A quick experiment (reverted, not
    in the engine) cut the blast chance by half in partial cover and by
    three-quarters in full cover. The 2:1 attack under one shell a turn
    still won 67–89%.
  - Nothing says whether a "round" is one shell or a battery's volley.

  That is the next ruling, not a harness setting.

**Recommendation (ours), and what the author decided:**
1. Adopt A0: one d10 severity for every hit, bullet or fragment. Explosives
   dominate by how many men they hit, as they do in the data. **Adopted
   2026-09-23 as rules decision 27.** The switch is gone. The rules now play
   exactly as the A0 rows above. Rerun: company, no fire plan, 0% / 20% /
   81% / 24%, with 55% out by HE.
2. Then rule on the blast: what cover does against it, and what one round
   is. **One round is one shell (decision 28), and cover counts against it,
   option a (decision 29). See the sixth round.**

**A side bias seemed to surface once A0 was the rule, and it was the seeds.**
The company mirror (200 battles, Western drill) gave BLUE / RED / draw
52 / 39 / 10, and 50 / 37 / 13 with `--swap`, and it was 47 / 45 before. It
looked like something in the explosive path favouring BLUE. It is not
(2026-09-23, company meeting, Western drill, morale on):

| Seeds | BLUE | RED | draw |
|---|---|---|---|
| 1–400 | 186 | 186 | 28 |
| 1000–2999 | 969 | 855 | 176 |
| 5000–5999 | 458 | 449 | 93 |
| 10000–13999 | 1773 | 1880 | 347 |
| **all 7,400** | **3386** | **3370** | 644 |
| 10000–13999, RED's units added first | 1817 | 1816 | 367 |
| 20000–20199 (`--seed 20000`) | 44% | 49% | 8% |

- Pooled, the mirror is level: 3386 to 3370.
- The lean moves with the **seed window**: BLUE ahead on 1000–2999, RED
  ahead on 10000–13999.
- Adding RED's units to the game first, the prime suspect, changes nothing.
- `--swap` could not tell the two apart. It replays the **same seeds**, so
  its noise is correlated with the unswapped run. It separates side from
  position; it does not give you a second sample.

Every run on this page before this one used seeds 1000 onwards, because the
CLI had no way to choose. It has one now: `--seed <first>`. **Before
calling a lean real, rerun it on a disjoint window.** At 200 battles a
share's standard error is about 3.5 points, and the gap between two shares
about 5.

## Sixth round: cover against a shell, 2026-09-23

The author's answers to the blast question:
- **One round is one shell** (rules decision 28). A battery's mission is
  several rounds, each with its own scatter and blast.
- **Cover against blast: "test a and b".** He chose **a** after this round
  (rules decision 29; `BLAST_COVER_FACTOR` in `data/explosives.ts`; the
  trial switch and the `--blast-cover` flag are gone). Both were on trial as
  `blastCoverFactor` in `data/variants.ts`, harness flag `--blast-cover
  partial,full`. Both apply to indirect fire only, and multiply each man's
  blast chance by the cover his force is in:
  - **a** — partial ×½, full ×¼ (`--blast-cover 0.5,0.25`);
  - **b** — full cover only, ×¼ (`--blast-cover 1,0.25`). The factor is ours;
    it is a's, so the two differ only on partial cover.

Western drill, 100 battles a cell, seeds from 1000, the same targets as
before. A prepared position starts in partial cover unless the row says
full. Company only: a company is what calls fire.

| Fire | Prepared in | Cover vs blast | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|---|
| none (a mortar bomb a turn on the nearest enemy seen) | either | none | 0% | 20% | 81% | 24% | 55% | 3/4 |
| | either | a or b | 0% | 15% | 62% | 25% | 50% | 2/4 |
| a bomb a turn on the objective (`--fires plan`) | partial | none | 1% | 50% | 99% | 4% | 76% | 3/4 |
| | partial | a | 0% | 21% | 95% | 12% | 67% | 3/4 |
| | partial | b | 0% | 31% | 97% | 4% | 75% | 3/4 |
| | full | none | 1% | 50% | 99% | 4% | 76% | 3/4 |
| | full | a or b | 0% | 16% | 88% | 19% | 60% | 3/4 |
| one shell a turn (`--fires 1,0`) | partial | none | 5% | 99% | 100% | 0% | 91% | 2/4 |
| | partial | a | 1% | 78% | 100% | 1% | 83% | 2/4 |
| | partial | b | 2% | 95% | 100% | 0% | 90% | 2/4 |
| | full | a or b | 0% | 51% | 99% | 5% | 74% | 3/4 |
| a battery and a mortar section: 4 shells, 6 bombs a turn (`--fires 4,6`) | partial | none | 20% | 100% | 100% | 0% | 99% | 2/4 |
| | partial | a | 2% | 100% | 100% | 0% | 98% | 2/4 |
| | partial | b | 16% | 100% | 100% | 0% | 99% | 2/4 |
| | full | a or b | 1% | 100% | 100% | 0% | 97% | 2/4 |

Squad and platoon rows do not change without a fire plan. They have no
explosives but the assault's grenades, and those are not indirect fire.

### What it says

- **Cover is only half the answer.** It takes one shell a turn from
  deciding a 2:1 attack (99%) to an even one (51%), but only against a
  defender in **full** cover, and there a and b are the same thing. Against
  a battery's whole mission, 4 shells and 6 bombs a turn, the 2:1 attack
  still wins 100% under either. Cover then only stops that fire from winning
  a 1:1 attack (20% down to 1–2%).
- **a and b differ only where the defender is in partial cover**, that is
  a hasty position or men against a wall. Under a it is worth something
  (one shell a turn: 99% down to 78%); under b nothing.
- **Both cost the attack without a fire plan.** The defender digs in to full
  cover while the attacker walks up in the open, so the company's own mortar
  bomb does less to it: the 3–4:1 attack falls from 81% to 62% and misses
  its target. The fire plan is what brings it back (88–97%).
- **The 75% principle holds under either** with a fire plan on a dug-in
  defender: 60–75% out by HE, against 76% without cover.
- **What would decide it is how much fire a company gets**, not what cover
  does to it. How many shells one company can call in a turn is the
  question after this one. It is decision 8's one mission per side per turn,
  now that a mission is one shell, and later the ammunition item
  (backlog 12).

## Seventh round: how accurate the guns are, 2026-09-23

The author asked what changing artillery accuracy would do. First, what it is
today. This is the document's dispersion table, `data/artillery.ts`:
- Each axis is rolled on its own. There is a **70% chance** of landing on
  target on each axis, so **49%** of rounds land exactly on the aim point.
- A miss in range (short or long) is **50–200 m**, rolled as 1d4 × 50. A miss
  in line (left or right) is **25–100 m**, rolled as 1d4 × 25.
- That puts **65%** of rounds within 50 m of the aim, **82%** within 100 m
  and **98%** within 200 m. The mean miss is 52 m.
- The blast is as wide as the miss. For a man standing at the aim point, an
  artillery round catches him **58%** of the time, against 70% on a direct
  hit. A mortar bomb catches him **37%** of the time, against 50%. So a miss
  costs a shell only about a sixth of its effect.

Then a probe, a **temporary edit, not committed**: the table's miss distance
and its on-target chance were changed together, under decision 29, with the
company only. "Off" is the percentile that deviates on each side, so 15 is
today's 70% on target and 25 is 50%.

| Accuracy | Fire | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| today (miss ×1, off 15) | none | 0% | 15% | 62% | 25% | 50% | 2/4 |
| | a bomb a turn on the objective | 0% | 21% | 95% | 12% | 67% | 3/4 |
| | one shell a turn | 1% | 78% | 100% | 1% | 83% | 2/4 |
| | 4 shells + 6 bombs a turn | 2% | 100% | 100% | 0% | 98% | 2/4 |
| 50% on target (miss ×1, off 25) | none | 0% | 19% | 67% | 24% | 46% | 2/4 |
| | a bomb a turn | 0% | 37% | 93% | 15% | 58% | **4/4** |
| | one shell a turn | 4% | 86% | 100% | 2% | 78% | 2/4 |
| | 4 + 6 | 8% | 100% | 100% | 0% | 98% | 2/4 |
| misses twice as far (miss ×2, off 15) | none | 0% | 22% | 66% | 24% | 47% | 2/4 |
| | a bomb a turn | 2% | 30% | 95% | 15% | 62% | **4/4** |
| | one shell a turn | 8% | 67% | 96% | 6% | 80% | 3/4 |
| | 4 + 6 | 44% | 100% | 100% | 0% | 100% | 1/4 |
| both (miss ×2, off 25) | none | 0% | 27% | 74% | 22% | 40% | 3/4 |
| | a bomb a turn | 6% | 40% | 90% | 15% | 51% | **4/4** |
| | one shell a turn | 9% | 56% | 93% | 10% | 70% | **4/4** |
| | 4 + 6 | 64% | 100% | 100% | 1% | 100% | 1/4 |
| miss ×4, off 25 | none | 4% | 50% | 92% | 17% | 29% | **4/4** |
| | a bomb a turn | 5% | 70% | 92% | 14% | 40% | **4/4** |
| | one shell a turn | 12% | 62% | 92% | 14% | 57% | **4/4** |
| | 4 + 6 | 94% | 98% | 99% | 9% | 100% | 1/4 |

### What it says

- **Less accuracy helps a single round's balance.** With miss ×2 and 50% on
  target, one shell a turn stops deciding a 2:1 attack (56%) and meets all
  four company targets. So does a bomb a turn.
- **Against a battery's whole mission it does the opposite.** With 4 shells
  and 6 bombs a turn, a 1:1 attack wins 2% today, 44–64% at miss ×2, and 94%
  at miss ×4. The defending company is spread over some 400 m, and the blast
  is wide. A concentrated mission hits the same men twice. A scattered one
  covers the whole company. Inaccuracy turns a mission into area fire, and
  area fire suits a dispersed target.
- **Without a fire plan, less accuracy helps the attacker too.** The
  defender's own mortar bomb, aimed at the advancing attacker, misses more.
  At miss ×4 the 3–4:1 attack is back to 92%, and explosives put out only
  29% of the men, far off the 75% principle.
- **So accuracy is not the lever for massed fire.** How much fire a company
  may call is. Accuracy is a fair lever for how decisive **one** round is.

## What the sources say cover does against a shell, 2026-09-23

The author asked what is published on this. Every figure below is
secondhand. The primary tables, the JMEM and FM 6-141-2, are classified.
The pages were read through search results, because the sandbox could not
open them.

**Lethal areas by posture**, as quoted from open compilations:

| Round | Standing | Prone | Foxhole | Prone ÷ standing | Foxhole ÷ standing |
|---|---|---|---|---|---|
| 105 mm M1, impact, 60° | 390 m² | 140 m² | — | 0.36 | — |
| 155 mm M107, impact, 60° | 971 m² | 346 m² | 130 m² | 0.36 | 0.13 |
| 155 mm, air burst, 60° | 1,240 m² | 939 m² | 130 m² | 0.76 | 0.10 |

- **FM 7-90** (mortars, Appendix B): fire at standing men is almost twice as
  effective as at prone men. A proximity fuze is about 40% more effective
  than a surface burst against prone men. Against men in open fighting
  positions without overhead cover, it is about five times as effective as
  an impact fuze.
- **FM 21-75** and its successors: a foxhole protects against every shell
  except a direct hit. Overhead cover is what protects against an air burst.
- **Troop Reaction and Posture Sequencing** (US Army, 1970s): at the first
  impact, 58% of men in a hasty defence were standing. Two seconds later 29%
  were, and after eight seconds none were. Going to ground cuts casualties
  by as much as two thirds. That is why time-on-target fire, every round
  landing at once, is the deadliest.

**How that compares with decision 29.** If "none" is a man on his feet:
- Partial cover, ×½, sits between prone (×0.36) and FM 7-90's "twice".
  That is fair.
- Full cover, ×¼, is **about twice as generous to the shell** as the
  sources. A foxhole is ×0.10–0.13 against standing men.

A probe of full cover at ×⅛ and ×1/10 (temporary edit, not committed;
company, prepared positions in full cover):

| Full cover | Fire | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|
| ×¼ (the rule) | none | 15% | 62% | 25% | 50% | 2/4 |
| | a bomb a turn | 16% | 88% | 19% | 60% | 3/4 |
| | one shell a turn | 51% | 99% | 5% | 74% | 3/4 |
| | 4 shells + 6 bombs | 100% | 100% | 0% | 97% | 2/4 |
| ×⅛ | none | 13% | 51% | 26% | 50% | 2/4 |
| | a bomb a turn | 18% | 68% | 24% | 56% | 2/4 |
| | one shell a turn | 24% | 96% | 12% | 66% | 3/4 |
| | 4 + 6 | 100% | 100% | 0% | 96% | 2/4 |
| ×1/10 | none | 13% | 49% | 26% | 50% | 2/4 |
| | a bomb a turn | 15% | 68% | 25% | 56% | 2/4 |
| | one shell a turn | 22% | 92% | 16% | 63% | 3/4 |
| | 4 + 6 | 100% | 100% | 0% | 96% | 2/4 |

At the sources' figure, a dug-in company can take a shell a turn: a 2:1
attack wins about a quarter of the time. A battery's whole mission still
decides the fight. Two things the sources raise that the game does not
model:
- **The first rounds catch men on their feet.** Our cover is a state of the
  force, and a force in the open that has just been shelled is as exposed
  on the next turn. The sources say it would be lying down.
- **The fuze.** An air burst largely defeats going prone and open holes,
  but not overhead cover. The document has one kind of shell.

## Eighth round: a company's fire support, and accuracy by CEP, 2026-09-23

The author's next steps after the sources:
- Full cover against a shell goes to ×⅛ (decision 29).
- The first volley (decision 30) and air-burst fuzes (decision 31) are rules.
- Test a company with **2 artillery missions of 4 shells and 3 mortars**,
  with artillery at **15 m CEP** and a mortar's accuracy from the sources.
  "Usually it's adjustable — with increasing accuracy up to a cap."

### Accuracy, on trial

This is `cepDispersion` in `data/variants.ts`, harness flag `--cep
weapon:first:cap`. Each round scatters as a circular normal with CEP
`max(cap, first ÷ 2^adjustments)`. An adjustment is the same side's same
weapon firing again the next turn within 100 m of its last aim; the
observer's bracket halves the error each time.

| Weapon | First round | Cap | Source |
|---|---|---|---|
| Artillery | 15 m | 15 m | The author. For scale: an unguided 155 mm round is 50–267 m CEP at long range (M777 spec 50–200 m at 25 km; M549A1 267 m at maximum range). A PGK fuze is ≤30 m, Excalibur about 4 m. So 15 m is precision-fuze accuracy. |
| Mortar | 100 m | 25 m | An unadjusted 120 mm bomb is 136 m CEP at maximum range, 76 m with modern fire control. Doctrine fires for effect once the bracket is within 50 m. 25 m, the tube's own spread at working ranges, is ours. |

Things this leaves out:
- An observer. Adjustment only needs the same aim point on consecutive turns.
- A battery's shared error. Every round scatters on its own.

### The allocation

Read as follows:
- **2 × 4 shells for the battle**, fired on the first two turns as
  preparation. They land on turns 3 and 4, 80 m apart on the objective.
- **3 tubes at the document's 3 bombs a tube a turn**: three missions of 3
  bombs a turn, 80 m apart, until the attacker is within 400 m.
- For comparison: 3 tubes at 1 bomb each, and the missions a turn rather
  than a battle.
- The defender keeps only its company's one bomb a turn on the nearest enemy
  it has seen.

Company, Western drill, 100 battles a cell, seeds from 1000. "Table" is the
document's dispersion; "CEP" is the trial above. The defender's prepared
position is in partial cover (a hasty position) or full (dug in, no roof).

**Each part alone** (impact fuze). Rerun after the review fixes: everything
landing in one turn now finds the men as they were, and each tube adjusts
onto its own point.

| Fire | Accuracy | Prepared in | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| none (the company's one bomb a turn) | table | either | 16% | 62% | 25% | 45% | 2/4 |
| | CEP | either | 14% | 58% | 24% | 45% | 2/4 |
| 2 × 4 shells for the battle | table | partial | 81% | 100% | 0% | 81% | 2/4 |
| | table | full | **29%** | 93% | 16% | 59% | 3/4 |
| | CEP | partial | 95% | 100% | 0% | 82% | 2/4 |
| | CEP | full | **36%** | 93% | 13% | 60% | **4/4** |
| 3 tubes × 1 bomb a turn | table | partial | 73% | 100% | 0% | 85% | 2/4 |
| | table | full | **27%** | 99% | 6% | 67% | 2/4 |
| | CEP | partial | 90% | 100% | 0% | 85% | 2/4 |
| | CEP | full | **36%** | 99% | 3% | 70% | 3/4 |
| 3 tubes × 3 bombs a turn | table | partial / full | 100% / 91% | 100% | 0% | 88–95% | 2/4 |
| | CEP | partial / full | 100% / 99% | 100% | 0% | 90–95% | 2/4 |

**Together** (the 1:1 attack never wins more than 11%, except as noted):

| Fire | Accuracy | Fuze | Prepared in | ~2:1 win | Out by HE |
|---|---|---|---|---|---|
| 2 × 4 shells a battle + 3 × 3 bombs a turn | any | any | any | 100% | 93–97% |
| 2 × 4 shells a battle + 3 × 1 bomb a turn | table | impact | full | **61%** | 82% |
| | CEP | impact | full | 80% | 84% |
| | any | impact | partial | 100% | 94% |
| | any | air burst | any | 100% | 95–96% |
| 2 × 4 shells **a turn** + 3 × 3 bombs a turn | any | any | any | 100% (1:1: 21–40% with air burst on the table's accuracy) | 96–99% |

### What it says

- **The allocation as given decides the 2:1 attack every time**, under
  every accuracy, fuze and position. Most of that is the mortar section. At
  the document's rate, 3 tubes fire 9 bombs a turn, about 36 over the
  approach. Alone, that wins a 2:1 attack 90–100% of the time.
- **The two artillery missions are about right on their own.** Against a
  dug-in company they give 29–36% at 2:1 and 93% at 3–4:1. At 15 m CEP that
  meets all four company targets. Explosives put out 60% of the men.
- **So does a section at 1 bomb a tube a turn.** Both together give 61% at
  2:1 on the table's accuracy and 80% at 15 m CEP, against a dug-in defender.
- **Digging in is what the numbers turn on.** Against a hasty position,
  every allocation above wins a 2:1 attack 73–100% of the time.
- **An air burst wins against any defender without a roof.** It finds open
  holes at ×⅝, so every air-burst row is 100%. That is decision 31 working
  as the sources say. It also means the question is whether a prepared
  position has overhead cover. Today only a building does.
- **What accuracy is worth depends on how much fire there is.** Against a
  dug-in company, the trial's accuracy adds 7–9 points to a 2:1 attack
  with each part alone. With both parts together it adds 19 points (61% to
  80%). Against the full allocation it makes no difference, because the
  attack already wins.
- **Without a fire plan, decisions 29–31 barely move the attack.** With
  the table's accuracy, the 3–4:1 attack still wins 62% and misses its
  target, as it did before them. With the trial's it wins 58%. A company is
  expected to attack with fire support; these rows are its absence.
- **The fire is one-sided.** The defender has no section of its own, no
  counter-battery fire and no way to move off a shelled position.

## Ninth round: fire missions, and the defender's own mortars, 2026-09-23

The author's answers to the eighth round:
1. **Mortars fire as missions.** One bomb a turn until one lands close to
   the mark, then fire for effect.
2. **A prepared position has overhead cover**: a roof against an air burst
   (decision 31).
3. He asked what we suggest on the accuracy trial. See the handoff.
4. **Yes to fire support for the defender.**
5. **Artillery accuracy of 50–270 m CEP**, improving with each round.

### What was built

**Adjustment** (the accuracy trial, `cepDispersion`):
- Each earlier round from the same side's same weapon within 100 m of the
  aim halves the CEP, down to the cap.
- Once a round lands within 50 m of its aim, the guns are **on the mark**
  (`Game.isOnTheMark`) and fire at the cap. Missions within 100 m of that
  point are on the mark too, so a section's sheaf is.
- Artillery is **270 m to 50 m**; a mortar is **100 m to 25 m**. The 50 m
  for "on the mark" is ours, from the doctrinal "within 50 m of the
  adjusting point".
- **Registered targets** (`registeredTargets`): a side's guns are already on
  the mark at points it planned before the battle.

**The fire plan** (`--fires ...,adjust=on`):
- One round a turn on the centre of the objective until it is on the mark,
  then the full missions, 80 m apart, until the attacker is within 400 m.
- Artillery's 2 × 4 shells count fire for effect only.

**The defender's section** (`--defender-fires mortar=3x3,registered=200/400`):
- 3 tubes on the nearest attacker it has seen, adjusting the same way.
- Targets registered 200 m and 400 m in front of its line.
- The company's one bomb a turn goes on as before, for both sides.

**Two things the traces showed first:**
- **Nobody sees anybody until about 250–300 m.** Across 700 m of open ground
  the Western drill advances about 50 m a turn. No side detects the other
  before turn 10.
- **With the eighth round's fire, the defender broke on turn 7** without
  having seen the attacker, 400 m away. It never fired a shot, so the attack
  cost nothing. That is where the 100% came from.

### Results

Company, Western drill, 100 battles a cell, seeds from 1000, the accuracy
trial on throughout. A prepared position in **full** cover now has a roof,
so impact and air burst give the same results there, within noise.

| Attacker's fire | Prepared in | Defender's section | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| none | either | off | 16% | 61% | 24% | 45% | 2/4 |
| | either | **on** | **0%** | **0%** | 4% | 96% | 1/4 |
| 2 × 4 shells for the battle | full | off | 50–51% | 95–96% | 11% | 62% | **4/4** |
| | full | on | 1–2% | 31% | 13% | 97% | 2/4 |
| | partial | off | 78% (impact), 99% (air) | 100% | 0–1% | 80–94% | 2/4 |
| | partial | on | 27% (impact), 85% (air) | 89–100% | 0–3% | 97–98% | 2/4 |
| 3 tubes × 3 bombs a turn | full | off | 45–46% | 100% | 1% | 76% | 3/4 |
| | full | on | 2% | 91% | 2% | 97% | 2/4 |
| | partial | off | 92% (impact), 100% (air) | 100% | 0% | 87–93% | 2/4 |
| | partial | on | 43% (impact), 95% (air) | 100% | 0% | 97–98% | 3/4 (impact) |
| 2 × 4 shells + 3 × 1 bomb | full | off | 77–78% | 100% | 1% | 79% | 2/4 |
| | full | on | 17–18% | 92–93% | 2% | 97% | 2/4 |
| 2 × 4 shells + 3 × 3 bombs (the author's) | full | off | 89% | 100% | 0% | 86% | 2/4 |
| | full | on | **39–40%** | **100%** | 0% | 97% | **3/4** |
| | partial | off | 100% | 100% | 0% | 95–96% | 2/4 |
| | partial | on | 96% (impact), 100% (air) | 100% | 0% | 98–99% | 2/4 |

Where impact and air burst differ, the row gives both. The 1:1 attack never
wins more than 10%.

These are the figures after a review of the first cut (2026-09-23). Being on
the mark used to follow the aim from mission to mission, so the defender
stayed on the mark all the way in from one registered point. Now it holds
only within 100 m of where a round landed on the mark, or of a registered
point. The fix moved no cell by more than 2 points. The registered points at
200 m and 400 m already cover the ground from 100 m to 500 m, and that is
where the defender first sees the attacker. **Registration is what makes the
defender's section decisive.**

### What it says

- **Fire missions make artillery about right on its own.** Adjusting from
  270 m takes several turns: the first shell lands within 50 m only 2% of
  the time, the fourth half the time. So two missions of four shells, fired
  for effect once on the mark, give a 2:1 attack on a dug-in company 50%, and
  a 3–4:1 attack 96%. That meets all four company targets.
- **The defender's own section decides almost everything.** With targets
  registered on the approach, it fires for effect at 25 m CEP the turn it
  sees the attacker. Without fire support of its own, a company never takes
  a prepared position, even at 3–4:1.
- **With both sides firing, the author's allocation lands in the band.** A
  2:1 attack wins 39–40% and a 3–4:1 attack 100% against a dug-in, roofed
  defender.
- **But it is a fire duel, and it is won before contact.** Under the
  author's allocation, the attacker who wins at 3–4:1 loses nobody (0%,
  against a target of 10–30%): the defender broke under fire before it saw
  him. The attacker who loses is broken by
  registered fire as he comes into view. Explosives put out 96–99% of the
  men. That is well past the author's 75%, because small arms rarely get
  the chance.
- **The fire never runs out.** Nine bombs a turn for as long as there is a
  target is the document's rate of fire with no ammunition behind it
  (backlog 12). How much a section can fire in a battle is the lever that
  would turn this duel into a fight.
- **An air burst still matters against a hasty position**, which has no
  roof. Against partial cover, the defender's section on, it takes a 2:1
  attack from 27–43% to 85–95%.

## Tenth round: fire missions with a set number of rounds, 2026-09-23

The author's rulings after the ninth round:
- Accuracy by CEP, adjusting, observers and registered targets are rules
  (decisions 32–33).
- Counter-battery fire only for guns on the map (decision 35), so none today.
- **Moving off a shelled position**: yes. It is a drill option,
  `SquadDrill.displace`, harness flag `--displace`.
- **At company and below, fire support is assigned missions**, each with a
  set number of rounds for effect. "I think the default should be 6 but
  let's check it out both doctrinally and balance-wise" (decision 34).

### What doctrine says about 6

The open sources are thin; the planning tables (FM 6-20-30 Appendix B, the
JMEM) are not published. What they give:
- **A mortar section's fire for effect "should seldom consist of any less
  than five rounds for each mortar"** (FM 7-90, the 60 mm section). For a
  3-tube section, that is 15 or more.
- **An artillery battalion's example fire for effect is four rounds per
  tube** (a Marine Corps call-for-fire handout).
- A battery of 6 guns firing one round each is 6. A battery's fire for
  effect is usually one to three rounds a gun, so 6–18.
- The defence has a **final protective fire** with its own ammunition set
  aside, one per battery and one per mortar platoon.

So **6 is a battery's single volley, or a mortar section's two bombs a
tube**. That is the low end for artillery and under what doctrine asks of
mortars.

### How the harness fights with it

- A side with missions assigned calls them **one at a time per weapon**: a
  section or battery fires one mission at a time.
- The attacker calls on what it has seen of the defender nearest the
  objective. Until then it calls on its **planned targets**: the centre of
  each defending platoon, one after another. When it comes within 400 m the
  fires lift: a check fire (`Game.checkFire`) stops whatever is still to come.
- **Planned** (`--fires ...,registered=on`) means the attacker's guns are
  registered on those points before the battle (decision 32). They fire for
  effect at once, at the weapon's best accuracy.
- The defender calls on the nearest attacker it has seen, with mortar
  targets registered 200 m and 400 m in front of its line.
- A side with missions assigned gets nothing else. The free bomb a turn
  from the company is only for a side without an allotment.
- Every row: company, Western drill, 100 battles a cell, seeds from 1000.
  The defender is prepared in full cover, which has a roof. The defender has
  4 mortar missions of the same size as the attacker's, unless a row says
  otherwise.

**A review of the first cut changed these figures** (2026-09-23). Two
defects had inflated the attacker's fire:
- A mission sent its next adjusting round before seeing where the last one
  landed.
- A mission called before the lift still landed its rounds after it.
The rows also aimed at the objective's centre, which in the 2:1 layout lies
between the two defending platoons. The figures below are the rerun with all
three fixed.

**Adjusting is slow.** A mission sees its adjusting round only once it
lands: a turn after it is sent for a mortar, two for artillery. So a mortar
adjusts once every 2 turns and artillery once every 3. Artillery from 270 m
needs three or four observed rounds, about 10 turns, and the attacker
reaches the lift in about 7. **Unplanned, the artillery never fires for
effect.**

| Attacker's missions | Planned? | Rounds for effect | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| none (defender: none either; the free bomb for both) | — | — | 16% | 61% | 24% | 45% | 2/4 |
| 2 artillery | no | 6 | 0% | 0% | 10% | 90% | 1/4 |
| 2 artillery + 2 mortar | no | 3 / 6 / 9 / 12 | 1% / 0% / 0% / 0% | 9% / 10% / 29% / 43% | 25% / 24% / 20% / 15% | 82–95% | 2/4 |
| 2 artillery + 4 mortar | no | 6 | 0% | 28% | 20% | 91% | 2/4 |
| 2 artillery | **yes** | 6 | 0% | 55% | 18% | 94% | 2/4 |
| 4 mortar | yes | 6 | 1% | 95% | 2% | 94% | 2/4 |
| 1 artillery + 2 mortar | yes | 3 / 6 / 9 / 12 | 0% / 0% / 0% / 9% | 23% / 67% / 93% / 99% | 28% / 17% / 4% / 0% | 84–98% | 2/4 |
| 2 artillery + 2 mortar | yes | 3 | 1% | 72% | 18% | 85% | 3/4 |
| | yes | 6 | 20% | 97% | 2% | 95% | 2/4 |
| | yes | **9** | **65%** | 100% | 0% | 98% | **3/4** |
| | yes | 12 | 93% | 100% | 0% | 99% | 2/4 |
| 2 artillery + 4 mortar | yes | **6** | **64%** | 100% | 0% | 97% | **3/4** |
| 2 artillery × 6 + 2 mortar × **9** | yes | 6 / 9 | **35–36%** | 98–100% | 1% | 96–97% | **3/4** |
| 2 artillery × 6 + 2 mortar × **12** | yes | 6 / 9 | **48–49%** | 98–99% | 1% | 97% | **3/4** |
| 2 artillery × 6 + 4 mortar × 9 | yes | 6 / 9 | 88% (1:1: 11–16%) | 100% | 0% | 98% | 2/4 |

In the last three rows the defender's missions fire 6 or 9 rounds; the two
give the same result within noise.

**Without the defender's missions** (1 artillery + 2 mortar, 6 rounds; the
defender has none and no free bomb): a 1:1 attack wins 74% unplanned and 91%
planned. The defending company's indirect fire, even the one free bomb a
turn, is what holds a prepared position against an equal attacker.

**Moving off a shelled position** (1 artillery + 2 mortar, 6 rounds; the
defender's squads run 100 m to the rear once, when shelled with no enemy
within 300 m):

| Planned? | 3–4:1 win, staying | 3–4:1 win, moving off |
|---|---|---|
| no | 10% | 40% |
| yes | 67% | 100% |

### What it says

- **6 rounds for effect is doctrine's floor for artillery and right for it
  in balance.** A 6-gun battery's single volley, on a planned target.
- **For mortars, 9–12 is what balances.** With two artillery missions of 6
  and two mortar missions, all planned:
  - mortars at 9 give a 2:1 attack 35–36%;
  - mortars at 12 give it 48–49%;
  - both meet 3 of 4 company targets.
  Doctrine asks 15 or more of a 3-tube section. Mortars at 6 give 20%.
- **Planned targets are what make fire support work in the attack.** Without
  them the adjustment is too slow: the artillery never fires for effect
  before the lift, and no allotment gives a 2:1 attack more than 1%.
- **The defender's own mortars, on registered targets, hold the line.**
  Without its missions, even a 1:1 attack takes a prepared position 74–91%
  of the time.
- **Moving off a shelled position, as built, still hurts the defender.** A
  3–4:1 attack wins 40% against 10% unplanned, and 100% against 67% planned.
  It leaves a roofed position for open ground inside the fire. In doctrine,
  displacement goes to *prepared* alternate positions, out of the registered
  area. The engine gives a force one prepared position, so it cannot be done
  well yet. The option stays off by default.
- **The attacker who wins still barely bleeds when its fire is planned**:
  0–4% at 3–4:1, against a target of 10–30%. Unplanned, it loses 10–25%,
  but rarely wins. The fight is decided by fire, because nobody detects
  anybody before about 300 m (decision 12's detection). The defender's
  missions start only once the attacker is inside that, and the attacker's
  planned fire lands before.

## Eleventh round: who may call fire, 2026-09-23

The author's agenda for this session, item 2: "I'm thinking mortars for
company and above, artillery for battalion and above, but we should test it."
This is **who may call** a weapon at all, not when its guns are on the map
(decision 35). Battalion is not in the harness yet (echelon scaling, backlog
3), so the artillery half is tested only down to company.

Every row: Western drill, a defender prepared in full cover (with a roof),
200 battles a cell, seeds from 1000, `--sweep`'s "reply none" row. The
attacker's targets are planned (`registered=on`). "+ def" means the defender
has 4 mortar missions of 6 on targets registered 200 m and 400 m out. These
were run **before the rule existed**, so any echelon could call anything:

| Attacker's fires | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets |
|---|---|---|---|---|---|---|---|
| none | squad | 4% | 49% | 77% | 17% | 0% | **4/4** |
| defender's mortars only | squad | 4% | 49% | 77% | 17% | 0% | 4/4 |
| 2 mortar × 9 + def | squad | 82% | 93% | 97% | 5% | 63% | 1/4 |
| 4 mortar × 9 + def | squad | 100% | 99% | 99% | 1% | 95% | 1/4 |
| 2 artillery × 6 + 2 mortar × 9 + def | squad | 100% | 99% | 99% | 1% | 93% | 1/4 |
| none | platoon | 2% | 67% | 100% | 8% | 0% | **3/4** |
| defender's mortars only | platoon | 0% | 67% | 100% | 8% | 32% | 3/4 |
| 2 mortar × 9 + def | platoon | 27% | 100% | 100% | 2% | 79% | 2/4 |
| 4 mortar × 9 + def | platoon | 99% | 100% | 100% | 0% | 100% | 1/4 |
| 2 artillery × 6 + 2 mortar × 9 + def | platoon | 98% | 100% | 100% | 0% | 99% | 1/4 |
| none (the free bomb for both) | company | 0% | 15% | 55% | 24% | 46% | 2/4 |
| defender's mortars only | company | 0% | 0% | 0% | 7% | 91% | 1/4 |
| 2 mortar × 9 + def | company | 0% | 0% | 43% | 25% | 92% | 2/4 |
| 4 mortar × 9 + def | company | 0% | 14% | 99% | 1% | 96% | 2/4 |
| 2 artillery × 6 + 2 mortar × 9 + def | company | 0% | 35% | 100% | 1% | 96% | **3/4** |
| 4 mortar × 12 + def | company | 2% | 56% | 100% | 0% | 97% | **3/4** |
| 6 mortar × 9 + def | company | 1% | 46% | 100% | 0% | 96% | **3/4** |
| 6 mortar × 12 + def | company | 11% | 83% | 100% | 0% | 97% | 2/4 |
| 8 mortar × 9 + def | company | 1% | 46% | 100% | 0% | 96% | **3/4** |

The company row with artillery reproduces the tenth round's 35%, so the two
rounds measure the same thing.

- **Any indirect fire swamps a squad or a platoon fight.** Two mortar
  missions let a squad take a prepared position at 1:1 82% of the time.
  Without fire, small fights meet their targets: 4 of 4 at squad and 3 of 4
  at platoon.
- **Mortars alone balance a company attack.** Four missions of 12, or six of
  9, meet 3 of 4 company targets. The company doesn't need artillery, which
  supports "artillery for battalion and above".
- At squad the defender's registered mortars never fire (0% by HE): the
  points 200 m and 400 m out lie outside where a squad fight happens.

**The author's rulings** (2026-09-23): mortars at company and above,
artillery at battalion and above (decision 37). Rounds for effect default to
6 for artillery and 12 for mortars (decision 36).

**The same under the rule as built**, where both sides command the battle's
echelon and the harness strikes what they may not call
(`npm run balance -- --sweep --n 200 --drill western
--fires artillery=2,mortar=4,registered=on --defender-fires
mortar=4,registered=200/400`; `--any-echelon` switches the rule off). The
missions fire the new defaults, 12 for a mortar, on both sides:

| Fires | Echelon | Struck | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets |
|---|---|---|---|---|---|---|---|---|
| attacker 2 artillery + 4 mortar planned, defender 4 mortar | squad | all | 4% | 49% | 77% | 17% | 0% | 4/4 |
| the same | platoon | all | 2% | 67% | 100% | 8% | 0% | 3/4 |
| the same | company | artillery | 1% | 47% | 100% | 0% | 98% | **3/4** |
| attacker 2 mortar planned, defender 4 mortar | company | — | 0% | 0% | 55% | 18% | 96% | 2/4 |
| attacker 4 mortar unplanned, defender 4 mortar | company | — | 0% | 0% | 41% | 12% | 96% | 2/4 |
| none either side (the free bomb) | company | — | 0% | 15% | 55% | 24% | 46% | 2/4 |

What is still missing is the tenth round's last finding: **a winning
attacker barely bleeds** (0% at 3–4:1 with planned fire, against a target of
10–30%), because nobody sees anybody before about 300 m. The author's answer
is observation posts, set in mission planning (decision 38), and binoculars
and UAVs later.

## Twelfth round: the defender's mission plan, 2026-09-23

Rules decision 38: registered targets, observation posts and alternate
positions are the player's to set before the battle. The harness gives the
defender a plan (`--defender-ops`, `--alternate <m>`):
- its command groups are observation posts (at squad, the squad), and the
  drill leaves an OP where it stands;
- each prepared squad has an alternate position so many metres behind it,
  and the drill's displacement (`--displace`) goes there.

Western drill, full cover, 200 battles a cell, rules decision 37 on, the new
defaults (12 rounds a mortar mission). Attacker: 4 mortar missions, planned.
Defender: 4 mortar missions, registered 200 m and 400 m out.

| Defender's plan | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets |
|---|---|---|---|---|---|---|---|
| none | company | 1% | 47% | 100% | 0% | 98% | 3/4 |
| OPs | company | 5% | 75% | 100% | 3% | 96% | 2/4 |
| displace, no alternate | company | 8% | 100% | 100% | 0% | 99% | 2/4 |
| displace to an alternate 150 m back | company | 4% | 100% | 100% | 0% | 99% | 2/4 |
| OPs + displace to an alternate | company | 15% | 100% | 100% | 3% | 98% | 2/4 |
| none | platoon | 2% | 67% | 100% | 8% | 0% | 3/4 |
| OPs | platoon | 12% | 69% | 100% | 8% | 0% | 3/4 |
| displace to an alternate 150 m back | platoon | 2% | 67% | 100% | 8% | 0% | 3/4 |
| attacker unplanned; defender none | company | 0% | 0% | 41% | 12% | 96% | 2/4 |
| attacker unplanned; defender OPs | company | 0% | 3% | 58% | 16% | 88% | 2/4 |
| no missions either side (the free bomb); defender OPs | company | 0% | 0% | 0% | 3% | 95% | 1/4 |

(Row "no missions either side" without OPs: 0% / 15% / 55%, from the
eleventh round.)

What it says:
- **The OPs work as a rule.** In a company attack the defender first sees
  the attacker at about 650 m instead of 300 m, from turn 1.
- **Where the defender has only the free bomb, OPs win the defence
  outright.** The attacker's 3–4:1 attack goes from 55% to 0%: a bomb a
  turn on an attacker seen from 650 m.
- **Everywhere else OPs *help the attacker*, and we do not yet know why.**
  At company 2:1 the attacker's win goes from 47% to 75%. At platoon 1:1,
  with no fire at all, it goes from 2% to 12%, and the attacker also first
  sees the defender a little further out (300 m against 250 m). Ruled out so
  far:
  - the defender spending its missions early (holding them until the
    attacker is inside 500 m changes nothing: 48% and 72%);
  - the OP command groups standing inside the attacker's planned targets
    (weapons squads as OPs give 66% at company, 12% at platoon);
  - the defending squads firing early (none fire beyond 300 m either way).
  The defending platoon's command group moves more with OPs (42 moves in 20
  battles against 29). That is the lead to follow: something in the drill
  reacts to an early contact.
- **Displacing, even to a prepared alternate, still hurts the defender**
  at company (2:1 goes from 47% to 100%). The alternate position gives it
  cover when it gets there, but it runs through the attacker's fire to reach
  it, and the attacker, now seeing it move, walks its missions onto it.
  Displacement stays off by default.
- None of this touches the attacker who wins without bleeding (0–3% at
  3–4:1). Seeing further only helps if the defender's fire can use it.

**Rerun with the drill fixed** (same settings). The lead above was half of
it: the drill gave the defender's squads a hold-fire order and its command
groups none, so their covering fire answered anything the side had seen at
300–400 m and gave them away. Counted over 100 platoon 1:1 battles, the
defender's covering shots beyond 300 m came from command groups only, 125
without OPs and 345 with them. `drill.ts` now gives a defending command group
the squads' fire discipline.

| Row | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets |
|---|---|---|---|---|---|---|---|
| eleventh: rule on, the default plan | squad | 4% | 49% | 77% | 17% | 0% | 4/4 |
| eleventh: rule on, the default plan | platoon | 1% | 67% | 100% | 8% | 0% | 3/4 |
| eleventh: rule on, the default plan | company | 1% | 46% | 100% | 0% | 99% | 3/4 |
| eleventh: attacker 2 mortar planned | company | 0% | 0% | 54% | 17% | 99% | 2/4 |
| eleventh: attacker 4 mortar unplanned | company | 0% | 0% | 41% | 11% | 98% | 2/4 |
| eleventh: none either side (the free bomb) | company | 0% | 0% | 42% | 26% | 50% | 2/4 |
| plan: OPs | company | 10% | **83%** | 100% | 3% | 94% | 2/4 |
| plan: displace, no alternate | company | 10% | 100% | 100% | 0% | 99% | 2/4 |
| plan: displace to an alternate 150 m back | company | 4% | 100% | 100% | 0% | 99% | 2/4 |
| plan: OPs + displace to an alternate | company | 21% | 100% | 100% | 3% | 97% | 2/4 |
| plan: OPs | platoon | 1% | 59% | 100% | 8% | 0% | 3/4 |
| plan: displace, no alternate | platoon | 1% | 67% | 100% | 8% | 0% | 3/4 |
| plan: displace to an alternate 150 m back | platoon | 1% | 67% | 100% | 8% | 0% | 3/4 |
| plan: OPs + displace to an alternate | platoon | 1% | 59% | 100% | 8% | 0% | 3/4 |
| attacker unplanned; defender OPs | company | 0% | 3% | 64% | 17% | 83% | 2/4 |
| the free bomb; defender OPs | company | 0% | 0% | 0% | 4% | 90% | 1/4 |

- **At platoon the puzzle is gone**: OPs now help the defender a little (2:1
  67% → 59%), as they should.
- **At company OPs still help the attacker, more than before** (2:1 46% →
  83%, and unplanned 3–4:1 41% → 64%). The cause is found, below: it is a
  rule, not the harness.
- With only the free bomb, OPs still win the defence outright (3–4:1: 42% →
  0%).

**Why OPs help the attacker at company: seeing the target makes a mission
slower.** Company 2:1, 60 battles a row, the defender's 4 mortar missions
counted as they are called:

| Defender | Attacker wins | Defender's calls | Median turn | Median gap to the attacker | Straight to effect |
|---|---|---|---|---|---|
| no missions, OPs or not | 60/60 | 0 | — | — | — |
| missions, no OPs | 29/60 | 65 | 11 | 209 m | 65 of 65 |
| missions, OPs | 49/60 | 142 | 6 | 452 m | 41 of 142 |
| missions, OPs, but its fire counted as unobserved | **23/60** | 238 | 3 | 601 m | 238 of 238 |
| missions held until the attacker is inside 300 m of the command group, no OPs / OPs | 53 / 56 of 60 | 36 / 25 | 11 | 209 m | all |

- Decisions 33–34: a mission its side **sees** adjusts, one round at a time
  (a mortar every second turn, up to 4), before its 12 rounds for effect. A
  mission **nobody sees** fires for effect at once, at first-round accuracy.
- Without OPs the defender sees the attacker only at about 200 m, where its
  calls cannot be observed from the line, so every one goes straight to
  effect. With OPs it sees the attacker at 450 m, its calls are observed, and
  they adjust onto a force that keeps walking out from under them. The
  missions are spent before the assault.
- The same OPs with the fire counted as unobserved **help the defender**
  (29 → 23 of 60). Holding the calls until the attacker is close makes it
  worse, so the timing is not the lever; the method is.
- **This is a rules question for the author.** In doctrine the observer
  chooses the method in the call itself: *adjust fire*, or *fire for effect*
  straight away when the target's location is good enough or surprise
  matters. Today the engine chooses, and against a moving target it chooses
  the slower one exactly when the side can see.
- The eleventh round's figures barely move with the fix (company 2:1 47% →
  46%).

## Thirteenth round: the caller chooses the method, 2026-09-23

The author's ruling on the twelfth round: **the caller chooses adjust fire or
fire for effect at once** (decision 39); for a simulated lower echelon, Jev
will. The harness takes `method=effect` in `--fires` and `--defender-fires`.

Company, Western drill, full cover, 200 battles a cell, decision 37 on, the
new defaults. Attacker 4 mortar missions, planned unless the row says so.
Defender 4 mortar missions registered 200 m and 400 m out.

| Defender | Attacker | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets |
|---|---|---|---|---|---|---|---|
| adjusts, no OPs | planned | 1% | 46% | 100% | 0% | 99% | 3/4 |
| fire for effect, no OPs | planned | 1% | 46% | 100% | 0% | 99% | 3/4 |
| adjusts, OPs | planned | 10% | 83% | 100% | 3% | 94% | 2/4 |
| **fire for effect, OPs** | planned | **2%** | **49%** | **99%** | **25%** | 98% | **4/4** |
| fire for effect, OPs | unplanned, adjusts | 0% | 4% | 33% | 22% | 96% | 2/4 |
| fire for effect, OPs | unplanned, fire for effect | 1% | 21% | 96% | 29% | 97% | 3/4 |

- **Without OPs the method changes nothing**: the defender sees the
  attacker only when its calls cannot be observed anyway, and those went
  straight to effect already.
- **With OPs and fire for effect the company meets all four targets** — the
  first configuration in any round to do so. And the winning attacker
  **bleeds**: 25% of its men at 3–4:1, inside the 10–30% target, where every
  earlier row with fire support gave 0–4%. The defender seeing the attack
  coming, and bringing its fire down at once, is what the tenth round was
  missing.
- An attacker without planned targets does better firing for effect too
  (3–4:1: 33% → 96%). Adjusting onto a hidden defender that nobody of its
  side can see was never possible; what it lost was the time.
- So **the harness's best company configuration** is now: attacker 4 mortar
  missions planned; defender 4 mortar missions registered, observation posts,
  fire for effect. The harness's own default stays `adjust`, so every earlier
  row reproduces.

## Fourteenth round: nobody knows exactly where the enemy is, 2026-09-28

The author's question: in an attack neither side knows exactly where the
other is, so a pre-planned fire cannot be accurate. Was that accounted for?
Only in the engine. The harness's attacker planned its fires on the **exact
centre** of each defending position, taken from the layout. The smart
attacker built its fire plan around the same exact centre. Rules decision 51
adds the two halves, both off by default in the harness so every earlier row
reproduces:

- `--planning-error [share]`: the attacker's planned targets are where its
  start line would judge each position to be. They are off along the sight
  line by `share` of the range (0.2 unless given) and across it by 10 mils.
  The defender's registered approach points are off the attacker's real
  line by the same share of their distance.
- `--location-error`: every sighting in the game carries the error
  (`GameOptions.locationError`).

The tables below were measured before a review tightened how repeated
sightings combine (at most once an observer a turn). They were rerun on the
final code; see *Rerun* at the end of the round.

Company, plain drill, full cover, morale on, 300 battles a cell, seeds from
1000. Both sides have the calibrated mortar section (decision 43: 12
missions, fire for effect).

| Planning error | Location error | 3:1 win | 3:1 out by HE | 2:1 win | 2:1 out by HE |
|---|---|---|---|---|---|
| none | off | **95%** | 75% | 7% | 69% |
| none | on | 93% | 76% | 5% | 69% |
| 0.2 | off | 21% | 67% | 0% | 57% |
| **0.2** | **on** | **20%** | 69% | **0%** | 57% |

How big the planning error has to be (location error on):

| Planning error (share of range) | Off by at ~700 m (1 SD) | 3:1 win | 2:1 win |
|---|---|---|---|
| 0 | 0 | 93% | 5% |
| 0.05 | 35 m | 66% | 1% |
| 0.1 | 70 m | 41% | 0% |
| 0.15 | 105 m | 29% | 1% |
| 0.2 | 140 m | 20% | 0% |
| 0.3 | 210 m | 13% | 0% |

The attacker's method, planning error 0.2 and location error on (none, off
in brackets):

| Attacker's fires | 3:1 win | 2:1 win |
|---|---|---|
| fire for effect on the plan (calibrated) | 20% (95%) | 0% (7%) |
| adjust, not registered | 5% (25%) | 0% (0%) |
| fire for effect, registered on the plan | 22% (95%) | 0% (17%) |
| adjust, registered on the plan | 22% (95%) | 0% (17%) |

The last two rows are identical by construction, not a harness bug: a
registered target goes straight to effect whatever the method (decision 39).

The thirteenth round's best configuration (Western drill; attacker 4
missions registered, fire for effect; defender 4 missions registered at 200
and 400 m, observation posts, fire for effect), 200 a cell:

| Planning error | Location error | 3:1 win | 2:1 win |
|---|---|---|---|
| none | off | 51% | 36% |
| 0.2 | off | 15% | 5% |
| 0.2 | on | 21% | 3% |

### What it says

- **The attack's success was the fire plan's perfect intelligence.** With
  the plan off by an eye's error the calibrated 3:1 attack wins 20%, not
  95%, and explosives fall from 75% of losses to 69%. The attacker's bombs
  fall around where it thought the platoon was, and the platoon, dug in with
  overhead cover and a lethal area of a few tens of metres, is not there.
- **Even a small error costs most of it.** At 5% of the range, 35 m, the
  3:1 attack already falls to 66%. A mortar bomb's lethal area on the
  research figures is a disc of about 12 m radius, and a squad in overhead
  cover is hurt only by a near-direct hit. That is why the answer is so
  sensitive.
- **Location error alone changes little** in the calibrated battles (2
  points either way; 6 in the Western-drill 3:1 row, 200 battles a cell, which
  is inside its noise). By the
  time a side sees an enemy, it is inside 300–400 m. At that range the
  error is 60–80 m along the line, and repeated sightings of a force
  holding still bring it down. The defender's calls on a moving attacker
  were never precise anyway (first-round CEP 100 m).
- **Adjusting fire cannot rescue a wrong plan.** An adjusted mission walks
  its rounds onto the point it was given, not onto the enemy. The attacker
  sees the dug-in defender too late to give it a better point. Adjusting
  also spends minutes, which is why it does worse than firing for effect.
- **So under realistic intelligence, 3:1 does not win against a prepared
  platoon in the harness.** That breaks the design principle, so it is an
  open question for the author (README, decision 51). What gives an attacker
  the defender's location in reality is reconnaissance: observers,
  patrols, a UAV, contact with the forward edge. The harness's attacker has
  none of these. The defender's side has observation posts (decision 38),
  and the attacker's side needs its equivalent before the fire plan can be
  judged.

### Rerun on the final code

The first table, rerun after repeated sightings were limited to one
estimate an observer a turn (300 a cell, same seeds):

| Planning error | Location error | 3:1 win | 3:1 out by HE | 2:1 win | 2:1 out by HE |
|---|---|---|---|---|---|
| none | off | 95% | 75% | 7% | 69% |
| none | on | 95% | 75% | 6% | 69% |
| 0.2 | off | 21% | 67% | 0% | 57% |
| 0.2 | on | 20% | 67% | 0% | 57% |

Nothing that matters moved. Location error alone now costs the attacker
nothing at 3:1 (95%, was 93%).

## Fifteenth round: reconnaissance before the attack, 2026-09-29

The author: "let's see how sending recon affects this — the use of recon is
a lesson worth teaching." Rules decision 52 gives the drill a reconnaissance
(`--recon N`): the N squads nearest the objective go ahead scouting on
hold-fire, and the rest wait until the side has found something. The fire
plan can wait for the scouts too (`wait=on`, or `--fires calibrated-wait`).

Company, morale on, 300 battles a cell. Fires planned on an estimate (0.2),
location error on, and the defender has the calibrated mortar section.

**Plain drill** (the defender opens fire at 400 m):

| Attacker | 3:1 win | 3:1 turns | 3:1 attacker down | 2:1 win |
|---|---|---|---|---|
| no recon, fires on the estimate | 20% | 12 | 25% | 0% |
| 1 scout, fires on the estimate | 37% | 23 | 30% | 6% |
| **1 scout, fires wait for it** | **59%** | 22 | 32% | 0% |
| 2 scouts, fires wait | 33% | 22 | 29% | 0% |
| 3 scouts, fires wait | 12% | 21 | 26% | 0% |
| 1 scout, fires wait, adjusting | 15% | 23 | 28% | 0% |
| *1 scout, fires wait, on the truth (no planning error)* | *71%* | 20 | 33% | 0% |
| *no recon, on the truth (the old harness)* | *95%* | 10 | 38% | 7% |

**Western drill** (the defender holds its fire to 200 m):

| Attacker | 3:1 win | 2:1 win |
|---|---|---|
| no recon, fires on the estimate | 7% | 0% |
| 1 scout, fires wait for it | 1% | 0% |

The 3:1 turns and losses are the loser's median for the row where the
attacker mostly loses, and the attacker's own where it mostly wins.

### What it says

- **One scout is worth most of what perfect intelligence was.** Against a
  defender that opens up at 400 m, one squad sent ahead finds the position by
  drawing its fire. The guns fire on its report, about 300 m out and 60 m
  off, and the attack triples its chance, 20% to 59%. In a traced battle the
  scout lost 8 of 9 men, and the main body went in untouched and won.
- **The guns have to wait for it.** Firing the plan anyway while the scout
  goes forward gives 37%, since half the missions are spent on the
  estimate.
- **Send one.** Two scouts give 33% and three give 12%. More squads out in
  front means more men under the defender's small arms and mortars, and
  those men count toward the attacker's breakpoint.
- **Adjusting is still worse than firing for effect** (15%): the scout sees
  the rounds land, but adjusting takes minutes the scout does not have.
- **It takes twice as long**: 20–25 turns instead of 10–12. That is the
  price of reconnaissance, and the game should show it.
- **Against fire discipline the scout finds nothing.** Under the Western
  drill the scout reaches 250 m and never sees the dug-in position. A force
  holding still is found only inside 20 m (the document's hidden-enemy band),
  and this defender does not fire at a single squad. Its mortars see the
  scout (a mover, in the 300 m band) and destroy it, and indirect fire gives
  nothing away. With the scout gone the main body is released blind. So
  **reconnaissance here works only by drawing fire**. Finding a still
  position by watching it, which is what a real patrol does with optics from
  hundreds of metres, cannot happen under the 20 m band. That is a question
  for the author (README, decision 52).

## Sixteenth round: watching finds a still enemy, 2026-09-29

The author: "let observers find a still enemy further than 20 m." Rules
decision 53 (`--still-detection`): a force in position finds a still enemy
out to 300 m (600 m from an observation post), at its chance inside 20 m
falling off in a straight line to the edge. The scouts can bound and
observe (`--watch N`: halt N turns after each 50 m bound).

Company, morale on, fires planned on an estimate (0.2), location error on,
the defender's calibrated mortars, the attacker's fires waiting for contact
(`--fires calibrated-wait`), one scout (`--recon 1`). 300 battles a cell
(200 for the experiment).

| Scout | Still detection | Plain 3:1 | Plain 2:1 | Western 3:1 | Western 2:1 |
|---|---|---|---|---|---|
| walks on | off | 59% | 0% | 1% | 0% |
| walks on | on | 60% | 0% | 1% | 0% |
| halts 1 turn a bound | off | 66% | 0% | 1% | 0% |
| halts 1 turn a bound | on | 64% | 0% | 1% | — |
| halts 2 turns a bound | off | 60% | 0% | — | — |
| halts 2 turns a bound | on | 57% | 0% | — | — |
| halts 4 turns a bound | either | draw (60 turns) | draw | — | — |
| *experiment: halted scout sees 600 m* | on, halts 1 | *35%* | *1%* | *42%* | *5%* |
| *experiment: halted scout sees 600 m* | on, halts 2 | *32%* | *0%* | *38%* | *1%* |

Without the scout, still detection moves nothing either (plain 20% → 20%,
Western 7% → 6%).

### What it says

- **The rule is symmetric, and the defender wins the exchange.** A traced
  battle (Western drill, halting 2 turns): the scout halted 400 m, 350 m,
  then 300 m out, found nothing (still detection reaches 300 m, and its
  chance is nil at the edge), and at 300 m was shelled by the defender's
  mortars. Five defending forces had been watching it at the same 300 m.
  (The halts come every 6 turns rather than every 3 because out ahead the
  scout is outside its command group's every-turn order band.)
- **Watching longer only costs time.** Halting 4 turns a bound, the attack
  never arrives within the harness's 60 turns.
- **Optics would make the lesson.** The experiment, a halted scout that
  sees a still force as far as an observation post (600 m), is not in the
  code. Against fire discipline it takes the 3:1 attack from 1% to 42%.
  Against the plain drill it lowers it, 64% to 35%: the scout finds the
  position sooner but from twice as far, and a report from 600 m is off
  by twice as much (120 m along the line, rules decision 51). So what the
  scout needs is to see further than it is seen, and then to get close
  enough, or look long enough, to fix the position. That is a question for
  the author (README, decision 53).

## Seventeenth round: binoculars, and a longer look, 2026-09-29

The author: "give scouts binoculars and let a longer look sharpen it."
Rules decision 54: a halted scout watches as an observation post does
(`--binoculars`), and a force in position keeps its eyes on a still enemy
it has found, each turn's look sharpening the report (`--keep-eyes-on`).
The drill finds, fixes, then assaults (`--look N`: the main body waits N
consecutive turns of the scouts holding the enemy at the objective), and the
guns can wait for a sharp report (`aim=N`).

Company, morale on, 200 battles a cell. Fires planned on an estimate (0.2),
location error on, still detection on, the defender's calibrated mortars,
one scout bounding and halting one turn a bound, and the attacker's mortars
firing for effect only on what the side has seen.

| Scout | Look | Guns wait for | Western 3:1 | Western 2:1 | Plain 3:1 | Plain 2:1 |
|---|---|---|---|---|---|---|
| eyes | — | any report | 1% | 0% | 66% | 0% |
| eyes | 4 turns | ≤40 m | 1% | 0% | 70% | 0% |
| binoculars | — | any report | 21% | 1% | 26% | 0% |
| **binoculars** | **4 turns** | any report | **86%** | 1% | **95%** | 1% |
| binoculars | 4 turns | ≤40 m | 82% | 3% | 90% | 2% |
| binoculars | 8 turns | ≤40 m | 85% | **21%** | 92% | **21%** |

The Western drill's defender holds its fire to 200 m; the plain drill's
opens up at 400 m.

### What it says

- **Find, fix, then assault.** With binoculars and a 4-turn look the 3:1
  attack wins 86–95%, where it won 1–66%. That is what perfect intelligence
  gave before decision 51 (95%), now earned by a scout.
- **Binoculars alone make it worse** (21–26%): the scout finds the position
  at 600 m, the company goes at once, and the guns fire on a report 60 m
  off. The look is the half that pays.
- **The look is what sharpens it.** In a traced battle (Western drill, seed
  1002) the scout bounded and halted forward and found a squad at 550 m on
  turn 8, 39 m off. Held in sight, the report narrowed to 28, 23, 20, 18 and
  14 m. The guns landed 0–12 m from the squads, the defence broke on turn 18
  with 13 men down, and the attacker lost nobody.
- **Waiting for a 40 m report adds nothing** once there is a look: by the
  time the company goes, the report is sharper than that anyway.
- **A longer look buys 2:1** (21% at 8 turns) at the cost of time: battles
  run 38–47 turns.
- **Without binoculars the look buys nothing**: the scout sees nothing it
  can hold at 300 m before the defender's mortars find it.
- The scouts no longer stop for a command group glimpsed away from the
  objective: in an earlier version the scout's binoculars picked up the
  defender's moving command group from the start line, the scout stopped
  there, and the company went in blind.

### With a floor on the look, 2026-09-29

The author: 85% is the upper bound for 3:1. The look had no limit: a report
watched long enough became as good as a laser fix. Now it sharpens only to
CAT IV's best (31 m circular error, `BEST_VISUAL_FIX_CE_M`). The same
configuration, binoculars, the guns waiting for any report, 300 a cell:

| Drill | Look | 3:1 before | 3:1 with the floor | 2:1 before | 2:1 with the floor |
|---|---|---|---|---|---|
| Western | 4 turns | 86% | **82%** | 1% | 0% |
| Western | 8 turns | 85% | **83%** | 21% | 2% |
| plain | 4 turns | 95% | 92% | 1% | 2% |
| plain | 8 turns | 92% | 91% | 21% | 1% |

(The "before" 8-turn rows also waited for a report within 40 m.) Against the
Western drill, whose defender keeps its fire discipline, the 3:1 attack sits
inside the author's 85%. The plain script's defender opens fire at 400 m and
gives its position away, and there it is still above. The 2:1 attack's 21%
at an 8-turn look came from the unlimited sharpening.

## Eighteenth round: the scenarios on their own ground, headless, 2026-09-29

The harness is flat and empty; the scenarios are on the tel. The browser tool
plays them at two minutes a battle and disagreed with the harness (the scout
did not pay there). `npm run scenario-sim` (`src/sim/scenarioBattle.ts`)
plays a generated scenario headless, about 150 battles a minute:
- the **squads on both sides fight by the drill**, the executor the real
  game uses (only squad and platoon are scripted in the game);
- the **attacking company commander is scripted**, a stand-in for Jev
  (backlog 15). `CompanyPlan` holds its choices: where it thinks the enemy
  is (the tasking, spoilt by an eye's error, drawn as the browser tool draws
  it), whether it registers its plan, whether its guns wait for the scouts,
  where the company waits (`--wait-in dead-ground`), and where the scouts
  watch from (`--scout-from vantage`);
- the **defender** holds by the drill and calls its mortars, for effect, on
  the nearest attacker it knows of, as the browser tool's defender does.

Two tools for the commander, in `src/app/deadGround.ts`, both reading the
ground with the engine's own sight test: **dead ground** (the nearest spot
out of sight of where the enemy is or is thought to be) and a **vantage
point** (the spot 350–550 m from where the plan puts the enemy that sees
most of it, on the attacker's side: beyond a still force's 300 m, inside
binoculars' 600 m). The drill waits where the order says (`DrillTask.waitAt`)
and sends its scouts to the observation point (`DrillTask.scoutTo`).

Company, morale on, 200 battles a row, seeds from 1000, the scenarios' own
fire (12 mortar missions a side), decisions 51–54 on as the scenarios have
them. The plan is on an estimate unless the row says so. Recon: one scout
bounding and halting a turn a bound, a 4-turn look, the guns waiting for it.

| Company | Drill | 3:1 (`telAzekaAssault`) | 2:1 (`telAzekaAssault2`) |
|---|---|---|---|
| plan on the truth | plain | 68% | 32% |
| plan on the truth | Western | 76% | 40% |
| plan on an estimate | plain | 20% | 9% |
| plan on an estimate | Western | 23% | 11% |
| + a scout, straight at the objective | plain | 21% | 7% |
| + a scout, straight at the objective | Western | 18% | 7% |
| + the company in dead ground | plain | 24% | 7% |
| + the company in dead ground | Western | 16% | 7% |
| + the scout to an observation point | plain | **28%** | **16%** |
| + the scout to an observation point | Western | **18%** | **15%** |

### What it says

- **The runner agrees with the browser, not the harness.** Seeds 11–18
  without recon: 1 of 8 and 0 of 8 (the browser 2 of 8 each). With a scout
  the attack does not come near the harness's 82–92%.
- **On the tel, the plan on the truth wins 68–76% at 3:1**, inside the
  author's 85%. The loss to an estimated plan (to 20–23%) is as on flat
  ground.
- **Dead ground changes nothing here**: the start line is already out of
  sight of where the plan puts the enemy, and the company lost nothing while
  it waited (a median 0–5 men, the scout's).
- **A scout straight at the objective finds the position at about 260 m**,
  the slope hiding it until then. That is inside the defenders' own 300 m,
  and they see it back and shell it.
- **A scout sent to an observation point** sees from outside that reach and
  lives (the company's losses while waiting fall to 0). The 3:1 attack gains
  a little (plain 20% → 28%), the 2:1 more (9% → 16%). In a traced battle
  the scout found one squad on its way, the guns neutralised it in four
  missions landing 16–19 m off, and the rest of the platoon stayed out of
  its sight.
- **Found on the way: a lockstep** between bound-and-observe and command.
  Out of the every-turn order band a scout that was refused its bound still
  counted it as made, so each turn it could be ordered it wanted to halt,
  and it never moved again. Fixed in the drill: a bound counts only if the
  order got through.
- **Open.** Why the tel stays near 20–30% where flat ground gives 82%: the
  observation point is chosen by what it sees of the plan's points, which
  may be the wrong ones (the plan is off by up to 150 m); one scout sees one
  squad at a time; and the company's assault up the slope. The next traces
  should compare where the scout watches from with where the squads are.

### Why the tel stays low, traced, 2026-09-29

**Where the scout watches from, against where the squads are.** On seed
1000–1005 the observation point the commander chose saw two of RED's three
squads at most, and so did the best spot chosen on the true positions:
squad A-2, on the east of the shoulder, is hidden from every spot 350–550 m
out on the attacker's side. It can be seen only from the east, from the
valley below the tel's east face, and **no spot in reach sees all three**.
One scout can never fix the whole position. Two smaller faults went with
it: the ring was measured from the plan's centre, so on two seeds the point
was 250–320 m from a squad, inside its reach; and the walk to it was
130–400 m.

So the commander now chooses **several observation points**
(`bestVantages`), each for what the others cannot see, each at least 350 m
from every point the plan suspects, and gives one to each scout. On
Tel Azeka with the true positions it sends one scout south-west and one
east.

**The company level moved out of the drill** (the author's item from the
architecture proposal). `SquadDrill.recon` is gone. `app/company.ts` holds
the company's decisions: `CompanyOrders` (which forces scout and from
where, whether the rest hold and where, whether the scouts lie up) and
`ScriptedCompany`, the rule-based commander that issues them. Jev will
issue the same orders. The drill keeps what a squad does:
`SquadDrill.scouting.watchTurns` (bound and observe), holding its fire,
lying up at its point, waiting where told. The harness and the headless
runner both use the same commander (`--recon N`, `--look N`, `--watch N`
as before, `--scout-from vantage`). The flat harness reproduces the
seventeenth round (Western drill, binoculars, 4-turn look: 83% at 3:1, 1%
at 2:1).

On the tel, 200 battles a row, a 4-turn look, the guns waiting for the
scouts, the company in dead ground:

| Scouts | Guns wait for | Drill | 3:1 | 2:1 |
|---|---|---|---|---|
| one, one observation point | any report | plain | 31% | 17% |
| one, one observation point | any report | Western | 24% | 14% |
| two, two points | any report | plain | 32% | 23% |
| two, two points | any report | Western | 25% | 24% |
| two, two points | ≤40 m | plain | **37%** | **23%** |
| two, two points | ≤40 m | Western | **28%** | **25%** |

**Where the guns aim.** Over 40 battles (two scouts, ≤40 m, plain), 416
missions: median 22 m from the nearest live defender, 10% within 5 m, 37%
within 15 m. The aim is good. But **half the missions went at forces in the
open, the command groups**, and the other half at squads under overhead
cover, where a mortar mission does little (decision 48). The defence loses
16–20% of its men. The commander fires on the enemy nearest the objective,
and a platoon's command group near its squads is that as often as a squad
is. Killing it does not break a defence, whose breakpoint counts men.

**Open for the author:** which target the company's guns should take when
the scouts have found several. The squads (what holds the position) or the
command group (what directs it)? In the game that is the company
commander's call, so Jev's.

## Nineteenth round: an agent as Jev, and what it found, 2026-09-29

**An agent in Jev's place.** `npm run jev-sim` puts the attacking company
commander's decisions to whoever answers them as typed questions
(`src/sim/companyQuestions.ts`): how many scouts and from which observation
point, where the company waits, send it in now, which way, whether the
scouts give a base of fire, which mark the mortars fire on (or smoke), and
what a scout in trouble does. A battle is its seed and the answers so far,
replayed each run to the next question, so an agent never touches the
game's state, and the picture it is given is drawn only from its side's
view. Two Claude agents played seeds 11–14 of each assault.

| Seeds 11–14 | Agent | Scripted, best then | Scripted, no recon |
|---|---|---|---|
| 3:1 | 3 wins, 1 loss | 2 wins, 2 losses | 1 win, 1 draw, 2 losses |
| 2:1 | 1 draw, 3 losses | 4 losses | 1 draw, 3 losses |

Both agents found on their own that three or four missions on one squad
before the company moved took it out, where missions spread about did
little, and that firing on the command group did almost nothing.

**What they found wrong, and what changed:**
- **A bug: scouts froze short of their points.** The commander told every
  scout to lie up as soon as the side had any enemy near the objective in
  sight; the first glimpse of a command group froze them wherever they
  were, in five of the eight battles. Now a scout on its way goes on, and
  lies up at its point; at its point it does not give up while the enemy
  is in sight.
- **Losing a command group did nothing to orders or fire.** Rules decision
  55.
- **The questions lacked what a commander has** (item 2): when the attack
  is called off, a damage report after a mission (in words, as the side
  saw it), firing on last-seen marks, what each observation point sees,
  and the danger-close lift. Added.
- **No control after "go"** (item 3): now the axis (straight, or by a
  scout's observation point), a base of fire from the scouts, mortar smoke
  once the company is moving, and a scout under fire or slow can be told to
  go on, lie up or pull back. Smoke costs no mission in the engine: nothing
  rations it.

**The scripted commander again**, with the scout fix and decision 55 in,
200 battles a row on the tel (two scouts at two points, a 4-turn look, the
company in dead ground, the guns waiting for a mark within 40 m):

| Guns take first | Drill | 3:1 | 2:1 |
|---|---|---|---|
| nearest the objective | plain | 46% | 32% |
| **squads** | plain | **59%** | **39%** |
| command groups | plain | 25% | 23% |
| squads | Western | 39% | 35% |
| command groups | Western | 25% | 25% |

(Before the scout fix: 28–37% and 23–25%.) Squads first is the best rule
the scripted commander has. Command groups first is the worst even with
decision 55: a defender holds on standing orders, and the one that calls
its mortars is behind the summit.

## Twentieth round: the mission's deadline, 2026-09-29

Rules decision 58 gives each attack a deadline; the Tel Azeka battles have 45
turns. Without one, a company that scouts first (two scouts, each from an
observation point, a four-turn look, the rest in dead ground, fires held for
contact, aim 40 m) won its attacks in a median 32 turns at 3:1 and 34 at 2:1,
p90 37 and 45, longest 44 and 57 (60 seeds each). With the deadline, 200 battles
each from seed 1000:

    npm run scenario-sim -- --n 200 --recon 2 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from vantage --wait-in dead-ground

| Scenario | Attacker wins | Defender wins (out of time) | Draws | Turns (median) |
|---|---|---|---|---|
| telAzekaAssault (3:1) | 41% (46% before) | 58% (6%) | 2% | 32 |
| telAzekaAssault2 (2:1) | 30% (32% before) | 67% (3%) | 4% | 30 |

The clock takes the slowest attacks: a scripted company that keeps looking
while its scouts lose and regain the enemy. That is the lesson it is there to
teach: recon has a price in time as well as men.

## Twenty-first round: platoon control of the assault, 2026-09-29

Rules decision 59 lets the company commander task its platoons once it goes.
Two fixed answer policies through the question tool, 30 seeds each from 1000
(two scouts to the first observation point, the company in dead ground, go
after four turns holding the enemy in sight or at turn 25, mortars on marks in
sight, the scouts firing in support):

| Policy | 3:1 wins | 3:1 attacker down | 2:1 wins | 2:1 attacker down |
|---|---|---|---|---|
| Every platoon assaults at once | 12/30 | 17% | 3/30 | 22% |
| First platoon a base of fire, the rest bound by platoon and hold short until the fires lift | 16/30 (7 lost out of time) | 15% | 8/30 (5 lost out of time) | 18% |

Control wins more and loses fewer men, and costs time: half its 14 losses at
3:1, and 5 of its 22 at 2:1, were to the deadline (decision 58); the attack
that goes in all at once never ran out of time. The
policy lifts the fires the first turn it is asked; a commander who times the
lift to the last rounds is not measured here.

## Twenty-second round: a reserve and the counterattack, 2026-09-30

Every battle before this one was an attack on a defender that never left
its holes: all three of the platoon's squads forward, no reserve, and no
drill that moved a defender forward. The author ruled (decision 60): a squad
in reserve, and the platoon counterattacks by drill. On the tel, RED-A-1
goes back to (570, 460), dug in beside the platoon command group, 100–112 m
from each forward position. It is the squad whose post saw none of the
approach that the other two did not (from full cover, over a grid of the
southern approach: A-2 sees 192 points, 138 of them only it; A-3 156, 86
only it; A-1 91, none only it). No spot within 170 m of both forward
positions is out of sight of the whole approach; the tel's south face is a
forward slope.

200 battles a row from seed 1000, the nineteenth round's company (two
scouts to two observation points, a four-turn look, the company in dead
ground, the guns waiting for a mark within 40 m), with the plain drill:

| Guns take first | 3:1 before | 3:1 with a reserve | 2:1 before | 2:1 with a reserve |
|---|---|---|---|---|
| squads | 56% | 62% | 36% | 32% |
| nearest the objective | 41% | 52% | 30% | 28% |
| command groups | 23% | 32% | 23% | 21% |

**Almost no counterattack went in**: none in the squads-first and nearest
rows, 1% of battles in the 3:1 command-groups row, and none of those held
the position. Switching it off (`--no-counterattack`) gives the same
squads-first row to the battle. Tracing 40
battles, the nearest any attacker came to a forward position was 148 m, and
usually 210–250 m: every battle ended at a breakpoint after fire,
before an assault. So the change in the table is the layout alone: two
squads forward instead of three helps the attacker at 3:1 by 6–11 points
and does little at 2:1 (−2 to −4, inside the noise of about ±3 points at
this count).

**With the mortars taken off both sides**, so the infantry has to close
(a scratch variant, 60 battles from seed 1000, squads first):

| | 3:1 wins | defender down | counterattacked (held at end) | 2:1 wins | counterattacked (held at end) |
|---|---|---|---|---|---|
| counterattack | 72% (7 lost out of time) | 35% | 30 (3) | 40% (8) | 25 (5) |
| reserve holds | 57% (11) | 34% | — | 35% (12) | — |

The reserve goes in half the battles, and it **helps the attacker**. A trace
shows why: it goes when both forward squads are out, and by then the
platoon is at its breakpoint (16 of 32 men down, on turn 31, in the one
traced). It leaves its hole, takes losses and breaks in the open, and the
side gives up sooner; defenders that would have held to the deadline lose
instead. The rule does not ask whether a counterattack can succeed. Asked
whether it should go at once, only above some strength or against no more
than a squad, or only behind fire, the author ruled **at once, before the
attacker consolidates** (2026-09-30), which is what was built. Whether it
pays is left to attacks that reach the position; on the tel today none
does.

## Twenty-third round: a metre climbed costs five, 2026-09-30

Rules decision 61 (author, from the pace research, validation.md
*Infantry pace under fire*): a metre climbed costs 5 m of a bound, not 8.
Same company and seeds as the twenty-second round, 200 battles a row:

| Guns take first | 3:1 at 8 | 3:1 at 5 | 2:1 at 8 | 2:1 at 5 |
|---|---|---|---|---|
| squads | 62% | **77%** | 32% | **58%** |
| nearest the objective | 52% | 70% | 28% | 49% |
| command groups | 32% | 67% | 21% | 41% |

Still no attack closes: the nearest squad ends a median 211 m from a live
defender (255 m at 8). What moved (40 battles of the 3:1, squads first):
the scouts reach their observation points sooner and the main body goes
at a median turn 18 (20); once it goes a moving squad covers 64 m a turn
(52) and the company nets about 25 m a minute (20), still inside the
sources' 15–30; explosives' share falls from 82% to 78% as small arms come
into reach more. The battle ends at a median turn 23 (26).

The spread between a good target order and a poor one narrows (3:1: 67–77%,
was 32–62%): with the mortars on marks earlier, whichever they take first
matters less. **For the author:** at 2:1 the attack now wins 41–58% against
a prepared platoon, which sits badly with the design principle that a
prepared position needs 3:1. It is a consequence of fire, not of closing —
the mortar research under way (how long a dug-in platoon holds under a
mortar section) is the place to look before touching anything else.

## Twenty-fourth round: full cover by the sources, 2026-09-30

Rules decision 62 sets full cover against a shell from FM 7-90 and the WWII
figures (impact: hole 0.03, roof 0.02; air burst: hole 0.13, roof 0.005;
were 0.125, 0.125, 0.625, 0.125). Same company and seeds, 200 battles a row:

| Guns take first | 3:1 at 61 | 3:1 at 62 | 2:1 at 61 | 2:1 at 62 |
|---|---|---|---|---|
| squads | 77% | **47%** | 58% | **18%** |
| nearest the objective | 70% | 46% | 49% | 19% |
| command groups | 67% | 44% | 41% | 17% |

The prepared position has its superiority back, as the design principle
wants: 2:1 fails, 3:1 is an even fight (the author's ceiling for it is
85%). What the guns take first hardly matters now. Explosives' share falls
to 70–74%. When the defender loses (29 of 60 traced), it gives up with 28%
of its men down (64% of them by the mortars) and **35% broken but unhurt**:
morale, not the body count, now breaks it. Still no attack closes (the
nearest squad ends a median 183 m out). Suppression, sampled at each
movement phase over 40 battles: with the attacker 150–300 m off a defending
squad is neither suppressed nor pinned half the time; inside 150 m there
were 11 squad-turns in 40 battles; the attacker's own squads within 250 m
are pinned a fifth of the time. docs/suppression-design.md takes it from
there.

## Twenty-fifth round: suppression, step by step, 2026-09-30

Rules decision 63 (docs/suppression-design.md), built and measured one part
at a time: 200 battles a row, the twenty-fourth round's company, squads
first; suppression sampled at each movement phase over 40 battles.

| Step | 3:1 wins | 2:1 wins | Defender pinned, attacker 150–300 m off | Squad-turns inside 150 m (40 battles) | Nearest attacker at the end |
|---|---|---|---|---|---|
| Decision 62 (before) | 47% | 18% | 28% | 11 | 183 m |
| + S1 reach, S3 roofs | 62% | 34% | 58% | 3 | 258 m |
| + S2 heads down | 81% | 55% | 64% | 18 | 210 m |
| + S4 danger close a risk | 80% | 55% | 64% | 18 | 210 m |
| + S5 assaulted while pinned | 80% | 55% | 64% | 18 | 210 m |

- **S1–S3 made the fire decide sooner, not the assault arrive.** The
  defender is pinned two turns in three while the attacker closes, and,
  blinded (S2), its mortars fire less and worse: the attacker's losses
  fall from 18% to 10%. But it breaks **at range, by nerve**: in the 52 of
  60 traced battles it lost, 729 of its men were broken and 279 down.
- **Why:** as built, every force within a round's suppression reach also
  counts as *bombarded*, and decision 19 takes 5 of every man's nerve a
  turn for that (3.75 in position). S1 widened the reach of that loss with
  the reach of the suppression.
- **S4 and S5 moved nothing on the tel** because no assault arrives: the
  battle is over before the fires would lift. Without mortars (the scratch
  variant, 60 battles) S5 is at work: the 3:1 wins 63% with the
  counterattack and 55% without (72% and 57% before S5).
- **A trial, not built:** suppression from beyond the lethal blast without
  decision 19's bombarded loss gives 3:1 **70%**, 2:1 **49%**; battles last
  to a median turn 30 (26), the nearest attacker ends 166 m out (210 m),
  55 squad-turns inside 150 m (18), and the first counterattacks go in
  (3%). The defender still breaks more by nerve (522 broken, 368 down).

**For the author:** 2:1 winning about half against a prepared platoon sits
badly with the design principle. Whether the wider suppression should carry
decision 19's bombarded loss is the first lever (the trial above); the loss
itself (5 a turn, ours) the second.

## Twenty-sixth round: nerve by cover, 2026-09-30

Rules decision 64: the nerve fire costs is ×2 in the open, ×1 behind
partial cover, ×0.3 in a hole, ×0.15 under a roof. Same company and seeds,
200 battles a row, squads first:

| | 3:1 wins | 2:1 wins | Attacker down | Nearest attacker at the end | Squad-turns inside 150 m (40 battles) | Counterattacked |
|---|---|---|---|---|---|---|
| Decision 63 | 80% | 55% | 10–13% | 210 m | 18 | 0–1% |
| + decision 64 | 70% | **60%** | 7–9% | **125 m** | **94** | **8–13%** |

- **The dug-in defender stops breaking at range.** In the 36 of 60 traced
  battles it lost, 328 of its men were down (54% by small arms, the rest
  the mortars) and 435 broken — against 279 and 729 before. It now loses
  to the attack, not to the shelling.
- **The attack closes**, for the first time on the tel: the nearest squad
  ends a median 125 m out, five times as many squad-turns inside 150 m, and
  the reserve counterattacks in 8–13% of battles (decision 60), not yet
  holding the position at the end in any.
- **But 2:1 wins more (60%), and the odds matter little (3:1 70%).** The
  attacker in the open is rarely under fire: the defender's squads are
  pinned 62% of the time with the attacker 150–300 m off, and a pinned
  force fires at nothing beyond 100 m (decision 63, S2) and guides no
  mortars. So the doubled loss in the open seldom applies (the attacker
  loses 7–9% of its men). **For the author:** S2's reach — the question he
  did not answer — is the lever the numbers point at: a pinned force that
  still fires, at a penalty, within small-arms range would make crossing
  the open cost what decision 64 says it should.

## Twenty-seventh round: pinned fire at range, and the defender's mortars, 2026-09-30

Rules decision 65: a pinned force fires out to 400 m, at half its chance
beyond 100 m. 200 battles a row, squads first:

| | 3:1 wins | 2:1 wins | Attacker down |
|---|---|---|---|
| Decision 64 | 70% | 60% | 7–9% |
| + decision 65 | 66% | 62% | 8–10% |
| trial: no aim penalty beyond 100 m | 67% | 58% | 8–11% |
| trial: a pinned force sees to 300 m | 67% | 58% | 8–10% |
| trial: both | 66% | 55% | 9–11% |

The trials were run by changing `HEADS_DOWN` in a scratch script, not in the
game. None of them moves it: the pinned defender's rifles are not what keeps
the attacker safe. **The defender's mortars are.** Per battle of the 3:1
(60 traced at each commit):

| Code at | Defender's HE missions fired (of 12) | Attacker down (of 86) | …by the mortars and grenades |
|---|---|---|---|
| Decision 62 | 4.3 | 15.0 | 11.5 |
| + S1 reach, S3 roofs | 4.4 | 13.6 | 11.3 |
| + S2 heads down | 3.8 | 8.1 | 6.6 |
| + decisions 64, 65 | 2.5 | 7.7 | 5.0 |

The scripted defender fired a third of its missions even before
suppression, and since S2 each does half as much: its squads are pinned,
so no one observes the fall of shot to adjust it, and its marks go stale.
It also plans nothing — it registers no targets on the approach, which
the planning stage allows (decision 38), and fires only on an attacker in
sight. **So the imbalance is mostly in the scripted defender's fire, the
stand-in for Jev, not in a rule**: a defending company that registered the
approaches and fired on them as the attacker crossed would fire its
missions on the mark without needing an observer. That is the next thing
to build and measure (ours, a harness policy, like the scripted
attacker's).

## Twenty-eighth round: the defender's fire plan, and its command post, 2026-09-30

Two changes to the scripted defence, neither a rule:

- **A fire plan** (`planDefenderFires` in `src/sim/scenarioBattle.ts`, a
  harness policy, ours). In planning the defending company registers its six
  mortar targets (decision 38) on the dead ground 100–400 m in front of its
  positions, toward the attack, nearest first, 120 m apart; in the battle it
  fires on an attacker seen this turn or last within 100 m of one — on the
  mark, needing no observer — before anything else. `--no-defender-plan`
  turns it off.
- **A defending command post stays put** (`drill.ts`). The drill brought
  every command group to 80 m behind its side's squads, defenders' too, so
  RED's company command group walked from behind the summit (600, 200) to
  (549, 418), in the open, into the attacker's shelling. With decision 64
  doubling the nerve fire costs in the open, it broke — in every one of the
  141 turns in 20 traced battles where RED **could not call its mortars at
  all** (decision 55: no one in command). A defender's command group now
  holds where it was set up; an attacker's still follows its squads.

200 battles a row, squads first unless said:

| | 3:1 wins | 2:1 wins | Defender's HE missions | Attacker down | Defender down |
|---|---|---|---|---|---|
| Decision 65 | 66% | 62% | 2.5 | 8–10% | 20–22% |
| + the fire plan | 71% | 61% | 2.4 | 8–10% | 20–24% |
| + the command post holds (squads first) | **23%** | **16%** | **4.5** | 14–17% | 12–16% |
| … nearest the objective first | 21% | 13% | | | |
| … command groups first | 22% | 13% | | | |
| … without the fire plan | 19% | 15% | | | |

The command post was the fault; the fire plan adds about four points at 3:1.
The defender never loses fire control now (0 of 532 turns traced), and its
mortars account for most of the attacker's losses (10.6 of 12.6 men down a
battle). The attacker's own company command group never broke in the traces,
and its fire control held. **The attacker now gives up** at its breakpoint
(30% down, broken or fled) with about a quarter of its men down or broken,
crossing the open under decision 64's doubled nerve loss.

**Against the design principle:** 2:1 fails (13–16%), as it should; 3:1
wins only about one battle in five, where the author's ceiling is 85% and a
3:1 attack on a prepared platoon is meant to succeed. The levers, none
touched: decision 64's ×2 in the open (ours), the attacker's 30% breakpoint
(decision 44, from the sources), and the scripted attacker itself — it
lays no smoke from its mortars and no fire plan of its own beyond firing on
marks.

## Twenty-ninth round: a smarter scripted attacker, and what does not move 3:1, 2026-09-30

The scripted company gained two options (harness policies, ours;
`FirePlanChoices` in `src/sim/scenarioBattle.ts`, `--smoke N`,
`--prep-fires`): **smoke** — once it goes and its lead squads are 450 m to
100 m from the objective, it keeps a mortar screen on the enemy marks
nearest its squads (else its plan's points), up to N smoke missions, each
one of its twelve (decision 56); and **fires on the plan** — once it goes,
with no mark it is sure of, it fires on its registered points in turn, on
the mark. 200 battles a row, squads first:

| Attacker | 3:1 wins | 2:1 wins |
|---|---|---|
| As in the twenty-eighth round | 23% | 16% |
| + fires on the plan | 23% | 16% |
| + 4 smoke missions | 7% | 2% |
| + 4 smoke, fires on the plan | 6% | 3% |
| + 6 smoke, fires on the plan | 3% | 2% |

**Neither helps; smoke hurts.** The attacker already fires about 11 of its 12
missions on marks it has found, so the plan has nothing left to fire, and
every smoke mission is a mission of HE lost; smoke blocks sight both ways, so
a screen on the defence blinds the attacker's own observers and squads as
much as the defender's. Both options stay off by default.

Trials, not built (a scratch script changing the figure at run time), each
with fires on the plan:

| Trial | 3:1 wins | 2:1 wins |
|---|---|---|
| The attacker with 24 missions, not 12 | 18% | 10% |
| … and 4 smoke | 6% | 3% |
| The attacker lifts its fires at 200 m, not 100 m (12 missions) | 25% | 15% |
| … with 24 missions | 26% | 17% |
| Nerve lost in the open ×1, not ×2 (decision 64) | 28% | 19% |
| The attacker gives up at 40%, not 30% (decision 44) | 34% | 17% |

**No single lever brings 3:1 near the author's 85%.** 2:1 stays under 20%
under all of them, as the principle wants. More fire does not help the
attacker; its own fire lifted later helps a little (its bombs, reaching 100 m
since decision 63, suppress its own closing squads); the rule levers — the
doubled nerve in the open and the 30% breakpoint — each give 5–11 points.
The attack loses because it crosses the open under working defensive mortars
and gives up before it arrives; what would let a 3:1 attack arrive is the
question for the author.

## Thirtieth round: combined levers, how the attacker closes, and the target, 2026-09-30

Three strands, asked together by the author. All trials, not built: a
scratch script changing the figures at run time (`LIFT_AT_M` by a
temporary edit, restored). 200 battles a row, squads first; "rules" is
nerve in the open ×1 (decision 64 has ×2) and the attacker's breakpoint at
40% (decision 44 has 30%).

| Trial | 3:1 wins | 2:1 wins |
|---|---|---|
| As in the twenty-eighth round (2 scouts, a 4-turn look) | 23% | 16% |
| Rules | 38% | 23% |
| Lift at 200 m | 27% | 17% |
| Lift at 200 m + rules | 39% | 20% |
| Lift at 200 m + rules + an 8-turn look | 41% | 25% |
| **How it closes** — no overwatch (every squad bounds) | 20% | 11% |
| … a 2-turn look | 19% | 11% |
| … go on the first sighting | 10% | 7% |
| … no overwatch and go on the first sighting | 1% | 1% |
| … one scout | 17% | 18% |
| … an 8-turn look | 27% | 20% |
| … three scouts | **43%** | 18% |
| … four scouts | 37% | 14% |
| … an 8-turn look and three scouts | 35% | 21% |
| Three scouts + nerve ×1 in the open | 49% | 27% |
| Three scouts + a 40% breakpoint | 50% | 23% |
| **Three scouts + rules** | **58%** | **38%** |
| Three scouts + lift at 200 m | 38% | 23% |
| Three scouts + lift at 200 m + rules | 60% | 35% |

- **Hurrying loses.** Going as soon as the scouts find anything, or with
  every squad moving at once, throws the attack away (1–10%). Patience and
  eyes win it: three scouts, each finding its part of the defence for the
  guns, is the best single change (43%); a fourth scout is one squad too
  many out of the assault.
- **The lift distance hardly matters** once the scouts are there.
- **With three scouts and both rule levers the attack lands inside the
  research's range** (validation.md, *What an attack at 3:1 should win*):
  3:1 58% (55–70%), 2:1 38% (30–45%). Either lever alone leaves both a few
  points short.

## Thirty-first round: decision 66 adopted, the standard measurement, 2026-09-30

Rules decision 66 (the author): the targets 55–70% at 3:1 and 30–45% at 2:1
against a prepared position, nerve in the open ×1, an attacker giving up at
40%. The scripted company now sends three scouts. **The standard
measurement** from here:

```bash
npm run scenario-sim -- --recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 \
  --scout-from vantage --wait-in dead-ground --n 200 --target-first squads
```

200 battles a row:

| Guns take first | 3:1 wins | 2:1 wins | Attacker down | Defender down | Counterattacked (held at end) |
|---|---|---|---|---|---|
| **squads** | **58%** | **38%** | 16–21% | 19–25% | 13–17% (0–1%) |
| nearest the objective | 52% | 35% | 17–22% | 18–23% | 14–17% (1–2%) |
| command groups | 45% | 29% | 19–23% | 17–21% | 11–14% (1–3%) |

With a competent commander (squads first) both land inside the targets;
poorer target choices fall a few points under them, which is what a
commander's decision should cost. The reserve counterattacks in about one
battle in seven and now and then holds the position at the end.
Explosives cause 73–77% of losses, the 75% the author set (decision 43).
The balance harness's flat-ground tables above predate decisions 62–66 and
the command-post fix, and have not been rerun.

## Thirty-second round: the flat-ground harness rerun on today's rules, 2026-09-30

The balance harness (`npm run balance`, flat open ground) rerun after
decisions 61–66 and the command-post fix, beside the same runs at the code
before decision 62. Its targets (`TARGETS` in `src/sim/balance.ts`) now carry
decision 66's bands: 1:1 at most 30%, 2:1 30–45%, 3–4:1 55–70% with the
winner losing 10–30%. 200 battles a cell, morale on; the attacker's wins,
before → now (share of losses to explosives in brackets):

**A — the default run** (no fire support below company, which decision 37
gives none; decisions 51–55 off, as the harness has them unless named):

| Battle | Target | Squad | Platoon | Company |
|---|---|---|---|---|
| 1:1 | ≤30% | 19% → 23% | 5% → 10% | 0% → 0% |
| 2:1 | 30–45% | 57% → 67% | 69% → **87%** | 7% → 2% |
| 3–4:1 | 55–70% | 76% → 81% | 99% → 99% | 97% → 96% |

**B — calibrated fire** (decision 43's mortar section on both sides; only
company may call it):

| Battle | Target | Company |
|---|---|---|
| 1:1 | ≤30% | 0% → 0% (HE 64% → 56%) |
| 2:1 | 30–45% | 6% → 0% (HE 69% → 59%) |
| 3–4:1 | 55–70% | 95% → **7%** (HE 75% → 73%) |

**C — the full rules** (decisions 51–55 on, three scouts, a four-turn look,
the guns waiting for what the scouts find, calibrated fire):

| Battle | Target | Company |
|---|---|---|
| 1:1 | ≤30% | 0% → 0% |
| 2:1 | 30–45% | 1% → **1%** |
| 3–4:1 | 55–70% | 65% → **58%** (HE 84% → 70%) |

Meeting engagements are about even at every echelon, before and now. C's
squad and platoon cells read 0% and are not recorded: three scouts from a
single squad or a platoon of three leaves no one to attack with.

**The sweep** (`--sweep`, the harness's defaults, assault reply 0–70%)
meets **3 of 12** targets under every configuration — the 1:1 ones.

- **The company 3:1 with the full rules lands inside the target (58%)**, as
  on the tel. Without the scouts and the rest (B) it collapses to 7%: the
  defender's mortars now work, and an attacker that does not find the
  defence first loses — the same thing the tel showed.
- **2:1 at company is far under target (1%, where 30–45%)** on flat ground,
  where the tel's 2:1 wins 38%: the tel's dead ground lets the attacker wait
  and close unseen; the flat harness has none.
- **Platoon and squad attacks are too easy (2:1 67–87%, 3:1 81–99%)**: no
  indirect fire below company, perfect intelligence by default, and nothing
  on open ground for a defender but its hole.
- **The harness has fallen behind the game.** Its defaults leave decisions
  51–55 off, its recon does not scale with the echelon, and its sweep still
  tries the assault-reply rates of 2026-09-23, which measure as irrelevant.
  The tel's headless runner (`scenario-sim`) is now the measure the balance
  is judged by; the flat harness would need its defaults brought up to the
  game and its recon scaled (a scout a platoon) to judge squads and platoons
  again.

## Thirty-third round: the harness on the game's rules, 2026-09-30

The harness now plays the game's rules by default (`runBattle`): decisions
51–55 on, fires planned on an eye's estimate, and in an attack a scout from
each attacking platoon (none for a lone squad, one for a platoon, three for
a company), each bounding and watching a turn, the rest waiting four turns
of what they find — the scenario runner's standard, scaled by echelon.
`--classic` plays it as before (the thirty-second round's figures). 200
battles a cell, morale on, the attacker's wins, classic → the game's rules:

**The default run:**

| Battle | Target | Squad | Platoon | Company |
|---|---|---|---|---|
| 1:1 | ≤30% | 23% → 15% | 10% → 1% | 0% → 0% |
| 2:1 | 30–45% | 67% → 48% | 87% → 47% | 2% → 1% |
| 3–4:1 | 55–70% | 81% → **69%** | 99% → 94% | 96% → **59%** |

Meeting engagements stay about even (squad 54/41, platoon 41/45, company
43/41).

**Calibrated fire at company** (decision 43's mortar section on both sides):
1:1 1%, 2:1 10%, 3:1 **69%** (was 0%, 0%, 7%); explosives 48–51% of losses.
With the guns waiting for the scouts' reports as well: 0%, 1%, 95%.

**The sweep** now meets **7–8 of 12** targets (was 3 of 12): every 1:1
target and most attacker-loss targets; the assault reply rate still makes no
difference.

- **Squad and company land on or near the targets**: the squad's 3:1 69%
  and 2:1 48%, the company's 3:1 59% (69% with calibrated fire).
- **Platoon 3:1 is still too easy (94%)** on flat open ground: a platoon
  attacking three squads to one with no indirect fire on either side
  (decision 37 gives none below company), where only the defender's hole
  and its rifles stand against it.
- **Company 2:1 is still far under (1–10%)**: on flat ground there is no
  dead ground to wait and close in, where the tel's 2:1 wins 38%.
- The harness is again a measure of the game, not of the rules as they
  stood before 51–55. `npm run validate` still plays the classic harness
  (`validation.ts`), so validation.md's figures stay comparable until it is
  rerun.

## Thirty-fourth round: Jev commands the company, 2026-09-30

The first battles with Jev itself (`jev-1.13.0`, TypeSafe) in the attacking
company commander's chair (`npm run jev-sim -- --jev`), on the tel, seeds
from 1000. What was learned about working with Jev comes first, because
the wins depend on it more than on anything in the rules.

### How Jev answers

`npm run jev-probe` re-asks the questions of battles already played
(recovered by replay, so Jev sees exactly the picture it saw) in other
framings and prints how the answers move.

- **It is steady.** The same question asked again gets the same answer
  almost every time (a few in thirty move on a choice near even odds).
  `jev-preview` answers like `jev-latest`. Calls take about 150 ms.
- **It judges; it does not plan.** It weighs the state against the options'
  words. It never weighs a scarce resource (it fired all twelve mortar
  missions as fast as it was allowed) or a clock it is not told about.
- **It leans to an option whose words the state repeats.** Principles in
  the state saying "a reserve exists to be committed" made it pick
  "reserve" more often, not less; "keep the company out of sight while it
  waits" made it answer "no" to going in 178 times out of 197 once the enemy
  was found. The mission text it is given (`MISSION`, `src/sim/jev.ts`)
  therefore names no option, and a test holds it to that.
- **Option labels move it most.** "reserve: stay back where it waited,
  ready to be committed" read as the safe choice: it held two platoons of
  three back and never committed them (105 of 118 "carry on"). Labels that
  say what each option does to the attack ("assault the position: close
  with the enemy and take the objective"; "reserve: … out of the fight until
  you commit it later") turned that round (assault 27 of 30).
- **It needs to be told what a commander would know**: the picture now
  says whether the company has gone in and each platoon's task. And it does
  what a label says: offered "hold fire: save the mission for when your
  assault is closing on the enemy" before the company went, it held every
  mission until then (24 of 25) — which costs the attack 30 points (below),
  so the hold option is bare again.
- **A "no" must not say something false.** With its scouts all lost, "no:
  keep holding while the scouts look" kept the company on the start line
  (124 of 126); the label now says there are no scouts left to look.

### What the questions can reach without Jev

`npm run jev-sim -- --rule` answers the questions by rule, as the scripted
commander of the standard measurement (thirty-first round) decides: three
scouts, wait in dead ground, go after four turns with the enemy in sight,
every platoon assaulting, mortars on what the scouts hold in sight, sure
to 40 m, squads first. `--rule a,b` changes one choice at a time to Jev's.
The attack's wins, 3:1 (`telAzekaAssault`), same 20 seeds (±11 points):

| Commander | 3:1 wins |
|---|---|
| Scripted (the standard measurement, no questions) | 65% |
| Rule through the questions | **70%** |
| … mortars held until the company goes | 40% |
| … fire on the first mark offered, sure or not | 65% |
| … bound by platoon (`go.bound`) | 20% |
| … hold short under the fires (`go.lift`) | ~~10%~~ **65%** (corrected in the thirty-seventh round: rerun at this round's own commit; the 10% does not reproduce) |
| … one scout, not three | 40% |
| … in as soon as the enemy is found (no four turns of shelling first) | 55% |
| … Jev's choices together: one scout, in at once, bound, hold short | 30–40% |

And over 100 seeds a scenario from 1000 (±5 points):

| Commander | 3:1 wins | 2:1 wins |
|---|---|---|
| Rule through the questions | **63%** | **34%** |
| Rule with Jev's four choices (one scout, in at once, bound, hold short) | **23%** | **14%** |
| Jev itself (20 seeds, below) | 10% | 15% |

The rule lands inside the targets (55–70%, 30–45%) as the scripted
commander does; with Jev's four plan choices it falls to where Jev is.

So the questions are not the gap: answered as the scripted commander
decides, they win what it wins. What costs are **choices** — four of them
account for most of the distance to Jev, and the
largest are ones a trained commander makes on purpose: bounding by platoon
and holding the assault short under its own fires are textbook, and in
this game they cost the attack as much as leaving two platoons in reserve
did. That is a question for the rules and the drill, not for Jev's wording
(see below).

### Jev's battles

Twenty seeds a scenario from 1000, the attack's wins (the scripted
commander on the same seeds: 3:1 **65%**, 2:1 **25%**; on the standard 200,
58% and 38%):

| Question set | What changed | 3:1 | 2:1 |
|---|---|---|---|
| 2026-09-30 (10 seeds) | as built | 20% | — |
| .2 | mission framing, platoon options by what they do, three scouts offered | 10% | 20% |
| .2 + stage | the picture carries the company's stage; hold "saves the mission"; the mission text does not say "wait" | 5% | 15% |
| **.3** | hold fire bare again | **10%** | **15%** |

Each fix did what it was for — the reserve is committed (every platoon
assaults), the company goes in when the enemy is found (turn 16–18, median),
the company waits in dead ground — and the wins did not come, because the
choices left are the costly ones: Jev bounds by platoon in 40 battles of 40
and holds short under its fires in 29 of 40; it sends one scout, not three
(it is offered three); and it goes in as soon as the enemy is found rather
than shelling it first. Losses stay in hand (attacker 22–23% down, the
defence 12–16%), and explosives cause 77–81% of them.

**Jev sits far under the targets** (3:1 55–70%, 2:1 30–45%) where the
scripted commander sits inside them. Read as a measure of the game, that
says **the game rewards the scripted commander's plan, not a textbook
one**: a commander who bounds and holds short, as doctrine teaches, loses
most attacks it should win.

**For the author** (⚠️ nothing here changes a rule):

1. Should bounding by platoon and holding the assault short under the
   fires cost that much? Both are drill mechanics (`boundByPlatoon`,
   `holdShort` in `src/app/drill.ts`), ours, not the document's; if a
   trained commander's choices are to win, they are where to look.
2. The balance targets were met with the scripted commander. Is that the
   commander they are meant for, or should they hold for Jev (the opponent
   in single-player) too?
3. The framing is ours to tune, and every change is measured on Jev's own
   recorded questions first (`jev-probe`). Steering Jev off bounding or
   holding short by rewording would hide the question above, so it has not
   been done.

> **Correction (thirty-seventh round).** Holding short costs the rule about
> 6 points at 3:1 (57% over 100 seeds), not the 50 the table above says; the
> 10% does not reproduce at this round's own commit. Bounding by platoon is
> the costly choice, and it was a drill artefact (thirty-seventh round). The
> text above and the thirty-fifth and thirty-sixth rounds' readings of
> "holding short" are wrong where they lean on the 10%.

## Thirty-fifth round: Claude models in Jev's place, 2026-09-30

Three Claude models answered the attacking company commander's questions
(`npm run jev-sim -- --claude <model>`, `src/sim/claude.ts`, question set
`2026-09-30.3`, default effort), on the tel, 20 seeds a scenario from 1000,
four battles at once. Each model gets the same picture and mission Jev does,
answers with an option id held by a JSON schema, and logs a one-sentence
reason. Every call stands alone: a model does not see its own earlier
answers or reasons, and it gets no order beyond the one-line tasking and the
principles (`MISSION`) — as Jev.

| Commander | 3:1 | 2:1 | Attacker down | Defence down | s a call |
|---|---|---|---|---|---|
| Rule through the questions (100 seeds) | **63%** | **34%** | | | |
| Jev (`jev-1.13.0`) | 10% | 15% | 22–23% | 12–16% | 0.15 |
| `claude-haiku-4-5` | **20%** | 0% | 17% / 24% | 14% / 11% | 1.8 |
| `claude-sonnet-5-5` | 5% | 0% | 26% / 29% | 8% / 4% | 4.5–5.1 |
| `claude-opus-5-5` | 5% | 5% | 27% / 28% | 10% / 5% | 5.2–6.1 |

(±9–11 points at 20 seeds. Explosives cause 80–83% of losses throughout.
Tokens over the six runs: about 4.5 M in, 1.3 M more read from the cache, and 0.76 M
out. Haiku's calls are not cached: the system prompt is shorter than its
cache minimum.)

**A model that reasons does not beat one that judges, and a small one does
best.** None comes near the rule; Sonnet and Opus sit under Jev. Most of
their battles end on turns 10–22 with the attack at its breakpoint (40%) and
the defence barely touched (0–6 men down).

### The choices, beside Jev's

| Choice | Rule | Jev | Haiku | Sonnet | Opus |
|---|---|---|---|---|---|
| Scouts | 3 | 1 | 1 (39 of 40) | 1 (40/40) | 1 (40/40) |
| When it goes in | 4 turns with the enemy in sight | as soon as found (turn 16–18) | when found, or a few turns after (median turn 20–22) | **turn 5, enemy not found** (40/40) | **turn 5, enemy not found** (40/40) |
| Platoon tasks | all assault | all assault | 68 assault, 28 base of fire | all assault | all assault |
| Bound by platoon | no | yes (40/40) | yes (26 of 26 asked) | yes (37 of 40) | yes (40/40) |
| Hold short under the fires | no | 29 of 40 | yes (36 of 36 asked) | **no** (38 of 40) | yes (40/40), then won't lift (34 of 37) |
| Mortars | sure marks in sight, before going | all twelve, as fast as allowed | about 10 missions, first on turn 17–18 | median 4–7 of 12; held 233 times | median 3–8 of 12; held 206 times; 87 smoke |

What the logged reasons say, choice by choice:

- **Scouts.** All three send one, for the reason Jev's choice suggests: "one
  scouting squad finds the enemy without splitting the mass" (Sonnet);
  "keeping the other eight squads massed" (Opus). The principle *mass at the
  decisive point* is read against scouting.
- **When it goes in: the largest difference.** Sonnet and Opus go at the
  first chance (turn 5) in every battle, the enemy not yet found, and on the
  deadline: "with 41 turns left and the objective about 400 m away, waiting
  wastes time" (Sonnet); "the briefing already places the enemy on the
  shoulder, so more scouting adds little, while starting now keeps the full 41
  turns" (Opus). Haiku waits: "committing to attack before locating the enemy
  risks walking into prepared defenses", and goes once the enemy is found
  ("enemy is pinned and visible with 29 turns remaining"). Its four 3:1 wins
  all went in on turns 22–29. Waiting is the one thing Haiku does as the rule
  does, and it is the one model above Jev.
- **Platoon tasks.** Sonnet and Opus assault with every platoon, as Jev now
  does. Haiku gives one platoon a base of fire in a third of its battles:
  "commit platoons 1 and 2 to the assault while platoon 3 provides covering
  fire from the flank".
- **Bounding.** All three bound, as Jev does, and give the textbook reason:
  "one platoon's fire keeps the defenders' heads down while the other
  closes" (Sonnet).
- **Holding short.** Opus and Haiku hold short, as Jev does ("holding at
  200 m lets the squads gather under the mortars and go in together").
  Opus then declines to lift the fires 34 times in 37: "BLUE-1-2 would go in
  alone against a prepared platoon while the rest of the company is still
  130–300 m back" — it waits to mass, and the squads at the line wait under
  the defender's fire. Sonnet alone goes straight in: "holding at 200 m under
  mortars gives the enemy time to recover and burns turns".
- **Mortar fire.** Where Jev fires everything at once, Sonnet and Opus hoard:
  "my squads are still 400+ m from the enemy, so bombs now would lift before
  the assault closes; I'll save the missions for the final approach"
  (Sonnet). That is the principle *fire … is wasted unless the attack moves
  while it lasts*, read literally. Because they went in blind, the fire
  questions come with stale or unsure marks, and much of the ammunition is
  never fired. Opus also fires smoke (87 missions), which the scripted
  attacker found hurts (twenty-ninth round).

### What it says

- **Going in blind is the costliest choice, and it is the reasoners' own.**
  It comes from the deadline line (the first principle, and the picture's
  "or the attack has failed") with no word on how long an approach takes:
  a model that reasons about time decides it has none to spare. The
  scripted commander goes on about turn 20 and wins.
- **Every commander so far chooses bounding and holding short** (Jev and
  three of three Claude models; Sonnet alone does not hold short). The
  thirty-fourth round's question to the author (should they cost this much?)
  now has four commanders behind it, not one.
- **The comparison is of stateless answerers.** No model sees its earlier
  answers, so none can hold to a plan: Opus holds short, then refuses the
  lift that the hold-short plan needs; it saves missions for an approach no
  later call knows about. An order (OPORD) from higher headquarters, a
  plan written at turn 0, and each call carrying the plan and the decisions so
  far, is the next thing to measure. It would change the comparison with Jev,
  which cannot carry a plan the same way.

## Thirty-sixth round: an order, a plan and a memory, 2026-09-30

The thirty-fifth round's commanders answered every question afresh, from a
one-line tasking. This round gives them what a company commander has: an
**order from battalion** (`src/sim/opord.ts`, `--order`; for Jev `--framing
order`) in five paragraphs — the enemy (a platoon dug in with overhead cover,
a squad held back to retake a position, mines, registered mortars), the
ground, the company and its 12 missions, the mission and intent, and time
and movement (50 m a turn walking, half under fire, 5 m per metre climbed:
about 11 turns to the shoulder unopposed, about twice that under fire). It
names no option (tested). With a Claude model, `--plan` has it write its own
plan before the first question and carry it in every call, and `--memory`
carries the battle's decisions so far with their reasons. And, without the
API, `--rule blind` measures the choice that cost the reasoners most: the
rule's commander, but sent in at the first chance (turn 5), the enemy found or
not.

⚠️ The order is ours (the intelligence picture and the intent are written for
the test beds); it is the author's to check.

### What going in blind costs

| Commander (100 seeds a scenario from 1000) | 3:1 | 2:1 |
|---|---|---|
| Rule through the questions | 63% | 34% |
| … sent in at turn 5, found or not (`--rule blind`) | **18%** | **4%** |

That one choice costs 45 and 30 points: most of the distance from the rule to
Sonnet and Opus (thirty-fifth round). Nothing else the rule does changes.

### The battles

20 seeds a scenario from 1000, the attack's wins (±9–11 points):

| Commander | Given | 3:1 | 2:1 | Went in blind | Bound | Held short |
|---|---|---|---|---|---|---|
| Jev | mission (35th round) | 10% | 15% | — | 40/40 | 29/40 |
| Jev | + order | 10% | 5% | 31/40 | 40/40 | **0/40** |
| Haiku | mission (35th round) | 20% | 0% | 0/40 | 26/26 | 36/36 |
| Haiku | + order, plan, memory | 5% | 15% | 15/40 | 21/27 | 36/40 |
| Sonnet | mission (35th round) | 5% | 0% | 40/40 | 37/40 | 2/40 |
| Sonnet | + order, plan, memory | 0% | 0% | 28/40 | **8/39** | 10/40 |
| Opus | mission (35th round) | 5% | 5% | 40/40 | 40/40 | 40/40 |
| Opus | + order | 0% | 0% | 40/40 | **3/40** | 21/40 |
| Opus | + order, plan, memory | 5% | 0% | 36/40 | **1/40** | **7/40** |

(Tokens for the round's Claude runs: about 11.3 M in, 5.0 M more read from
the cache, 1.04 M out. Haiku's calls are still not cached.)

**None wins more.** Every commander stays at 0–15%, within the noise of
where it was. But the choices moved, and the reasons say why.

### What the order and the plan changed

- **Bounding and holding short went, on the time line alone.** Nothing in the
  order names either; Opus, told how long closing under fire takes, stopped
  bounding: "bounding by platoon would roughly double the ~22 turns needed
  under fire and split the mass we must put on the objective together by turn
  45". Jev stopped holding short (0 of 40, from 29). So the thirty-fourth
  round's two textbook costs are not fixed choices: a commander told the time
  drops them. They were not what kept the wins down.
- **Going in blind got worse, and the order is why.** The same time line —
  "about twice that under fire" — reads as 22 turns of 41, and every
  commander counts back from it: "with 41 turns left and roughly 22 needed to
  close under fire, waiting on the scouts wastes the time the attack needs"
  (Opus, order only, 40 of 40 blind). Jev, which went in when the enemy was
  found, now goes blind in 31 of 40. The only one that waits more is Haiku,
  which had waited already.
- **The plans are sound, and cannot be played.** Opus's plan (seed 1000,
  3:1): "the company moves by bounds into the dead ground about 250-300 m
  short of the shoulder … once the positions are fixed and 2 and 3 Platoons
  are at the assault position, I call 'AZEKA'. Mortars fire, 1 Platoon opens
  fire, and all platoons assault … No later than T30 we go in regardless."
  Sonnet's: "Turns 0-12: advance to the last cover, about 150-200 m from the
  shoulder, and locate the positions". With the memory, they follow their
  plans: "the plan had the company closing into the dead ground by T12 …
  advancing now" (Opus, go.10). But **the questions have no step for it**.
  The company waits where it is (`plan.wait`) or goes in: "yes" to "send the
  company in" commits it to the attack, with no halt at an assault position
  to find and shell the enemy first. The plan every reasoner writes — move
  up under cover, fix, fire, then go — is played as going in blind, which
  costs 45 points.
- **Mortars are still hoarded.** The plans budget them ("2 missions to pin
  identified positions while we close, 6 for the assault, keep 4 for the
  counterattack"), and the fire question's own words — "the assault has to
  arrive before you lift" — keep them for a close that a blind attack rarely
  reaches: Sonnet and Opus fire a median 3–6 missions of 12.

### What it says

1. **The gap to the rule is a missing move, not missing judgement.** The rule
   wins by waiting where it is while the scouts find the enemy and the mortars
   shell it, then going. A reasoner's plan does the same from nearer, and the
   game offers it only "wait at the start line" or "attack now". Next: a go
   option that moves the company up to an assault position (dead ground or a
   named point short of the enemy) and holds it there until a second
   question sends it in — then measure the rule, Jev and the models again.
   That is a question-set change (`QUESTION_SET_VERSION`), and a drill one.
2. **Our order pushes time too hard.** "About twice that under fire" and "will
   not extend the deadline" are both true and both read as "go now". A
   version that also says when an attack typically has to leave its assault
   position is advice, not fact, and is not written; the question in 1 is the
   better fix.
3. **For the author**: the thirty-fourth round's question (should bounding and
   holding short cost this much?) matters less than it seemed — commanders
   drop both once told the time, and still lose. The costly choice is when the
   company goes, and the game gives no way to go part of the way.

## Thirty-seventh round: reasonable plans, not one plan, 2026-10-01

Back to the balance itself. The targets (3:1 on a prepared platoon 55–70%,
2:1 30–45%; validation.md, *What an attack at 3:1 should win*) were met in
the thirty-first round with **one** commander, and every other commander
since — Jev, three Claude models, the rule with one choice changed — lands far
under them. The author's guideline for judging results: **close to real life
in the outcomes**. So the measure here is a set of reasonable plans, not the
calibrated one, and a check that tactics move the result about as much as
they do in real attacks: Rowland's small-unit data has 3:1 winning 54%
without surprise and 76% with it — tactics worth some 20 points, not 50.

Everything here is the rule (`npm run jev-sim -- --rule <choices>`): no
model, no tokens, 100 seeds a scenario from 1000.

### The plans (author, 2026-10-01)

| Plan | `--rule` | Scouts | Goes | Platoons | Bound | Hold short |
|---|---|---|---|---|---|---|
| A. Calibrated | — | 3 | 4 turns with the enemy in sight | all assault | no | no |
| A + move up | `moveup` | 3 | moves up to an assault position first | all assault | no | no |
| B. Deliberate | `basefire,bound,holdshort` | 3 | as A | 1 base of fire, 2 assault | yes | yes |
| B + move up | `…,moveup` | 3 | as A + move up | as B | yes | yes |
| C. Hasty | `onescout,rush` | 1 | as soon as the enemy is found | all assault | no | no |
| D. Flank | `basefire,holdshort,flank` | 3 | as A, by a scout's observation point | 1 base of fire, 2 assault | no | yes |
| E. Fire-heavy | `holdshort,prep` | 3 | once most missions are fired (by turn 30) | all assault | no | yes |
| Control: blind | `blind` | 3 | turn 5, found or not | all assault | no | no |
| Control: no scouts | `noscout` | 0 | at once | all assault | no | no |

New for this round: a go answer that moves the company up to an assault
position (the last dead ground about 250 m short of where the plan puts the
enemy, `company.ts`, `moveUp`; question set `2026-09-30.4`); `basefire`,
`flank`, `prep`, `noscout`; `--defender-plan` (where the defender registers
its mortars); `--fire-on-the-move`.

### The defender's mortar plan is not the cause

The scripted defender registers its mortars on the dead ground in front of
it (a harness policy, ours). Moving them to the open ground first, or
registering none, moves the plans by under 10 points (3:1, the calibrated
plan 63% / 63% / 71%; every other plan alike; 2:1 within 4 points). It
stays as it is: real defenders plot fires on dead ground and likely assault
positions.

### Bounding was a drill artefact

Bounding by platoon took 3:1 from 63% to 16% (2:1 unchanged). Three things
in the drill and the engine made it so:

1. **Two layers of bounding.** Inside a moving platoon the squads already
   alternate (`overwatch`); bounding by platoon stopped two platoons of
   three on top of that. A squad moved one turn in six in contact — about
   **8 m a minute**, against the sources' **15–30 m a minute** for an
   advance under fire (validation.md, *Infantry pace under fire*), which
   already include fire and movement. Squad alternation alone gives about 25.
2. **From the first sighting anywhere.** The drill counted the company in
   contact as soon as the side knew of any enemy — a scout's mark 500 m off —
   so platoons halted to "cover" beyond their own 400 m reach.
3. **A halted platoon covered no better than a moving one.** The engine gave
   a force that moved no penalty to its own fire.

**Changed (the drill, ours):** a platoon bounds only within the drill's fire
range (400 m) of a known enemy, and the bounding platoon's squads go
together. **Offered (a rule, off):** `GameOptions.fireOnTheMove`, a factor
on a moving force's small-arms hit chance (the sources give no direct figure:
kneeling hits about 0.68 as often as prone at 300 m, and marching fire is
unaimed; the factor is ours).

| Plan | 3:1 before → after the drill change | 2:1 before → after |
|---|---|---|
| Bound | 16% → **48%** | 38% → 35% |
| Bound, hold short | 16% → 44% | 35% → 23% |
| B. Deliberate | 29% → **50%** (out of time 56 → 6) | 44% → 44% |
| B + move up | 11% → 16% | 21% → 21% |

Fire on the move at ×0.5 moves little (calibrated 63% → 57%, bound 48% →
51%, deliberate 50% → 46%, the rest within a few points): against men dug
in with overhead cover, rifle fire works by suppression, and a burst
suppresses whether it hits or not. **It is not recommended**: it changes
nothing the plans need.

### Moving up is where the attack is lost

Moving up to an assault position takes the calibrated plan from 63% to
**10%** (2:1 34% → 15%), and the company loses **10.4 men** before it goes
in (0.8 without). Traced over 20 battles at 3:1: 132 men lost while moving
up and holding there, to rifle fire (42), mortars (31), both (21) and
unattributed (38); the defender saw the company in 18 of 20 battles, a
median 5 turns after the move began, and the median range from the nearest
defending squad when a man fell was **254 m** — inside rifle range. The
"dead ground" is chosen against where the plan puts the enemy, which is off
by an observer's error, and the move is made at the first chance, before the
scouts have found anything. A real assault position is chosen after the enemy
is found, against what was found.

### Where the plans stand

After the drill change, fire on the move off:

| Plan | 3:1 | 2:1 | Attacker down (3:1) | Defence down (3:1) |
|---|---|---|---|---|
| A. Calibrated | 63% | 34% | 14% | 25% |
| B. Deliberate | 50% | 44% | 16% | 23% |
| E. Fire-heavy | 47% | 33% | 18% | 23% |
| C. Hasty | 19% | 5% | 22% | 19% |
| D. Flank | 11% | 6% | 21% | 14% |
| A + move up | 10% | 15% | 22% | 15% |
| B + move up | 16% | 21% | 22% | 14% |
| Control: blind | 18% | 4% | 23% | 15% |
| Control: no scouts | 1% | 0% | 23% | 13% |

Against the criteria (author, 2026-10-01):

- **The median reasonable plan** (A–E): 3:1 **47%**, 2:1 **33%** — just under
  the 3:1 band, inside the 2:1 one.
- **The floor is not met.** Three plans sit far under it, and each for a
  reason in the harness, not the rules:
  - *Moving up* — the assault position above.
  - *Flank* — "by a scout's observation point" sends the company to the
    observation point, which is back near the start line (the
    observation points are 350–550 m out by construction), so the "flank"
    is a long detour, not an approach on the enemy's side.
  - *Hasty* — one scout and no shelling before going in. Real hasty attacks
    on a prepared position do worse than deliberate ones; whether by 44
    points (63% → 19%) is the open question.
- **The controls lose clearly** (1–18% at 3:1, 0–5% at 2:1), as they
  should.
- **Losses**: attackers lose 14–23% of their men on average and defenders
  13–25%. Whether a failed attack's exchange (the attacker down 22–23%, the
  defence 13–15%) is what real failed attacks cost is not yet checked
  against a source (next, 4).

### Next

1. **The assault position chosen against what the scouts found**, and only
   once they have found it: then rerun A + move up and B + move up.
2. **A flank that approaches the enemy's side**: an axis point beside the
   objective (off the line of attack, in dead ground), not the scouts'
   observation point.
3. Then the hasty attack's gap, with the mechanism traced as above.
4. A research pass on loss exchange in failed attacks (the one outcome the
   sources here do not cover).


## Thirty-eighth round: the assault position and the flank, 2026-10-01

The thirty-seventh round left three reasonable plans far under the floor, two
of them for reasons in the harness. Both are changed (question set
`2026-10-01.1`):

- **The assault position is chosen against what was found.** `moveUp` takes
  the enemy where the side has found it near the objective (its marks), else
  where the plan puts it, and seeks dead ground out of sight of both; the
  rule moves up only once the enemy is found, not at the first chance.
- **A flank that goes in on the enemy's side.** The axis question offers
  `flank:west` / `flank:east`: the dead ground nearest a point 200 m to one
  side of the enemy and 100 m back toward the company (ours), named by the
  compass. The scouts' observation points stay as options; they sit 350–550 m
  out, back near the start line, and going by one was a detour. The `flank`
  rule takes a flank where the ground has one.

100 seeds a scenario from 1000:

| Plan | 3:1 before → after | 2:1 before → after | Men lost before going in (3:1) | Out of time (3:1 / 2:1) |
|---|---|---|---|---|
| A + move up | 10% → **37%** | 15% → **31%** | 10.4 → 4.3 | 2 / 1 |
| B + move up | 16% → 32% | 21% → 22% | 10.4 → 4.3 | 4 / 28 |
| D. Flank | 11% → **42%** | 6% → 18% | 0.8 | 5 / 41 |
| A + flank (new) | 52% | 30% | 0.8 | 3 / 8 |

Moving up still costs about 4 men before the attack (0.8 from the start line)
and 26 points against the calibrated plan; going round a flank costs 11.

### Where the reasonable plans stand

| Plan | 3:1 | 2:1 |
|---|---|---|
| A. Calibrated | 63% | 34% |
| A + flank | 52% | 30% |
| B. Deliberate | 50% | 44% |
| E. Fire-heavy | 47% | 33% |
| D. Flank | 42% | 18% |
| A + move up | 37% | 31% |
| B + move up | 32% | 22% |
| C. Hasty | 19% | 5% |
| **Median** | **45%** | **30%** |

- **The median** is 45% at 3:1 (target 55–70%) and 30% at 2:1 (target
  30–45%): the 2:1 at the bottom of its band, the 3:1 ten points under.
- **The spread** (3:1, hasty aside) is 32–63%: about 30 points, against the
  sources' 20 or so for tactics. The hasty attack is still 44 under the
  calibrated plan, and untraced.
- **At 2:1, a base of fire leaves one platoon to close**: plans B and D run
  out of time in a third to two-fifths of their battles. One platoon
  assaulting a prepared platoon is 1:1 at the point of contact; that it
  fails is plausible.

### Next

1. **Trace the hasty attack** (one scout, in as soon as the enemy is found):
   where its 44 points go.
2. **The 3:1 median is ten points short.** Once the hasty attack is
   understood, whether the gap is the plans or the game is the author's
   question: tuning toward 55% for the median plan would lift the
   calibrated plan above 70%.
3. A research pass on loss exchange in failed attacks.


## Thirty-ninth round: the hasty attack, and what attacks cost, 2026-10-01

### The hasty attack is two ordinary costs

Plan C (one scout, in as soon as the enemy is found) wins 19% at 3:1 against
the calibrated plan's 63%. Taken apart, 100 seeds each:

| 3:1 | Wins | Enemy found (turn, mean) | Company goes (turn) | Own missions before going |
|---|---|---|---|---|
| A. Calibrated (3 scouts, 4 turns' fire first) | 63% | 11 | 16 | 3.0 |
| One scout | 30% | **18** | 23 | 2.5 |
| In as soon as found | 43% | 11 | 11 | **0** |
| C. Hasty (both) | 19% | 18 | 18 | 0 |

(2:1: 34%, 7%, 21%, 5%.) One scout finds the enemy seven turns later than
three (33 points); going in at once fires nothing on it first (20 points);
together, 44. Neither is a fault in the harness: finding the enemy and
shelling it before the assault are what a deliberate attack is for. Whether
they are worth this much in real life the sources do not say directly
(Rowland's surprise, 22 points at 3:1, is the nearest).

### What attacks cost: the sources against the game

A research pass (validation.md, *Loss exchange in attacks*; second-hand
extracts) and a new count: `ScenarioBattleResult.lost` adds to the killed
and wounded the men of forces that surrendered or are routing, and men
broken — real figures for a lost position are mostly prisoners.

| 100 battles a plan, the tel | Attacker lost | Defender lost | The sources |
|---|---|---|---|
| Won (A, B, E) | 8–14% | 50–52% | attacker 5–20%, defender 40–90% |
| Won (C, hasty) | 24% | 50% | |
| Failed (A, B, E, C) | **35–41%** (B at 2:1: 25%) | 16–29% | attacker 10–25%, defender 5–20% |

- **A won attack costs what the sources say.** The attacker loses about a
  tenth; the defence about half, most of it prisoners and the fled.
- **A failed attack goes on too long** (overstated: see the correction in
  the fortieth round). The attacker loses 35–41% before it
  stops; the sources put a company's stall at 10–25%, battalion doctrine its
  breakpoint at about 20%. The game's is 40% (decision 66), raised from
  decision 44's 30% in the thirtieth and thirty-first rounds to bring the
  calibrated plan's wins into the target.
- **The two pull against each other.** The 3:1 median plan is already ten
  points under its target (thirty-eighth round); a breakpoint nearer the
  sources' would lower every plan's wins further.

### For the author

1. **The attacker's breakpoint** (decision 66, 40%): failed attacks cost
   about twice what the sources say. Lowering it toward 25–30% is closer to
   real life in losses, and costs wins.
2. **The 3:1 wins**: the median reasonable plan wins 45% (target 55–70%). If
   the breakpoint comes down, what else should carry 3:1 back up — or is
   the target the one to move, since it was set from division and
   all-postures data and small-unit attacks without surprise win 54%
   (Rowland)?
3. **The hasty attack** (19%): finding the enemy late and not shelling it
   first cost 33 and 20 points. Real, or too much?


## Fortieth round: the attacker's breakpoint at 30%, 2026-10-01

The author asked what taking the attacker's breakpoint back to 30%
(decision 44's figure; decision 66 has 40%) does. All eight reference plans,
100 seeds a scenario from 1000 (`--attacker-breakpoint 0.3`).

> **Correction to the thirty-ninth round.** It said a failed attack costs
> the attacker "about twice" what the sources say. That compared the game's
> *lost* (killed, wounded, prisoners, the fled and the broken) with the
> sources' *casualties* (killed, wounded, captured); a failed attacker's
> broken and fled men mostly rally and are not casualties. Counted as the
> sources count, a failed attack costs the attacker **19–28%** at 40% —
> at or a little over the top of the sources' 10–25%, not twice it. A won
> attack's defender is rightly counted with its prisoners and fled.

| Plan | 3:1 at 40% → 30% | 2:1 at 40% → 30% |
|---|---|---|
| A. Calibrated | 63% → 59% | 34% → 24% |
| A + flank | 52% → 47% | 30% → 26% |
| B. Deliberate | 50% → 42% | 44% → 41% |
| E. Fire-heavy | 47% → 45% | 33% → 28% |
| D. Flank | 42% → 38% | 18% → 18% |
| A + move up | 37% → 33% | 31% → 19% |
| B + move up | 32% → 25% | 22% → 16% |
| C. Hasty | 19% → 7% | 5% → 5% |
| **Median** | **44.5% → 40%** | **30.5% → 21.5%** |

What a failed attack costs the attacker in killed and wounded (A, B, E, C;
the sources 10–25%, centred near 15%): at 40%, 23–27% (3:1) and 19–28%
(2:1); at 30%, **18–22%** and **16–22%**. A won attack is unchanged: the
attacker loses 6–14%, the defender about 50%, mostly prisoners and fled.

**Read together:** 30% puts losses where the sources put them, and costs
about 5 points at 3:1 and 9 at 2:1. **Adopted as rules decision 67** (author,
2026-10-01). The standard measurement (thirty-first round's command, 200
battles) at 30%: 3:1 **49%** (58% at 40%), 2:1 **27%** (38%), explosives
72–75%. The win targets (55–70%, 30–45%) were
read from division-level, all-postures data; small-unit attacks without
surprise win 54% at 3:1 (Rowland). With the author: the breakpoint, and
whether the targets should be set for small-unit attacks on prepared
positions.

### Win targets for small-unit attacks: a proposal (for the author)

The author asked (2026-10-01) for the targets to be set for small-unit
attacks separately. The current ones (decision 66: 3:1 on a prepared
position 55–70%, 2:1 30–45%) were read from division-level tables that mix
postures (validation.md, *What an attack at 3:1 should win*). The
small-unit evidence there is Rowland's (WWII, via a review): 3:1 wins **54%**
without surprise and **76%** with it; 1:1 wins 40% and 70%; a prepared
position is worth about **×1.65** to the defender. Rowland does not split
by preparation.

- **3:1 on a prepared position: 40–55%.** Rowland's 54% is for all
  positions, so it is the top of the band for a prepared one; with ×1.65 the
  effective ratio is about 1.8:1, which on Rowland's 1:1–3:1 line is about
  46%. **Up to 70–75% with surprise or strong suppression** (Rowland's 76%).
- **2:1 on a prepared position: 20–35%.** No small-unit source gives 2:1.
  Rowland's line read the same way (effective 1.2:1) would say about 41%,
  which contradicts "an attack below 3:1 on a prepared position usually
  fails" (doctrine, and the division-level band's own 25-point step from
  3:1). The proposal keeps that step under the new 3:1 band. This is the
  weaker of the two.

**Caution:** the game today (decision 67) lands at 3:1 49% and 2:1 27% in
the standard measurement, and its reasonable plans' medians at 42% and 24%
(the hasty attack aside) — inside both proposed bands. The 3:1 band stands
on Rowland, not on the game; the 2:1 band is a judgement, and it should be
judged as one, not because the game meets it.

## Forty-first round: the hasty attack against history, 2026-10-01

Under decision 67 (100 seeds a scenario from 1000), the hasty attack and its
two parts:

| 3:1 (2:1) | Wins | Cost against the calibrated plan |
|---|---|---|
| A. Calibrated | 59% (24%) | — |
| One scout instead of three | 24% (6%) | 35 points |
| In as soon as found, no fire first | 30% (8%) | 29 points |
| C. Hasty (both) | 7% (5%) | 52 points |

A research pass (validation.md, *Hasty and deliberate attacks*; every
figure second-hand, the proxy refused the pages) found no source that counts
hasty against deliberate attacks on prepared positions at small-unit level.
The nearest: a US planning table puts even odds for a **hasty attack on a
prepared defence at 3.75:1** (about 35–45% at 3:1); the MoD's 1978 desert
war game rates hasty operations at **70% of deliberate**; Rowland's surprise
split at 3:1 is 22 points; RAND's NTC studies tie good reconnaissance to
success without a size.

**Read against it** (±10 points, judgement): a hasty company attack on a
dug-in platoon at 3:1 should win about **15–35%** (centre about 25%), and the
gap to a deliberate one should be about **20–35 points**, not 52.
- **No fire before going in** (29 points) is near the 15–25 the sources
  suggest — a little high.
- **One scout** (35 points, the enemy found seven minutes later) is **too
  much**: about 10–15 would fit. RAND says reconnaissance matters; nothing
  says seven minutes is worth a third of the attack's chance.
- **The two compound** (each costs about 30, together 52); the sources
  suggest less than additive.

### What one scout costs: traced

Replaying the 100 battles of each (`onTurn` hook), at the moment the company
goes in and after:

| 3:1 | Three scouts | One scout |
|---|---|---|
| Enemy squads known on going in (of 3) | 1.5 | 1.3 |
| Enemy men down by then | 0.6 | 0.4 |
| Scouts still alive on going in | **2.8** | **0.8** |
| Missions fired after going in | 8.3 | 7.5 |
| Enemy men down at the end | 7.8 | 5.6 |
| Wins | 59% | 24% |

- **The finding is not the cost**: on going in the company knows about as
  much either way, and its fire has done as little.
- **The scouts are the fire's only eyes during the assault**, when most of it
  is fired. Moving squads cannot find a still, dug-in enemy (decision 53),
  and the company command group walks 80 m behind its squads and never
  stops to look. With one scout gone before the company went in (22 of
  100), the attack won none; with it alive, one viewpoint wins 31% against
  three's 62%.
- **Time is mostly a confound**: battles where the enemy is found late are
  ones where the plan's estimate was far off, which are harder anyway.

A real company's fire is directed by its commander's observer from
overwatch, not by its scouts alone. Proposed (for the author): the drill
halts the company command group in overwatch once the company goes in
(ours), and command groups carry binoculars (a rule; decision 53 gives them
to scouting squads only) — or an observation post may be set up during the
battle (a rule; decision 38 allows it only in planning).

## Forty-second round: an overwatch and binoculars for command groups, tried and withdrawn, 2026-10-01

The forty-first round traced one scout's cost to the company's fire having
no eyes but the scouts' during the assault. The author asked for both fixes
proposed there: the drill halts the company command group in overwatch (an
observation point onto the plan's enemy, from the scouts' vantage finder,
350–550 m out), and command groups carry binoculars (a rule). Built and
measured, the calibrated plan at 3:1, 100 seeds:

| | Wins | Men lost before going in | Defender down |
|---|---|---|---|
| Neither (as the game is) | 59% | 0.8 | 24% |
| Overwatch only | 25% | 2.2 | 18% |
| Command groups' binoculars only (both sides) | **2%** | 13.7 | 2% |
| Both | 3% | 13.9 | 1% |

- **Binoculars for command groups help the defender far more than the
  attacker.** The defending company's command post and the platoon's sit high
  on the tel watching their approaches; with binoculars they see the waiting
  company and its scouts and shell them before the attack starts (battles
  end on turn 12–14, the attack broken, the defence untouched).
- **The overwatch puts the company command group on an exposed vantage
  point**, where it is seen and shelled; losing it loses the company's fire
  control (decision 55), which costs more than its eyes give.

**Both withdrawn**; nothing of them is in the game. What it says: the scouts'
weight is not simply "eyes the company lacks" — any observer close enough to
see a dug-in enemy is close enough to be seen and shelled, and the defender
on the high ground is the better placed watcher. The one-scout gap
(forty-first round) stays open; ways that do not hand the defender the same
gift — a second observer for the company that stays hidden (an observation
post put out in planning, decision 38), or scouts that survive better — are
for the author.

## Forty-third round: the hasty attack redefined, and where the plans stand, 2026-10-01

**No one sends a lone scout** (author, 2026-10-01). The hasty plan keeps the
company's normal reconnaissance (three scouts) and gives up only the
preparation: in as soon as the enemy is found, no fire first (`--rule
rush`). The one-scout cost (forty-first and forty-second rounds) is no longer
a reference plan's; the question still offers one scout, and it stays
costly.

| Hasty attack, decision 67 | 3:1 | 2:1 |
|---|---|---|
| One scout, no fire first (the old C) | 7% | 5% |
| **Three scouts, no fire first (C)** | **30%** | 8% |
| History (validation.md, *Hasty and deliberate attacks*) | 15–35% | — |

The gap to the deliberate plan at 3:1 is 29 points (history: 20–35).

The reference plans under decisions 67 and 68, 100 seeds a scenario from
1000:

| Plan | 3:1 | 2:1 |
|---|---|---|
| A. Calibrated | 59% | 24% |
| A + flank | 47% | 26% |
| E. Fire-heavy | 45% | 28% |
| B. Deliberate | 42% | 41% |
| D. Flank | 38% | 18% |
| A + move up | 33% | 19% |
| C. Hasty (three scouts) | 30% | 8% |
| B + move up | 25% | 16% |
| **Median** | **40%** | **21.5%** |
| **Target (decision 68)** | **40–55%** | **20–35%** |

**Both medians are inside the targets**, at the bottom of each band; losses
are in the sources' range (fortieth round); the controls lose clearly. The
balance the thirty-seventh round set out to check holds for reasonable plans,
not one.

**For the AI comparison:** Jev and all three Claude models chose one scout in
nearly every battle (thirty-fifth and thirty-sixth rounds). If no commander
would, the scout question (`plan.scouts`) is steering them; look at its
wording with `jev-probe` before the next comparison.

## Forty-fourth round: the scout question, and what two scouts win, 2026-10-01

Jev and every Claude model chose **one scout** in nearly every battle
(thirty-fifth and thirty-sixth rounds), which no commander does (author).
The question's options were bare ("one squad", "two squads") beside a
mission that says *mass at the decisive point*, and the models' reasons said
so: "one squad finds the enemy without splitting the mass". `npm run
scout-probe` puts the question to Jev and Haiku in four wordings, 20 seeds:

| Wording | Jev | Haiku |
|---|---|---|
| Bare (as it was) | 1 scout, 20 of 20 | 1 scout, 19 of 20 |
| + what scouts do, in the question | 3, 20 of 20 | 2, 20 of 20 |
| + what each option means, in its label | 2, 20 of 20 | 1 (8), 2 (11), 0 (1) |
| **Both** | **3, 20 of 20** | **2, 20 of 20** |

What is added is the game's own fact, no advice: each scout watches from its
own observation point; the scouts stay at their posts when the company goes
in, and are the eyes for its mortar fire, since moving squads cannot find men
dug in (forty-first round). **Adopted**, question set `2026-10-01.3`.

### Two scouts win less than one

Haiku now chooses two scouts, a plan not measured before (`--rule
twoscouts`, 100 seeds): **3:1 18%, 2:1 16%** — under one scout (24%, 6%) and
far under three (59%, 24%). Traced (as the forty-first round): with both
scouts alive on going in (89 of 100) it fires about as many missions after
(8.3 against three's 8.8) and wins 20% against 62%. **Observation is not the
difference.** The plans show why it is odd: only two observation points are
offered, so the third of three scouts goes to the first's point (`p1`
twice) — three scouts are two viewpoints and one more squad out of the
assault. That three win 59% where two win 18% says the calibrated plan wins
by something fragile, not by more eyes. **Next:** find it, since the
calibrated plan anchors the balance.

### What the third scout does: traced

**Not its viewpoint.** Where the third of three scouts watches does not
matter (`--rule posts-…`, 100 seeds, 3:1): at `p1` 59%, at `p2` 54%,
straight ahead 62%; two scouts at `p1`,`p2` 18%, both at `p1` 21%, at
`p2`,`p1` 18%. **What matters is that the squad is out of the assault.** The
scouts are the squads nearest where the plan puts the enemy, so the third is
usually the western platoon's (BLUE-1).

**The western platoon's approach is where the attack is lost.** Per squad
over 100 battles, with two scouts the western platoon's three squads lose
about 9.8 men a battle and are the first to lose a man in 75 of 100; the
attack's breakpoint is about 26 men. The western platoon closes first (43
of 55 battles where two platoons close), and the attack is piecemeal: when
two platoons do close to 150 m of the enemy, the calibrated plan wins 79%
and two scouts 38% — but with two scouts only 23 attacks of 100 get two
platoons there at all (55 with three); the rest break on the approach.

**So the calibrated plan wins by sending fewer men up the western
approach**, not by its scouts. The drill sends each squad straight at the
nearest enemy once the company goes in, at full pace, by no covered route,
and the side gives up at 30% of all its men: one more squad on the exposed
approach tips the attack. A real company moves its platoons by covered
routes and brings them in together. For the author: whether the drill should
do the same (a drill change, ours) before the balance is called met.

## Forty-fifth round: covered routes, and platoons that close together, 2026-10-01

The forty-fourth round found the attack lost piecemeal on the western
approach: once released, every squad went straight at the nearest enemy at
full pace, and the western platoon arrived first, alone. Two drill changes
(ours, author asked for both, 2026-10-01):

- **Covered routes.** An attacking squad steps through ground out of sight
  of the enemy its side knows of, where a step that still closes on it (by at
  least 40% of the step, up to 60° off the line) is; straight within 150 m.
- **Closing together.** An assaulting platoon within 300 m of the enemy waits
  at the last cover while another assaulting platoon's lead is 100 m or more
  further back — five turns at most.

`--no-covered` and `--no-together` turn each off. 100 seeds a scenario from
1000, decision 67:

| 3:1 | Neither | Covered only | Together only | Both |
|---|---|---|---|---|
| Two scouts | 18% | 30% | 30% | **35%** |
| Calibrated (three scouts) | 59% | 61% | 53% | 57% |

**Scouts now count as they should**: one 28%, two 35%, three 57% (2:1: 15%,
29%, 31%) — rising with the number, where two had won less than one.

| Reference plan | 3:1 before → after | 2:1 before → after |
|---|---|---|
| A. Calibrated | 59% → 57% | 24% → 31% |
| A + flank | 47% → 41% | 26% → 21% |
| B. Deliberate | 42% → 49% | 41% → 25% (out of time 38) |
| E. Fire-heavy | 45% → 43% | 28% → 25% |
| D. Flank | 38% → 25% | 18% → 15% (out of time 44) |
| A + move up | 33% → 28% | 19% → 25% |
| B + move up | 25% → 27% | 16% → 21% |
| C. Hasty (three scouts) | 30% → **45%** | 8% → 23% |
| **Median** | **40% → 42%** | **21.5% → 24%** |
| **Target (decision 68)** | 40–55% | 20–35% |

- **The medians stay inside the targets**, a little higher; the attacker
  loses less on the way in (calibrated 11% down, was 13%).
- **The hasty attack gains most** (30% → 45%): going in by covered ground
  and together makes up much of what preparation gave. That is now above
  history's 15–35% and 12 points under the calibrated plan (history: 20–35).
- **The flank plan loses** (38% → 25%): the detour to the flank point and the
  covered steps lengthen an approach that was already long.
- **At 2:1 a base of fire leaves one platoon to close**, and with covered
  steps it runs out of time more often (B, D).

**For the author:** the hasty attack is now a little better than history
suggests; the flank, worse.

## Forty-sixth round: Jev and Haiku on today's rules, 2026-10-01

Decisions 67–68, the drill of the forty-fifth round, question set
`2026-10-01.3`; the mission framing, no order, plan or memory (as the
thirty-fifth round); 20 seeds a scenario from 1000.

| | 3:1 | 2:1 |
|---|---|---|
| Jev | 15% | 5% |
| Rule with Jev's main choices (`rush,bound,holdshort`, 100 seeds) | 27% | 14% |
| Haiku (`claude-haiku-4-5`) | 5% | 5% |
| Rule with Haiku's main choices (`twoscouts,flank,basefire,holdshort,moveup`) | 20% | 18% |
| Reference plans' median | 42% | 24% |

**Their choices** (40 battles each):
- **Jev:** three scouts at 3:1, two at 2:1 (one before the scout question was
  reworded); in as soon as the enemy is found (40 of 40); bounds (37 of 37)
  and holds short (39 of 40); all platoons assault; often tells a scout to
  stop where it is (49 times) and halts platoons under fire (16).
- **Haiku:** two scouts (40 of 40); **moves up at turn 5, before the enemy is
  found** (40 of 40: "move to covered ground 250 m short to mass forces while
  scouts complete reconnaissance"); round a flank (33 of 33); a base of fire
  for a platoon in 29 of 70 tasks; holds short (32 of 32).

**Read:** most of the distance to the reference plans is their plans — the
hasty attack with bounding and holding short (Jev), the flank and moving up
with a base of fire (Haiku), the weakest pieces measured. A further 10–15
points are in-battle answers: Haiku moves up before the enemy is found, so
the assault position is chosen against the plan's estimate (the thirty-
seventh round's mistake); Jev stops its scouts short and halts under fire.
Tokens: Haiku about 1.3 M in, 66 k out; Jev about 2,000 calls.

## Forty-seventh round: moving up before the enemy is found, 2026-10-01

Haiku moved up to an assault position at turn 5, before the enemy was found,
in all 40 of its battles (forty-sixth round). Tried: re-siting the assault
position against the enemy once found. Measured with `--rule earlyup` (the
calibrated plan, moving up at the first chance), 3:1, 100 seeds:

| | Wins | Men lost before going in |
|---|---|---|
| Calibrated, moving up once the enemy is found (A + move up) | 28% | 4.0 |
| Moving up at the first chance, no re-siting | 11% | — |
| Moving up at the first chance, re-sited once found | 9% | 9.9 |

**Re-siting does not help, and is withdrawn.** The cost is not where the
assault position is but moving the company forward before the enemy is
located: it is seen on the way and shelled. That is a real mistake —
doctrine has reconnaissance before the move to an assault position — and
the game punishes it as it should. `earlyup` stays as a rule variant.

## Forty-eighth round: direct-fire HE as a shell, 2026-10-03

Rules decision 75 puts tank rounds, RPGs and rifle grenades on the shell's
rules: cover, posture, roofs, a blast that catches whoever is in it, men
going to ground, suppression out to its reach. The standard measurement,
200 battles a scenario from seed 1000, the same seeds with the switch
(`directHeAsShell`) off and on:

| | 3:1 wins | 2:1 wins | Attacker down (3:1 / 2:1) | Defender down | Out by HE |
|---|---|---|---|---|---|
| Off (as before) | 48% | 32% | 14% / 17% | 21% / 18% | 75% / 76% |
| On (decision 75) | **42%** | **29%** | 15% / 18% | 20% / 17% | 74% / 75% |

- **The attacker loses 6 and 3 points.** Its rifle grenades now meet a
  defender that is dug in and under a roof: ×0.02 where they were ×1.
  The defender's fire hardly changes, because the attacker is mostly in
  the open, where a shell's factor is ×1 too.
- **Both are still inside decision 68's targets** (40–55%, 20–35%), the
  3:1 near the bottom. The reference plans' median was 42% and 24% before
  this change. If it falls by as much, the 3:1 median drops below 40%:
  the reference plans should be measured again before any ruling on it.
- **A side effect in the drill:** a defending squad displaces to its
  alternate position once it has been shelled (`drill.displace` reads
  `downUnderShelling`). A direct HE round that hits now sets that too, so
  a rifle grenade can move a defender out. Not separated from the rest in
  these figures.
- 200 battles put about ±3.5 points of noise on each figure. The 3:1
  drop is beyond that; the 2:1 drop is within it.
- **The baseline has drifted.** With the switch off, the standard
  measurement now gives 48% / 32%; the handoff records 49% / 27%. The
  difference was already there before this change.

## Forty-ninth round: buildings, critical hits and armour, 2026-10-03

Rules decisions 76–78, the standard measurement, 200 battles a scenario
from seed 1000, all three off and all three on:

| | 3:1 wins | 2:1 wins | Attacker down | Defender down |
|---|---|---|---|---|
| Off (decision 75 alone) | 42% | 29% | 15% / 18% | 20% / 17% |
| On | 43% | 29% | 15% / 18% | 20% / 17% |
| Critical hits alone | 43% | 29% | 15% / 18% | 20% / 17% |

- **These battles cannot measure most of today's work.** Tel Azeka has
  no buildings, and the assault scenarios have no vehicles. The only
  part they exercise is the firing slit: the attacker's rifle grenades
  on the defender's prepared positions, within 150 m. That moves
  nothing beyond the noise.
- **Building damage and armour need a battle with both.** Yokneam has
  249 buildings and one tank, but it is not in the harness. A scenario
  with an attack into a village, with APCs, is the test bed these
  rules need.

## Fiftieth round: the urban test bed, 2026-10-03

`yokneamUrban` (tools/scenarios/yokneam-urban.json): BLUE has a company,
two tanks and two Namer APCs in the low ground north of Yokneam. RED has a
platoon in prepared houses on the north-west edge of the town on the hill,
about 450 m off and 80 m up. The drill now fires a tank's main gun out to
1,500 m and a squad's RPG at armour out to 300 m (`SquadDrill.heavyWeapons`,
⚠️ ours). The runner reports buildings and vehicles in a second table.
Standard measurement, 100 battles from seed 1000:

| | Attacker wins | Defender wins (out of time) | Turns | Attacker down | Defender down | Out by HE |
|---|---|---|---|---|---|---|
| yokneamUrban | 32% | 66% (14%) | 15 | 11% | 29% | 98% |
| telAzekaAssault, same day | 44% | 55% (4%) | 26 | 14% | 22% | 73% |

| | Buildings damaged | Rubble | Window / slit criticals | Roof criticals | Men buried | Vehicles out (BLUE) |
|---|---|---|---|---|---|---|
| yokneamUrban | 1.1 | 0 | 3.0 | 0 | 0 | 57% |

- **The tanks fire about 5 main-gun rounds a battle, and the RPGs about
  2.** The town's houses average 208 m², twice the reference house, so
  one needs about 20 tank rounds to come down. No house was brought down.
- **57% of BLUE's vehicles end the battle immobilised, every one by its
  tracks**, with track damage of up to 90 points. The cause is the
  document's HE-against-tracks roll (decision 3): 20% for 2 points on
  any vehicle within the blast, read off the document's bands (100 m for
  a mortar bomb). RED's mortars, fired at BLUE's infantry, keep catching
  the vehicles beside them. That makes the 81 mm the best anti-tank weapon
  on the field. Open, for the author.
- **Out by HE is 98%**: the defender's losses come from the tanks' main
  guns, three window criticals a battle among them.

## Fifty-first round: the figures checked against the sources, 2026-10-03

Rules decision 79 is on and off, on the same seeds: 200 battles a
scenario from seed 1000, standard measurement.

| | Off: attacker wins | On: attacker wins | Off / on: attacker down | Off / on: defender down |
|---|---|---|---|---|
| telAzekaAssault (3:1) | 43% | **49%** | 15% / 12% | 20% / 21% |
| telAzekaAssault2 (2:1) | 29% | **39%** | 18% / 15% | 17% / 18% |
| yokneamUrban | 38% | **17%** | 10% / 11% | 30% / 23% |

| | Off | On |
|---|---|---|
| Urban: BLUE's vehicles out | 53% | 25% |
| Urban: window / slit criticals a battle | 3.2 | 3.2 |
| Urban: buildings damaged a battle | 1.1 | 1.1 |

- **On the tel the attacker gains.** Weaker charges (a 60° fan at
  30%) and suppression out to 125 m both work for it, and it loses
  fewer men.
- **2:1 is now 39%, above decision 68's 20–35%.** For the author: the
  checked figures and the targets disagree, and nothing is retuned here.
- **In the town the attacker loses ground.** Its tanks' HE is smaller
  (280 m² against 390 m²), so the defender loses 23% where it lost 30%.
  The mortars no longer immobilise its vehicles by near misses.

## Fifty-second round: ARES's indirect-fire figures, 2026-10-03

Rules decision 80 on and off, with decision 79 on; same seeds, 200
battles a scenario.

| | Off: attacker wins | On: attacker wins | Off / on: out by HE | Off / on: defender down |
|---|---|---|---|---|
| telAzekaAssault (3:1) | 49% | **41%** | 70% / 64% | 21% / 19% |
| telAzekaAssault2 (2:1) | 39% | **36%** | 71% / 64% | 18% / 16% |
| yokneamUrban | 17% | **36%** | 98% / 98% | 23% / 29% |

- **The mortars kill fewer on the tel.** The 81 mm's area is now 250 m²
  (was 476), so the defender is worn down less before the assault, and
  explosives' share falls to 64%, below decision 43's 75%.
- **The 2:1 attack is 36%,** just above decision 68's 20–35%. The 3:1
  attack is 41%, inside its 40–55%.
- **In the town the tanks matter more.** HE at 495 m² rather than 280 m²
  puts the defender's losses up from 23% to 29%, and the attacker's wins
  from 17% to 36%. BLUE's vehicles out: 19%.
- **Tank HE back at 280 m²** (author, after GICHD's *Explosive Weapon
  Effects*: "tank munitions … a more limited lethal area than others").
  The urban attack is **18%** (defender down 23%, BLUE vehicles out 21%,
  200 battles). The tel battles have no tanks and do not move.
- For the author: ARES calls its areas "fragmentation" areas and never
  defines them. If they are smaller than lethal areas in the JMEM sense,
  this round understates the shells.

## How the engine scales, 2026-09-23

The same scripted mirror as the harness, grown by the company, timed per turn
over 18 turns — through the approach and into the fight — in the dev
container.

| Forces | Units | Men | Flat, ms/turn | Tel Azeka, ms/turn | Where it goes |
|---|---|---|---|---|---|
| 1 company a side | 34 | 238 | 6 | 4 | morale step 3–5 |
| 3 companies a side | 98 | 690 | 14 | 14 | morale step 12 |
| 9 companies a side | 290 | 2046 | 81 | 102 | morale step 69–85 |
| 1 company, **a token a man** | 208 | 238 | — | 26 | morale 15, move 8 |
| 3 companies, **a token a man** | 620 | 690 | — | 206 | morale 120, move 56 |

- **Squads as tokens, with every man inside rolled on his own** — which is
  what the engine already does — **stays under a tenth of a second a turn at
  2,000 men**.
- **A token per man costs about 15 times as much for the same men, and grows
  with the square of the tokens.** Tripling the men multiplied the time by 8.
- **The morale step is most of every row.** `leaderBonus` walks every unit
  for every man, several times a step. Indexing the leaders by side once per
  step would take most of it away. Not done, since nothing is slow yet.

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
