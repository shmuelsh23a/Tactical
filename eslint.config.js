import tsParser from "@typescript-eslint/parser";

/**
 * Lint config for this repo's **architectural rules only**.
 *
 * There is deliberately no style or code-quality layer here — no formatting, no
 * `prefer-const`, no import ordering. Turning those on across a codebase that
 * has never been linted buys a large mechanical diff and a standing argument,
 * and `strict` + `noUncheckedIndexedAccess` already carry most of the weight.
 *
 * What is here is the set of rules that used to be prose in AGENTS.md, and were
 * briefly regexes in `src/invariants.test.ts`. A review found those regexes only
 * matched double quotes and could be blinded by a `//` inside a URL, which is
 * the argument for doing it on a parsed syntax tree instead: ESLint sees an
 * import as an import, whatever quotes it wears and whatever sits beside it.
 *
 * The division of labour with `src/invariants.test.ts` is deliberate — each rule
 * has exactly one owner. Everything expressible as "this node may not appear"
 * lives here; what is left there is the `.js` extension rule (awkward as a
 * selector) and a structural check that the compiler's own guards still exist.
 */

/** Globals that have no business inside a platform-free rules engine. */
const forbiddenGlobals = [
  { name: "document", message: "The engine is DOM-free; the app layer owns the browser." },
  { name: "window", message: "The engine is DOM-free; the app layer owns the browser." },
  { name: "localStorage", message: "The engine is DOM-free; the app layer owns the browser." },
  { name: "navigator", message: "The engine is DOM-free; the app layer owns the browser." },
  { name: "process", message: "The engine ships as a standalone library — no node globals." },
  { name: "Buffer", message: "The engine ships as a standalone library — no node globals." },
  { name: "__dirname", message: "The engine ships as a standalone library — no node globals." },
];

export default [
  { ignores: ["dist/**", "node_modules/**", "tools/**"] },

  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Determinism. A game must replay bit-for-bit from its seed; anything
      // here makes a replay diverge from the live game.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Draw from the seeded Rng, or replays diverge." },
        { object: "Date", property: "now", message: "The engine has no clock; a turn is the only time there is." },
        { object: "performance", property: "now", message: "The engine has no clock; a turn is the only time there is." },
      ],
    },
  },

  {
    // The engine is a library: no React, no DOM, no node, and no reaching up
    // into the app. The dependency arrow points one way, always.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...forbiddenGlobals],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "The engine has no runtime dependencies." },
            { name: "react-dom", message: "The engine has no runtime dependencies." },
            { name: "milsymbol", message: "Symbol rendering belongs to the app layer." },
          ],
          patterns: [
            { group: ["**/app/**"], message: "The engine may not import the app. The arrow points one way." },
          ],
        },
      ],
    },
  },

  {
    // src/engine/index.ts is the engine's published surface. Deep imports bind
    // the app to internals that are free to move.
    files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Everything under engine/ except the barrel itself.
              group: ["**/engine/**", "!**/engine/index.js"],
              message: "Import from the engine barrel (../engine/index.js), not from its internals.",
            },
          ],
        },
      ],
    },
  },
];
