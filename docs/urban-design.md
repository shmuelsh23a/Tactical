# Urban warfare: the design (draft, 2026-10-15)

The roadmap's *Urban warfare* entry, designed as a whole before any code,
as the author asked on 2026-10-12: "We need to design a whole thing around
it. It's a big chunk." **Nothing here is built, and nothing here is
ruled.** It is a proposal. The questions for the author are at the end,
and each one has a recommendation. The doctrine behind it, quoted and
cited, is in [urban-doctrine.md](urban-doctrine.md).

## Why piecemeal fixes failed

The game models a building as one thing: a footprint with a height, which
gives full cover to anything within 3 m of it and blocks sight lines.
**A force is a point.** These figures were measured on the map's 249
houses (Yokneam, OpenStreetMap) on 2026-10-15:

| | Value |
|---|---|
| Footprint, median (25th to 75th percentile) | **208 m²** (186 to 240) |
| Narrow side, median | **16 m** |
| Houses with a height or storey count in the data | **0 of 249**, so every house defaults to 6 m |
| Distance from a house's centre to its nearest wall | about **8 m** |
| How far a force sees out through its own walls (`OWN_OBJECT_SIGHT_M`) | **6 m** |

A force placed in the middle of a house is therefore blind, and it can't
be seen either. Half the raids end with no shot fired for that reason
(balance.md, *The raid, diagnosed*). On 2026-10-06 we tried letting a
force see out through its walls at any depth. That fixed the blindness
but turned every house into a pillbox with a view on all sides, and the
raid broke 89 times in 100. Both failures come from the same cause: **a
point has no idea which window it is at.** Doctrine fights in a house
from particular apertures, on a particular floor, with a sector that
narrows the further back the firer stands. ATP 3-06.11 (2024), para 4-53:
"The farther back into a structure a Soldier is, the better the
protection and the smaller the weapon signature. However, the sector of
fire is more limited."

## The constraint: it has to scale to a brigade

The game runs from a squad up to a brigade, at metre resolution, and
`scaling.test.ts` caps a turn's cost by the number of forces, not the
number of men. So **no rooms, corridors or interior geometry.** The map
doesn't have them anyway: OpenStreetMap gives an outline and nothing
inside it. A brigade fighting in a town of thousands of buildings can't
afford pathfinding inside each house. The proposal below adds state to a
building and to a force. It adds no geometry, and it never adds a sight
line for each soldier.

## The proposal

### U1. A force is *in* a building, at a face

A force that enters a building is **in it**: it stores the building's id
and is no longer a free point inside the outline. It holds one of **two
postures**:

- **At the apertures** (`windows`). It sees and fires out of every face
  on the side it watches, from the wall line. Its sector is wide, the arc
  it is ordered to watch, as anywhere else. Anyone who can see that face
  can see it. Against fire coming through that face it has the building's
  full cover, with decision 77's window criticals.
- **Back in the room** (`deep`). It sees and fires only through a narrow
  cone, about ±20° ⚠️ ours, centred on its sector. Its signature is small:
  it is spotted as a hidden force within 20 m, and otherwise only when it
  fires, at about half the chance ⚠️ ours. It is shielded from window
  criticals coming from outside its cone.

Sight lines in both postures are drawn **from the wall**, not from the
centre of the footprint. One line still connects a pair of forces, as
`scaling.test.ts` requires. Only the line's end point changes. **This is
the fix for the stalemate**, and it differs from the 2026-10-06 attempt in
two ways: a force sees out only on the side it watches, and only through
the cone its posture allows.

Each posture has a cost, so neither can be the default that always wins:
`windows` trades signature for sector, and `deep` trades sector for
staying hidden. A defender that picks `deep` everywhere can be flanked
from outside its cones, and decision 85's *caught unready* makes that
hurt.

A building **can hold forces of both sides** (a foothold, U3). Two forces
inside the same building ignore the outside sight rules between them and
fight under the close-quarters rule.

### U2. Floors

Each building gets a number of **storeys**. Where OpenStreetMap gives
`building:levels` or `height`, that value is used. Otherwise the default
is **2** ⚠️ ours, matching today's 6 m. A force in a building stands on
**one floor**: ground, an upper floor, or the roof. Basements wait until
a map records them.

- **Eye height** is `floor × 3 m + 1.5 m`. An upper floor sees over walls
  and lower houses, and is seen from farther away on the same lines.
  ATP 3-06.11 (2024), para 2-44: a tall structure "can provide line of
  sight across a great distance".
- **Tank main gun**: −10° to +20° (para B-96). A tank can't engage a floor
  that sits above +20° from it, which works out to roughly 10 m of height
  within about 25 m. This is geometry, not a new number.
- **Indirect fire**: a floor with storeys above it is protected by them.
  The roof-penetration rule of decision 77 applies only to the **top**
  floor (para B-168: "additional penetration is rare since each additional
  floor is also concrete"). The **roof** is open to every shell and
  airburst (para 4-61).
- **Who wants which floor**: the second floor is doctrine's default for a
  machine gun (para B-29). The ground floor is the quickest to leave and
  to counterattack from. The roof is for observers only. Upper floors buy
  sight and safety from the tank, and pay for it by being seen farther
  and taking longer to come down.

Changing floors costs a turn ⚠️ ours.

### U3. Moving and clearing

- **Between buildings**: across open ground, under today's rules. A street
  is ground with no cover, which matches doctrine's "natural kill zones"
  (TC 3-21.75, para 8-1). Smoke and bounding already exist for crossing
  it.
- **Into a building the enemy holds**: an assault (decision 11, 25 m)
  that ends **inside**. It produces a **foothold**: both sides are now in
  one building.
- **Close quarters**: while both sides are in one building, each turn they
  fight by the assault rule: fire, grenades, and the quality gap of
  decision 84. Nothing else can see in. The side with the footing is the
  one that holds the floor it is on. **Top-down** gives the attacker the
  edge (ATTP 3-06.11 (2011), para 7-148: "grenades are easier to throw
  down a stairwell than up"). How big that edge is, is ⚠️ ours.
- **Clearing takes time.** A building counts as *cleared* only when no
  enemy is left in it and a force of the attacker's has been in it for
  **N turns per floor** without contact. Doctrine's planning figure is
  40–60 minutes for a supported platoon to clear a one-floor building
  with a basement, and 90 without support (ATP 3-06.11 (2024), para 3-8).
  With a 60 s turn (decision 40), **taken literally that is 40 to 90
  turns a house** (see question 4).
- **Through the wall** (mouse-holing): a force adjacent to a building can
  breach into it rather than use a door, which is decision 16's laid
  charge again: it takes turns to set, and the explosion can be heard.
  Doctrine gives no charge size, and the turn count is ⚠️ ours. A tank
  round already breaches the wall it hits (decision 76).
- **Rubble** slows movement as well as covering it (para B-151: "a severe
  obstacle to vehicular movement"). Rubble is impassable to vehicles,
  ⚠️ ours, and costs infantry as climbing does (decision 61).

### U4. The drill and the company in a town

Today the scripted drill walks to the enemy's centre and stops. The
doctrinal sequence comes from ATTP 3-06.11 (2011), para 2-70, and the
battle drill from TC 3-21.76 (2025), ch. 8, 07-SQD-D9509:

1. **Isolate**: a base of fire (support by fire) in buildings that
   overlook the objective building. Armour does this when there is any
   (para 3-79).
2. **Foothold**: the nearest objective building, assaulted from the side
   the base of fire covers, top-down where a roof or upper floor can be
   reached.
3. **Clear**: **at least one squad per floor** (para C-3). The assault
   force is bigger than usual and the support force smaller.
4. **Consolidate**: hold the building against the counterattack (the
   drill's standard) before the next bound.

The company picks **objective buildings**, not a centroid. It bypasses
houses only where there is open ground between them, and accepts the
flank risk that comes with it (paras 5-93, 5-94). The defender occupies
**mutually supporting buildings in depth**. Against an infantry attacker
that means the depth of the village, and against armour its leading edge
(para 6-53). It keeps a counterattack force, as the reserve of decision
60 does today.

### U5. Fires in a town

- **Dead space behind buildings**: about 5× the building's height for
  low-angle fire, and ½× for high-angle fire (para B-165). This decides
  whether a shell can land in a given street. It can be computed from the
  building's height and the direction the fire comes from, so the number
  is doctrine's own.
- **Duds**: up to 25% of impact-fuzed rounds fail to detonate when they
  strike hard surfaces at a glancing angle (para B-19). It is a single
  roll per round that lands on a building, but it **adds draws to the
  rng**, so it goes behind a `GameOptions` flag like everything else.
- **Mortars over artillery**, as doctrine says (ATP 3-21.90, para 4-162).
  The 60 mm already can't get through a roof (decision 93).
- **Danger close in a town**: doctrine refers this to ATP 3-09.32, which
  is **not in the corpus**. It stays as decision 63 S4 until the author
  brings that manual.

### U6. What counts as success, and the scenarios

- The objective of an urban attack is **buildings cleared** (FM 3-90's
  *clear*: "eliminates all enemy forces within an assigned area").
  Defeating the enemy force is not enough. This becomes the first
  concrete case of backlog 18 (victory conditions).
- **Doctrine changes the target band.** ATP 3-06 (2022), Table 5-1, gives
  an attack on a prepared position **9:1 to 15:1** in a town, against
  3:1 in the open, and ATP 3-06.11 (2024), para 3-22, says "three to five
  times" the normal force. On doctrine's own figures, `yokneamUrban`, a
  company with armour against a platoon, about 3:1, should mostly
  **fail**. It currently wins 56%. Decision 68's 40–55% is an open-ground
  band and was never meant for a town (see question 5).
- **Time limits**: the raid's 30 turns and the urban test bed's 45 can't
  hold a clearance that takes doctrine's 40 minutes or more per house
  (see question 4).

### Decisions 75–78, re-read in this light

- **76** (damage, rubble, a tank round breaching): consistent. MPAT
  "creates a breach hole" (para B-103), and rubble is "a stronger
  position" (para B-5). Under U2 the breach opens **the floor the round
  struck**, not the whole building.
- **77** (critical hits through windows): now applies only to a force
  `windows`, or to a `deep` force inside the firer's cone. The roof
  penetration applies to the top floor only.
- **75** (direct HE as a shell): unchanged.
- **78** (armour): unchanged, apart from the tank's elevation limit in U2.

## Order of work, once ruled

Each stage is measured on the raid and on `yokneamUrban` before the next
one starts, and each stage is a `GameOptions` flag so that older
recordings still replay.

1. **U1** (in a building, posture, sight from the wall). The stalemate
   should go without the raid collapsing. If it collapses, the cone and
   the signature are what to look at.
2. **U2** floors.
3. **U3** foothold, close quarters, clearing, breaching, rubble.
4. **U4** the urban drill and company, in the harness and then in the
   browser's computer.
5. **U5** dead space and duds.
6. **U6** scenario objectives, time limits, and the target band.

## Questions for the author

1. **The shape: a force in a building, at a face, with two postures and
   floors, and no rooms** (U1, U2)? *Recommended.* The alternatives are
   real interiors (rooms from a generator, since OpenStreetMap has none),
   which won't scale to a brigade, or keeping forces as points and
   tuning the 6 m, which is what failed on 2026-10-06.
2. **Storeys where the map says nothing: 2?** Every house in Yokneam
   lacks the tag. The other option is to set storeys per building in the
   scenario spec.
3. **The posture figures**: a ±20° cone and half the spotting chance for
   `deep`. Both are ours. Doctrine says "back from the windows in the
   shadows of the room" and gives no number.
4. **Clearing time.** Doctrine's 40–60 minutes for a house would be 40–60
   turns, longer than either town scenario. Options:
   (a) take doctrine literally and lengthen the town scenarios;
   (b) treat the 40–60 minutes as including the methodical search, and
   count a house of the game's size as cleared after a few turns without
   contact, ⚠️ ours, *recommended for now*;
   (c) make a turn longer in a town (this touches decision 40 for
   everything).
5. **The target band for an urban attack.** Doctrine's 9:1–15:1 implies
   that a 3:1 attack on a prepared position in a town usually fails.
   Should urban scenarios get their own band? If so, what should it be,
   or should it be measured first once U1–U3 are in?
6. **Mouse-holing as a laid charge** (decision 16's turns), or not at
   this stage?
7. **Is the order U1 to U6 right?** Each stage is measured before the
   next. The alternative is to build U1 to U3 together and measure once.
