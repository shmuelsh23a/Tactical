# Business plan

**Settled with the author, 2026-09-24.** What the game is for, who pays for it,
what is free, and the order it is built in. Pricing is deliberately left open.
Decisions are marked ✅; what is still open is under *Open items* at the end.

## What the game is

A teaching game for commanders that grew into a wargame. It started as a
squad–company tactics trainer (משחק מלחמה לפו"ם). Two things change its scale:
**Jev** (backlog 15 in the [README](../README.md)) lets every simulated
subordinate make its own decisions, and the engine simulates the individual
soldier. Together they let the same game run from a squad up to a division.

**It is about teaching commanders first, and being a game second.** Every level
runs the same loop:

1. **Orders.** The player writes a short OPORD and draws the battle plan on the
   map.
2. **Execution.** Play is automated. The OPORD and the plan drive both the
   scripted behaviour (the drill) and the decisions Jev makes for simulated
   commanders.
3. **Adaptation.** The player watches, adapts the plan and issues FRAGORDs.
4. **Debrief.** The deterministic recording replays the battle exactly for the
   after-action review.

## Decisions

### Product ✅

- **Mobile and PC, Android first.** Development targets **Android**; the game
  is then ported to **Apple** (iOS) and **PC**. The phone is not a port or a
  second-class platform: it is
  the device every leader of every rank has on them. **The test is that a game
  can be played on the toilet**, which means:
  - short battles, *and* save and resume at any moment, including mid-turn;
  - asynchronous multiplayer: take your turn, get notified, carry on;
  - one-handed, portrait, thumb-sized controls, and order-writing built from
    templates and pick-lists, with drawn graphics that snap to the ground;
  - playable **offline** (see *Connectivity* below);
  - a canvas or WebGL map. The SVG map does not survive the move to a phone
    (README, Stage 4).
- **Solo and multiplayer.** Multiplayer starts as **red against blue**. It
  later grows into **several echelons per side**, each human at their own
  level and Jev filling the levels nobody is playing. At that point it is
  effectively a command-post exercise.
- **Scenarios and campaigns**, pre-built, plus **generation from geospatial
  data** and a **scenario editor**.
- **Level of control.** Each echelon gives orders **one level down** but can
  **see all the way down to the squad**.
- **Command decisions, not bookkeeping.** The player sets priorities and is
  shown the information, but does not do quartermaster's arithmetic. Fuel,
  food and ammunition are priorities, not litres.

### Order format ✅

- The order form is a **doctrine-neutral skeleton**: mission, commander's
  intent, concept of operations, tasks to subordinates, coordinating
  instructions, service support, command and signal. Each doctrine is a
  presentation of it.
- The OPORD is **structured, not free prose**: fields for its paragraphs, and
  control measures (objectives, phase lines, boundaries, support-by-fire and
  attack positions) drawn on the map. That is what lets the order drive the
  drill and Jev directly, with nothing parsed out of text.
- **The IDF format ships first**, in Hebrew, because that is where the first
  customers are (below). The US Army format is the reference during
  development and ships second. More formats, and per-customer formats, come
  later.

### Build order ✅

- **Echelons:** squad up to division, one echelon at a time.
- **Functions:** combat arms first, then supporting arms, then administration
  and logistics.
- **Platforms:** Android, then Apple and PC. The engine has no runtime
  dependencies, so the port is the app layer only.
- **Revenue does not wait for division.** The subscription can open as soon as
  simulated platoon commanders work, which is at **company**.

### Editions ✅

Modelled on Command: Modern Operations and **Command PE**:

| | Civilian | Institutional |
|---|---|---|
| Content | Unclassified information only | Tailored to the institution: its doctrine, equipment specs, specific opposing forces, its own maps |
| Deployment | Cloud and devices | Anything up to **air-gapped** |
| AI | Jev, hosted | Jev where allowed; air-gapped needs a local model (below) |

For the civilian edition, every order-of-battle and TTP detail keeps a note of
the public source it came from, so "unclassified" can be shown and not just
asserted.

### Free and paid ✅

The line is drawn at what costs money to run.

- **Free:** everything that makes **no Jev calls**. That is squad–platoon, solo
  and multiplayer, on the pre-built scenarios, and the scenario editor on the
  pre-built maps. It has to be complete and good, not a demo, because it is the
  only marketing there is.
- **Subscription:** everything that **needs Jev** (company and up, where
  subordinate commanders are simulated), and the editor **when it makes new
  maps** from geospatial data.
- **Team plan:** a commander buys seats for their officers. We expect the game
  to spread this way, one commander at a time.
- **Price:** later, from measured cost per battle (see *Open items*).
- **Web sales** alongside the app stores, within the stores' rules, to keep the
  15–30% store cut off at least some of the revenue.

### First customers ✅

**IDF reservists buying personal subscriptions because it is useful to them.**
Institutional sales come after, on the evidence the civilian edition builds up.

### Security and privacy ✅

- **Generated usernames**, as in Minecraft and Fortnite. No real name is
  required.
- **Invented unit names**. **No rank field** in the user's details.
- **Warnings** where real data is most likely to be entered: writing an OPORD,
  and generating a map from real ground.
- Every standard best-practice protection (encryption, data minimisation,
  hardened accounts).
- **OPSEC is ultimately the user's responsibility**, and the terms of use say
  so.
- **What is logged:** decisions and a *reference* to the map, never the map
  itself. A generated map is real ground, and a player may well have built
  their real sector. Consent is stated in the terms. Israeli privacy law (the
  Privacy Protection Law, as amended) applies from day one, and the EU's GDPR
  once there are users there. Jev processes what the game sends it, so the
  privacy notice names it as a processor (it has a data processing agreement).

### Jev ✅

**Version one assumes Jev exists** and is reachable. **All civilian games are
logged**, securely and anonymously: the question put to the model, the answer,
the model id and the question-set version. That is the per-battle cost
measurement and the material for quality review.

**Jev's terms, checked 2026-09-24** (TypeSafe's Master Customer Agreement and
Acceptable Use Policy, both last updated 2026-09-23):

- **No distillation (MCA §2.3(b)).** We may not use the service or its output
  "to perform model distillation, train a model to imitate the output of the
  Services, or develop (or to facilitate the development of) a similar or
  competing product or service." **The logs cannot be the training set for a
  replacement.** Owning the output (§4.2 assigns it to us) does not lift the
  restriction.
- **A signed order overrides the standard terms (§16.14).** A negotiated
  carve-out, or TypeSafe's own offline version, is the route to keeping
  Jev-derived behaviour on an air-gapped network.
- **They do not train on our data without consent (§4.1)**, but they keep
  derived telemetry (logs, hashes, statistics, classifications) indefinitely,
  and are not obliged to keep our data at all (§10.3).
- **No ITAR-controlled information may be sent (§16.12).** That matters for any
  US institutional edition. Classified material of any country is out anyway.
- **The AUP does not name military use or wargames.** It forbids "violent
  activities" (§1.7), designing weapons (§1.11), and anything TypeSafe decides
  on counsel's advice would create liability for it (§1.15). A training
  wargame is not a weapon, but §1.7 and §1.15 are loose enough to suspend us.
  **A written agreement with TypeSafe comes before any institutional sale**
  (author, 2026-09-24): it confirms the use, and is where a local-model
  carve-out would be negotiated. The **civilian subscription may launch
  before it**, on the standard terms.
- **Other exposure:** they may change the terms on 60 days' notice (§16.7) and
  change the API in ways that break us (§2.5); their liability is capped at a
  year's fees or $50 (§12.2); disputes go to arbitration in San Francisco
  (§15). The AUP also forbids designing for compulsive use by minors (§2.4),
  which bears on pre-military youth.

### The air-gapped fork ✅

**An air-gapped institution brings its own AI**, at least something that runs
on a local GPU. **This is a fork in the roadmap taken when needed, not a
mandatory stop.** Given §2.3(b), the routes are:

1. **TypeSafe's offline version**, if it exists by then, or a negotiated order
   that permits a local model.
2. **A small model trained on our own data, with no Jev output in it:**
   - the decisions **human players** make in the same situations, which is
     arguably better material for a teaching game than another model's
     answers;
   - **self-play in the engine.** The engine is deterministic and fast, so
     it is its own training environment.

Until a lawyer says otherwise, Jev's answers stay out of that pipeline
entirely, including as an evaluation set. The scripted drill remains the
fallback when there is no model at all.

### Connectivity ✅

In this order:

1. **Direct device-to-device play** between two phones: Bluetooth, or the
   devices' own Wi-Fi (Wi-Fi Direct or a hotspot). This is for places with no
   cellular connection. On Android first, where Nearby Connections and Wi-Fi
   Direct cover both. When Apple follows, local Wi-Fi (one phone runs a
   hotspot, the other joins, they talk over a socket) is the dependable
   iPhone-to-Android path; the two platforms' Bluetooth frameworks do not
   talk to each other well.
2. **Online play through backend servers**, which comes later.
3. **Asynchronous play** on top of the servers.

The deterministic engine is what makes this cheap: devices exchange
**decisions, not state**, and each device resolves the same turn with the same
seed.

- **Hidden information in direct play:** the **host device is the referee**
  and sends the guest only its side's view. Good enough between friends (the
  host could in principle cheat). Anything ranked needs the server.
- **A native shell** (Capacitor, React Native or similar) wraps the engine,
  because a browser build cannot open Bluetooth or local sockets.
- **Paid features with no signal:** Jev needs the network, so a game with no
  connection is a free-tier game. A subscriber offline gets a **grace period**
  on the licence check, and the **scripted drill stands in for Jev**. A battle
  never fails halfway through for want of a connection.

### User-generated content ✅

- Scenarios, campaigns and **maps export to a file** and are shared **device
  to device**, or through any channel the users choose: instant messages,
  email and so on.
- **Quality is the users' business, not ours.** No moderation queue. User
  content brings players in.
- **Exported files are cryptographically signed** by the game. On import the
  signature is checked, so a file altered after export is detected and
  refused. What the signature proves: the file is unchanged since the game
  exported it, under that username. What it cannot prove on its own: a key
  kept on a phone can be extracted by a determined user. Once the servers
  exist, they can countersign.
- **Imported files are untrusted input** all the same: size limits, schema
  validation, and nothing in a file that runs.
- Every file carries a **format version**, so an older file still opens after
  a rules change, and carries its **map-data attribution** (the ODbL requires
  it).

### Licensing ✅

The third-party data clause in [LICENSE](../LICENSE) is **generalised**
(2026-09-24). It covers OpenStreetMap and SRTM data **by source, wherever it
is found**: the whole `src/app/maps/` directory, data fetched or cached at
runtime, and the map data inside any exported file. The rest of an exported
file (scenario, forces, orders) stays under the terms that otherwise apply.
`src/invariants.test.ts` pins that coverage and checks that each map module
states its source. **We drafted it; a lawyer has not reviewed it.**

The repository licence is an evaluation licence. The shipped app will also
need an end-user licence and terms of use, which is where OPSEC
responsibility, logging consent and ownership of user content are stated.

### Team ✅

For now the author and Claude build it. More people join when it scales.

## Open during development

1. **Cost per battle, by echelon.** Measure it from the logs before setting a
   price. At about 74 Jev calls a turn for a brigade (docs/balance.md, *How the
   engine scales*), division will be a few hundred, and the price structure
   (flat, per battle, or tiered by echelon) follows from the number.
2. **Proof that it teaches.** Define what "learned" means (plan quality, how
   closely the result matched the intent, speed and quality of FRAGORDs) and
   measure it in the debrief from the start. It is what the institutional sale
   rests on.
3. **The TypeSafe agreement**, before the first institutional sale; the
   civilian subscription does not wait for it (see *Jev*).

## When there is a working demo

Deliberately deferred until the game can be shown:

1. **Export control.** The institutional edition sold abroad will probably
   need Israeli defence-export approval, and the civilian edition's content
   decides whether it does too.
2. **Name and trademark.** A product name, checked before it goes into the
   stores.
3. **Age rating and minors.** The stores' age ratings, privacy rules for
   minors, and TypeSafe's AUP §2.4 on compulsive use by minors.
4. **IP assignment agreements** from the first person who joins, so the code
   stays owned the way [LICENSE](../LICENSE) says it is.
5. **A lawyer reviews** the LICENSE clause, the end-user terms and the Jev
   position together.
