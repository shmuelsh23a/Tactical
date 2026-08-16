#!/usr/bin/env bash
# PostToolUse (Edit|Write): typecheck after TypeScript edits.
input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed 's/\\\\/\\/g')
case "$file" in
  *.ts|*.tsx)
    out=$(npm run typecheck 2>&1) || {
      echo "Typecheck failed after editing $file — fix before continuing:" >&2
      echo "$out" | tail -30 >&2
      exit 2
    }
    ;;
esac
exit 0
