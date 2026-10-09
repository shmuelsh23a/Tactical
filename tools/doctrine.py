#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Search the doctrine corpus in docs/Doctrine.

The corpus is a published retrieval index: 426 US Army doctrine documents
(77,597 pages) parsed to ~223,000 chunks, each carrying its designator, its
heading path and -- the part that matters for citing -- the **doctrine
paragraph numbers** it spans (para_ref_start / para_ref_end). A finding from
here is quotable as "ATP 3-21.8 (2024), para 1-9", which is how
docs/sources.md wants a figure recorded.

    # what manuals are in there
    py tools/doctrine.py --list
    py tools/doctrine.py --list 3-21

    # find a phrase, newest manuals first
    py tools/doctrine.py --find "base of fire"
    py tools/doctrine.py --find "support by fire" --doc 3-21.8 -n 5
    py tools/doctrine.py --find "actions on contact" --doc 3-21.8 --full

    # a regex, and a heading filter
    py tools/doctrine.py --find "squad.{0,20}wedge" --regex
    py tools/doctrine.py --find "breach" --heading "URBAN"

    # tables only (TOE, ranges, planning figures)
    py tools/doctrine.py --find "rate of fire" --tables

    # one chunk in full, by id
    py tools/doctrine.py --show "doctrine_current:row0219#00058"

A full scan of the corpus takes about a second, so there is no index to
build and no cache to go stale. On Windows set PYTHONUTF8=1, or the console
mangles the manuals' quotes and dashes.

**Semantic search is not wired up.** The corpus stores a voyage-context-4
embedding per chunk, but querying it needs a VOYAGE_API_KEY to embed the
query, and there is none on this machine. Everything here is literal or
regex text search. That is usually enough, because doctrine repeats its
defined terms verbatim -- but it will miss a paraphrase, so search the
*doctrine's* wording ("base of fire", "support by fire", "bounding
overwatch"), not ours ("covering fire", "leapfrogging").

**Chunk counts are not a measurement.** The manifest says so outright: this
is a retrieval index, not a unit set. "81 chunks mention X" is an artefact
of an 1,800-character chunker, not a fact about doctrine. Quote paragraphs,
never counts.
"""
import argparse
import csv
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CORPUS = os.path.join(REPO, "docs", "Doctrine", "US", "doctrine_current")

META = [
    "chunk_id", "doc_id", "seq", "designator", "title", "year", "heading_path",
    "printed_page_start", "printed_page_end", "para_ref_start", "para_ref_end",
    "page_start", "has_table",
]


def newest_release(root=CORPUS):
    """The latest dated release directory under the corpus root."""
    if not os.path.isdir(root):
        sys.exit("no corpus at " + root)
    stamps = sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))
    if not stamps:
        sys.exit("no dated release under " + root)
    return os.path.join(root, stamps[-1])


def documents(release):
    with io.open(os.path.join(release, "documents.csv"), encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def cite(r):
    """A doctrine citation: designator (year), paragraphs, printed page."""
    bits = ["%s (%s)" % (r["designator"], r["year"])]
    a = (r.get("para_ref_start") or "").strip()
    b = (r.get("para_ref_end") or "").strip()
    if a:
        bits.append("para " + a if (not b or a == b) else "paras %s–%s" % (a, b))
    p = (r.get("printed_page_start") or "").strip()
    if p:
        bits.append("p. " + p)
    elif r.get("page_start"):
        bits.append("pdf p. %s" % r["page_start"])
    if r.get("has_table"):
        bits.append("[table]")
    return " · ".join(bits)


def scan(release, match, doc=None, heading=None, tables=False, columns=None):
    """Every chunk whose text satisfies `match`, as dicts. One pass, no index."""
    import pyarrow.parquet as pq

    cols = list(dict.fromkeys((columns or META) + ["text"]))
    want_doc = [d.lower() for d in (doc or [])]
    head_re = re.compile(heading, re.I) if heading else None
    pf = pq.ParquetFile(os.path.join(release, "chunks.parquet"))
    for batch in pf.iter_batches(batch_size=4000, columns=cols):
        d = batch.to_pydict()
        for i in range(len(d["text"])):
            text = d["text"][i] or ""
            if tables and not d["has_table"][i]:
                continue
            if want_doc:
                desig = (d["designator"][i] or "").lower()
                if not any(w in desig for w in want_doc):
                    continue
            if head_re and not head_re.search(d["heading_path"][i] or ""):
                continue
            n = match(text)
            if n:
                row = dict((k, d[k][i]) for k in cols)
                row["_hits"] = n
                yield row


def main():
    ap = argparse.ArgumentParser(description="Search the US doctrine corpus.")
    ap.add_argument("--find", metavar="PHRASE", help="literal phrase (case-insensitive), or a regex with --regex")
    ap.add_argument("--regex", action="store_true", help="treat --find as a regular expression")
    ap.add_argument("--doc", action="append", metavar="DESIG", help="only this manual, by designator substring (repeatable)")
    ap.add_argument("--heading", metavar="PATTERN", help="only chunks whose heading path matches this regex")
    ap.add_argument("--tables", action="store_true", help="only chunks that contain a table")
    ap.add_argument("--list", nargs="?", const="", metavar="PATTERN", help="list documents, optionally filtered")
    ap.add_argument("--show", metavar="CHUNK_ID", help="print one chunk in full")
    ap.add_argument("--full", action="store_true", help="print each hit's whole text, not an extract")
    ap.add_argument("--chars", type=int, default=320, help="extract length around the match (default 320)")
    ap.add_argument("-n", "--limit", type=int, default=12, help="most hits to print (default 12; 0 for all)")
    ap.add_argument("--release", help="a specific dated release instead of the newest")
    args = ap.parse_args()

    release = args.release or newest_release()

    if args.list is not None:
        rows = documents(release)
        pat = args.list.lower()
        rows = [r for r in rows if pat in r["designator"].lower() or pat in r["title"].lower()]
        rows.sort(key=lambda r: r["designator"])
        for r in rows:
            print("%-18s %-5s %5spp  %s" % (r["designator"], r["year"], r["pages"] or "?", r["title"]))
        print("\n%d document(s) · %s" % (len(rows), os.path.basename(release)))
        return

    if args.show:
        found = None
        for r in scan(release, lambda t: 1, columns=META):
            if r["chunk_id"] == args.show:
                found = r
                break
        if not found:
            sys.exit("no chunk " + args.show)
        print(cite(found))
        print(found["heading_path"])
        print("(%s)\n" % found["chunk_id"])
        print(found["text"])
        return

    if not args.find:
        ap.print_help()
        return

    if args.regex:
        rx = re.compile(args.find, re.I | re.S)
        match = lambda t: len(rx.findall(t))
        show_re = rx
    else:
        needle = args.find.lower()
        match = lambda t: t.lower().count(needle)
        show_re = re.compile(re.escape(args.find), re.I)

    rows = list(scan(release, match, doc=args.doc, heading=args.heading, tables=args.tables))
    # Newest doctrine first -- a 2026 manual supersedes a 2017 one -- then by
    # how much the chunk is about the phrase, then in reading order.
    rows.sort(key=lambda r: (-int(r["year"] or 0), -r["_hits"], r["designator"], r["seq"]))

    shown = rows if args.limit == 0 else rows[: args.limit]
    for r in shown:
        print("=" * 78)
        print(cite(r))
        print(r["heading_path"] or "(no heading)")
        print("(%s)" % r["chunk_id"])
        print()
        if args.full:
            print(r["text"])
        else:
            m = show_re.search(r["text"])
            at = m.start() if m else 0
            half = max(40, args.chars // 2)
            lo = max(0, at - half)
            hi = min(len(r["text"]), at + half)
            print(("…" if lo else "") + r["text"][lo:hi].strip() + ("…" if hi < len(r["text"]) else ""))
        print()
    kinds = len(set(r["designator"] for r in rows))
    print("%d chunk(s) in %d manual(s); showed %d." % (len(rows), kinds, len(shown)))
    print("Chunk counts are a chunker artefact, not a measurement — quote paragraphs.")


if __name__ == "__main__":
    main()
