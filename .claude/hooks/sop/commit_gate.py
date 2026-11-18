#!/usr/bin/env python3
"""The commit gate (verification SOP, rules 7 and 10).

A PreToolUse hook on the Bash tool. When the command runs `git commit`, it looks for a
`Verified:` line in the commit message: how the commit was verified, or "none" with a
reason. A commit with no such line was not accounted for.

Three modes, read from the environment variable SOP_GATE, else the first word of
`.claude/sop-gate` in the repository the commit goes to, else of `sop-gate` in the Claude
home folder (`~/.claude`, or CLAUDE_CONFIG_DIR); the default is `observe`:

  off      does nothing
  observe  lets every commit through and writes what it WOULD have blocked to
           `sop-gate.log` in the Claude home folder, so that false alarms can be read
           before anything is blocked
  enforce  blocks a commit whose message has no stamp (exit 2; the reason goes to
           Claude). After two blocks in a row in one session the next commit is let
           through and logged, so a session can never be stuck on the gate; the count
           starts again after that, and after any commit that carries a stamp.

It judges only what it can read. A message that will be typed in an editor, or comes from
a shell variable, a command substitution, a pipe, another commit, a file it cannot open
or a file the same command names before it commits (it may be writing it), is let through. The one substitution it reads is the usual `-m "$(cat <<'EOF' ...)"`,
whose heredoc is the message. Text that merely mentions `git commit` (an echo, a comment,
a note written to a file) is not a commit. A stamp counts where git would write it as a
line of the message: `\n` typed inside `-m "..."` is not a new line, a `--trailer` is.

It never blocks on its own failure: any error inside it lets the commit through.

Installed for a whole machine it is started with `--machine`, and then stands aside in a
project that carries its own copy (`.claude/hooks/sop/`), so one commit is judged once.

This file is installed from the verification kit (`sop/hooks/`). Change it there and run
the installer; an installed copy is overwritten. Standard library only.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
import tempfile
import time
from pathlib import Path

MODES = ("off", "observe", "enforce")
BLOCKS_ALLOWED = 2
# a line of the MESSAGE that starts with "Verified:" and says something: a letter or a
# digit somewhere after it ("Verified: `pytest` (12 passed)" yes, "Verified: -" no)
STAMP = re.compile(r"(?im)^[ \t]*Verified:[^\n]*[^\W_]")
EMPTY_STAMP = re.compile(r"(?im)^[ \t]*Verified:[^\n]*$")
TYPED_NEWLINE = re.compile(r"(?i)\\n[ \t]*Verified:")
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
MARK = "__SOP_HEREDOC_%d__"
MARK_RE = re.compile(r"__SOP_HEREDOC_(\d+)__")
STR = "__SOP_STRING_%d__"                           # stands for a `$'...'` string
STR_RE = re.compile(r"__SOP_STRING_(\d+)__")
# a heredoc operator with the mark of its body: (the delimiter's quote, the body's number)
OPERATOR = re.compile(r"<<-?[ \t]*(['\"]?)[A-Za-z_][A-Za-z0-9_]*\1 __SOP_HEREDOC_(\d+)__")
# a `-m` value that is nothing but a heredoc read by cat: the body is the message
CAT_HEREDOC = re.compile(r"^\$\(\s*cat\s*<<-?[ \t]*(['\"]?)[A-Za-z_][A-Za-z0-9_]*\1\s*\)$")
# git's own options that take a value, before the subcommand
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
                  "--super-prefix", "--config-env"}
# `git commit` options whose value must not be read as options (`--date "-2 months"`)
COMMIT_VALUE_OPTS = {"--author", "--date", "--cleanup", "--pathspec-from-file",
                     "--template"}
# the message comes from another commit: there is nothing to read here
BORROWED = {"--reuse-message", "--reedit-message", "--fixup", "--squash"}
# the shell would still expand this (a backslash before it makes it plain text)
EXPANDS = re.compile(r"(?<!\\)(?:\$[A-Za-z_{(]|`)")
# words that may stand before the command itself
BEFORE = {"env", "command", "builtin", "exec", "time", "sudo", "nohup", "nice", "!", "if", "then",
          "else", "elif", "do", "while", "until"}
SHELLS = {"bash", "sh", "zsh", "dash", "bash.exe", "sh.exe"}
# a simple command that holds none of these neither commits, moves, nor starts a shell
MATTERS = re.compile(r"git|cd|pushd|popd|c\b", re.I)
STDIN = {"-", "/dev/stdin", "/dev/fd/0"}
MOST_CD = 200                    # changes of folder followed in one command
LONGEST_WORDS = 100_000          # characters of one simple command (heredocs not counted)
LONGEST_COMMAND = 2_000_000      # characters of the whole command


# ----------------------------------------------------------------- where things live
def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def repo_root(start: Path) -> Path:
    """The nearest folder, from `start` upwards, that holds a `.git`; else `start`."""
    for d in (start, *start.parents):
        if (d / ".git").exists():
            return d
    return start


def log(line: str) -> None:
    try:
        f = Path(os.environ.get("SOP_GATE_LOG") or claude_home() / "sop-gate.log")
        f.parent.mkdir(parents=True, exist_ok=True)
        with open(f, "a", encoding="utf-8") as out:
            out.write(time.strftime("%Y-%m-%dT%H:%M:%S") + " " + line + "\n")
    except OSError:
        pass


def _word(f: Path) -> str | None:
    """The first word of a mode file, whatever wrote it. Windows PowerShell's
    `echo enforce > file` writes UTF-16 with a byte-order mark; a file that cannot be
    understood must not turn the gate off without a trace."""
    try:
        raw = f.read_bytes()
    except OSError:
        return None
    for enc in ("utf-8-sig", "utf-16"):
        try:
            text = raw.decode(enc)
        except ValueError:
            continue
        if "\x00" in text:
            continue
        words = text.split()
        if words and words[0].lower() in MODES:
            return words[0].lower()
        break
    log(f"mode-file-not-understood {f} (it must hold one of: {', '.join(MODES)})")
    return None


def mode(repo: Path) -> str:
    m = (os.environ.get("SOP_GATE") or "").strip().lower()
    if m in MODES:
        return m
    for f in (repo / ".claude" / "sop-gate", claude_home() / "sop-gate"):
        m = _word(f)
        if m:
            return m
    return "observe"


def project_has_its_own_gate(cwd: Path) -> bool:
    """Does the session's own project carry the gate, so that its hook judges and the
    machine-wide one stands aside? The project is the folder Claude Code was started in
    (CLAUDE_PROJECT_DIR): it is that folder's hooks that are loaded, whichever repository
    a commit goes to."""
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    base = Path(project) if project else repo_root(cwd)
    try:
        own = base / ".claude" / "hooks" / "sop" / "commit_gate.py"
        return own.exists() and own.resolve() != Path(__file__).resolve()
    except OSError:
        return False


# ----------------------------------------------------------------- reading the command
def _ansi(body: str) -> str:
    """What `$'...'` stands for: the one way to write a real newline inside `-m`."""
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t", "r": "\r"}.get(m.group(1),
                                                                             m.group(1)),
                  body, flags=re.S)


def _heredocs(command: str) -> tuple[str, list[str], list[str]]:
    """Read the command once as the shell would and take out what is data, not code.
    Returns (the command without it, the heredoc bodies, the `$'...'` strings).

      * a heredoc body is taken out and a mark left where it began: a note that quotes
        `git commit` is not a commit, and a message given through a heredoc is read from
        its body. `<<` inside quotes, and a here-string (`<<<`), are not heredocs;
      * a `$'...'` string is taken out whole and a mark left in its place;
      * a comment is dropped (it may hold an apostrophe, or the words `git commit`);
      * a backslash at the end of a line joins the lines.
    """
    bodies: list[str] = []
    strs: list[str] = []
    out: list[str] = []
    pending: list[str] = []          # delimiters whose bodies start at the next newline
    stack: list = []                 # "'" or '"', or the bracket depth inside a `$( )`
    i, n = 0, len(command)
    last_arith = command.rfind("))")
    while i < n:
        ch = command[i]
        top = stack[-1] if stack else None
        if ch == "\n" and pending:
            j = i + 1
            for delim in pending:
                end = re.compile(r"^[ \t]*" + re.escape(delim) + r"[ \t]*$", re.M)
                e = end.search(command, j)
                bodies.append(command[j:e.start()] if e else command[j:])
                j = e.end() if e else n
            pending = []
            out.append("\n")
            i = j
            continue
        if top == "'":
            if ch == "'":
                stack.pop()
            out.append(ch)
            i += 1
            continue
        if ch == "\\" and i + 1 < n:
            if command[i + 1] != "\n":
                out.append(command[i:i + 2])
            i += 2
            continue
        if ch == "$" and command.startswith("((", i + 1) and i < last_arith:
            j = command.find("))", i) + 2          # arithmetic: `<<` in it is a shift
            out.append(command[i:j])
            i = j
            continue
        if ch == "$" and command[i + 1:i + 2] == "(":
            stack.append(0)
            out.append("$(")
            i += 2
            continue
        if top == '"':
            if ch == '"':
                stack.pop()
            out.append(ch)
            i += 1
            continue
        # code: the top level, or the inside of a `$( )`
        if ch == "$" and command[i + 1:i + 2] == "'":
            j, buf = i + 2, []
            while j < n and command[j] != "'":
                step = 2 if (command[j] == "\\" and j + 1 < n) else 1
                buf.append(command[j:j + step])
                j += step
            out.append(STR % len(strs))
            strs.append(_ansi("".join(buf)))
            i = j + 1
            continue
        if ch in "'\"":
            stack.append(ch)
        elif ch == "#" and (i == 0 or command[i - 1] in " \t\n;&|("):
            j = command.find("\n", i)
            i = n if j == -1 else j
            continue
        elif ch == "<" and command[i - 1:i] != "<":      # not the tail of a `<<<`
            m = HEREDOC.match(command, i)
            if m:
                out.append(m.group(0) + " " + (MARK % (len(bodies) + len(pending))) + " ")
                pending.append(m.group(2))
                i = m.end()
                continue
        elif isinstance(top, int) and ch in "()":
            if ch == "(":
                stack[-1] += 1
            elif top == 0:
                stack.pop()
            else:
                stack[-1] -= 1
        out.append(ch)
        i += 1
    return "".join(out), bodies, strs


def _segments(text: str) -> list[tuple[str, str]]:
    """Split a shell line into simple commands at `;`, `&`, `|`, a newline and brackets
    that stand outside quotes and outside `$( )`. Each comes with the operator before it
    (`&&` and `||` as written). A round bracket is also given on its own, with an empty
    command, so that what a subshell changes can be undone where it ends."""
    out: list[tuple[str, str]] = []
    buf: list[str] = []
    stack: list = []
    sep, i, n = "", 0, len(text)
    last_brace = text.rfind("}")
    while i < n:
        ch = text[i]
        top = stack[-1] if stack else None
        if top == "'":
            if ch == "'":
                stack.pop()
            buf.append(ch)
        elif ch == "\\" and i + 1 < n:
            buf.append(text[i:i + 2])
            i += 1
        elif ch == "$" and text[i + 1:i + 2] == "(":
            stack.append(0)
            buf.append("$(")
            i += 1
        elif top == '"':
            if ch == '"':
                stack.pop()
            buf.append(ch)
        elif ch in "'\"":
            stack.append(ch)
            buf.append(ch)
        elif ch == "$" and text[i + 1:i + 2] == "{" and i < last_brace:
            j = text.index("}", i)
            buf.append(text[i:j + 1])              # ${NAME}: its brackets split nothing
            i = j
        elif isinstance(top, int):
            if ch == "(":
                stack[-1] += 1
            elif ch == ")":
                if top == 0:
                    stack.pop()
                else:
                    stack[-1] -= 1
            buf.append(ch)
        elif ch in ";&|\n(){}":
            if "".join(buf).strip():
                out.append((sep, "".join(buf)))
                sep = ch
            else:
                sep = ch * 2 if (sep == ch and ch in "&|") else ch
            buf = []
            if ch in "()":
                out.append((ch, ""))
        else:
            buf.append(ch)
        i += 1
    if "".join(buf).strip():
        out.append((sep, "".join(buf)))
    return out


def _argv(segment: str) -> list[str] | None:
    """The words of one simple command, without what may stand before the command
    itself (`VAR=value`, `sudo`, `if`, `!` ...). None where it cannot be read."""
    if len(segment) > LONGEST_WORDS:
        return None                               # shlex is slow on one very long word
    try:
        words = shlex.split(segment, posix=True)
    except ValueError:
        return None
    while words and (words[0] in BEFORE or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0])):
        words = words[1:]
    return words


def _strings(value: str, strs: list[str]) -> str:
    """`value` with every `$'...'` mark replaced by what it stood for."""
    return STR_RE.sub(lambda m: strs[int(m.group(1))] if int(m.group(1)) < len(strs)
                      else m.group(0), value)


def _base(word: str) -> str:
    return re.split(r"[\\/]", word)[-1].lower()


def _is_git(word: str) -> bool:
    return _base(word) in ("git", "git.exe")


def _from_git_bash(given: str) -> str:
    """Git Bash spells C:\\x as /c/x; Windows itself does not know that spelling."""
    m = re.match(r"^/([A-Za-z])/(.*)$", given)
    return f"{m.group(1)}:/{m.group(2)}" if m else given


def _path(base: Path, given: str) -> Path:
    """`given` as a path under `base`."""
    p = Path(_from_git_bash(given) if os.name == "nt" else given)
    return p if p.is_absolute() else base / p


def _literal(segment: str, value: str) -> bool:
    """Was this value written in single quotes, where the shell expands nothing?"""
    return ("'" + value + "'") in segment


class Commit:
    """One `git commit` in the command: the folder it runs in and what its message says.
    `text` is None where the message cannot be read from here."""

    def __init__(self, where: Path, text: str | None):
        self.where, self.text = where, text

    @property
    def stamped(self) -> bool | None:
        return None if self.text is None else bool(STAMP.search(self.text))


def _message(args: list[str], seg: str, sep: str, where: Path, bodies: list[str],
             strs: list[str], earlier: str = "") -> str | None:
    """The text of the commit message, or None where it cannot be read from here.
    `earlier` is what the same command does before this commit."""
    texts: list[str] = []
    state = {"given": False, "known": True, "heredoc": False}

    def written(value: str) -> str:
        return _strings(value, strs)

    def message(value: str | None) -> None:
        state["given"] = True
        if value is None:
            state["known"] = False
        elif CAT_HEREDOC.match(value.strip()):
            state["heredoc"] = True                # -m "$(cat <<'EOF' ...)": the body is it
        else:
            texts.append(written(value))
            if EXPANDS.search(STR_RE.sub("", value)) and not _literal(seg, value):
                state["known"] = False             # "$MSG", "$(printf ...)": not readable

    def file(src: str | None) -> None:
        state["given"] = True
        if src in STDIN:
            if sep == "|" or not MARK_RE.search(seg):
                state["known"] = False             # from a pipe: not readable here
            else:
                state["heredoc"] = True
        elif src is None or EXPANDS.search(src):
            state["known"] = False
        else:
            path = _path(where, written(src))
            if path.name and path.name in earlier:
                # The same command names this file before it commits (writes it, adds to
                # it, copies over it). What it holds NOW is what the last commit said, and
                # what it will hold cannot be told from here: not judged.
                state["known"] = False
                return
            try:
                texts.append(path.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                state["known"] = False             # not written yet, or not reachable

    k = 0
    while k < len(args):
        a = args[k]
        nxt = args[k + 1] if k + 1 < len(args) else None
        if a == "--":
            break
        if a.startswith("--"):
            name, eq, value = a.partition("=")
            takes = (name in ("--message", "--file", "--trailer") or name in BORROWED
                     or name in COMMIT_VALUE_OPTS)
            if takes and not eq:
                value, k = nxt, k + 1
            if name == "--message":
                message(value)
            elif name == "--file":
                file(value)
            elif name == "--trailer" and value:
                texts.append(written(value))       # git writes a trailer as its own line
            elif name in BORROWED:
                state["given"], state["known"] = True, False   # another commit's message
        elif a.startswith("-") and len(a) > 1:
            for j in range(1, len(a)):             # short options written together
                letter, rest = a[j], a[j + 1:]
                if letter in "mFCct":              # these take a value: the rest, or the next
                    if not rest:
                        rest, k = nxt, k + 1
                    if letter == "m":
                        message(rest)
                    elif letter == "F":
                        file(rest)
                    elif letter in "Cc":
                        state["given"], state["known"] = True, False
                    break
                if letter in "Su":                 # an optional value against the letter
                    break
        k += 1
    if state["heredoc"]:
        # the heredoc of this command carries the message. Under an unquoted delimiter
        # the shell still expands the body, so a body that would change is not readable
        for quote, num in OPERATOR.findall(seg):
            if int(num) < len(bodies):
                texts.append(bodies[int(num)])
                if not quote and EXPANDS.search(bodies[int(num)]):
                    state["known"] = False
    if any(STAMP.search(t) for t in texts):
        return "\n".join(texts)                    # a stamp that is there is there
    if not state["given"]:
        return None                                # it will be typed in an editor
    return "\n".join(texts) if state["known"] else None


def commits_in(command: str, cwd: Path, depth: int = 0) -> list[Commit]:
    stripped, bodies, strs = _heredocs(command)
    here, before = cwd, cwd
    pushed: list[Path] = []                        # pushd / popd
    scopes: list[tuple[Path, Path]] = []           # what a subshell changes ends with it
    earlier: list[str] = []                        # the command so far, before a commit
    moves = 0
    found: list[Commit] = []
    for sep, seg in _segments(stripped):
        if not seg:
            if sep == "(":
                scopes.append((here, before))
            elif scopes:
                here, before = scopes.pop()
            continue
        if not MATTERS.search(seg):
            earlier.append(seg)
            continue
        words = _argv(MARK_RE.sub("", seg))
        if not words:
            earlier.append(seg)
            continue
        if words[0] in ("cd", "pushd", "popd"):
            moves += 1
            if moves > MOST_CD:
                continue                           # a path that grew with every `cd`
        if words[0] in ("cd", "pushd"):
            to = [w for w in words[1:] if w == "-" or not w.startswith("-")]
            if words[0] == "pushd":
                pushed.append(here)
            if to and to[0] == "-":
                here, before = before, here
            elif to:
                here, before = _path(here, to[0]), here
            continue
        if words[0] == "popd":
            if pushed:
                here, before = pushed.pop(), here
            continue
        flag = next((k for k, w in enumerate(words[1:-1], 1)
                     if re.fullmatch(r"-[A-Za-z]*c", w)), 0)       # -c, -lc, -xc
        if _base(words[0]) in SHELLS and flag and depth < 3:
            script = words[flag + 1]               # bash -c "git commit ..."
            found += commits_in(_strings(script, strs), here, depth + 1)
            earlier.append(seg)
            continue
        if not _is_git(words[0]):
            earlier.append(seg)
            continue
        where, i = here, 1                         # git's own options, up to the subcommand
        while i < len(words) and words[i].startswith("-"):
            opt = words[i].split("=", 1)[0]
            if opt == "-C" and i + 1 < len(words):
                where = _path(where, words[i + 1])
            i += 2 if (opt in GIT_VALUE_OPTS and "=" not in words[i]) else 1
        if i < len(words) and words[i] == "commit":
            found.append(Commit(where, _message(words[i + 1:], seg, sep, where, bodies,
                                                strs, "\n".join(earlier))))
        else:
            earlier.append(seg)                    # (a commit reads its file, writes none)
    return found


# ----------------------------------------------------------------- the count of blocks
def _counter(session: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", session or "no-session")[:80]
    return Path(tempfile.gettempdir()) / f"sop-gate-{safe}.count"


def blocks_in_a_row(session: str) -> int:
    try:
        return int(_counter(session).read_text(encoding="utf-8").strip() or 0)
    except (OSError, ValueError):
        return 0


def count_block(session: str) -> bool:
    """One more block in a row. False where it cannot be recorded: a block that cannot
    be counted could repeat for ever, so the caller then lets the commit through."""
    try:
        _counter(session).write_text(str(blocks_in_a_row(session) + 1), encoding="utf-8")
        return True
    except OSError:
        return False


def start_again(session: str) -> None:
    try:
        _counter(session).unlink()
    except OSError:
        pass


# ----------------------------------------------------------------- the decision
def decide(event: dict, machine: bool = False) -> tuple[int, str]:
    """(exit code, what to tell Claude). 0 lets the command through; 2 blocks it."""
    if event.get("tool_name") != "Bash":
        return 0, ""
    command = str((event.get("tool_input") or {}).get("command") or "")
    if "commit" not in command:
        return 0, ""
    if len(command) > LONGEST_COMMAND:
        log(f"too-long-to-read ({len(command)} characters): let through unjudged")
        return 0, ""
    cwd = Path(str(event.get("cwd") or os.getcwd()))
    if machine and project_has_its_own_gate(cwd):
        return 0, ""
    found = commits_in(command, cwd)
    session = str(event.get("session_id") or "")
    bare = [c for c in found if c.stamped is False]
    if not bare:
        if any(c.stamped for c in found):
            start_again(session)                   # a commit that carries its stamp
        return 0, ""
    hows = [mode(repo_root(c.where)) for c in bare]
    if "enforce" not in hows and "observe" not in hows:
        return 0, ""
    where = repo_root(bare[hows.index("enforce") if "enforce" in hows else 0].where)
    what = " ".join(command.split())[:120]
    if "enforce" not in hows:
        log(f"observe would-block repo={where} session={session[:12]} :: {what}")
        return 0, ""
    if blocks_in_a_row(session) >= BLOCKS_ALLOWED:
        start_again(session)
        log(f"enforce let-through-after-{BLOCKS_ALLOWED} repo={where} "
            f"session={session[:12]} :: {what}")
        return 0, ""
    if not count_block(session):
        log(f"enforce let-through-uncounted repo={where} session={session[:12]} :: {what}")
        return 0, ""
    log(f"enforce blocked repo={where} session={session[:12]} :: {what}")
    if any(TYPED_NEWLINE.search(c.text or "") for c in bare):
        return 2, ("This commit's message holds `Verified:` after a `\\n` typed inside "
                   "-m \"...\", which is not a new line: git would not write the stamp as "
                   "a line of its own. Give the line with a second -m, or write the "
                   "message through a heredoc, and commit again.")
    if any(EMPTY_STAMP.search(c.text or "") for c in bare):
        return 2, ("This commit's `Verified:` line says nothing. Say what was run, such as "
                   "`Verified: suite, smokes, review round 2`, or `Verified: none - <why>`, "
                   "and commit again.")
    return 2, ("This commit says nothing about how it was verified. End the commit message "
               "with a line such as `Verified: suite, smokes, review round 2`, or "
               "`Verified: none - <why>` if it was not verified, and commit again.")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    try:
        raw = sys.stdin.buffer.read().decode("utf-8", "replace")     # never the locale's
        event = json.loads(raw or "{}")
        code, reason = decide(event if isinstance(event, dict) else {},
                              machine="--machine" in argv)
    except Exception:  # noqa: BLE001 - a gate that breaks must never block work
        return 0
    if reason:
        print(reason, file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main())
