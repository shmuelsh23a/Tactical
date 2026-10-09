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

Two ways to search, and they answer different questions:

- **Text search** (the default) is literal or regex. Use it when you know
  doctrine's own term -- "base of fire", "bounding overwatch" -- because
  doctrine repeats its defined terms verbatim and an exact hit is proof.
  It will miss a paraphrase: "covering fire" finds nothing.
- **`--semantic`** ranks by meaning, using the corpus's stored
  voyage-context-4 vectors. Use it when you have our words and not
  doctrine's, or a question rather than a term:

      py tools/doctrine.py --semantic --find "when does a squad stop firing and move"

  It needs a VOYAGE_API_KEY (in `.env` at the repo root; `.env.example`
  shows the name) to embed the query with the same model that embedded the
  chunks. The first run builds a cached vector matrix beside the index,
  about 15 seconds; after that a query is roughly a second plus the API
  call. Scores are cosine, printed before the citation.

  **It ranks loosely, and that is structural.** The index's vectors are
  *contextualized*: each chunk was embedded in a group with its neighbours,
  so re-embedding a chunk's own embed_text alone scores about 0.73 against
  its stored vector, not 1.0. Query vectors sit in a different part of the
  space again, so scores compress into roughly 0.3-0.55 and the order is
  only approximate -- a near-verbatim query put its own target third, under
  two chunks that were merely adjacent in subject. So use --semantic to
  find out what doctrine *calls* a thing, then prove it with a text search
  and quote that. Do not embed queries as documents to "fix" the scores:
  measured, that is worse (0.67).

**Chunk counts are not a measurement.** The manifest says so outright: this
is a retrieval index, not a unit set. "81 chunks mention X" is an artefact
of an 1,800-character chunker, not a fact about doctrine. Quote paragraphs,
never counts.
"""
import argparse
import csv
import io
import json
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


# ---------------------------------------------------------------- semantic

#: The corpus's own model. A query must be embedded by the *same* model that
#: embedded the chunks, or the vectors are not comparable at all.
MODEL = "voyage-context-4"
VOYAGE_URL = "https://api.voyageai.com/v1/contextualizedembeddings"


def load_env(repo=REPO):
    """
    Read `.env` into os.environ without a dependency, and without
    overwriting anything already set in the shell. Values are not logged:
    the file is gitignored and stays unprinted.
    """
    path = os.path.join(repo, ".env")
    if not os.path.exists(path):
        return
    with io.open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v


def embed_query(text, model=MODEL, dim=1024):
    """
    One query vector from Voyage. `input_type="query"` matters: it is what
    the corpus's manifest records as the query side of the same embedding,
    and it makes Voyage prepend its retrieval prompt.
    """
    import urllib.error
    import urllib.request

    key = os.environ.get("VOYAGE_API_KEY")
    if not key:
        sys.exit(
            "No VOYAGE_API_KEY. Put it in .env at the repo root -- copy "
            ".env.example to .env and fill in the value -- or set it in the "
            "shell. Without it, drop --semantic and search text instead."
        )
    body = json.dumps({
        "inputs": [[text]],
        "model": model,
        "input_type": "query",
        "output_dimension": dim,
        "output_dtype": "float",
    }).encode("utf-8")
    req = urllib.request.Request(
        VOYAGE_URL, data=body,
        headers={"Authorization": "Bearer " + key, "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        sys.exit("Voyage refused the query (HTTP %s): %s" % (e.code, detail))
    except urllib.error.URLError as e:
        sys.exit("Could not reach Voyage: %s" % e.reason)
    # data[i].data[j].embedding -- one input, one chunk in it.
    return payload["data"][0]["data"][0]["embedding"]


def vectors(release, rebuild=False):
    """
    Every chunk vector as one (N, 1024) matrix, L2-normalised, with the
    chunk ids in the same order.

    Pulling them out of the parquet takes about ten seconds, so the matrix
    is cached beside it as .npy and memory-mapped after that. It is kept in
    float16, as the index stores it -- 457 MB rather than the 913 MB
    float32 would cost -- and scored in blocks, so neither the cache nor a
    query has to be held in memory whole. The cache is gitignored, like the
    index it comes from.
    """
    import numpy as np
    import pyarrow.parquet as pq

    mat_p = os.path.join(release, "vectors.f16.npy")
    ids_p = os.path.join(release, "vectors.ids.json")
    if not rebuild and os.path.exists(mat_p) and os.path.exists(ids_p):
        with io.open(ids_p, encoding="utf-8") as fh:
            return np.load(mat_p, mmap_mode="r"), json.load(fh)

    sys.stderr.write("building the vector cache (once, ~15s)\n")
    pf = pq.ParquetFile(os.path.join(release, "chunks.parquet"))
    blocks, ids = [], []
    for batch in pf.iter_batches(batch_size=8000, columns=["chunk_id", "embedding"]):
        col = batch.column("embedding")
        a = col.flatten().to_numpy(zero_copy_only=False).reshape(len(col), -1).astype(np.float32)
        blocks.append(a)
        ids.extend(batch.column("chunk_id").to_pylist())
    mat = np.concatenate(blocks)
    mat /= np.clip(np.linalg.norm(mat, axis=1, keepdims=True), 1e-12, None)
    mat = mat.astype(np.float16)
    np.save(mat_p, mat)
    with io.open(ids_p, "w", encoding="utf-8") as fh:
        json.dump(ids, fh)
    return mat, ids


def semantic(release, query, limit, doc=None, heading=None, tables=False, rebuild=False):
    """The `limit` chunks nearest the query, each with its score."""
    import numpy as np

    q = np.asarray(embed_query(query), dtype=np.float32)
    q /= max(float(np.linalg.norm(q)), 1e-12)
    mat, ids = vectors(release, rebuild=rebuild)
    # Blocked, so a 457 MB float16 memmap never becomes a float32 temporary
    # of twice the size just to be multiplied by one vector.
    sims = np.empty(mat.shape[0], dtype=np.float32)
    step = 32768
    for i in range(0, mat.shape[0], step):
        block = np.asarray(mat[i:i + step], dtype=np.float32)
        sims[i:i + block.shape[0]] = block @ q
    # Over-fetch, because the filters below are applied after scoring.
    take = min(len(sims), max(limit * 40, 400) if (doc or heading or tables) else limit)
    top = np.argpartition(-sims, take - 1)[:take]
    top = top[np.argsort(-sims[top])]
    want = dict((ids[i], float(sims[i])) for i in top)

    rows = []
    for r in scan(release, lambda t: 1, doc=doc, heading=heading, tables=tables):
        sc = want.get(r["chunk_id"])
        if sc is not None:
            r["_score"] = sc
            rows.append(r)
    rows.sort(key=lambda r: -r["_score"])
    return rows[:limit]


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
    ap.add_argument("--semantic", action="store_true",
                    help="rank by meaning, not wording (needs VOYAGE_API_KEY in .env)")
    ap.add_argument("--rebuild-vectors", action="store_true",
                    help="rebuild the cached vector matrix --semantic uses")
    args = ap.parse_args()

    load_env()
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

    if args.semantic:
        # Ranked by meaning, so the order is the scores' and nothing else:
        # re-sorting by year here would throw away what was asked for.
        show_re = re.compile(re.escape(args.find), re.I)
        shown = semantic(release, args.find, max(1, args.limit or 12),
                         doc=args.doc, heading=args.heading, tables=args.tables,
                         rebuild=args.rebuild_vectors)
        rows = shown
    else:
        if args.regex:
            rx = re.compile(args.find, re.I | re.S)
            match = lambda t: len(rx.findall(t))
            show_re = rx
        else:
            needle = args.find.lower()
            match = lambda t: t.lower().count(needle)
            show_re = re.compile(re.escape(args.find), re.I)

        rows = list(scan(release, match, doc=args.doc, heading=args.heading, tables=args.tables))
        # Newest doctrine first -- a 2026 manual supersedes a 2017 one -- then
        # by how much the chunk is about the phrase, then in reading order.
        rows.sort(key=lambda r: (-int(r["year"] or 0), -r["_hits"], r["designator"], r["seq"]))
        shown = rows if args.limit == 0 else rows[: args.limit]
    for r in shown:
        print("=" * 78)
        print((("%.3f  " % r["_score"]) if "_score" in r else "") + cite(r))
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
    kinds = len(set(r["designator"] for r in shown))
    if args.semantic:
        print("%d chunk(s) nearest the query, in %d manual(s)." % (len(shown), kinds))
    else:
        print("%d chunk(s) in %d manual(s); showed %d."
              % (len(rows), len(set(r["designator"] for r in rows)), len(shown)))
    print("Chunk counts are a chunker artefact, not a measurement — quote paragraphs.")


if __name__ == "__main__":
    main()
