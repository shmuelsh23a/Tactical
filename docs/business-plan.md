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

- **Mobile and PC.** The phone is not a port or a second-class platform: it is
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

### Jev and the air-gapped fork ✅

- **Version one assumes Jev exists** and is reachable.
- **All civilian games are logged**, securely and anonymously: the question
  put to the model, the answer, the model id and the question-set version.
  That is the training set for whatever replaces Jev, and it is also the
  per-battle cost measurement.
- **An air-gapped institution brings its own AI**, something that at least runs
  on a local GPU, and we approximate Jev on it. Either Jev will have an
  offline version by then, or we train a small model to give good-enough
  answers. **This is a fork in the roadmap taken when needed, not a mandatory
  stop.**
- The scripted drill remains the fallback when there is no model at all.

### Connectivity ✅

In this order:

1. **Direct device-to-device play** between two phones: Bluetooth, or the
   devices' own Wi-Fi (Wi-Fi Direct or a hotspot). This is for places with no
   cellular connection.
2. **Online play through backend servers**, which comes later.
3. **Asynchronous play** on top of the servers.

The deterministic engine is what makes this cheap: devices exchange
**decisions, not state**, and each device resolves the same turn with the same
seed.

### User-generated content ✅

- Scenarios, campaigns and **maps export to a file** and are shared **device
  to device**, or through any channel the users choose: instant messages,
  email and so on.
- **Quality is the users' business, not ours.** No moderation queue. User
  content brings players in.

### Licensing ✅

- **Generalise the third-party data clause in [LICENSE](../LICENSE).** It lists
  map files one by one today, and that cannot cover ground fetched at runtime
  or maps players export. The ODbL (OpenStreetMap) and SRTM terms have to
  cover any map the game produces, whatever its name.

### Team ✅

For now the author and Claude build it. More people join when it scales.

## Open items

Gaps found in the last pass, each small or to be decided when it comes up. None
of them changes the plan.

1. **Hidden information in direct play.** With no server, whose device holds
   the true state? If both devices hold everything, a modified client can see
   through the fog. Options: the host device is the referee and the guest only
   gets its side's view (simple, the host could cheat); or orders are
   exchanged as commit-then-reveal. Friends playing each other can live with
   the first. Anything ranked needs the server.
2. **Cross-platform direct play.** Apple and Android peer-to-peer frameworks do
   not talk to each other well over Bluetooth. Local Wi-Fi (one phone runs a
   hotspot, the other joins, they talk over a socket) is the dependable
   iPhone-to-Android path. This also means a **native shell** (Capacitor, React
   Native or similar) around the engine: a browser build cannot open Bluetooth
   or local sockets on an iPhone.
3. **Subscription features with no signal.** Jev needs the network, so a game
   with no connection at all is a free-tier game. Paid features need a stated
   rule for this case (an offline grace period for the licence check, and the
   scripted drill standing in for Jev), not a failure halfway through a battle.
4. **Exported files are untrusted input.** A map or scenario that came over
   WhatsApp is validated on import like anything else from outside: size
   limits, schema checks, and nothing in it that runs. Each file carries a
   **format version** so an older file still opens after a rules change, and
   carries its map-data attribution with it (ODbL).
5. **What the logs hold.** Anonymous is not the same as harmless: a generated
   map is real ground, and a player may well build their real sector. Log the
   decisions and a reference to the map, not the map itself. State consent in
   the terms. Israeli privacy law (the Privacy Protection Law, amended) applies
   from day one, and the EU's GDPR once there are users there.
6. **Jev's terms of service.** Before counting on the logs as training data,
   check whether Jev's terms let its answers train another model. Many vendors
   forbid it. If Jev does, the air-gapped fork needs another route: training on
   our own labelled games, or buying Jev's offline version.
7. **Cost per battle, by echelon.** Measure it from the logs before setting a
   price. At about 74 Jev calls a turn for a brigade (docs/balance.md, *How the
   engine scales*), division will be a few hundred, and the price structure
   (flat, per battle, or tiered by echelon) follows from the number.
8. **Proof that it teaches.** Define what "learned" means (plan quality, how
   closely the result matched the intent, speed and quality of FRAGORDs) and
   measure it in the debrief from the start. It is what the institutional sale
   rests on.
9. **Export control.** The institutional edition sold abroad will probably need
   Israeli defence-export approval, and the civilian edition's content decides
   whether it does too. Ask early; the answer shapes what goes into the civilian
   edition.
10. **Name and trademark.** The product needs a name that has been checked
    before it goes into the stores.
11. **Age rating and minors.** Pre-military youth are a natural audience, and
    both the stores' age ratings and privacy rules for minors apply to them.
12. **When people join:** IP assignment agreements from the first contributor,
    so the code stays owned the way [LICENSE](../LICENSE) says it is.
