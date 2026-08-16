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
| Casualty bands | **0 / 1–2 / 3–5 / 6+** → `ללא נפגעים שנצפו` / `נפגעים בודדים` / `מספר נפגעים` / `אבידות כבדות` | ours (banding itself ✅ confirmed) |

Two properties to keep in mind if these move: the bands are **honest** (a player
is told less, never told something false), and they apply to the live combat log
during play as well as to a per-side debrief. The umpire's view is exact and is
where the tally belongs.

## Rules the document is silent on

| Figure | Value | Whose | Where |
|---|---|---|---|
| Smoke screen radii | **25 / 50 / 100 m** (grenade / mortar / artillery) | ours, decision 9 | [`data/smoke.ts`](../src/engine/data/smoke.ts) |
| Charge trigger radius | **10 m** of the path walked | ours, decision 10 | [`combat/mines.ts`](../src/engine/combat/mines.ts) |
| Assault reach | **25 m** | ✅ author, decision 11 | [`combat/assault.ts`](../src/engine/combat/assault.ts) |
| Grenades per assault | **0–3, no ammunition tracked** | ours, decision 11 | UI |
| Indirect fire | **one mission + one screen per side per turn** | ✅ author, decision 8 | UI limit over an engine that models `roundsPerTurn`. Correct *for the platoon-leader slice* — a platoon commander calls for fire, he does not own a battery. Replaced by a real battery unit at battalion and above (backlog 3), so retune this only within the current echelon. |
| Fog-of-war fallback radius | **300 m** (`SPOT_RANGE_M`) | ours | [`app/hotseat.ts`](../src/app/hotseat.ts) — only used when `trackIntel` is off |
| What-if runs | **20** | ours | [`app/whatIf.ts`](../src/app/whatIf.ts) — a UI choice, not a rule |

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
- **Full camouflage at setup is strong.** The demo's forward RED squad starts at
  the -50% cap, which is the author's prepared-position reading. Against it, a
  walking searcher has 30% inside 20 m and a scout 40%.
