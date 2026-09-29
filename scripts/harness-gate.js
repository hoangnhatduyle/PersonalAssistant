#!/usr/bin/env node
/**
 * Harness gate (pilot: SPEC-CORE-008 only).
 *
 * Regression gate, not a completeness gate: for every spec marked
 * `status: active` in .claude/specifications/*.yaml, find every real test
 * file that already declares it traces to that spec (via the existing
 * `// Traces: SPEC-ID ...` comment convention used across this repo) and
 * require those files to pass. It does NOT require every AC/NC in the spec
 * to have a test yet — that's a separate, larger coverage effort. It exists
 * so that behavior someone already linked to a spec can't silently regress.
 *
 * Independent of harness_engineering's MCP tools on purpose: those take
 * self-reported pass/fail from whichever agent calls them, with no
 * filesystem or test-runner verification. This script actually runs the
 * tests.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SPEC_DIR = path.join(REPO_ROOT, ".claude", "specifications");

function activeSpecIds() {
  return fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .filter((f) => {
      const text = fs.readFileSync(path.join(SPEC_DIR, f), "utf8");
      return /^status:\s*active\s*$/m.test(text);
    })
    .map((f) => f.replace(/\.yaml$/, ""));
}

function tracedFilesFor(specId) {
  // grep exits 1 with no output when nothing matches; that's a valid "zero files" result.
  let out = "";
  try {
    out = execSync(
      `grep -rl --include="*.test.ts" --exclude-dir=node_modules -e "Traces:.*${specId}" .`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
  return out.split("\n").filter(Boolean);
}

function main() {
  const specs = activeSpecIds();
  if (specs.length === 0) {
    console.log("[harness-gate] no active specs — nothing to check.");
    return;
  }

  let allFiles = [];
  const problems = [];

  for (const specId of specs) {
    const files = tracedFilesFor(specId);
    if (files.length === 0) {
      problems.push(`${specId} is status:active but zero test files trace to it (grep for "Traces:.*${specId}" found nothing). An active spec with no linked tests can't be regression-gated — fix the linkage or move it back to draft.`);
      continue;
    }
    console.log(`[harness-gate] ${specId}: ${files.length} linked test file(s) — ${files.join(", ")}`);
    allFiles.push(...files);
  }

  if (problems.length > 0) {
    console.error("\n[harness-gate] BLOCKED:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }

  allFiles = [...new Set(allFiles)];
  console.log(`\n[harness-gate] running ${allFiles.length} linked test file(s) via vitest...`);

  try {
    execSync(`npx vitest run ${allFiles.map((f) => JSON.stringify(f)).join(" ")}`, {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  } catch (err) {
    console.error(
      "\n[harness-gate] BLOCKED: a test linked to an active spec failed. " +
        "This means a commit would regress behavior already declared spec-compliant. Fix the test or the code before committing.",
    );
    process.exit(1);
  }

  console.log("[harness-gate] all active-spec-linked tests pass. Commit allowed.");
}

main();
