See [AGENTS.md](AGENTS.md).

That file is the operating manual for this repo and is deliberately
vendor-neutral, so every assistant works from the same instructions. Claude Code
reads this file, so this is the pointer; everything else lives there.

The block below is installed and refreshed by the author's verification kit
(`install.py`); edit the kit, not the block. AGENTS.md states the procedure for
every assistant, adapted: "commit" where the block says "pull request" (work
here goes onto `main` by commit). Where the two differ, the stricter one holds.

<!-- sop:begin -->
## Verification (standard operating procedure)

Every change is verified this way, in every project. The full text is the
`verification-sop` skill; a repository's own rules win where they are stricter.

- Verify by RUNNING the change end to end (the repo's `verify` skill), not by tests alone.
  No `verify` skill in the repo: say so and offer to write one first.
- Run the cheap checks (tests, build, linter) before opening a pull request.
- A check still failing after three rounds of fixing: stop and bring the person in.
- One reviewer (`code-reviewer`, guided by `REVIEW.md`), several rounds. After fixing what
  a review found, send the fixes back. Never merge code changed after its last review.
- A change never edits the checks that judge it (`REVIEW.md`, CI, hooks, the reviewer's
  instructions): that is a separate pull request, merged first.
- End every commit message with `Verified: <what was run>` or `Verified: none - <why>`.
- Never make a check pass by weakening it. A flaky test is fixed or deleted with a note.
- A defect that got past the checks becomes a `REVIEW.md` item (trigger, check, incident).
- Report what was run, what it showed, and what was NOT verified.
<!-- sop:end -->
