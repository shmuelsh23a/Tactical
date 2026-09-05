import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The invariants that hold this project together, enforced instead of asked for.
 *
 * Each of these was a paragraph in AGENTS.md before it was a test. Prose only
 * works on someone who read it — a different assistant, a different model, or a
 * human in a hurry gets no warning at all. A failing test explains itself at the
 * moment the rule is broken, which is the only place the explanation is useful.
 *
 * TypeScript already covers what it can: `debriefView.ts` and `recording.ts`
 * carry `never` exhaustiveness guards, so a new `RecordedAction` cannot be added
 * without deciding what each side may learn of it. What is left here is what the
 * compiler cannot see — imports, globals, and layering.
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

function code(text: string): string {
  // Comments only. Prose in this repo says "the document" constantly and means
  // the rules .docx, not the DOM, so comments have to go before any global is
  // looked for. String literals are left alone: that can only hide an offender,
  // never invent one.
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every import specifier in a file, comments stripped first. */
function imports(text: string): string[] {
  return [...code(text).matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!);
}

const engine = files.filter((f) => f.rel.startsWith("engine/"));
const app = files.filter((f) => f.rel.startsWith("app/"));

describe("the source tree is where these checks think it is", () => {
  it("finds both layers, so a bad path cannot make the rest vacuous", () => {
    expect(engine.length).toBeGreaterThan(15);
    expect(app.length).toBeGreaterThan(5);
  });
});

describe("determinism: a game replays bit-for-bit from its seed", () => {
  it("draws no randomness or wall-clock time outside the seeded Rng", () => {
    // Anything here makes a replay diverge from the live game, which is the one
    // property every other feature is built on — recordings, the debrief, the
    // what-if re-rolls, and networked play later.
    const offenders = files
      .filter((f) => /\b(Math\.random|Date\.now|performance\.now)\b/.test(code(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe("layering: the engine is a library, not part of the app", () => {
  it("keeps the engine free of React, the DOM and the symbol renderer", () => {
    // The same module has to power the browser game now and a mobile app later.
    const offenders = engine
      .filter((f) => {
        const ui = imports(f.text).some((s) => /^(react|react-dom|milsymbol)/.test(s));
        return ui || /\b(document|window|localStorage|navigator)\./.test(code(f.text));
      })
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("makes the app reach the engine only through its barrel", () => {
    // src/engine/index.ts is the published surface. Deep imports let the app
    // bind to internals that are free to move.
    const offenders = app
      .flatMap((f) => imports(f.text).map((spec) => ({ rel: f.rel, spec })))
      .filter(({ spec }) => spec.includes("engine/") && !spec.endsWith("engine/index.js"))
      .map(({ rel, spec }) => `${rel} -> ${spec}`);
    expect(offenders).toEqual([]);
  });
});

describe("module resolution: the extension has to be the one Node will look for", () => {
  it("gives every relative import a .js extension", () => {
    // TypeScript files import each other as ./thing.js. Missing it compiles
    // under some settings and fails at runtime under others.
    const offenders = files
      .flatMap((f) => imports(f.text).map((spec) => ({ rel: f.rel, spec })))
      .filter(({ spec }) => spec.startsWith("."))
      .filter(({ spec }) => !/\.(js|css|json)$/.test(spec))
      .map(({ rel, spec }) => `${rel} -> ${spec}`);
    expect(offenders).toEqual([]);
  });
});

describe("disclosure: the debrief cannot leak what a side never saw", () => {
  it("keeps both per-side filters exhaustive over every recorded action", () => {
    // The compiler enforces this through `never` guards in debriefView.ts; this
    // test is here so the guards themselves cannot be quietly deleted. If it
    // fails, read rules decision 13 before "fixing" it.
    const view = files.find((f) => f.rel === "app/debriefView.ts")!;
    expect(view.text.match(/const never: never = action/g) ?? []).toHaveLength(2);
  });
});
