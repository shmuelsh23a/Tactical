"""Dump the rules document to plain text, to check the Markdown against it.

The rules live in a .docx that nothing in this repo can read directly. The
readable copy is docs/mechanics.he.md, transcribed by hand; this script prints
the raw extraction so that copy can be verified — and re-verified whenever the
author revises the document.

Usage (from the repo root):

    python tools/dump-docx.py                     # print the extraction
    python tools/dump-docx.py -o out.txt          # write it instead
    python tools/dump-docx.py path/to/other.docx

Paragraphs come out in document order; tables as ` | `-joined rows between
`--- TABLE ---` markers. Merged cells collapse, which is why the Markdown copy
is written by hand rather than generated.

Standard library only, matching the engine's no-dependencies rule. Note that on
Windows `python3` may resolve to the Microsoft Store stub — use `python`.
"""

import argparse
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

DEFAULT_DOCX = "Tactical - Mechanics.docx"


def para_text(p):
    """All text runs of one <w:p>, concatenated."""
    return "".join(t.text or "" for t in p.iter(W + "t"))


def walk(el, out):
    """Emit paragraphs in document order; render tables as ` | `-joined rows."""
    for child in el:
        if child.tag == W + "p":
            text = para_text(child).strip()
            if text:
                out.append(text)
        elif child.tag == W + "tbl":
            out.append("--- TABLE ---")
            for tr in child.findall(W + "tr"):
                cells = [
                    " ".join(para_text(p).strip() for p in tc.iter(W + "p")).strip()
                    for tc in tr.findall(W + "tc")
                ]
                out.append(" | ".join(cells))
            out.append("--- END TABLE ---")
        else:
            walk(child, out)


def dump(docx_path):
    with zipfile.ZipFile(docx_path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    lines = []
    walk(root, lines)
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("docx", nargs="?", default=DEFAULT_DOCX)
    ap.add_argument("-o", "--out", help="write to a file instead of printing")
    args = ap.parse_args()

    docx = pathlib.Path(args.docx)
    if not docx.exists():
        sys.exit(f"no such document: {docx}")

    body = "\n".join(dump(docx))
    header = (
        f"# Raw extraction of {docx.name} by tools/dump-docx.py.\n"
        f"# The .docx is the source of truth; docs/mechanics.he.md is the readable copy.\n\n"
    )

    if args.out:
        out = pathlib.Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(header + body + "\n", encoding="utf-8")
        print(f"wrote {out} ({len(body.splitlines())} lines)")
        return

    sys.stdout.reconfigure(encoding="utf-8")
    print(header + body)


if __name__ == "__main__":
    main()
