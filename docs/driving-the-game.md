# Driving the game by script

Playing the demo scenario to an interesting position takes many activations, so
verification is usually scripted through whatever browser automation the
assistant has. The notes below cost real time to rediscover; they are kept out
of [AGENTS.md](../AGENTS.md) only because they are long, not because they are
optional.

Start here: [AGENTS.md](../AGENTS.md) *Verifying a change in the actual game*
has the two rules you cannot skip — hard-reload after an engine change, and
dispatch clicks on `svg.map` itself.

- **A token's symbol image is large in map coordinates.** `elementFromPoint` at
  a spot near a unit hits the `<image>`, and `Token`'s handler calls
  `stopPropagation`, so the click never reaches the map — a move silently does
  nothing. Dispatch on `svg.map` itself instead: the background handler reads
  `clientX/clientY` off the event and does not care what was under the cursor.
- **Every state change re-renders every token through milsymbol**, which is
  slow enough that a long click sequence blows the 30 s tool timeout. Drive one
  or two activations per call and read the state back between them.
- **C2 is measured from where the חפ"ק stands when the order is given**, so
  move the command group *before* the subordinate if you want the squad to
  stay in the every-turn band.
- **One order is usually enough.** Since a standing order executes every turn,
  a script can order a force once and then just advance activations — far
  cheaper than clicking a bound per turn, and it no longer stalls when the
  force falls out of contact.
- **Check a move landed by looking for a movement line anywhere in the new log
  entries**, not at the top one — detection and orders log after it. (The log
  renders newest-first.)
- **One click per script call, or await a tick between them.** React batches
  state updates, so two `.click()`s in the same tick both hit the pre-render
  DOM — the second silently re-clicks the same stale button. A
  `await new Promise(r => setTimeout(r, 60))` between clicks is enough, and the
  whole activation sequence can then run in one call.
- **Advancing turns needs all three buttons**, in this order of preference each
  time: `התחל תור`, `מוכן — הצג את המפה`, `סיים שלב`. Click whichever is present
  and *enabled*. A driver that clicks only the last two stalls at the initiative
  panel and looks like the engine hung. Six to eight such steps per tool call is
  the ceiling before the 30 s timeout — read the log back between batches.
- **Match the handoff button on the word, not the prefix.** Its label starts
  with the side — `RED מוכן — הצג את המפה` — so a driver that looks for a
  label *starting* with `מוכן` never finds it and stalls at the handoff.
- **When screenshots time out, drive by script and read the DOM.** With the
  pane hidden the page can take longer than the screenshot's 5 s to paint;
  `javascript_tool` clicks and `.sidebar li` / `.unit-card` text still work,
  and `.token-enemy` counts say what a side's map is showing.
- **The `.roster` list only exists during an activation**, not on the initiative
  panel — querying it to decide "has the app rendered?" gives a false negative
  at the start of a turn.
- **Getting into the debrief without touching the disk.** `שמור הקלטה` triggers
  a download and `טען לתחקיר` is a file input, but both drive in-page, and this
  is the only cheap way to check anything in `Debrief.tsx`: patch
  `URL.createObjectURL` to capture the Blob, click save, restore it, then push
  `await blob.text()` back through the input as a `File` via a `DataTransfer`
  (`input.files = dt.files`) and dispatch a bubbling `change` event.
- **The browser console buffer survives reloads.** Stale HMR errors from a
  mid-edit moment look alarming after a hard reload — especially after renaming
  an export, where every module that imported the old name logs a failure. Check
  what the modules *currently loaded* export before chasing one:
  `(await import('/src/engine/index.ts')).theThing`. If that answers correctly
  and the page renders, the errors are history.

Once a position is set up, a **recording is the cheap way back to it**: save
one (`שמור הקלטה`), then `replayGame()` reconstructs that exact state without
replaying the clicks. For engine-only checks, building a recording in a test is
faster than driving the UI at all.
