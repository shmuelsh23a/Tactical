/**
 * Read `.env` at the repo root into `process.env`, without a dependency
 * and without overwriting anything already set in the shell.
 *
 * The Node tools read `process.env` directly, so a key sitting in a
 * gitignored `.env` was invisible to them: on 2026-10-11 all three keys
 * were present and `jev-sim --jev` would still have refused, which looks
 * like a missing key and is not. The Python side (`tools/doctrine.py`)
 * has had this since the corpus arrived; this is its counterpart.
 *
 * Values are never logged. Import it for the side effect, first thing:
 *
 *     import "./env.js";
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const at = text.indexOf("=");
    if (at <= 0) continue;
    const key = text.slice(0, at).trim();
    const value = text.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value && process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No .env, or it cannot be read: the shell's own environment stands.
}
