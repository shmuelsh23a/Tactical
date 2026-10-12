# Mortar allotment and fire plans: doctrine (2026-10-12)

The review the author asked for after decision 92: "revisit mortar
allotment and fire plans according to doctrine." Decision 92's
instrumented battles left the 3:1 defence pinned in 53% of its contact
turns, by shells, because twelve missions a side keep them falling most
turns (balance.md, *A shell's suppression as a chance*). This is what
doctrine says a company has and how it spends it, set against what the
game does. **Nothing has changed yet.** All quotes are from the corpus
(`tools/doctrine.py`), checked on the text.

## What the game does now

- **Allotment**: every company scenario gives each side **12 missions of
  `mortar`** — the 81 mm's lethal area (476 m²), a fire unit of **3 tubes**
  (`FIRE_UNIT_TUBES`), **24 bombs** for effect (`RESEARCH_ROUNDS_FOR_EFFECT`):
  288 bombs a side. It is the only mortar the engine knows.
- **The attacker** (`callAttackerFire`): three registered points across
  the brief's frontage; then, with `waitForContact` and `aimWithin 40`, a
  full mission on any fresh mark it is sure of, one after another until
  the twelve are gone; fire lifts at **100 m** from its own squads
  (`LIFT_AT_M`, decision 63 S4: danger close accepted).
- **The defender** (`planDefenderFires`, `callDefenderFire`): **six**
  registered targets in the dead ground 100–400 m in front; then a full
  mission on any fresh mark — a registered target's first, else the
  nearest. Nothing is held back.
- The `RESEARCH_ROUNDS_FOR_EFFECT` comment cites FM 7-90 for "seldom less
  than five rounds for each mortar". **That line is in neither FM 7-90's
  text nor anywhere in the corpus** — the comment needs correcting
  whatever is ruled.

## What doctrine says

### Organisation

- "The basic unit is a squad with one mortar. **Each mortar section has
  two squads** and each mortar platoon has two sections" (ATP 3-21.90,
  2019, para 1-65). A three-tube section is not a US organisation.
- **A rifle company owns two 60 mm**: "two, three-Soldier light mortar
  squads. Each squad mans a single 60-mm mortar", "directly under the
  control of the Infantry company commander" (ATP 3-21.10, 2026, para
  1-25). SBCT: two 120 mm, plus two 60 mm (ATP 3-21.90 1-76). A mechanised
  company has none (ATP 3-90.1 1-58).
- **The battalion mortar platoon**: four 120 mm, with four 81 mm "to
  support operations in terrain that limits vehicle access" (ATP 3-21.90
  1-71); crews for one system at a time (ATP 3-21.20 1-91).
- **How it reaches a company**: priority of fires "is normally given to
  the unit assigned the main effort … only one maneuver unit has the
  priority of fires at any one time" (ATP 3-21.90 2-38); direct support
  "is often used to place a mortar section in support of a rifle company"
  (2-70). In the defence, priority goes to whoever holds "the most
  dangerous avenues of approach" (2-42).

### Ammunition

- **No basic load in numbers** anywhere in the corpus — it is set by the
  unit's SOP (ATP 3-21.90 6-42–6-43). Mix 70% HE, 20% smoke/WP, 10%
  illumination (6-46).
- The 60 mm is carried by hand: "The mortar section can only carry a very
  limited amount and therefore most ammunition is carried and dropped off
  by Soldiers in the rifle platoons … The section cannot expend all of
  its rounds prior to the mission's completion. **Ammunition restrictions
  often have to be imposed for each target**" (ATP 3-21.10 D-65).
- Anchors, not allotments: a company Stryker stows **77 rounds of 60 mm**
  (TC 3-22.90 5-100); a mortar carrier 60–69 of 120 mm (5-99, 5-75); a
  60 mm HE weighs 3.75 lb, an 81 mm 9.42, a 120 mm 31.2 (ATP 3-21.90
  Table 6-1). The one quantity example is a whole task force's mortar
  platoon: "20 x platoon 4 rounds of high explosive" — 320 rounds from
  four 120 mm for the operation (ATP 3-21.90, ch. 2 example matrix).
- Rates (TC 3-22.91 Tables 3-4–3-6): 60 mm 30 a minute for 4 minutes, 20
  sustained; 81 mm 30 for 2 minutes, 15 sustained; 120 mm 16 for 1
  minute, 4 sustained. **Ammunition, not rate, is the limit.**

### Fire planning

- **Few targets**: "The company target lists should consist of **not more
  than three to five targets**" (ATP 3-21.10 D-20; ATP 3-90.1 8-22); the
  company mortar plan's "primary constraint is normally ammunition
  availability" (D-14).
- **One priority target**: "the company mortar section can be assigned
  one" (ATP 3-21.90 2-120); the tubes lie on it when idle, and its rounds
  are "set aside" and fired "at the maximum rate of fire immediately upon
  the observer's call" (2-120, 2-123).
- **One FPF in the defence**: fired "at the maximum rate of fire until
  the firing unit is requested to stop, ammunition is exhausted" (ATP
  3-21.10 D-25); one per mortar unit (D-29); to the platoon on "the most
  dangerous avenue of dismounted approach" (D-24); "normally within 100
  to 400 meters of friendly troops" (D-32); "a specific amount of
  ammunition is always designated, prepared, and set aside" (D-24). Two
  60 mm cover 60 × 30 m (ATP 3-21.90 Table 3-1).
- **Rounds per target**: the observer's call (TC 3-22.91 4-29). To cover
  100 m: 60 mm **8** rounds, 81 mm **4**, 120 mm **2** (Table 6-4).
- **Surprise over volume**: "A few rounds from many mortars are better
  than many rounds from a few mortars" (TC 3-22.91 3-159); two rounds on a
  platoon standing in the open do what 10–15 do once it is warned (ATP
  3-21.8 B-38).
- **Preparation is a choice with a cost**: "Not all maneuver tasks
  warrant preparation fires … Will the loss of surprise from the
  preparation be offset by the damage done to the enemy?" (ATP 3-21.20
  C-78); company 60 mm only against "enemy forward elements", weighing
  "ammunition resupply and availability of mortars to attack targets of
  opportunity" (TC 3-22.91 3-98).
- **Assault**: "short, violent preparations targeted against forward
  defenses … lifted or shifted at the last possible moment" (ATP 3-21.90
  3-71); then shifted beyond the objective (ATP 3-21.8 B-16). Risk-
  estimate distances, 0.1% incapacitation: 60 mm 115–175 m, 81 mm
  170–230 m, 120 mm 280–430 m; 10%: 65 / 80 / 100 m (TC 3-22.91 Table
  3-2; ATP 3-21.8 Table B-1). Our 100 m lift sits between, as decision 63
  S4 accepted.
- **Immediate suppression** is for a target "that has taken friendly
  maneuver … elements under fire" (TC 3-22.91 4-11).

**Doctrine does not give**: a basic load per tube, rounds a soldier
carries for the 60 mm, rounds to suppress or neutralise a position by
calibre (the JMEMs are classified), a preparation's length, when to
register.

## Where the game departs from it

1. **The wrong weapon and too many tubes.** A company fights with a
   three-tube 81 mm section; doctrine gives it two 60 mm of its own, and
   the battalion's 81 / 120 mm only by priority of fires to the main effort.
2. **Probably too many rounds** for a company's own fire — 288 of 81 mm
   against a section that carries "a very limited amount" — though
   doctrine puts no number on it.
3. **No set-aside.** Neither side holds rounds for a priority target or an
   FPF; both spend on whatever they see, which doctrine's "ammunition
   restrictions … for each target" and "set aside" forbid.
4. **The defender plans six targets** where doctrine says three to five,
   and has no FPF — the one fire doctrine guarantees a defence.

## The proposal (⚠️ for the author)

**A. Weapons** (engine data, sourced): add the **60 mm** (ARES lethal area
150 m²; FM 7-90 suppression 20 / 35 / 50 m; 30 a minute; risk 115–175 m)
and the **120 mm** (ARES 650 m²; 65 / 125 / 200 m; 16 a minute; 280–430 m)
beside the 81 mm; and a mortar section of **two** tubes, a platoon four.

**B. Allotment** (the scenario specs), for the IBCT companies on the tel:
- **Attacker, the main effort**: its own **2 × 60 mm**, and the
  battalion's **4 × 81 mm** (dismounted terrain) with priority of fires.
- **Defender, a platoon of a defending company**: its company's
  **2 × 60 mm**, by a priority target and the FPF.
- **Ammunition in rounds, not missions** — ⚠️ ours, since doctrine has no
  number: 60 mm section about **80** (the 77 a company Stryker stows);
  the battalion 81 mm platoon's share for the main effort about **160**
  (half the 320 of the task-force example). An FFE of 8 (60 mm) or 4–8
  (81 mm platoon) covers a squad's 100 m (TC 3-22.91 Table 6-4).

**C. Fire plans** (the scripted commanders, harness policies):
- **Both**: three to five planned targets; **one priority target** with
  rounds set aside, fired at once on call; nothing beyond the plan and the
  priority target except **immediate suppression** of a mark that is
  firing on its own squads.
- **Defender**: **one FPF** 100–400 m in front, on the most dangerous
  approach, its rounds set aside and fired at the maximum rate when the
  assault reaches it.
- **Attacker**: a preparation stays a choice (`prepFires`); lift at the
  risk-estimate distance or 100 m as now (decision 63 S4); then shift
  beyond the objective.

What it would do, not measured: much less fire falling on the defence
in the approach (no 288-bomb budget, less spent on sightings), more of
it in a short burst at the assault and on the FPF. Which way the 3:1 and
the 2:1 move is not obvious — the defence is pinned less, but the
attacker's battalion mortars are heavier. It would be measured as 91 and
92 were.
