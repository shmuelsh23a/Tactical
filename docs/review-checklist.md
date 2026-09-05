# Review checklist

What to check before this project's changes are committed, in priority order.
Written for **any** reviewer — a person, or an assistant of any make. Claude
Code's `code-reviewer` subagent works from this file rather than its own copy,
so there is one checklist and it cannot drift.

To use it with an assistant that has no subagent mechanism, ask for a review of
`git diff` against this file.

**Review, never fix.** A review that edits the code is a second author, not a
second opinion. Report findings and let the author decide.

## 0. Run the checks first

```bash
npm run check      # typecheck + the whole suite, including the invariants
```

Most of what a reviewer used to look for by eye is enforced by
[`src/invariants.test.ts`](../src/invariants.test.ts) and by the compiler. If
`npm run check` is green, spend the review on judgement rather than on rules a
machine already checked. If it is red, that is the finding.

## 1. Determinism — a blocker, every time

A game must replay bit-for-bit from its seed. Recordings, the debrief, the
what-if re-rolls and future networked play all rest on it.

- Randomness comes from the engine's seeded `Rng`, never `Math.random`, never
  drawn from the app layer. *(enforced)*
- **Watch the number of draws, not just their source.** A change that rolls for
  a different set of candidates changes the draw order, so replays of older
  recordings diverge. That is legitimate — `verifyRecording` exists for it — but
  it must be deliberate and called out.
- New rng consumers must sit inside the engine, not in a React component.

## 2. Recording and replay integrity

- Every new `RecordedAction` must be handled in `recording.ts` and in **both**
  switches in `debriefView.ts`. *(enforced by `never` guards — if you are
  editing those guards, ask why.)*
- The journal must record what the engine **adopted**, not what the caller
  passed: normalise first, then journal the normalised value.
- A unit is recorded as it stands when `addUnit` is called. Dressing it
  afterwards desyncs the recording from the live game.

## 3. What a side is allowed to know

The engine is the umpire and returns ground truth; a player must never be shown
it (rules decisions 12 and 13).

- Anything a player looks at reads `sideView()` / `contactsFor()`, not
  `game.units`. Anything that *resolves* uses the truth.
- Enemy casualties go through `casualtyReport(n, exact)`, exact only for the
  reader's own forces.
- Ask the question the disclosure bugs were made of: **which part of this line
  is the side's own business, and which part is an observation?**
  `outcomeVisibleTo` decides whether a line appears; `describeOutcome` decides
  what it may say. An observation test in the first suppresses things a side
  plainly knows.

## 4. Rules fidelity

- Does the change match the README's **Rules decisions**? Every *decision* is ✅
  as of 2026-08-16, but several carry ⚠️ riders inside them — chosen smoke
  radii, the casualty band cut-points, "armour cannot be assaulted", the
  camouflage-at-setup reading. Those are still assumptions. A change that
  quietly alters a ✅ is a blocker, not a nit.
- Data tables in `src/engine/data/` are transcribed verbatim from the rules
  document. A wrong *reading* is fixed in `src/engine/combat/`, not by editing
  the number.
- Any new number the document does not give must be recorded in the README and
  on [balance.md](balance.md), and flagged to the author.

## 5. Correctness

Logic errors, off-by-one in range bands, `undefined` paths under
`noUncheckedIndexedAccess`, wrong side attribution in intel or debrief code.

**Where this repo's real bugs have been:** a rule with two halves, each
defensible alone, applied at different layers or measured off different
geometry — the charge search vs its trigger, the sector bonus vs the arc width,
the disclosure filter vs the disclosure text. When a change touches one half,
go and read the other.

## 6. Tests

- Seed-dependent tests must pick a seed that produces the needed outcome **and
  say in a comment why that seed**.
- A rule with two halves needs a test that applies both at once and asserts the
  wrong combinations are not produced.
- A claim about a rate ("this is now findable") deserves a measured test, not a
  single-seed anecdote.

## Reporting

A one-line verdict — **SHIP** / **FIX FIRST** / **DISCUSS** — then findings
ranked by severity, each with `file:line`, why it is wrong, and a concrete fix.
If the diff is clean, say so briefly. Do not invent findings to look thorough.
