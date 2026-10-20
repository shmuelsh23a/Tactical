# Urban warfare: the design (2026-10-15)

The roadmap's *Urban warfare* entry, designed as a whole before any code,
as the author asked on 2026-10-12. Its shape is **the author's, ruled
2026-10-15** (README, rules decision 96). The figures are still open, and
each one is marked ⚠️ where it is ours. **Nothing is built yet.** The
doctrine behind the design, quoted and cited, is in
[urban-doctrine.md](urban-doctrine.md).

## The ruling

The author, 2026-10-15:

> Fighting in closed terrain (trenches, houses, under ground) should be
> simulated to the soldier level. It should be done in a manner similar
> to "Door Kickers 2", with individual soldiers' movement and fire. When
> we do squad and platoon combat manually, the player will go into a
> separate screen when the force is going into a house/trench. When we do
> company and above, the system will build these houses and calculate
> movements without generating the graphics.

His answers to the follow-up questions, the same day:

1. **Floor plans are randomised.**
2. **Inside, the commander only plans.** Soldiers act by doctrine. "We
   don't move individual units around like other RTS/TBS do." Plan-then-
   execute ticks, not real time with pause.
3. **The defender is the same.** Each commander plans his side of the
   fight, and neither controls the soldiers.
4. **Inside and outside are coupled.** A soldier at a window fires out,
   and a round through a window lands in a room.
5. **Where it runs**: on the computer itself when played on a PC. Phones
   may have to send it to a server (see *Cost and determinism*).

## Why the earlier draft was dropped

The first draft (the same day, in this file's history) kept a force as a
point and gave it a face of the building and a posture. That model
couldn't represent the room fight, which is where doctrine says urban
combat is decided. About 90% of urban engagements happen within 50 m
(ATP 3-06.11 (2024), para B-15), and room fights within 10 m and a few
seconds (TC 3-21.76 (2025), para 11-20). Room clearing is a four-man team
taking a room's corners, its points of domination (ATP 3-06.11, paras
C-32, C-66, C-67). Doctrine fights inside at **soldier scale**, and the
game already draws every man individually, with his own traits.

The draft's questions are answered or superseded as follows:

- **Superseded.** The two postures (at the windows, or back in the room)
  are no longer a rule. They follow from where each soldier stands inside.
  Close quarters and clearing become the interior fight.
- **Still in.** Floors, fires in a town, objectives, time limits, and the
  target band, below.

## Two layers

- **The outside (the tactical map)**: forces as today. A street, a
  garden and the open ground between houses are fought there, under the
  rules as they stand.
- **The inside (closed terrain)**: a house, a trench, a tunnel. It has
  its own grid, and soldiers are individuals on it. It starts when a
  force goes into closed terrain and ends when the fight inside ends,
  either because one side is gone or because it is cleared.

The two layers exchange effects:

| From | To | What crosses |
|---|---|---|
| Inside | Outside | A soldier at a window or loophole fires out, and is seen from outside, through **that** aperture only |
| Outside | Inside | A round that hits a building lands in a **room**: through a window (decision 77), through the roof into the top floor, or through a breached wall (decision 76) |
| Outside | Inside | A force that enters, through a door, a breach or the roof |
| Inside | Outside | A force that leaves, a building cleared, a building lost |

This replaces `OWN_OBJECT_SIGHT_M` for a force inside a building, and it
removes the stalemate (balance.md, *The raid, diagnosed*) at its root. A
defender is seen where he actually stands at a window.

## Floor plans, randomised

- **Generated from the outline**: OpenStreetMap gives the footprint and
  nothing inside it. A generator splits the footprint into rooms,
  a stairwell, doors and windows, floor by floor. **Corridors are not
  generated yet**: rooms open into one another, as in a small dwelling.
  A block of flats wants a corridor and stairs per wing; that waits for
  the resolver to show it matters.
- **Seeded from the game's seed and the building's id**, so a replay and
  both sides get the same house, and the recording carries no plan. The
  generator's draws come from their own stream, never from `game.rng`, in
  the same way as a force's men (decision 19). The plan exists whether or
  not the house is ever entered.
- **Storeys**: from `building:levels` or `height` where the map has them.
  Otherwise the default is 2 ⚠️ ours, which matches today's 6 m. Every
  house in Yokneam lacks the tag.
- **Plausible, not real**: room sizes and window spacing come from typical
  construction ⚠️ ours, to be set against local building types when we
  build it. A scenario may draw a feature building by hand.
- **Who knows the plan**: the defender, because it is his house. The
  attacker knows **only what is reasonable to know from the outside**
  (the author, 2026-10-15): the outline, the storeys, and the doors and
  windows his men have seen. The rooms become known as they are seen
  into, which is the same ledger as outside (`contactsFor`). Special
  operations, planned on intelligence of the inside, are a separate
  topic.

## The commander plans; the soldiers act by doctrine

This is the layer split that holds everywhere else (backlog 21): **plans
are the players', and drills come from the manuals and stay fixed.**
Nobody moves a soldier.

**The attacker's plan** (the squad or platoon commander):
- the entry: a door, a breach (decision 16's laid charge, in turns) or
  the roof;
- top-down or ground floor. Doctrine prefers top-down (TC 3-21.75 (2013),
  para 8-12) and notes that most entries are by the ground floor (ATTP
  3-06.11 (2011), para 7-149);
- which team goes first, and the order of rooms or floors;
- grenades before entry or not (the drill's "FRAG OUT", subject to the
  rules of engagement);
- where the support element stands, and the security left outside.

**The defender's plan**:
- which rooms and floors are held, and by whom;
- loopholes and barricades, prepared before the battle. Doctrine says to
  barricade ground-floor openings and keep "two or three firing ports" in
  each (ATP 3-06.11 (2024), paras 4-54, 4-55);
- mouseholes between rooms or into the next house (para 4-52);
- the fallback route, and which rooms to give up.

**The soldiers' behaviour is the drill**: Enter and Clear a Room
(TC 3-21.76 (2025), ch. 8, 07-SQD-D9509). The four-man stack, #1 and #2
to opposite corners, #3 and #4 opposite them, "CLEAR", security posted,
the next room. The defender's soldiers hold their sectors from their
positions, fire on what they see, and fall back when the plan says to.
The steps are doctrine's. Figures doctrine doesn't give, such as reaction
times and accuracy at close range, come from the rules we already have
wherever possible, and are marked ⚠️ otherwise.

### Time: plan-then-execute ticks

The outside turn is 60 s (decision 40), but a room fight lasts seconds.
The interior advances in **ticks** of about 1 s ⚠️, played out inside the
outside turn. Both sides plan, the ticks run, and the plans stand until a
commander changes them at the next outside turn. Every draw comes from
`Rng` and every plan is journaled, so a recording replays the interior
fight bit-for-bit. No real time and no pause.

## Two modes, one resolver

- **Squad and platoon, played by hand**: when a force goes inside, the
  player gets a **separate screen** with the floor plan, as much of it as
  his side knows, and his soldiers. He plans there and watches the ticks
  play out. It is a planning and playback screen, not a control screen.
  **It opens as a tab** (the author, 2026-10-20: "The way we combine the in
  house and out house fight is by opening the in house battle as a tab.
  The same as in mobile version of chrome"):
  - The outside map is one tab, and each building being fought in is a tab
    of its own beside it.
  - The player switches between them as a phone's browser switches tabs: a
    tab strip or a grid of cards, each showing its fight at a glance.
  - A tab opens when an assault goes in and closes when the fight there
    ends.
  - It belongs with the UX/UI pass recorded in README backlog 13.
- **Company and above**: the same resolver runs **headless**. It builds
  the houses and resolves the fights without drawing them. The balance
  harness runs this way too.

**The resolver is one engine module and the screen only draws it**, so
the hand-played fight and the auto-resolved one can't disagree. The
resolver goes in `src/engine/` (DOM-free, `Rng` only), and the screen goes
in the app.

## Cost and determinism

**Cost** (an estimate to prove, not a measurement):
- A floor of about 200 m² on a 0.5 m grid is about 800 cells.
- With about 16 soldiers, the sight test each tick is about 128 lines of
  about 40 cells, roughly 5,000 steps. Over a 60 s turn that is about
  300,000 steps, around **3 ms a house** on a PC.
- Fifty houses fighting in one brigade turn come to about **150 ms**.
- A phone is 3–5× slower, still under a second.

**Measured 2026-10-16** (balance.md, *What a fight inside a house
costs*), on a throwaway prototype with real footprints and random plans:
**1.2–1.7 ms a house-turn** with 8 a side, 3.3 ms with 30 a side, and
**0.4 s** for all 249 Yokneam houses fighting in one turn. Floor plans
take 0.2 ms a storey. That was on a PC; a phone is not measured yet.

So **yes on a PC**, and probably on a phone too. A server is likely to be
needed for networked play and the AI commanders rather than for this
calculation. `scaling.test.ts` caps a turn's cost by the number of
forces. The interior gets its own budget, by soldiers inside, pinned the
same way.

**Determinism across devices** is the real constraint for phones and
servers. If a phone and a server both compute a fight, they must get the
same bits. Basic arithmetic (`+ − × ÷`) is exact under IEEE 754 in
every JavaScript engine. **The `Math` functions (`sin`, `cos`, `atan2`,
`exp`, `pow`) are only "implementation-approximated" in the language
standard, so they aren't guaranteed to match.** `Math.sqrt` is
correctly rounded on every engine we know of; confirm that before
relying on it. The
resolver uses only basic arithmetic and our own versions of anything
else, and a lint rule enforces that. The rest of the engine gets the same
audit before phones.

## What carries over from the draft

- **Floors**: eye height `floor × 3 m + 1.5 m`. A tank can't elevate its
  gun above +20° (ATP 3-06.11, para B-96). Only the top floor is open to
  a round through the roof (para B-168), and the roof is open to every
  shell (para 4-61).
- **Fires in a town**: dead space behind a building is about 5× its
  height for low-angle fire and ½× for high-angle fire (para B-165). Up
  to 25% of impact-fuzed rounds fail to detonate on hard surfaces
  (para B-19), behind a `GameOptions` flag because it adds rng draws.
  Danger close waits for ATP 3-09.32, which is not in the corpus.
- **Rubble** slows movement (para B-151): impassable to vehicles ⚠️, and
  climbing for infantry.
- **The company in a town**: isolate, foothold, clear, consolidate (ATTP
  3-06.11 (2011), para 2-70), **one squad a floor** (ATP 3-06.11, para
  C-3), and objective buildings rather than a centroid. The defender
  holds mutually supporting buildings in depth (ATTP 3-06.11, para 6-53).
- **Success** is buildings **cleared** (FM 3-90 (2023), para B-16), which
  is the first concrete case of backlog 18.
- **Decisions 75–78** are re-read against the coupling table above. A
  window critical (77) lands in a room, and a breach (76) opens a room on
  one floor.

## Trenches and tunnels

The same resolver handles them, on a different generator. A trench is a
line with its own cross-section, and a tunnel is a graph of passages.
Neither is on OpenStreetMap, so a scenario spec draws them. They come
after houses.

## Order of work

1. ~~**A throwaway prototype** of the cost estimate above~~ **Done
   2026-10-16**: 1.2–1.7 ms a house-turn (balance.md).
2. **The floor-plan generator**: **done 2026-10-16**
   (`src/engine/interior/floorPlan.ts`, figures in `data/interior.ts`, all
   ours and listed on balance.md). The grid lies along the longest wall.
   Rooms are cut 3 to 6 m a side on the floor, a stairwell is shared by
   every storey, and every room can be reached from the front door or the
   stairs; a wing that can't be is given its own door or listed as cut off.
   On the 249 Yokneam houses: 9 rooms a storey, rooms of 9 to 25 m²
   (median 15), none cut off. Pinned by a golden hash, and kept to plain
   arithmetic by a lint rule.
3. **The headless resolver**: the coupling, the attacker's and the
   defender's plans as data, and the drill from TC 3-21.76. **First half
   done 2026-10-16** (`src/engine/interior/resolver.ts`, `npm run
   interior-sim`): the plans as data, the drill, fire, grenades and wounds,
   on its own; measured on balance.md, *The fight inside, first measured*.
   **The coupling's first slice, done 2026-10-20**
   (`src/engine/interior/coupling.ts`, `GameOptions.closedTerrain`):
   - A fight runs a turn's 60 ticks as the turn closes.
   - Forces go in only by an assault order (the author: "only an assault
     order goes in, and a force at the walls fights from outside"), and
     come out by withdrawing, routing or surrendering.
   - Wounds go both ways between the map and the fight.
   - Contacts are exchanged when a fight starts.

   Measured on balance.md, *The fight inside, in the game*.

   **The second slice, done 2026-10-20** (decision 98, `GameOptions.windowFire`):
   a defender stands at a window facing the enemy unless planned otherwise,
   fires out through it and is seen through it; fire into the building finds
   only those men and attackers still in the street; forces fighting each
   other inside do not also shoot by the rules outside; a window or roof
   critical bursts in one room among both sides. Only where a fight is going
   on: a garrison not yet assaulted keeps `OWN_OBJECT_SIGHT_M`. Spotting and
   morale's seeing follow the windows too.

   **Joining a fight, done 2026-10-20** (decision 99, `GameOptions.joinFights`):
   the attacking side's further forces join as new teams at the door; the
   defending side's are refused until the counterattack inside is designed.
   **Plans inside, done 2026-10-20** (decision 101, `Game.setInteriorPlan`):
   door or roof, grenades, team size; storeys held, windows or back,
   expected from, fall back or hold. **Still to do:** the defender's
   counterattack inside; breaches, mouseholes, loopholes and room order in
   a plan; the computer and the harness filling plans; the screen. Two findings wait on the author first: a
   house is cleared in minutes, where doctrine's one example says about an
   hour (too weak to set a target; balance.md has why), and top-down entry
   is barely better than the door. It is
   measured against doctrine before anyone plays it:
   - clearing that is slow and methodical (ATP 3-06.11, para 3-8). The
     paragraph's "40-60-minutes" is one illustration, not a planning
     figure: a target needs real data;
   - top-down beating the ground floor;
   - grenades as the most-used explosive (para B-35);
   - casualties higher than in the open (para C-8).
4. **The company and the harness** on it: the town scenarios
   (`yokneamRaid`, `yokneamUrban`) re-measured.
5. **The screen**: planning and playback for a hand-played squad or
   platoon.
6. **Trenches and tunnels.**

## Top-down: what it gains and what it costs (built 2026-10-16)

**Approved as proposed and built the same day.** The measurement is in
balance.md, *Top-down, built and measured*. The figures below are what
was built.

The author asked for a real advantage for top-down entry, from doctrine.
Today the only top-down effect is a grenade thrown up a stairwell at half
its chance, and the two entries measure level (balance.md). **Nothing here
is built.**

### What doctrine says

No controlled study compares the two directions (a web search on
2026-10-16 found doctrine and anecdote only). Doctrine itself is specific,
and it names **costs as well as gains**:

- **Gains.**
  - "the enemy will be expecting it" at the obvious entry (ATTP 3-06.11
    (2011), para 7-146). Top-down "bypasses the expected ground floor
    entry points that are often well defended and booby trapped" (para
    7-147).
  - A roof entry "can allow elements to approach defensive positions from
    the rear, making them much easier to clear". It can "drive the enemy
    out of the building where the support element can engage them" (ATP
    3-06.11 (2024), para C-30).
  - "a unit's momentum is greater clearing down than up; grenades are
    easier to throw down a stairwell than up" (ATTP 3-06.11, para 7-148).
  - "An enemy who is forced down to ground level may elect to withdraw
    from the building, thus exposing himself to friendly fires" (para
    7-148). Driven up instead, he "may be cornered and subsequently fight
    desperately or escape over the roof" (same para).
  - Clearing up "places heavy demands on Soldiers' muscular and
    cardiovascular endurance"; throw grenades up and they are "likely to
    roll back down" (ATP 3-06.11, para C-103). Top-down "is less
    physically demanding" (para C-30).
- **Costs.**
  - It needs roof access: ladders, adjacent roofs, armoured vehicles,
    helicopters (para C-30; ATTP para 7-147: "The exposure of Soldiers when
    entering a higher level must be mitigated").
  - "force size is more limited, and it is more difficult for the clearing
    element to get support from the outside. This makes a determined enemy
    better able to halt and isolate an understrength attacking force"
    (para C-30).
  - Clearing down "Soldiers make more noise... Enclosed stairways propagate
    sound that can alert enemies across many floors" (para C-103).
  - Anecdote, not doctrine: a casualty on a stairwell is hard to carry back
    up (a Marine staff sergeant, NPR). A Marine scout-sniper platoon's
    Fallujah AAR doubts top-down suits the infantry squad.

### The proposal (⚠️ every figure ours, for the author)

**Gains:**

1. **The defender watches the way he expects the attack.** In his plan the
   defender sets where he expects the attack from: the ground floor by
   default, as doctrine says the enemy does. A man watches only the
   doorways of his room that face that way, so he fires the second an
   enemy fills them. An attacker coming in through any other doorway, or
   down from the floor above, finds him **unready**: the 1 s reaction
   applies to him, and decision 85's *caught unready* figures apply (hit at
   ×1.5, fires at ×0.4 until the next second). This is "from the rear"
   (C-30).
2. **The defender falls back, and down leads out.** In the defender's plan,
   "fall back" is the default; the other choice is "hold to the last". A
   man whose room's neighbour is taken falls back to a room farther from
   the attackers.
   - With the attack coming down, falling back leads down the stairs and
     out of the front door. He **withdraws** from the building, which ends
     his part in this fight. The coupling will hand him to the outside map,
     where the support element can engage him (7-148).
   - With the attack coming up, he is driven up and **cornered** on the top
     floor. There he fights where he stands; the roof escape waits for
     roofs.
3. **Stairs by direction.** A flight takes **6 s up and 3 s down** (4 s
   today), from C-103 and C-30. A grenade thrown up keeps its half chance,
   and its 5% self-hit **doubles**, because it rolls back down (C-103).

**Costs:**

4. **Getting onto the roof takes a means and time.** A top-down plan names
   how: an adjacent roof, a ladder, or a vehicle. It costs **3 minutes**
   before the first man is in; a helicopter is for battalion. Once coupled
   to the outside map, the climb is fought there, exposed.
5. **One team at a time through the hatch.** The second team can follow
   only once the first has cleared the stair room, and then another team
   after the next **2 minutes** (C-30, "force size is more limited").
6. **Casualties from upstairs are harder to get out.** While the floors
   below are not clear, a man put out above them halts his team **×1.5**
   as long (15 minutes, not 10) (C-30, the NPR anecdote).
7. **The noise down the stairs.** When attackers come down a flight, the
   defenders on that storey turn to watch the stairs (C-103). This blunts
   gain 1 on every storey after the first.

### What it should measure like

Against a determined, prepared defender who holds to the last, top-down
should cost more than it saves: few men in, little support. Against one
who falls back, it should clear faster and with fewer losses, driving him
out. Its edge should be largest where the ground floor is the prepared
part. A plan should face a real choice, and neither entry should dominate.

## The author's answers on the open points (2026-10-15)

- **Clearing time against scenario length: wait for the new engine.**
  The town scenarios' time limits stay as they are until the resolver
  measures how long a house takes. Doctrine's "40-60-minutes" was first
  taken as the check; it is only an illustration (balance.md, *The fight
  inside, first measured*), so the check still needs a source.
- **The target band for an urban attack: from the research**, not from
  doctrine's force ratios alone. The research is gathered in
  [urban-doctrine.md](urban-doctrine.md), *Research on outcomes*. What
  it found and what it suggests is below, under *The urban band*.

## The urban band: what the research says (ruled 2026-10-15)

**Accepted by the author as proposed, 2026-10-15** (README, decision 96):
decision 68's band, the cost in time, and 9:1–15:1 as planning advice.

**The research contradicts doctrine's planning table.** Two matched
historical studies, read on the page, compare urban and open attacks:

- **The Dupuy Institute for CAA** (Lawrence & Anderson 2002), 137
  division engagements in 1944: attackers won **84% against 71%**
  (Channel Ports against Normandy) and **95% against 59%** (Aachen
  against the Westwall and Ardennes). Between 1.15:1 and 2.56:1, **no
  urban attack failed (0 of 14)**, against 12 of 55 in the open. The
  authors' verdict is that terrain has "no significantly measurable
  influence on the outcome".
- **Dstl** (Syms 2023), 145 battles from 1943 to 2008, brigade to
  company: attackers won **88% in towns against 59% in the open**, with
  no control for force ratio.
- **Attacker losses a day in towns are about half** of the open rate in
  both studies, and in a third study (Yazilitas 2004, abstract only).
- **What a town does cost is time.** The advance is ½ to ⅓ of the open
  rate, and battles last 2–3× longer at brigade and battalion level.
- I found **no historical basis for ATP 3-06's 9:1–15:1**. It is a
  planning table adapted from ATP 2-01.3.
- **The caveats:** the urban attacks were chosen, often against
  encircled defenders. The data is division and brigade level, with only
  6 urban cases at company level. No study gives a rate for a company
  attacking a platoon in houses.

**The proposal, as accepted:**

1. Keep **decision 68's band for an urban attack**: 3:1 against a
   prepared position **40–55%**, 2:1 **20–35%**. The research gives no
   reason to set it lower, and its direction would set it higher; the
   selection bias is why I'd not raise it.
2. Put the urban cost **in time, not outcome**: an urban attack should
   take markedly longer than the same attack on open ground, about 2× ⚠️
   (the brigade figure, extrapolated). This becomes a measured target
   once the resolver exists, alongside a clearing time per house once one
   is sourced.
3. Losses: an urban attacker should **not** lose more per turn than an
   open-ground one.
4. Doctrine's 9:1–15:1 is recorded as doctrine's planning advice, not a
   target the rules are tuned to.

On this band, `yokneamUrban`'s 56% at about 3:1 is at the top of the
band. It is not the outlier it looked like against doctrine's table.
- **Clearing time: ruled 2026-10-16** — "a methodical search per room,
  sized so a lightly held two-storey house takes about 20 minutes, with
  the fighting adding to it". Built as `searchSecondsPerM2` = 3.5
  (balance.md, *The methodical search, calibrated*). **The fighting's own
  time, ruled the same day**: 5 minutes to reorganise a room taken under
  fire and 10 a casualty, so a house nobody holds takes 20 minutes and
  three prepared defenders 56 (balance.md, *What a firefight inside costs
  in time*). The author accepted that "about 20 minutes" is a house
  nobody holds, and one defender about 32. The real data puts a squad clearing a defended two-storey
  house at **about 20–60 minutes** (the sources in urban-doctrine.md);
  the resolver took about 7 before the search. **The proposal as
  accepted:**
  - Give each room a **methodical search** after its "CLEAR": the cache
    search and back-clearing Fallujah describes. Its length would be set
    so an empty or lightly held two-storey house takes **about 20
    minutes**, the low end and Fallujah's platoon pace, with the fighting
    adding to it.
  - That is about 2 minutes a room, against today's 20 s of
    consolidation.
  - The approach between houses stays on the outside map, where it is
    already paid for.
- **What the attacker knows of a floor plan: only what is reasonable to
  know from the outside.** That covers the outline, the storeys, and the
  doors and windows he can see from where his men have looked. The rooms
  behind them are unknown until seen into. **Special operations are a
  separate topic**: a raid planned on intelligence of the inside, which
  is the case for `yokneamRaid`, is to be designed on its own.
