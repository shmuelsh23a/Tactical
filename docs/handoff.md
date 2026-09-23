# Handoff — where the project stands

**Current as of the balance session, 2026-09-23 (rules decisions 19–27).** This is the working note for whoever
picks the project up next: the state of play, what is waiting on the author, and
what I would take next. It is **current state only** — history lives in
[handoff-archive.md](handoff-archive.md), and anything durable has been moved
out of here on purpose:

- [AGENTS.md](../AGENTS.md) — the operating manual: commands, conventions that
  are easy to get wrong, and how to drive the game in a browser.
- [README.md](../README.md) — the design: what is implemented, the **rules
  decisions**, the gap list and the roadmap.
- [docs/mechanics.he.md](mechanics.he.md) — the rules document itself.
- [docs/balance.md](balance.md) — every number that was chosen rather than
  transcribed, and the interactions to preserve when tuning them.
- [docs/review-checklist.md](review-checklist.md) — what to check before
  committing, written for any reviewer of any make.
- [docs/driving-the-game.md](driving-the-game.md) — scripting the browser to
  verify a change for real.

## Green as of this commit

```
npm run check       lint + typecheck clean, 526 tests, 29 files
npm run balance     the balance harness; see balance.md for every run recorded
```

The app opens on a **scenario picker** (Yokneam and Tel Azeka, or a saved
battle to review), and the demo
plays end to end in the browser, including the debrief. The
rule is that nothing is called done on tests alone: if a player can see it, it
gets driven in the actual game first.

## How this repo expects to be worked on

The rules that matter are **enforced, not written down**. `npm run check` is the
one command — lint, typecheck, suite — and the three surfaces divide the work
with one owner per rule: [`eslint.config.js`](../eslint.config.js) for
determinism and layering, [`src/invariants.test.ts`](../src/invariants.test.ts)
for what a selector states badly, and the compiler for the four switches over
`RecordedAction`. Node is pinned to **24** in `.nvmrc`, which `engines` and CI
both read. Prefer adding a check to adding a paragraph.

Instructions are vendor-neutral: [AGENTS.md](../AGENTS.md) is canonical,
`CLAUDE.md` is a pointer to it, and `.claude/` holds adapters only — hooks that
call the project's npm scripts and a reviewer that reads
[review-checklist.md](review-checklist.md). Any assistant should be able to work
here from AGENTS.md alone.

## Waiting on the author

**Start here: where the 2026-09-23 session stopped.** The last thing he
decided was **decision 27**: one wound rule (a d10 severity) for every hit,
bullet or fragment. The **next question for him is the blast table**. Under
any wound rule, one artillery shell a turn decides a 2:1 attack, because:
- the document's blast catches 70% of the men within 50 m of a single
  round;
- **cover does nothing against blast** (a quick trial of ½ in partial cover
  and ¼ in full barely moved it);
- nothing says whether a "round" is one shell or a battery's volley.

His guiding principle, checked against the sources and agreed, is that
explosives cause **about 75% of casualties** in modern war
([balance.md](balance.md), *Fifth round*). The harness measures it now: each
man put out records what did it (`Soldier.outBy`), and `--fires` gives an
attacker a fire plan on the objective. Put the blast question to him with
those numbers. Do not tune it yourself.

**What the balance work has settled** (2026-09-22/23, decisions 20–27, all on
balance.md):
- A harness of headless NATO-style battles, judged against four planning
  targets at each of three echelons (`TARGETS` in
  [`sim/balance.ts`](../src/sim/balance.ts)).
- A **squad drill** as data ([`app/drill.ts`](../src/app/drill.ts)), which is
  the executor future simulated subordinates will use (backlog 15) and what
  the TTP editor will edit (backlog 20).
- Under the Western drill and today's rules: **10 of 12 targets**. The two
  misses:
  - a winning platoon attacker at 3–4:1 loses 8%, where the target is
    10–30%;
  - a company attacking at 2:1 wins 20%, where the target is 30–70%. This
    has been the trade for making explosives count; with a fire plan it
    recovers to 50%.

**A bug to chase first (ours, not his).** Since decision 27, the company
mirror leans BLUE:

| Run | BLUE / RED / draw |
|---|---|
| `--kinds meeting --drill western --morale on --n 200 --echelons company` | 52 / 39 / 10 |
| the same, `--swap` | 50 / 37 / 13 |
| before decision 27 | 47 / 45 |

The lean survives the swap, so it follows the **side label, not the
position**. Explosives now matter, so look at what treats the sides
differently in the explosive path:
- the order the fire missions resolve in;
- the order of units in `game.units` (BLUE is added first);
- the harness's `rear` for the mortar's firing point.

Squad and platoon mirrors have no explosives and were not rerun.

**Still open, and his:**
- **The blast table** (above).
- **The Western drill's numbers**: all ours.
- **The assault reply rate** (ruling 1, on trial as `assaultReplyChance`).
  It measures as irrelevant, and we suggest 30%.
- **The size of the prepared-defender bonus** (decision 24, his rule, our
  numbers).
- **The traits' other effects**: his next session on morale.

**Morale is built (rules decision 19), and the author's next session is the
traits.** He said so on 2026-09-22: strength, intelligence, wisdom, agility,
charisma and luck are drawn for every man now, but only wisdom, luck and a
leader's intelligence and charisma do anything — through morale. What the
others do to shooting, movement, detection and the rest is the next ruling;
build nothing on them before it. Also his, and not built: **campaigns carry
the pool of will, and only rest refills it** (backlog 16), and **taking the
objective** as a morale gain, which needs backlog 18 first.

**Two further things, both raised 2026-09-21, neither blocking today's work.**

1. **Mission and victory conditions** (backlog 18) — the shape, before
   anything is built on a reading. Today a battle ends only when one side is
   wiped out (`sideDefeated`), and the document names no משימה, no objective
   and no victory condition. This is the load-bearing one: backlog 16 needs a
   result to carry forward and backlog 17 needs "objective" to mean something.
2. **Weather and light** (backlog 19) — same, and the same reason as morale:
   the document has none of it, so every number would be ours.

Everything raised before those two is closed. The **`LICENSE` carve-out** was
raised and settled the same day (✅ 2026-09-21): it named the two Ramat Menashe
map modules and not the two Tel Azeka ones, which had shipped on 2026-09-16
without it. It is grouped by source now, and `src/invariants.test.ts` fails
when a module under `src/app/maps/` is missing from it, so the next window
cannot repeat the omission. The clause still works by **naming files**, which
is exactly what backlog 17 breaks — ground fetched at runtime cannot be named
in advance.

Six rulings closed on 2026-09-16 (decisions 16, 17 and 18, and two riders on
12), and rules decision 15 on 2026-09-06. The reasoning behind all of them is
in [handoff-archive.md](handoff-archive.md), and the figures he gave are on
[balance.md](balance.md). **Do not reopen a decision without him.**

Some are ✅ *as decisions* while their **numbers** are still ours. They belong to
the balance pass, not to the rules list, and live on
[balance.md](balance.md):

| | Chosen | Note |
|---|---|---|
| Decision 9 | smoke radii **25 / 50 / 100 m** | The document sizes no screen. |
| Decision 13 | casualty bands **0 / 1–2 / 3–5 / 6+** | He confirmed that reports are banded, not where the bands fall. |
| Decision 15 | eye heights **1.5 / 2.5 / 0.5 m**, object cover, **8 m per metre climbed**, **30°** for vehicles | All his, all "tentative until balance". |
| Decision 16 | laying a charge takes **2 turns** | "Tentatively", 2026-09-16. What the two turns *cost*, and that the charge goes where the force stands, he confirmed the same day. |
| Decision 19 | **every morale number** — losses, gains, test, rally, suppression, reach, breaking points | The shape is his; not one magnitude is. The whole table is on [balance.md](balance.md), with the one measurement that shaped it. |

**Decision 11's riders** (no assault on armour, no ammunition tracking) remain
assumptions he has not contradicted; ammunition is backlog 12's job.

One rules question is **open but not asked**, because nothing needs it yet:

- **Roads as going.** The map draws roads and the engine ignores them. Faster
  along a road, a vehicle confined to one — the document does not raise it.

## Do not re-propose

Closed deliberately, with reasons that are not obvious from the code:

- **A limit on how many charges a force may lay.** No stock and no cooldown is
  deliberate: put to the author 2026-09-16 and **deferred to ammunition**
  (backlog 12), because a stock of charges per force is the same mechanism as
  rounds per force and a separate one here would only have to be unpicked. It
  is a known dominated option in the meantime — for a force that was going to
  sit still anyway the two turns are free (decision 16).

- **An artillery battery as a standalone unit.** Indirect fire is off-map
  *because* the playable slice is the platoon-leader view — a platoon commander
  calls for fire rather than owning guns. The battery arrives with **echelon
  scaling** (backlog 3) and not before (decision 8).
- **Reading the cover modifier as percentage points.** Settled on the document's
  own grammar, not on the arithmetic (decision 7).
- **A flat bonus for a sector of observation.** It made the width control a trap
  — the widest arc dominated every narrower one. The bonus is divided by the
  arc's width for that reason (decision 14).
- **Raising the charge trigger radius to the 20 m search band.** The gap between
  10 m and 20 m is the ground where a charge is found without being trodden on,
  which is the only thing the search roll buys (decision 10).
- **Terrain types** (wood, built-up, each with a cover grade, a sight rule and
  a movement cost). Proposed and **withdrawn on the author's steer**
  2026-09-06: the game is to scale from soldier to brigade with metre-level
  resolution underneath, so the map carries *objects* and *elevation*, never
  a zone with a rules table. A wood is a footprint from OpenStreetMap, not a
  type (decision 15).
- **An elevation bonus to hit or to detect.** "No hit modifier for now" — the
  sight lines already reward the high ground. To be looked at again at
  balance, not before (decision 15).
- **Judging "no climb" on the whole order line.** It was the shortcut in
  `reachAlong`, and on the real map it disagreed with the bound's own
  samples one order in 260 and threw out of the order loop. The climb is
  judged on the bound taken; a test holds a field on which the old shortcut
  overspends.

## Do not re-derive

Measurements that cost real time and are already recorded:

- **Charges, before the decision-10 fix:** a charge 5 m off the route at the
  midpoint of a 50 m walk fired **200/200 seeds and was found 0/200**.
- **Hidden enemy, same shape:** a stationary squad 15 m beside a 50 m walk was
  found **0/400** from the endpoint against **~26%** beside the halt.
- **Sector bonus by width:** `13.5 ÷ width` → +23% / +15% / +8% at
  60° / 90° / 180°, against a flat −20% outside.
- **Dead ground on the demo map:** BLUE-2 running up the centre from
  (400, 60) is seen by nobody on turn 1 at (400, 160) — **0/200 seeds** —
  and by someone on turn 2 at (400, 260) — **200/200**, RED-1 itself 185
  times. The shoulder at about y = 250 is where the northern low ground comes
  into view.
- **Node support windows** (from `nodejs/Release`, checked 2026-09-05): 20 went
  EOL **2026-04-30**, 22 ends 2027-04-30, 24 ends **2028-04-30** and leaves
  Active LTS on 2026-10-20. That is why the pin is 24 and not 22.
- **What a NATO symbol costs to draw** (measured in the dev browser,
  2026-09-21): **0.037 ms** per `renderUnitSymbol` call before it was cached,
  **0.0006 ms** on a cache hit after — about 60×. Worth knowing what that does
  *not* buy: at the 5–8 tokens a platoon battle draws it is well under a
  millisecond per re-render either way, so this was never the cause of the
  "ten button clicks in one script call is too many" ceiling further down
  this file. That cause is still unmeasured. The cache earns its place at the
  token counts echelon scaling (backlog 3) brings, and on a phone (Stage 4),
  not on a desktop platoon.
- **What Jev actually exposes** (from `typesafe-ai/typesafe-sdk-js`, read
  2026-09-21, for backlog 15): three question kinds — `noul`, `choice`, `score`
  — answers carrying a confidence and per-label probabilities, and **no seed and
  no temperature among the exported types**. Hosted API, Node 20+,
  `TYPESAFE_API_KEY`, no published weights and no self-hosting. The vendor's own
  documentation site was unreachable from a sandboxed session, so the SDK source
  on GitHub is the reference that can actually be read.

## What I would pick up next

**Ordered. The first three want a word from him before anything is built;
the fourth does not.**

0. **The blast table** — the question the 2026-09-23 session ended on (see
   *Start here*). Ask him first. Measure his answer with `npm run balance --
   --sweep --drill western` and `--fires`, and record it on balance.md.
1. **Mission and victory conditions** (backlog 18) — **ask first, and ask
   about this one first.** It sits under the whole product direction: a
   campaign needs a result to carry (16), a mission builder needs "objective"
   to mean something (17), and the debrief would finally measure a plan
   against its mission instead of a body count. Today `sideDefeated` ends a
   battle only when a side is wiped out.
2. **The traits' other rules** — the author's next session. Wait for it.
3. **The AI commander** (backlog 15). Unblocked — it invents no rule, so it
   needs no ruling — but it is Stage 3 work while the repo is mid-Stage 2, and
   it brings a hosted third-party dependency with it. Note the item covers two
   jobs: the opponent in single-player, and the **simulated subordinates under
   every player** once echelons scale past company (author, 2026-09-21), where
   a platoon commander under a human's order still has to decide how to carry
   it out. The second is the larger job and arrives with backlog 3. Read the
   item before touching any of it, particularly the part about `sideView`
   versus `game.units`: that mistake would pass every test in the suite.

**Morale is built** (rules decision 19, 2026-09-22), so that item is off this
list: the author gave the shape, compared it with Total War, Company of
Heroes, XCOM, Close Combat, Combat Mission, ASL, Steel Division, Battle
Brothers and Darkest Dungeon, and took every suggestion. Both scenarios play
with it on. It was driven in the demo to a break and a rally; nobody has yet
*played* an attack under it (see balance.md).

**The scenario picker is built**, so that item is off this list. It was built
twice: once on 2026-09-21 as a `בחר קרב` dialog in the header, and again on
2026-09-22 as the opening screen, by a session that started from `main` and
never saw the first branch. The merge kept the **opening screen and its
briefs** (the author's choice): a brief is a tasking both players read before
taking a side, so it names no forces and does not give away the ground's
lesson. From the first build it kept the catalogue tests (Hebrew labels,
forces inside the window, ground covering it); its dialog, keyboard close and
ground-lesson briefs went. Adding a battle is a spec, a run of the tool, and
one line in [`scenario.ts`](../src/app/scenario.ts).

**The roadmap now carries the product direction** (2026-09-21): the browser
build is the development shell, and **Stage 4** is the mobile and desktop app
on the same engine. Backlog **16–19** are the four things the author described
that the repo did not have — campaigns, a mission builder over real ground and
mission parameters, mission and victory conditions, and weather.

**The live log is filtered by side** (rules decision 17, 2026-09-16).
`LogEntry` carries `readers`, `pushLog` takes a required audience, and
`LogPanel` renders only what the side at the screen may read.

## Traps that cost real time

Browser-driving traps live in [driving-the-game.md](driving-the-game.md) and
testing ones in [AGENTS.md](../AGENTS.md). These are the ones specific to where
the code currently stands:

- **A force's men are drawn from their own rng, not the game's** (rules
  decision 19). `generateMorale` seeds from the game's seed and the force's
  id, because a recording carries the men as drawn and a replay does not draw
  them again. Move that draw onto `game.rng` and every recording diverges
  after setup — the digests will say so, but the reason will not be obvious.
- **Morale finds casualties by itself; suppression does not.** The morale step
  compares every soldier with the snapshot taken when the turn began, so any
  way of hurting a force is counted. But *being shot at* — suppression, and
  which way the fire came from for flanking — is only known where the engine
  calls `noteFire`. A new way to fire at a force must call it, or it will kill
  without frightening anyone.
- **Tests that end a turn need two steps.** `advanceToPhase("initiative")`
  straight after `beginTurn()` does nothing — the game is already there. Go to
  `summary` first; `morale.test.ts` has an `endTurn` helper.

- **Recordings saved from the demo before Naismith (2026-09-06) replay
  differently**: an order's bound now stops short uphill, so every position
  after the first climb moves. `verifyRecording` will say so.
- **Sealed recordings made before 2026-08-16 that cross a minefield will fail
  `verifyRecording`.** Decision 10 changed how many rng draws a move near a
  charge makes. That is the tool doing its job, not a regression.
- **Covering fire answers a bound *late*, and that is the ruling working.** A
  force answers only an enemy its side has **detected** (author, 2026-09-16),
  and the roll that picks a mover up happens on the way into the *fire* phase,
  after movement. So the first bound that breaks cover in front of a coverer is
  not answered; the ambush fires on the next one. A force already on its side's
  map is answered the moment it moves. Both halves are pinned by tests. It is
  the sort of thing that reads as broken at the table before it is explained,
  and the alternative — the coverer rolling its own look at the moment of the
  trigger — is a change he would have to make, not us.
- **Measure before believing a performance claim, including this file's.**
  Caching the drawn NATO symbol was taken on because two notes here said
  milsymbol re-rendering was why long click scripts time out. It is 0.037 ms a
  call, which at a platoon's 5–8 tokens is under a millisecond per re-render:
  real, worth caching for what echelon scaling and a phone will bring, and
  **not** the cause of that ceiling. The cause is still unmeasured. The dev
  server's modules import inside `page.evaluate`, so timing something takes
  about ten minutes — see [driving-the-game.md](driving-the-game.md).
- **A rule with two halves is where the bugs have actually been — every time.**
  Three of the five decisions settled on 2026-08-16 turned up real defects this
  way; on 2026-09-16 it was **eleven**, across three features, and not one of
  them was a typo or a bad algorithm. Each was one rule applied in two places
  off different state, each half defensible alone: cover written at placement
  but read mid-bound, exactness keyed to the firer where the document keys it
  to the owner of the casualties, three of four attack paths carrying a
  refusal, an action economy borrowing a flag two other rules read. See
  [handoff-archive.md](handoff-archive.md) for that day's list.

  **When you touch one half, go and read the other** — and when a comment says
  a rule "cannot disagree" with another, check that it is true rather than
  intended. One of the day's bugs was a comment of mine claiming exactly that
  about two expressions that were not the same.
- **A sealed recording of a game whose forces had `baseCover`, made before
  2026-09-16, will fail `verifyRecording`.** Placement now gives a prepared
  force its cover, so the first turn resolves differently. No such recording
  exists in the repo — nothing set `baseCover` at setup before Tel Azeka — but
  a recording saved from a scenario of your own might.
- **A new spec is not a playable battle until it is listed.** The tool writes
  `<slug>Listing` beside the builder; add it to `SCENARIOS` in
  `src/app/scenario.ts`. `scenarioCatalogue.test.ts` fails until you do, and a
  spec without a `brief` is refused by the tool — the picker shows it to both
  players, so it is a tasking, never forces or charges.
- **`src/app/scenario.ts` is a list, not the scenario.** The demo lives in
  `src/app/scenarios/yokneamIllit.ts`, which is generated — editing it is
  editing a build product, and the next run of the tool throws the edit away.
  The spec is `tools/scenarios/yokneam-illit.json`.
- **Switching battles remounts `App`** ([`Root.tsx`](../src/app/Root.tsx)),
  keyed on the scenario and a pick counter, so picking the same battle again
  is still a new game. The engine is a mutable instance in a ref with a turn's
  worth of state beside it, so a new battle is a new `App` rather than a reset
  that would have to be extended every time a piece of state is added.
  Anything that must survive a switch has to live in `Root`, above the key —
  today that is only a debrief opened from the picker.
- **`addMine` is setup only now** (decision 16). A test or tool that emplaced a
  charge mid-game gets a `PhaseError`; in play a force lays one, which takes
  turns. Every call site was already before `beginTurn`, so nothing had to
  move — but a new one written from memory will fail.
- **`addUnit` records the force as it stands.** Setting `camouflaging` or
  `baseCover` after adding a unit desyncs the recording from the live game — the
  replay gets an undressed unit. Set it before `addUnit`.
- **The demo seed can miss a 90% roll twice.** On seed 2026 BLUE-2 crests the
  shoulder on turn 2 in full view of the tank and the ridge squad, and on that
  seed both missed before the wall fix; after it the tank sees it. Over 200
  seeds it is seen every time. A "nobody saw it" in the browser is a seed
  before it is a bug — measure before ruling.
- **Ten button clicks in one browser script call is too many.** The pane
  re-renders every token through milsymbol between clicks; eight is the
  ceiling, six is safe, and the handoff button's label starts with the side
  (`RED מוכן — הצג את המפה`), so match on the word, not the prefix.
- **The tank's cover is 1.6 m from flipping.** `RED-TANK` stands 4.6 m from
  the nearest house and the cover reach is 3 m; full cover would drop its
  eye to 0.5 m and switch off the "far low ground" lesson.
  `src/app/scenario.test.ts` pins it — if a regenerated map fails there, move
  the tank, do not loosen the test.
- **A log line without an audience does not compile, and that is deliberate.**
  `pushLog`'s third argument says who may read the line (rules decision 17).
  Reaching for the old `pushLog(text, kind, viewingSide)` shape passes a `Side`
  where an `Audience` belongs — the compiler says so, and
  `src/invariants.test.ts` catches it as text too. Use `onlyFor(side)` for a
  decision behind one's own lines, `sharedBy(side)` for an exchange both sides
  were in, `TABLE` for the umpire's bookkeeping, and `pushPerSide` when the two
  sides are entitled to different words — which is every line carrying losses.
- **A force's own object is left off its sight line for 6 m only.** The first
  cut skipped the whole object and let a squad against a house be seen
  straight through it from the far side. `OWN_OBJECT_SIGHT_M` is twice the
  cover reach for exactly the wall-versus-building distinction; read
  `terrainBlocksSight`'s comment before touching either number.
- **A zero-size Browser pane makes every map click land at (0, -1).** With the
  pane hidden the page gets no layout at all — `innerWidth` is 0 — so a click
  aimed as a fraction of `svg.map`'s rect maps to the origin, the order *is*
  accepted, and the log shows a plausible-looking bound to nowhere. Set a
  viewport (`resize_window` 1280×900) before aiming at map coordinates, and
  re-measure the rect *after* the map is on screen rather than at a handoff.
- **The console buffer in the Browser pane survives reloads.** After changing
  an export's shape (a component becoming a `memo`), the buffer shows
  "Component is not a function" with an *older* module timestamp than the
  page. If a clean reload renders tokens and buildings, it is history.
