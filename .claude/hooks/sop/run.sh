#!/usr/bin/env bash
# Run one of the verification kit's hook scripts with whichever Python this machine has:
# `py` on Windows, `python3` on Linux and macOS (a cloud session has no `py`).
# Usage: bash run.sh <script name without .py> [arguments]   (the hook's JSON is on stdin)
# A hook that cannot be run never blocks work: every way out of here but the script's own
# is exit 0.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/$1.py"
[ -f "$script" ] || exit 0
input="$(cat)"
# The commit gate is asked about every Bash command. One that does not hold the word
# "commit" is answered here, without starting Python at all.
if [ "$1" = commit_gate ]; then
  case "$input" in *commit*) ;; *) exit 0 ;; esac
fi
shift
for py in py python3 python; do
  # on the path is not enough: on Windows `python3` can be the Store's stand-in, which
  # runs nothing and exits with an error. Take the first one that really runs.
  if command -v "$py" >/dev/null 2>&1 && "$py" -c "" >/dev/null 2>&1 </dev/null; then
    printf '%s' "$input" | "$py" "$script" "$@"
    exit $?
  fi
done
exit 0
