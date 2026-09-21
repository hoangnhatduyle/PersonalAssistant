import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Library is private to the user: the AI assistant, voice, search,
 * briefing, personalization and feedback layers must not see it (yet).
 * This turns "assistant can't see it" into a failing test if anyone wires
 * it in. When that becomes intentional, relax exactly the paths named here.
 */
const ISOLATED_PATHS = [
  "src/app/api/search",
  "src/app/api/intelligence",
  "src/app/api/briefing",
  "src/lib/voice",
  "src/lib/knowledge",
  "src/lib/personalization",
  "src/app/api/feedback",
];

const ROOT = path.resolve(__dirname, "../../../..");
const FORBIDDEN = [/library_/i, /\/library/i];

function sourceFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("Library isolation", () => {
  for (const relative of ISOLATED_PATHS) {
    it(`${relative} never references Library`, () => {
      const offenders = sourceFiles(path.join(ROOT, relative)).filter((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN.some((pattern) => pattern.test(source));
      });
      expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
    });
  }

  it("actually scans files (guards against a silently empty path list)", () => {
    const scanned = ISOLATED_PATHS.flatMap((relative) => sourceFiles(path.join(ROOT, relative)));
    expect(scanned.length).toBeGreaterThan(10);
  });
});
