---
name: verification-sop
description: The standard procedure for verifying any code change, in any project, local or cloud. Use it before committing, before opening or merging a pull request, when a check fails, when asked to review, and when setting up a repository that has no verify skill, REVIEW.md or commit gate yet.
---

# Verification: the standard operating procedure

This is how the person you are working for wants every change verified. It applies in
every repository. Where the repository's own `CLAUDE.md` says something stricter, that
wins; where it is silent, this applies.

## Before you commit

1. Run the cheap checks the repository names (tests, build, linter). Fix what fails.
2. Run the change itself, end to end, with the repository's `verify` skill
   (`.claude/skills/verify/`). If there is none, say so, and offer to write one first
   (what it holds is listed under "Setting up a repository" below); a change that cannot
   be run is reported as not verified.
3. If a check still fails after three rounds of fixing, stop. Tell the person what fails,
   what you tried and what you think the cause is. Do not keep going.
4. Never make a check pass by weakening it: no skipped test, no added sleep, no retry
   loop, no loosened assertion. A flaky test is fixed at its root or deleted with a note
   saying why.
5. End the commit message with a stamp of how it was verified:
   `Verified: <what was run>` or `Verified: none - <why>`.

## Before a pull request is opened or merged

1. Have the change reviewed by the repository's `code-reviewer` agent (or a fresh-context
   reviewer where there is none), pointed at `REVIEW.md` if the repository has one. One
   reviewer; do not add more.
2. Fix what it found, then send the fixes back for another round, giving the reviewer the
   earlier findings. Repeat until a round finds nothing that matters. A review of code
   that has since changed does not count.
3. Do not change `REVIEW.md`, CI workflows, hooks or the reviewer's instructions in the
   same pull request as the code they judge.
4. In the pull request, say what was run, what it showed and what was not verified.

## When something got past the checks

Write it down as a rule where the next review will meet it: an item in `REVIEW.md` with a
trigger that can be read from a diff, the check to make, and the incident behind it. Only
for defects seen twice or costly once. When adding, look for an item to remove.

## Setting up a repository that has none of this

Offer, and on a yes do, in this order:
1. `.claude/skills/verify/SKILL.md`: how to build, start and drive THIS app end to end,
   with the exact commands, what "working" looks like, and how long it takes. Keep it
   fast. Test it by running it.
2. `REVIEW.md` at the root: what a reviewer must look at in this code, as items with a
   trigger, a check and a reason.
3. `.claude/agents/code-reviewer.md`: a read-only, fresh-context reviewer that reads
   `REVIEW.md`, checks only the items whose trigger matches the diff, and marks each
   finding Important, Nit or Pre-existing.
4. The commit gate hook, in observe mode. It comes with the verification kit
   (`install.py --repo <path>`), which also installs steps 1 to 3 as templates; without
   the kit at hand, do steps 1 to 3 and 5 and say that the gate is missing.
5. CI that runs the cheap checks on every pull request.

## About this file

It is a copy installed from the verification kit (`sop/skills/verification-sop/`). Change
the kit, then run its installer: an installed copy is overwritten.

## What to tell the person at the end

What was run and what it showed. What was not verified, stated as plainly. How many review
rounds there were and what each found.
