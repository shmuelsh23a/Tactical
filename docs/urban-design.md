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
  corridors, a stairwell, doors and windows, floor by floor.
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

1. **A throwaway prototype** of the cost estimate above, timed on a PC.
   It is deleted afterwards, and the figure goes here and on balance.md.
2. **The floor-plan generator**: deterministic, seeded, with storeys, and
   tests that the same seed and building give the same plan.
3. **The headless resolver**: the coupling, the attacker's and the
   defender's plans as data, and the drill from TC 3-21.76. It is
   measured against doctrine before anyone plays it:
   - 40–60 minutes for a supported platoon to clear a one-floor house,
     90 minutes unsupported (ATP 3-06.11, para 3-8);
   - top-down beating the ground floor;
   - grenades as the most-used explosive (para B-35);
   - casualties higher than in the open (para C-8).
4. **The company and the harness** on it: the town scenarios
   (`yokneamRaid`, `yokneamUrban`) re-measured.
5. **The screen**: planning and playback for a hand-played squad or
   platoon.
6. **Trenches and tunnels.**

## The author's answers on the open points (2026-10-15)

- **Clearing time against scenario length: wait for the new engine.**
  The town scenarios' time limits stay as they are until the resolver
  measures how long a house takes. Doctrine's 40–60 minutes (40–60
  turns) is what that measurement is checked against.
- **The target band for an urban attack: from the research**, not from
  doctrine's force ratios alone. The research is gathered in
  [urban-doctrine.md](urban-doctrine.md), *Research on outcomes*. What
  it found and what it suggests is below, under *The urban band*.

## The urban band: what the research says (proposal, not ruled)

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

**Proposal** (⚠️ for the author to rule):

1. Keep **decision 68's band for an urban attack**: 3:1 against a
   prepared position **40–55%**, 2:1 **20–35%**. The research gives no
   reason to set it lower, and its direction would set it higher; the
   selection bias is why I'd not raise it.
2. Put the urban cost **in time, not outcome**: an urban attack should
   take markedly longer than the same attack on open ground, about 2× ⚠️
   (the brigade figure, extrapolated). This becomes a measured target
   once the resolver exists, alongside the 40–60 minutes a house.
3. Losses: an urban attacker should **not** lose more per turn than an
   open-ground one.
4. Doctrine's 9:1–15:1 is recorded as doctrine's planning advice, not a
   target the rules are tuned to.

On this proposal, `yokneamUrban`'s 56% at about 3:1 is at the top of the
band. It is not the outlier it looked like against doctrine's table.
- **What the attacker knows of a floor plan: only what is reasonable to
  know from the outside.** That covers the outline, the storeys, and the
  doors and windows he can see from where his men have looked. The rooms
  behind them are unknown until seen into. **Special operations are a
  separate topic**: a raid planned on intelligence of the inside, which
  is the case for `yokneamRaid`, is to be designed on its own.
