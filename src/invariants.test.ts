import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Invariants that neither the compiler nor the linter can state.
 *
 * The three enforcement surfaces divide the work, one owner per rule:
 *
 *  - **The compiler** refuses a new `RecordedAction` that any of the four
 *    switches over it does not handle (`recording.ts`, both in `debriefView.ts`,
 *    and `describeAction`), so the disclosure rules cannot be skipped by
 *    omission.
 *  - **ESLint** (`eslint.config.js`) owns everything expressible as "this node
 *    may not appear": no `Math.random` or `Date.now` anywhere, no React, DOM,
 *    node globals or app imports inside the engine, no app import that bypasses
 *    the engine barrel. Those started life here as regexes over source text and
 *    were moved after a review found they only matched double quotes and could
 *    be blinded by a `//` inside a URL. A parser does not have those bugs.
 *  - **This file** takes what is left: a rule awkward to write as a selector,
 *    and a structural check that the compiler's own guards are still in place.
 */

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** Every TypeScript source file under `dir`, recursively. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = sources(SRC).map((path) => ({
  rel: path.slice(SRC.length + 1).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

/**
 * Source with comments stripped. A `//` preceded by `:` is left alone, so a URL
 * inside a string cannot swallow the rest of its line: over-stripping would
 * *hide* an offender, and that is the one direction this must not fail in.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

/**
 * Every import specifier in a file: `from`, bare side-effect `import "…"` and
 * dynamic `import("…")`, in quotes of any kind. Nothing here enforces a quote
 * style, so a check that only saw double quotes could be stepped around.
 */
function imports(text: string): string[] {
  const spec = /\b(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g;
  return [...code(text).matchAll(spec)].map((m) => m[1]!);
}

describe("the source tree is where these checks think it is", () => {
  it("finds the files, so a bad path cannot make the rest vacuous", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.rel === "app/debriefView.ts")).toBe(true);
  });
});

describe("module resolution: the extension has to be the one Node will look for", () => {
  it("gives every relative import a .js extension", () => {
    // TypeScript files import each other as ./thing.js — the path Node will
    // actually resolve after compilation. Omitting it compiles under some
    // settings and fails at runtime under others. Left here rather than in
    // ESLint because "a relative path that does not end in .js" is a clumsy
    // selector and a clear three lines of code.
    const offenders = files
      .flatMap((f) => imports(f.text).map((spec) => ({ rel: f.rel, spec })))
      .filter(({ spec }) => spec.startsWith("."))
      .filter(({ spec }) => !/\.(js|css|json)$/.test(spec))
      .map(({ rel, spec }) => `${rel} -> ${spec}`);
    expect(offenders).toEqual([]);
  });
});

describe("disclosure: the debrief cannot leak what a side never saw", () => {
  it("keeps every switch over a recorded action exhaustive", () => {
    // The compiler enforces this through `never` guards; this test is here so
    // the guards themselves cannot be quietly deleted — removing one turns a
    // compile error back into a silent default. If it fails, read rules
    // decision 13 before "fixing" it.
    const guardsIn = (rel: string) =>
      (files.find((f) => f.rel === rel)?.text.match(/const never: never = action/g) ?? []).length;

    expect(guardsIn("app/debriefView.ts")).toBe(2); // may it be seen / what it produced
    expect(guardsIn("app/debriefText.ts")).toBe(1); // how it is narrated
    expect(guardsIn("engine/recording.ts")).toBe(1); // how it replays
  });
});
