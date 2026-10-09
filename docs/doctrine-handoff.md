# Doctrine handoff — the drills from the manuals (backlog 21)

The brief for the session that replaces the game's drills with doctrine.

**The manuals have arrived (2026-10-09) — this is no longer blocked.** The
author's library is in `docs/Doctrine`: **426 US Army publications, 77,597
pages**, parsed and chunked for retrieval, searched with
[`tools/doctrine.py`](../tools/doctrine.py). How to use it, and the four
traps it carries, are in [AGENTS.md](../AGENTS.md), *The doctrine corpus is
the authority on drills*; its provenance is in
[sources.md](sources.md), *Doctrine: the manuals, as a corpus*. The three
manuals this brief named are all there, current editions recorded below.

It is **commercial-edition work and belongs in this public repository**: the
commercial edition is built on open-source manuals only, and every
publication in the corpus is Distribution A from armypubs.army.mil. (The
2026-10-01 note that it was local work, with the author's material in a
private package, is superseded.) The cloud sessions' proxy refuses most
military sites (handoff.md, *Traps*), which is why the corpus is a local
index rather than something a session fetches. The cloud handoff is
[handoff.md](handoff.md); read its *Start here* first.

## Why

The rules are tuned against real outcomes (validation.md). The **drills** —
how a squad, platoon or company carries out an order — have so far been ours
and tuned too, so a quirk in one hid a fault in the other: the calibrated
plan "won" by keeping a third scout squad off a killing ground, not by
scouting (balance.md, forty-fourth round). From now on the layers divide:

| Layer | Set by | Tuned against |
|---|---|---|
| Rules | research | real outcomes (wins, losses, pace) |
| **Drills** | **the manuals, fixed** | nothing — they are the reference |
| Plans | players, or the AI | whatever wins |

If doctrinal drills do not give real outcomes, the **rules** are what is
wrong — and that is a decision for the author, made on the numbers.

## Which doctrine (author, 2026-10-01)

- **Civilian (commercial) edition: US doctrine in open sources**
  (Distribution A, public domain): **ATP 3-21.8** *Infantry Platoon and
  Squad*, **ATP 3-21.10** *Infantry Rifle Company*, **FM 3-90** *Tactics*
  (forms of manoeuvre, hasty and deliberate attack, the defence).

  **The current editions, checked in the corpus 2026-10-09** (as this brief
  asked):

  | Manual | Edition | Pages |
  |---|---|---|
  | ATP 3-21.8 | **2024-01-11** (ARN44065) | 598 |
  | ATP 3-21.10 | **2026-06-01** (ARN46667) | 296 |
  | FM 3-90 | **2023-05-01** (ARN38160) | 480 |

  ⚠️ **This brief's "(its battle drills)" was wrong about where they are.**
  ATP 3-21.8's Appendix E only *names* the drills with their task numbers
  — Battle Drill 1 React to Direct Fire Contact (07-PLT-D9501), 1A the
  squad's, 2 Conduct a Platoon Assault (07-PLT-D9514), 2A the squad's, 3
  Break Contact (07-PLT-D9505), 3A the squad's — and refers the reader to
  the Army Training Network, which is not in the corpus and which the
  cloud proxy would refuse anyway. So the drill work draws on:

  - **TC 3-21.76** *Ranger Handbook* (**2025-09-19**, 380 pp) — Appendix A
    carries the steps in executable form, down to which team acts
    *without* orders and which waits on the squad leader. This is the
    closest thing in the corpus to what `drill.ts` already is, and is
    where the drill rewrite should start.
  - **ATP 3-21.8** chapters 3–5 — the reasoning and the standards behind
    the steps: base-of-fire and bounding elements, formations, movement
    techniques, the offense and the defense.

  One finding already worth carrying into the work: **ATP 3-21.8 (2024),
  para 3-102** — "Platoon leaders normally designate a general location for
  the base of fire, and the element leader selects the exact location."
  That is the game's own layer split stated in doctrine: the general
  location is a `CompanyOrders` field, the exact position is the squad
  drill's. It settles how the base of fire (backlog 21) divides between
  `company.ts` and `drill.ts` without a judgement call from us.
- **Institutional edition: the doctrine engine adapted to the customer's
  doctrine and material** (business-plan.md, *Editions*).
- **Every manual embedded must be cleared for public release** — for US
  doctrine, *Distribution A* on its cover. Some older or restricted editions
  are not, even where copies circulate; check each before it is committed,
  and record its title, edition, marking and source, so the commercial
  edition can show where every TTP detail came from (business-plan.md).
- **Also from doctrine** (author, 2026-10-02), so in scope here:
  - **mission and victory conditions** (backlog 18) — the manuals'
    definitions of mission accomplishment (seize, secure, defend, delay…);
  - **the MOS list and each squad's and platoon's makeup** — who carries
    what, for README decision 73 (every soldier an MOS, with kit and a
    skill), and what the manuals say about taking up a fallen gunner's
    weapon;
  - **reserves for the other layouts** — which squad each defending
    platoon holds back (the platoon battle, the company battle's platoon B,
    Yokneam);
  - **the OPORD** (`src/sim/opord.ts`) — rewritten in the manuals'
    five-paragraph form; ours until then, and not to be used again before;
  - **fire on the move** (`GameOptions.fireOnTheMove`, off) — kept until
    doctrine says whether infantry fires while moving (assault fire);
  - **the hasty attack at 45% and the flank plan at 25%** (balance.md,
    forty-fifth round) — no ruling until the reference plans are measured
    again on the doctrinal drill (Step 3).

## Step 1 — the inventory (no code)

Map every drill the game plays to its manual paragraph, in a new
`docs/doctrine.md`, one row each:

| Drill | Where in the code | Value now | Manual (publication, paragraph) | What doctrine says | Verdict | Proposed |
|---|---|---|---|---|---|---|

Verdicts: **matches**, **ours and differs**, **ours, doctrine silent**. A
manual gives procedures more than numbers ("bound when the overwatch is set";
"as METT-TC dictates"): where we must still choose a number, the row says
*the manual says X, our value Y*, as balance.md marks what is ours.

What the game plays today (`src/app/drill.ts`, `src/app/company.ts`,
`src/sim/scenarioBattle.ts`; the harness uses `PLAIN_SCRIPT`, and
`WESTERN_DRILL` is a first draft of ours):

**Attacking company and its squads**
- **Scouting** — how many squads, chosen as those nearest the plan's enemy;
  each to an observation point 350–550 m from it (`VANTAGE_RING_M`), halting
  to watch (`scouting.watchTurns`), giving up a point after 6 turns of nothing
  (`SCOUT_GIVE_UP_TURNS`); the enemy counts as found within 250 m of the plan
  (`FIND_WITHIN_M`). Binoculars for scouts (decision 54).
- **Waiting** — in the nearest dead ground out of sight of the plan's enemy
  (`waitIn: "deadGround"`), until sent.
- **When the company goes** — today a plan's choice (the scripted company: 4
  turns with the enemy in sight).
- **The approach** — a bound of 100 m at a run in contact (`bound`; the
  Western draft 50 m), half the squads moving while half fire (`overwatch`);
  covered steps out of sight of the known enemy, up to 60° off the line,
  straight within 150 m (`COVERED`); command groups 80 m behind
  (`commandGroupBehind`).
- **Bounding by platoon** — one assaulting platoon moves while the others halt
  and fire, within 400 m of a known enemy; the moving platoon's squads go
  together (`boundByPlatoon`).
- **Closing together** — a platoon within 300 m of the enemy waits at the
  last cover while another is 100 m further back, at most 5 turns
  (`TOGETHER`).
- **Moving up to an assault position** — dead ground 250 m short of the
  enemy as found (`ASSAULT_POSITION_M`, sought within 150 m); **going round a
  flank** — dead ground 200 m to the side and 100 m back (`FLANK_*`).
- **Base of fire** — a platoon halts within its fire range (400 m,
  `attackFireRange`; Western 300) and fires. **Open (author, 2026-10-03):** a
  platoon or company commander can pull some of his machine guns to form
  it; today it is riflemen only, and costs the deliberate plan about ten
  points (balance.md, fifty-sixth round). Who, with which weapons, where and
  for how long — from the manuals.
- **Holding short and lifting the fires** — squads stop 200 m from the enemy
  under their own mortars until the fires lift (`HOLD_SHORT_M`).
- **The assault** — at 25 m, with grenades (`assault`); grenadiers one
  launcher per four men.
- **Breaking contact** — none in the plain script; Western: at half strength,
  150 m back (`breakContact`).
- **Fire** — sectors (360° plain, 60° Western); the nearest enemy in reach.

**Defending platoon and company**
- **Fire discipline** — hold fire to 400 m (`openFireRange`; Western 200);
  covering fire when idle (`coverWhenIdle`).
- **Displacement** under shelling (`displace`), to an alternate position if
  one was prepared (decision 38).
- **The reserve's counterattack** on a position lost within 50 m, at a run
  (`counterattack`, decision 60).
- **The fire plan** — six mortar targets on the dead ground 100–400 m in
  front, 120 m apart (`planDefenderFires`; doctrine's target reference points
  and final protective fires); the command post stays where it was set up.

## Step 2 — the doctrinal drill

Write it as a named drill beside the others (`DOCTRINE_US`: `SquadDrill` data
plus the company behaviours), keeping `PLAIN_SCRIPT` for comparison. A drill
decides and the engine resolves (README, backlog 20): no drill changes a
rule or an outcome's odds. Where doctrine branches on events ("if pinned,
suppress and flank"), say so in the inventory before building it — backlog
20 leaves open whether a drill can branch.

## Step 3 — measure, then the author decides

Run the reference plans on the doctrinal drill, 100 seeds a scenario from
1000, on both tel assaults (handoff.md, *Start here*, lists them; about an
hour, four at a time, no tokens), and the standard measurement. Compare with
decision 68's targets (3:1 40–55%, 2:1 20–35%) and with losses against the
sources (validation.md, *Loss exchange in attacks*). If they miss, the
question is which **rule** — for the author, with the numbers. Record a new
balance round.

## Running it locally

```bash
git clone https://github.com/shmuelsh23a/Tactical.git && cd Tactical
nvm use            # Node 24 (.nvmrc)
npm ci && npm run check
npm run jev-sim -- --rule basefire,bound,holdshort --scenario telAzekaAssault --seed 1000 --n 100 --out jev-runs/B
npm run scenario-sim -- --recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from vantage --wait-in dead-ground --n 200 --target-first squads
```

`jev-runs/` and any `--out` directory under it are not committed.
