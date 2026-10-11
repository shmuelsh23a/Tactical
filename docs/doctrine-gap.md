# The doctrinal drills against ours: a gap list (2026-10-11)

What the manuals' battle drills do that [`drill.ts`](../src/app/drill.ts) and
[`company.ts`](../src/app/company.ts) do not, and what ours do that the
manuals do not ask for. This is the reading step
[doctrine-handoff.md](doctrine-handoff.md) calls for before any code: the
point is to decide what changes on evidence, not to translate a manual
line by line.

**Sources.** TC 3-21.76 *Ranger Handbook* (2025), chapter 8: **Battle Drill
2, Conduct a Platoon Assault** (07-PLT-D9514, pp. 175–178) and **Battle
Drill 2A, Conduct a Squad Assault** (07-SQD-D9515, pp. 178–180), with ATP
3-21.8 (2024) chapters 3–5 for the reasoning. Step numbers below are the
drills' own. An **asterisk in the manual marks a leader performance step**,
which this project reads as the layer boundary: asterisked is a *decision*
and belongs to `company.ts` or the player; unasterisked is the drill
executing.

Read one whole before working from this summary:

```bash
PYTHONUTF8=1 py tools/doctrine.py --find "Conduct a Squad Assault" --doc 3-21.76 --full
```

## The structural finding: our atom is the squad, and 2A's is the fire team

The game's smallest unit is an **8-man squad, one `Unit` with a flat
`soldiers[]`**. There is no fire team anywhere in the engine or the app.

- **Battle Drill 2 (platoon assault) maps onto what we have.** Every element
  it moves is a squad, a machine gun team or a vehicle section: "the squad
  or section in contact", "the remaining squads, not in contact", "the
  platoon leader maneuvers the squads into the assault". Our
  base-of-fire/bounding split is the same shape.
- **Battle Drill 2A (squad assault) cannot be represented as written.** It
  is built entirely on splitting the squad: the fire team in contact
  "becomes the support by fire team" (step 6b), the team not in contact
  "becomes the assault team" (the note at step 7), and the squad leader
  manoeuvres one while the other fires. With a squad as an indivisible
  token there is no such thing as half of it firing while the other half
  moves.

So the drills divide into what we can adopt now and what waits on a
modelling decision. That decision is at the bottom of this file, under
*What this needs settled*.

## Gaps that do not need a new unit type

Ordered by what they would change in the game, heaviest first.

### 1. The assault turns on "can we suppress?", three times — and we never ask

Doctrine's platoon assault is a sequence of **decision gates on suppression
achieved**, not on distance:

- Step 8: "The platoon leader assesses the situation."
- Step 11: "The platoon leader determines if the squad in contact can gain
  suppressive fire against the enemy **based on the volume and accuracy of
  the enemy's return fire**" — if not, deploy another squad and the second
  machine gun team.
- Step 12: "The platoon leader, **again**, determines if the platoon can
  gain suppressive fires" — if not, commit the last squad to flank and rear
  security, keep suppressing, and hand the problem to the company.
- Step 13: only "**if** the squads in contact together with the machine guns
  and vehicle element can suppress the enemy" does the assault go in.

Ours decides on **range**: `attackFireRange`, `bound.metres`,
`assault.range`, and `holdShort` waiting on the fires. Nothing in
`drill.ts` or `company.ts` contains the word *suppress*; the drill layer
never reads whether suppression was achieved.

This is the gap that most likely explains a measured oddity we already
have: the attack that wins by walking in regardless. It is also cheap,
because the engine already exports `suppressionLevel(unit)` →
`"none" | "suppressed" | "pinned"`.

**It must be judged from our own side.** Doctrine says "the volume and
accuracy of the **enemy's return fire**" — the commander reads his *own*
forces being shot at, not the enemy's internal state. So the gate reads our
own units' suppression and losses, which a side legitimately knows, and the
drill's "sees only what its side sees" rule is kept. Reading the enemy's
`suppressionLevel` directly would break it.

### 2. The base of fire shifts to the opposite flank; ours only stops

Step 13b(3): "the platoon leader gives the prearranged signal for the
base-of-fire element to **lift or shift** direct fires to the opposite
flank of the enemy position. (The assault element **MUST** pick up and
maintain effective fires throughout the assault. **Handover** of
responsibility for direct fires from the base-of-fire element to the
assault element is critical.)" And step 13b(5): "The base-of-fire element
must be able to identify the **near flank** of the assaulting squad(s)."

Ours has `scoutsFire` (a bool: the base of fire shoots or does not) and
`liftFires()` (the mortars stop). There is no shift to the far flank, no
handover, and no notion of the base of fire tracking the near flank of the
assault so as not to shoot into it. Today the only thing that stops our
base of fire hitting its own assault is `LIFT_AT_M`, a distance.

### 3. Target priority: the weapons hurting you, crew-served first

Step 11a(1): "The squad in contact destroys or suppresses **enemy weapons
that are firing most effectively against it**." Step 11a(2): the vehicle
section does the same "including vehicles and **crew-served weapons**." In
2A step 6c(2): "The fire team **destroys or suppresses enemy crew-served
weapons first**."

Ours is `pickTarget`: the **nearest** enemy in sector, by distance
(`drill.ts:370`). Nearest is not a doctrinal rule at all.

### 4. Screening smoke from the squad's own launchers

Step 11a(3): "The squad in contact places **screening smoke (M203 and
M320)** to prevent the enemy from seeing the manoeuvre element." 2A step
6c(3) is the same at squad level.

Ours fires 40 mm rifle grenades as **HE only** (`grenadiers`), and smoke is
a mortar mission the company calls (`smokeMissions`). The squad cannot
screen its own manoeuvre. Note the doctrinal purpose is specifically *to
stop the enemy seeing the manoeuvre element* — a sight-line effect on the
assault's survival, not casualties.

### 5. Flank and rear security as a job

Step 10: "The remaining squads, not in contact, take up covered and
concealed positions **in place** and observe to the **flanks and rear** of
the platoon." Step 12b: the platoon leader "deploys the last squad to
provide **flank and rear security**." 2A step 4: the fire team not in
contact "observes the flanks and rear of the squad."

Ours faces everything at the objective: `sectorWidth` is centred on the
axis to it, and an idle defender covers its front (`coverWhenIdle`). A
force watching *behind* the platoon has no expression, and nothing in the
game punishes a platoon for being flanked while it is busy to the front —
which is what that step exists to prevent.

### 6. Do not wait for the guns

The note at step 12: "**The platoon leader does not wait for indirect fires
before continuing.**"

Ours has `holdShort`, which stops the assault within `HOLD_SHORT_M` until
the commander lifts the fires. That is a reasonable drill, and it measured
well, but it is the opposite of what this note says. It should become a
choice recorded against doctrine, not our default.

### 7. Consolidation and reorganization do not exist

Step 14 (platoon) and 12 (squad), in detail: local security, the
base-of-fire element **moves up on signal**, sectors of fire assigned per
squad, **key weapons positioned to cover the most dangerous avenue of
approach**, observation posts out **to warn of counterattack**, a quick
fire plan, hasty positions; then step 15, reorganization: chain of command
re-established, **crew-served weapons staffed first**, ammunition
redistributed, casualties treated.

Ours has none of it. A force that takes a position simply stands on it.
This interacts with something we do model — the defender's reserve
counterattacking (decision 60) — and the asymmetry is unfair in our
favour: the counterattack hits an attacker who never consolidated, never
put out observation posts, and never assigned a sector of fire.

### 8. The leader goes forward

Step 4: "The platoon leader, RTO, FO, the squad leader of the next squad,
and one machine gun team **move forward to link up with the squad leader of
the squad or section in contact**." Step 6: the weapons squad leader and
second machine gun team do the same.

Ours keeps command groups a fixed `commandGroupBehind` (80 m) behind the
centre of their forces. Doctrine has the commander physically closing on
the point of contact — which both buys him the assessment steps 8, 11 and
12 depend on and exposes him. We model losing a command group (decision
55, itself still ⚠️); we do not model the risk being taken on
purpose.

## What ours has that doctrine does not ask for

Worth keeping, but mark them as ours rather than doctrinal:

- **`bound.metres` as a fixed distance.** Doctrine gives the leader "a
  distance and direction" per bound (2A step 9b(1); platoon drill step
  13b(6)(b)) and leaves the soldier's own movement to rushes — "no more
  than five seconds" in the platoon drill (step 13b(6)(h)), "3- to
  5-second rushes" in 2A (step 9b(4)). A fixed 50 or 100 m for the whole
  drill is our simplification of both.
- **`sectorWidth` as a single number** for the whole drill. Doctrine assigns
  sectors on consolidation, per squad, by the ground.
- **`displace`** (moving off a shelled position) — the author's rule, not
  in these drills.
- **`breakContact.readyShareBelow`** — a casualty threshold. Doctrine's
  Break Contact drill (07-PLT-D9505, p. 181) begins "while receiving direct
  fire from the enemy **or on orders**, the platoon leader orders the
  platoon to break contact", with no casualty trigger: it is a decision,
  not a reflex.

## What this needs settled

Three choices, each a different amount of work and a different amount of
balance disturbance. They are not alternatives so much as a ladder.

| | What it adds | Cost |
|---|---|---|
| **A. The platoon drill on today's units** | Gaps 1–8 above, all of which are drill-layer or company-layer work on squads we already have | No change to any scenario's order of battle; the harness can measure every step of it |
| **B. A weapons squad and its machine gun teams** | The base of fire as doctrine actually forms it — the platoon leader pulling out machine guns (README backlog 21's own words). Steps 6, 11b and 12a(1) all move machine gun teams independently of rifle squads | Every scenario's order of battle changes, so **every balance table moves**; needs a new unit kind and a weapons-squad drill |
| **C. Fire teams** | Battle Drill 2A at all, and the inside of the assault at squad level (2A steps 6–10) | The engine's atom changes from 8 men to 4; `Unit` gains sub-structure, and detection, cover, morale and succession all currently assume the squad |

### Where each rung stands (2026-10-11)

**A is built.** All eight gaps, each a switch citing its numbered step, each
off unless asked for; `DOCTRINAL_DRILL` turns the set on and
`--drill doctrinal --gate --rear-security` is rung A entire. Gap 1's
measurement is on balance.md and is a rules finding, not a drill one.

**B is blocked on two decisions, both the author's.** The behaviour it needs
is small — machine gun teams tasked as the base of fire, which
`PlatoonTask: "support"` already expresses. What it cannot do without a
ruling:

1. **Doctrine's machine guns outrange our rules.** ATP 3-21.8 (2024) para
   **C-119**: medium machine guns in the base-of-fire element "may find
   themselves firing at targets within a range of **800 meters**". Our
   small-arms table stops at **400 m**, and **rules decision 25** (✅, the
   author, 2026-09-23) explicitly refuses infantry the 700 m coaxial
   table — infantry fire נק"ל\מקלעים "only", because that heading already
   includes machine guns. Data tables are transcribed verbatim and are not
   to be edited (AGENTS.md). So a doctrinal machine gun team cannot reach
   where doctrine employs it, and the three ways out are all the author's:
   an exception to decision 25 for a dismounted medium MG; accepting 800 m
   as unreachable in our rules; or a new transcribed band for it. **Not to
   be decided here** — decision 25 is recorded and must not be silently
   reversed.
2. **A weapons squad changes the force ratio.** The scenarios are built to
   **3:1 and 2:1 by force count**, and are *generated* from JSON specs
   (`tools/scenarios/*.json`, "do not edit by hand"). Adding a four-man
   weapons squad to each of three platoons changes the ratio, so
   `telAzekaAssault` stops being the 3:1 it is named for and every table
   keyed to that ratio becomes incomparable — not merely moved. The choice
   is between **new scenario variants** carrying weapons squads (existing
   tables stay valid, more specs to maintain) and **changing the existing
   specs** (one set of scenarios, every table re-based at once).

**C needs the engine's unit model changed, and is a session of its own.**
There is no team level to put a fire team at: `Echelon` is
`squad | platoon | company | battalion | brigade`, and `Unit` carries a
flat `soldiers[]`. Two designs, neither cheap:

- **A fire team as its own Unit** of four men. Needs a new echelon and a
  convention pairing two teams into a squad (as `platoonKey` pairs squads
  into platoons today). Everything that counts squads — detection, cover,
  morale, succession, the breakpoint, every scenario spec, every balance
  table — then counts twice as many smaller things.
- **`Unit` gains sub-structure**, teams inside the squad. Smaller blast
  radius in the scenarios, but every consumer of `soldiers` must then say
  *which* team it means, and there are many.

Either way the squad stops being a token and becomes a formation, which is
the thing the ladder's top rung was always going to cost.

**A was the recommendation**, and not only because it was cheapest: it is the
only one of the three that can be measured against the existing tables
rather than invalidating them. Gap 1 alone (the suppression gates) changes
how every scripted attack behaves, and we would want to see that in
isolation before the order of battle moves under it.

B is the natural second step, and backlog 21 already names it. C is a
larger decision about what the game is — it would make the squad a
formation rather than a token — and should wait until A and B have been
measured.
