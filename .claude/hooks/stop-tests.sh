#!/usr/bin/env bash
# Stop: refuse to end the turn with uncommitted source changes and red tests.
input=$(cat)
case "$input" in *'"stop_hook_active":true'*) exit 0 ;; esac
if git status --porcelain -- src tools 2>/dev/null | grep -q .; then
  out=$(npm test 2>&1) || {
    echo "npm test is red — fix the failures (or revert) before finishing:" >&2
    echo "$out" | tail -40 >&2
    exit 2
  }
fi
exit 0
