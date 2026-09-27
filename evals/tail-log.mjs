#!/usr/bin/env node
// Strips ANSI colour codes from a run log and prints the tail, so eval output
// is readable when piped through a shell that mangles escape sequences.
//   node evals/tail-log.mjs /tmp/eval.log [lines]
import { readFileSync } from "node:fs";

const [file, lines = "60"] = process.argv.slice(2);
const text = readFileSync(file, "utf8")
  // eslint-disable-next-line no-control-regex
  .replace(/\u001b\[[0-9;]*m/g, "")
  .replace(/\u0000/g, "");
console.log(text.split("\n").slice(-Number(lines)).join("\n"));
