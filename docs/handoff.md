# Handoff — where the project stands

**Next, in one line: urban warfare is in the game, and since decision 98 it meets the street through the windows (a defender at one fires out and is seen; a round that gets in bursts in one room). The standoff fault is gone. Next is joining a fight already going on, then the players' plans inside as data. Spotting follows the windows too. The 2:1 reference median, the force-quality matrix and the AI commanders wait on the author.**

**Current as of 2026-10-20, evening.** Later the same day:
- **Decision 98, through the windows** (README; every option as proposed,
  by the author). Built, reviewed twice, driven in the browser on a saved
  battle: RED fired out of a house fight with its one window man ("1
  יורים"), BLUE-2 fired in. The raid 14%, urban 59%: within noise, because
  the town's houses block almost every sight line to a fight (balance.md,
  *Through the windows*).
- **The standoff fault is closed**, and the three-hour clock accepted.

Earlier (`3c28ae0`). Since the header before (2026-10-12):
- **Decision 96, urban warfare.** The author's design, built in steps:
  - floor plans generated from footprints, bit-identical on any device;
  - a headless fight inside, run by the doctrinal room-clearing drill;
  - clearing time calibrated to real data: 20 minutes for a house nobody
    holds, toward an hour against prepared defenders;
  - top-down entry with doctrine's gains and costs;
  - the coupling to the turn: entered only by an assault order, each side
    told only its own losses.
- **Decision 97, a grenade's smoke needs a thrower.** A hand pot within
  35 m of a man of the side; rifle-grenade smoke within 100 m of infantry
  with a grenadier, as a 10 m screen.
- **Today's control is temporary** (README, *Design principles*, first).
  The product commands by OPORD, a battle plan drawn on the map and
  written orders during play. A serious UX/UI pass is scheduled with that
  work (backlog 13).

The 2026-10-12 header and the long running line are in
[handoff-archive.md](handoff-archive.md), *2026-10-12 to 20 — the header
as it ran*.

This is the working note for whoever
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
- [docs/sources.md](sources.md) — the reference library: every report and
  page the numbers were checked against, where to find it, how far it was
  read, the figures in play with their sources, and the air-delivered
  munition figures for when air support comes (backlog 10).
- [docs/business-plan.md](business-plan.md) — who it is for, editions, free
  and paid, build order, and the open business items.
- [docs/validation.md](validation.md) — the game's numbers against the
  research, with sources, and what `npm run validate` measures.

## Green as of decision 98 (2026-10-20)

```
npm run check       lint + typecheck clean, 1,070 tests, 73 files
npm run balance     the balance harness; see balance.md for every run recorded
npm run validate    the numbers against the sources; see validation.md
npm run interior-sim [-- --prepared --hold --expect-above --storeys 1 --only door-no]
                    the fight inside on every demo house (decision 96)
npm run scenario-sim -- --n 100 --scenario yokneamRaid
                    the raid: 13% since the coupling (balance.md)
node tools/smart-attacker.mjs [scenario] [turns]
                    a scripted attacker plays a scenario in the browser
                    (dev server on :5199 first; SEED=n for other dice)
PYTHONUTF8=1 py tools/doctrine.py --find "base of fire" --doc 3-21.8
                    the doctrine corpus, 455 manuals since 2026-10-14;
                    --semantic needs VOYAGE_API_KEY in .env (AGENTS.md has
                    the traps)
npm run suppression-pays
                    does suppression pay, and can an attacker get it
npm run scenario-sim -- --drill doctrinal --gate --rear-security
                    the doctrine work (rung A) in the harness
npm run jev-sim -- --rule --scenario telAzekaAssault --seed 1000 --n 100
                    one reference plan; eight of them are the balance
```

Working tree clean and pushed to `origin/main` at that commit.

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

## What governs the work

Two of the author's principles govern every step, and both are in the
README:
- **Results are judged by closeness to real outcomes** (win rates and what
  attacks cost each side, against the sources on validation.md).
- **The layers divide** (backlog 21): rules are tuned to real outcomes,
  drills come from doctrine and stay fixed, and plans are the players'.
  Since 2026-10-20 a third: **today's control is temporary** (README,
  *Design principles*), so behaviour goes into data the engine carries out.

The 2026-10-01 version of this section, with its tables and the rulings of
2026-10-02, is in [handoff-archive.md](handoff-archive.md), *2026-10-01 —
"Start here" as it stood*.

## Waiting on the author

### Open (2026-10-20)

- **Should the computer's drill send a second squad into a house its side
  is clearing?** Decision 99 lets an assault join a fight; the drill never
  orders one (12 fights in 20 raids, no joins), because it picks only
  targets it can fire at. A drill change, so his.
- **The defender's counterattack inside** (decision 99 refuses it for
  now): its own design when he wants it.
- **For the UX pass:** the screen marks the enemy a force is fighting
  inside as a target; the engine refuses that shot ("נלחם בתוך מבנה").

- **The reference plans' 2:1 median is 18.5%**, just under 20 (standard
  measurement 31%). The stall is fixed (an assault that is spent commits
  the rest and lifts the fires; one scout a platoon); what is left is the
  plans that split the company at two to one being shot up — doctrine's
  three to one at the point of assault, and decision 68's "usually fails".
  Accept?
- **Running the AI commanders costs real API spend.** Not blocked
  (`tools/env.ts` reads `.env`, keys set); starting them is his call.
- **The force-quality matrix** (decision 83) has waited on his view of its
  spread since 2026-10-05. It can be re-run now the baseline is in band
  (18 cells × 400 battles, which is long, so ask first).
- **Our own figures in the fight inside**, all ⚠️ and listed on balance.md:
  - `CLOSE_QUARTERS`: the hit chance a second, reaction, stun, grenades a
    man, consolidation, the 3.5 s/m² search, 5 minutes to reorganise and
    10 a casualty, the roof's 3 minutes, the hatch's 2;
  - the room sizes and window spacing of the floor plans;
  - a defender counted prepared if his force has a front.

  Decision 97's 10 m rifle-grenade screen is ours too. None has been
  questioned; all were set against the real data or doctrine where any
  existed.

### Ruled 2026-10-15 to 20, for reference

Each is in the README's decision 96 or 97. The short form:
- Closed terrain is fought soldier by soldier on randomised floor plans.
  Commanders plan, soldiers act by doctrine; plan-then-execute ticks;
  headless at company and up.
- The urban band is decision 68's. A town costs time, not outcome, and
  9:1–15:1 is planning advice.
- The attacker knows only what can be seen from outside. Special
  operations are a topic of their own.
- Clearing time: 20 minutes for a house nobody holds, about 32 with one
  defender.
- Top-down: all seven mechanisms. Defenders fall back under fire, and with
  one stairwell held they are cornered ("realistic for a house").
- Only an assault order goes in; a force at the walls fights from outside.
- The plans inside, unless otherwise planned: the front door, a grenade a
  room, teams of four; one defender a room.
- Played by hand, the fight inside opens as a tab, as on a phone's browser.
  It goes with the UX/UI pass.
- Smoke: a thrower within reach, a grenadier for rifle-grenade smoke, a
  smaller screen than a pot. Further limits wait for ammunition
  (backlog 12).
- Through the windows (decision 98): the plan says who stands at a window
  (by default, at one facing the enemy); fire in finds only men at facing
  windows; fire out counts only them; a round that gets in bursts in its
  room; only where a fight is going on. Spotting and morale's seeing
  follow the windows too. The three-hour clock stays.
- Joining (decision 99): the attacking side joins as new teams at the
  door, by the same defaults; the defending side is refused for now.
- Today's control is temporary: OPORD, a map battle plan and written
  orders. The UX/UI pass goes with it, and his played battle's findings
  are under backlog 13.

### The older queue

**The artillery, as the 2026-09-23 sessions left it.** Decisions
36–39 are ✅ and built (README):
- **36:** rounds for effect by weapon, 6 artillery / 12 mortar. A call for
  fire journals its number; a recording from before replays at what it
  fired (`madeBeforeDecision36` in `recording.ts` tells the eras apart).
- **37:** who may call — mortars company+, artillery battalion+
  (`Game.mayCall`, `GameOptions.commandEchelon`, `FIRE_SUPPORT_MIN_ECHELON`).
  Both platoon demos lost their indirect fire.
- **39:** the caller chooses adjust fire or fire for effect
  (`callForFire`'s `method`; `שיטה` in the UI; Jev for simulated echelons).
- **38:** mission planning on turn 0 — `registerTarget`,
  `designateObservationPost`, `prepareAlternatePosition` — in the engine,
  the harness (`--defender-ops`, `--alternate`) and the live UI.

**The artillery stage is closed** (author, 2026-09-23). He accepted the
mission-planning numbers (6 targets a weapon, OPs to 1,000 m, one alternate
a force, 25 m, partial for a force with none). They, and the open questions
below, are to be **tested and balanced when the artillery is**, at
battalion, with echelon scaling (backlog 3, where the README says so):
- how far an alternate position may be (an attacker may prepare one on the
  objective today);
- whether one mission in hand a weapon is a rule (today the UI's and the
  harness's);
- why displacing to an alternate still hurts the defender (the drill moves
  in the open under fire);
- the artillery itself: 6 rounds for effect, 270 m to 50 m, never measured.

Not yet shown to him: the company battle on Tel Azeka (`telAzekaCompany`),
whose layout is ours. He has not played the planning stage or the call for
fire either; nothing about this session has been played by a person yet.

His guiding principle, checked against the sources and agreed, is that
explosives cause **about 75% of casualties** in modern war
([balance.md](balance.md), *Fifth round*). With fire missions on both sides
it measures 82–99%, because the fight is decided before small arms get a
say (see *Start here*).

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

**The company mirror's BLUE lean was not a bug** (closed 2026-09-23, the
session after decision 27). It was the seed window. Over 7,400 battles on
disjoint seeds the mirror is 3386 BLUE to 3370 RED, and the lean flips sign
between windows. See balance.md, just above *How the engine scales*.
`npm run balance` takes `--seed <first>` now; rerun a lean on a fresh window
before chasing it.

**Added 2026-10-11, and these have piled up:**

- **The force-quality matrix's spread** (decision 83) has been waiting
  since 2026-10-05 — and should now wait a little longer, because its
  numbers predate the targeting fix and a ruling on them would be a ruling
  on an artefact. Re-run first, then ask.
- **Decision 90's ⚠️ tail band**: a dismounted medium machine gun's
  701–800 m hit chance is **10%, and ours**. The document stops at 700 m
  and ATP 3-21.8 gives the reach without a hit chance. It is the one
  invented number in the machine gun.
- **Flanking and moving up now measure as mistakes** (see *What I would
  pick up next*). Before anyone tunes the ground to fix that, it is worth
  saying whether a flank *should* pay on a tel like this one, or whether
  40% against a frontal 57% is the right answer and our instinct is wrong.
- **Should the browser's computer fight doctrinally?** It fights by
  `PLAIN_SCRIPT` today, so none of rung A reaches the game — no fire teams,
  no 800 m machine guns, no consolidation. On current evidence making it
  doctrinal would make it *weaker* (17% against 13% in `scenario-sim`),
  which argues for leaving it until the doctrinal drill measures level.

**Added 2026-10-09:**

- **Rules decision 88 is ⚠️ and unseen**: the browser hands its attacking
  computer a competent plan (two scouts on vantage points, guns held for a
  mark sure to 40 m, smoke on the crossing) rather than the harness's bare
  defaults, which beat themselves. The open question with it: **should
  single-player offer a difficulty at all**, and what would a weaker
  setting take away — fewer scouts, no smoke, or the bare defaults as an
  "easy"? The measurement that chose it is on balance.md, *What the
  browser's attacking computer is given*.
- **Should a player defending face an attacker whose plan is wrong?**
  The computer attacker is briefed with decision 51's observer error, the
  same as the harness's. That is defensible and symmetrical, but it has not
  been played by a person, and it is the kind of thing that feels different
  from the defending side.

**Still open, and his:**
- **The company battle's layout** (above). The rest of the artillery waits for battalion.
- **The Western drill's numbers**: all ours.
- **The assault reply rate** (ruling 1, on trial as `assaultReplyChance`).
  It measures as irrelevant, and we suggest 30%.
- **The size of the prepared-defender bonus** (decision 24, his rule, our
  numbers).
- ~~The traits' other effects~~: ruled 2026-10-02 (decision 69).

**Morale is built (rules decision 19), and so are the traits (decision
82).** Strength, intelligence, wisdom, agility, charisma and luck are drawn
for every man and act through morale and, with `traitEffects`, on his own
pace at a rush, aim, spotting, being hit and his luck; `fatigue` tires him
by strength.
Also the author's, and not built: **campaigns carry the pool of will, and only rest refills it** (backlog 16), and **taking the
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
cannot repeat the omission. On 2026-09-24 it stopped naming files: it covers
map data **by source, wherever it is found** — the whole `src/app/maps/`
directory, the runtime cache and every exported file — so backlog 17 does not
break it. The test now checks that coverage, and that each map module carries
its own attribution. **Drafted by us, not reviewed by a lawyer.**

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
| Decision 15 | eye heights **1.5 / 2.5 / 0.5 m**, object cover, **5 m per metre climbed** (decision 61, was 8), **30°** for vehicles | All his, all "tentative until balance"; the climb cost set from the sources 2026-09-30. |
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
  scaling** (backlog 3) and not before (decision 8). The author set where
  (decision 35): mortars on the map at company and above, artillery at
  battalion and above. Counter-battery fire comes with them, and there is
  none for off-map guns.
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

- **How long clearing really takes** (2026-10-16, urban-doctrine.md,
  *Research on clearing time*):
  - No controlled study times building clearing against known opposition.
  - The real data agrees on about 20–60 minutes for a squad and a defended
    two-storey house: Fallujah's "80 to 100 houses a day with a platoon or
    a company-sized element" (checked on the text), an ARL Ranger squad
    about 30 minutes, and about 8 s for a room's entry itself.
  - ATP 3-06.11's "40-60-minutes" is one illustration, not a planning
    figure.
- **Urban attacks in the research** (2026-10-15): TDI 2002 and Dstl 2023
  find attackers win as often or *more* in towns, at about half the daily
  loss, taking 2–3× longer. No historical basis for 9:1–15:1 was found.
- **`interior-sim` baselines** (all on balance.md):
  - a house nobody holds, 20.4 minutes; one defender 32;
  - three prepared defenders 54–58;
  - top-down against defenders who fall back: 12% fewer men lost and 5–9
    minutes slower, saving nothing against ones who hold.
- **The coupling's first measurement** (2026-10-20, 100 battles): the raid
  3% → 13% with assault-only entry (22% while the walls also went in),
  urban 60% → 58%, the tel identical.
- **Decision 97 against the drills**: the doctrinal drill and the standard
  measurement identical before and after the thrower rule (60 battles).
  After the 10 m screen, the drill keeps 53% / 25% (200 battles), with one
  3:1 battle a draw instead of a loss.

- **What a fight inside a house costs** (2026-10-16, throwaway prototype,
  real Yokneam footprints, 0.5 m grid, two storeys, 60 ticks of 1 s):
  **1.2–1.7 ms a house-turn** at 8 a side, 3.3 ms at 30 a side, 5.3 ms on a
  0.25 m grid, **0.4 s** for all 249 houses at once; plans 0.2 ms a storey.
  Ryzen 7 8845HS, Node 24. Table on balance.md.

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

- **The doctrine corpus is contextualized, so semantic scores run low**
  (measured 2026-10-09). Re-embedding a chunk's own `embed_text` alone
  scores **0.73** against its stored vector, not 1.0, because each chunk
  was embedded in a group with its neighbours. Embedding a query as a
  `document` instead of a `query` is worse: **0.67**. Query scores
  therefore sit at **0.3–0.55** and the ranking is only approximate — a
  near-verbatim query put its own target **third**, under two chunks merely
  adjacent in subject. `--semantic` is a way in, not a proof; quote a
  literal hit. Do not spend another API budget rediscovering this.
- **The move of the attacker's fire plan out of `sim/` changed nothing**
  (2026-10-07). Both standard measurements came out byte-identical, checked
  by `git stash`ing the change and rerunning: `scenario-sim --n 60` gives
  0% / 0%, medians 15 / 14, and the full scouts-and-smoke run gives
  **10% / 15%**, medians 33 / 33. Those two tables are the before-and-after
  for any further move of that code.
- **The browser's attacker needs scouts, and waiting for contact alone is
  worse than nothing** (2026-10-07, 40–60 battles a row, seed 1000,
  `telAzekaAssault`): the harness's bare defaults win **0%** and break
  themselves on their own danger-close fire; `--wait-for-contact` with no
  scouts also wins 0% but loses **17%** of its men against 5% and dies in a
  median 9 turns instead of 15; the two scouts plus held guns plus smoke
  win **10%**. The middle option looks like a half-measure and is a
  regression — do not reach for it.
- **The ComputerAttacker resume hole is latent, not observed**
  (2026-10-07). `task.company` is genuinely unset on a resume and genuinely
  read by `drillCombat`, and the fix (`currentOrders`) is in — but a scan of
  **every** save point across four seeds (~700 resumes) produced **no**
  divergence, because the scouts never have a target in that window on this
  scenario. If it ever needs reproducing, it wants a scenario where a scout
  can see something early.

- **The reference plans on the corrected baseline** (2026-10-11, 100 seeds
  a cell): A calibrated 57/43, A + flank 40/45, B deliberate 45/23, E
  fire-heavy 46/38, D flank 29/19, A + move up 29/23, B + move up 26/21, C
  hasty 43/35; medians **41.5%** and **29%**. Sixteen cells, about twelve
  minutes four at a time. A cell is worth ±10 points at 95%, so read the
  medians.
- **Suppression, measured in isolation** (`npm run suppression-pays`):
  pinning cuts a defender's fire to **×0.24** at 200 m; one rifle squad
  suppresses and **two pin**; two machine gun teams pin from 600 m, where
  rifles cannot reach; at equal numbers the firefight is symmetric
  (×1.03–1.11), and **at 3:1 the attacker pins while staying unsuppressed**
  (6 against 65). Suppression halves every turn, so a sustained input of X
  settles at about 2X.
- **What the targeting fix is worth**: +7 points to every drill (the plain
  script's 3:1 went 10% → 17% in `scenario-sim`). The base-of-fire firing
  position is worth +5, isolated with `--no-firing-position`, and only
  bites once a platoon is tasked `support` — which the scripted company
  does only under the suppression gate.

- **The stale tables on the 91–94 baseline** (2026-10-12, about forty
  minutes four jobs at a time): reference plans with `jev-sim --rule
  <variant> --seed 1000 --n 100` (A at 3:1 `--n 200`); the raid with
  `scenario-sim --n 100 --scenario yokneamRaid` — **not** the standard
  measurement's company flags, which send three scouts out of a platoon
  and give 0%. Results on balance.md. The raid's control at 9696f48
  reproduces 26% exactly.
- **The re-run of every stale table** (2026-10-11, about twenty minutes of
  runs, four jobs at a time). Standard measurement at **200** battles,
  `--recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from
  vantage --wait-in dead-ground --target-first squads`: 3:1 **56%**, 2:1
  **40%**, urban **14%**, explosives **46% / 48%**, attacker down 8%,
  defender down 22%. `yokneamRaid` **26%** (out of time 49%). Hasty with
  one scout (`--rule onescout,rush`) **22%** at 3:1 and **32%** at 2:1.
  *A calibrated* at 200 seeds **61%**. A 200-battle cell is worth ±7
  points at 95%, a 100-battle cell ±9.
- **Which tables the targeting fix did *not* move**: `yokneamUrban`
  (18% → 14%, explosives 97%) and the raid (26%, unchanged). Both are
  fought at close range among houses, so decisions 75–78 and 87 do not
  need revisiting on this account. Do not re-run them again looking for a
  change.

## What I would pick up next

**The players' plans inside, as data** (urban-design.md, step 3b). The
windows (decision 98) and joining (decision 99) are done; neither moves the
town tables, because the raid's ground blocks sight lines to a fight and
the drill never joins one. A scenario with open approaches to a defended
house would show the windows; the drill question above decides the
joining.

**The 1% standoff fault is closed** (2026-10-20): no stall in 3,984
fights. The six left are the three-hour clock on two building blocks,
still progressing (balance.md). **The clock stays at three hours**
(the author, 2026-10-20: "long enough").

**Then the players' plans inside, as data.** By the design principle, the
defender's rooms and the attacker's entry, grenades and teams come from a
plan the engine carries out, which is what the OPORD will fill one day.
Not a screen.

**Then the 2:1 question, the force-quality matrix and the AI commanders**,
as the author says. Artillery and air support for a company still come
only by a scenario's allotment (decision 95); battalion echelon is
backlog 10.

## Traps that cost real time

- **Every interior change had real faults the reviewer found** — on
  2026-10-16 to 20, five reviews of the floor plans, the resolver,
  top-down, smoke and the coupling found two stalls, lost wounds, a free
  move, a fog-of-war leak and three silent no-ops. Decision 98's first
  review found nine more: a roof critical on a wall fell back to the whole
  building, a room burst read distance from the force's mark, phantom hits
  once the pool ran out, the drill aiming by a different sight line. Run the `code-reviewer`
  agent before committing anything under `src/engine/interior/`, and
  measure with `interior-sim` after; the tests alone passed every time.
- **A stall check is part of the fight's clock.** `lastProgress` must only
  move forward (`Math.max`), and anything that holds a team on a timer
  (consolidating, a halt for casualties, the roof) must push it forward,
  or a long legitimate wait reads as a standoff.
- **`cat > file` with no heredoc in a compound command waits on stdin** and
  hangs the tool for its full timeout. Write files with the Write tool, or
  give every `cat` a heredoc; run vitest with `< /dev/null`.
- **`rm -rf` is denied by `.claude/settings.json`** — the whole compound
  command is refused, not only the `rm`. Remove files one by one, or a
  directory with `rmdir` once empty.
- **Before-and-after measurements on Windows**: `git worktree add <dir>
  HEAD`, then `cmd //c mklink //J <dir>\node_modules <repo>\node_modules`
  (a junction, so no copy), run both trees in parallel, and remove the
  junction with `cmd //c rmdir` **before** `git worktree remove --force`.
- **The Browser pane can report a 0×0 viewport** when it is hidden: set
  `resize_window` 1280×900, and click the map by dispatching on `svg.map`
  at coordinates from its own `getScreenCTM()` (driving-the-game.md), not
  by screen coordinates off a scaled screenshot.
- **A replay script outside the repo** runs with `npx vite-node <file>` from
  the repo root, importing the engine by absolute path
  (`C:/Unity/תיק עבודות/Tactical/src/engine/index.ts`). That is how the
  author's saved battle was analysed on 2026-10-20.

- **`git checkout -- <file>` as a fallback in a `||` chain destroyed a
  file's work.** `cmd 2>/dev/null || py -c "revert..."` ran the *first*
  branch, which succeeded, so the fallback never fired — and the first
  branch was a checkout that reverted `scenarioBattle.ts` to HEAD, losing
  an hour of edits (recovered, because the moved code lived in another
  file). Never put `git checkout --` in a one-liner next to anything else.
  To undo a temporary edit, reverse the exact string with a script.
- **`PYTHONUTF8=1` for anything touching the doctrine corpus**, not just
  Hebrew. Without it a Windows console turns the manuals' quotes and en
  dashes into `?`, and a designator reads `ADP 1 ? The Army`. The data is
  clean UTF-8; the terminal is not.
- **A long Python heredoc through Bash mangles `
` inside string
  literals.** Writing `tools/doctrine.py` that way produced real newlines
  inside `"..."` and a syntax error twice. Write a file that size with the
  Write tool, or keep the escapes out of it.
- **A deny rule of `Read(.env.*)` also blocks `.env.example`**, which is a
  tracked template with no values in it and wants to stay readable. The
  rules in `.claude/settings.json` name the real secret files instead:
  `.env`, `.env.local`, and `**/` of each.
- **The six-offset resume test needs `i >= from`, not `i > from`.** A save
  landing exactly on a turn boundary (an activation index divisible by six)
  leaves the unbroken run having closed that turn and the resumed one not,
  which looks like a product divergence and is the test harness. See
  `computerAttacker.test.ts`.
- **A measurement can be wrong in *direction*, not just in value, and
  nothing warns you.** Three days of tables, and the conclusions drawn
  from them, were taken through a drill whose forces never fired: the
  harness reported win rates, losses and explosive shares throughout, all
  internally consistent, all wrong. What caught it was instrumenting one
  turn of one battle and printing per force whether it was in range, had
  line of sight, and had fired — four columns that took ten minutes to
  add. **When a table is surprising, print what the forces are actually
  doing before reasoning about the rules.** The suppression work
  (`npm run suppression-pays`) is the shape to copy: measure the
  mechanism in isolation first, then look for it in a battle.
- **An exhaustive `Record` catches a new enum member; a `switch` with a
  `default` swallows it.** Adding the `team` echelon (decision 89) broke
  `symbols.ts`, which mapped echelons with a `switch`/`default`, so every
  fire team and machine gun team drew with **no echelon amplifier** — and
  nothing failed. The three other places that map an echelon are
  `Record<Echelon, …>` and the compiler named all three. Prefer the
  `Record`.
- **Drive the browser as you go, not at the end.** Three days of doctrine
  work went in without once opening the game; the first hour of driving
  afterwards found the symbol fault above, machine gun teams named
  `חולית מקלע 1/A` in a roster that reads `מחלקה א'/1` everywhere else, and
  that **the player had no way to form a fire team at all** — the thing the
  author had actually asked for. None of it was visible from the harness.
- **`xargs` collapses an empty field and silently mis-groups every later
  job.** A queue of `name|rules|scenario` piped through `tr '|' ' '` and
  `xargs -n 3` put the *next* job's token into the empty `rules` slot, and
  sixteen reference-plan runs came out scrambled and fast enough to look
  fine. Pass the whole job as one argument (`xargs -I LINE`) and split it
  inside the worker.
- **A pull that lands new dependencies leaves `npm run check` broken.**
  `git pull` does not install. After 2026-10-07's sync of 133 commits,
  `@anthropic-ai/sdk` and `@typesafe-ai/sdk` were declared in
  `package.json` and absent from `node_modules`, and the typecheck failed
  with seven TS2307/TS7006 errors in `src/sim/claude.ts` and
  `src/sim/jev.ts` — which read like broken code and are not. Run
  `npm ci` after any sync that touches `package.json`.
- **A background measurement reads the code as each job starts.** A run of
  `jev-sim --rule` jobs (`xargs -P 4`) launches a fresh process per job, so
  editing `src/` while it runs changes the later jobs. Develop in a
  `git worktree` (symlink `node_modules`) while a measurement runs, and merge
  after (2026-10-01 did this throughout).
- **"Lost" is not "casualties".** `ScenarioBattleResult.lost` counts the
  broken and fled with the killed, wounded and captured; the sources'
  casualty figures do not count a failing attacker's broken men, who rally.
  Compare a failed attacker by `down`, a lost position's defender by `lost`
  (balance.md, fortieth round: round 39 got this wrong).
- **A 20-seed table can be wrong by 50 points without anyone noticing.**
  Round 34's "holding short wins 10%" did not reproduce at its own commit
  (65%), and three rounds reasoned from it. Rerun a surprising row at 100
  seeds before building on it.


Browser-driving traps live in [driving-the-game.md](driving-the-game.md) and
testing ones in [AGENTS.md](../AGENTS.md). These are the ones specific to where
the code currently stands:

- **A map symbol is not centred on its unit.** APP-6 amplifiers sit above the
  frame, so an image's centre is ~36 m off the unit's position. Read a
  selected unit's position from its `circle.selection-ring` (`cx`, `cy`).
  The smart attacker read image centres for its first runs and crept forward
  14 m a bound; every result from that version is marked in validation.md.
- **A squad far from its command group takes orders every other turn**
  (`g.token-no-orders`). A script that alternates bound/hold by turn parity
  can lock such a squad on "hold" for the whole battle.
- **Research-figure rules are gated on `lethality`**, and a recording without
  the field reads as `"document"`. Decisions 40–50 all follow this: a new
  research rule goes behind `this.lethality === "research"` so older
  recordings replay.
- **The container blocks most military-manual sites** (globalsecurity,
  infantrydrills, archive.org, DTIC). The Apify connector's `web-fetch` and
  `rag-web-browser` get through; a large result is saved to a file and can be
  searched with `jq`. Chromium in the container also phones Google, which
  the proxy rejects — harmless noise.

- **A battle does not begin when it is built.** The App opens on mission
  planning at turn 0 and calls `beginTurn` only when both sides have planned
  (decision 38). The harness and the tests still begin at once, which is
  fine: planning is optional. But anything in the App that assumes turn 1 on
  mount — `activations[0]`, `game.turn`, the initiative line — is wrong
  during planning.
- **Three eras of rounds for effect in a recording.** Before decision 36 a
  mortar mission fired 6. Between decision 36 and the fix that journals the
  number, it fired the weapon's default and the call carried none. Since
  then, every call carries its number. `madeBeforeDecision36` tells the first
  two apart by the header (the decision 37 flag, numbers written into the
  allotments). A player's call never takes a number from the caller: only
  `replayCallForFire` does.
- **The harness strikes what the battle's echelon may not call** (decision
  37) and says so on the first line of its output. A company row given
  `artillery=2` plays without it. `--any-echelon` measures without the rule.
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
- **`--swap` is not a second sample.** It replays the same seeds with the
  sides' places exchanged, so a fluke of the seed window survives it and
  looks like a bias that "follows the side". It put a bug that was not there
  at the top of the 2026-09-23 handoff. Check a lean on a disjoint window with `--seed`.
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
