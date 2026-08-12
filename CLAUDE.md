# Working in this repo

A tabletop tactical wargame (משחק מלחמה לפו"ם) as a deterministic TypeScript
rules engine plus a React hotseat UI. [README.md](README.md) holds the design,
the rules decisions, and the roadmap — read it before proposing changes. This
file is the operating manual.

## Commands

```bash
npm test             # vitest, the engine suite — run before calling work done
npm run typecheck    # strict tsc over engine + app
npm run dev          # Vite dev server, the hotseat game
npm run build:engine # emit the engine as a standalone library -> dist/
```

## The rules document is the authority

`Tactical - Mechanics.docx` (Hebrew, repo root) is the source of truth for every
number in the game. Nothing here can read a .docx, so **read
[docs/mechanics.he.md](docs/mechanics.he.md) instead** — a hand-checked Markdown
transcription of the whole document, verbatim, with the tables intact. It also
maps each rules table to the code that implements it.

When the author revises the .docx, re-verify the Markdown against it:

```bash
python tools/dump-docx.py   # prints the raw extraction
```

The Markdown is written by hand and is *not* generated — merged table cells
collapse in the raw extraction, so a regenerated file would lose structure.

Never invent or "balance" a rule. When the document is silent or ambiguous:
decide, implement, and record it in the README's **Rules decisions** list —
✅ for what the author confirmed, ⚠️ for what is still an assumption. Say which
one it is in your reply, too.

## Conventions that are easy to get wrong

- **Data tables are transcribed verbatim.** `src/engine/data/` mirrors the
  document's numbers exactly. When a *reading* of the document turns out to be
  wrong, change how the value is applied in `src/engine/combat/`, not the value
  itself — see rules decision 7, where the cover modifier stayed `-0.5` and only
  its application became proportional.
- **All randomness comes from `Rng`.** No `Math.random`, no `Date.now` in the
  engine. A game must replay bit-for-bit from its seed — that is what makes
  tests, replays, and future networked play possible.
- **The engine is DOM-free.** `src/engine/` never imports React or browser APIs;
  the app layer lives only in `src/app/` and reaches the engine through the
  `src/engine/index.ts` barrel.
- **Imports carry the `.js` extension** even for TypeScript files
  (`./units.js`), throughout.
- **Features are toggleable per game**, not baked in — the pattern is a flag on
  `GameOptions` (see `enforceC2`), so a quick firefight and a full exercise run
  on the same engine.
- **`noUncheckedIndexedAccess` is on**: indexing an array yields `T | undefined`.
- **The UI is Hebrew and RTL.** User-facing strings, log lines and labels are in
  Hebrew; keep new ones consistent with the existing phrasing.

## Verifying a change in the actual game

Engine changes are covered by tests, but anything the player sees should be
driven in the browser before you call it done: start the `dev` preview, play the
demo scenario to the situation you changed, and read the combat log back.

One trap: the `Game` instance is held in a React ref, so **Vite's hot reload
will not pick up an engine change** — the old instance keeps running the old
code. Hard-reload the page to get a fresh game, or you will "verify" the
behaviour you just replaced.

## Tests

Vitest, colocated as `*.test.ts` next to the code. The interesting suites are
`src/engine/game.test.ts` (turn loop, C2) and `src/engine/combat/combat.test.ts`
(fire resolution). Tests assert against the document's numbers — if a test needs
changing, be sure the *rule* changed and not just the code.
