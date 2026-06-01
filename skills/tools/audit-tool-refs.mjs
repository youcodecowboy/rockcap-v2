#!/usr/bin/env node
// audit-tool-refs.mjs — advisory handover-readiness audit (non-blocking).
//
// Complements validate-skills.mjs. The validator is the HARD GATE (blocks
// commits that INVOKE a non-existent tool). This audit is the SOFT REPORT: it
// scans every tool-like reference in every skill and flags "dangerous"
// phantoms — names that look like a real, callable MCP tool but aren't, and
// that are NOT explicitly marked as deferred.
//
// A phantom is treated as SAFE (not counted) when its line carries a deferral
// marker (gap / planned / future / doesn't exist / not yet / deferred /
// sub-skill). That's the honest way to reference a tool that isn't built yet.
//
// Usage:  node tools/audit-tool-refs.mjs
// Exit code is always 0 (advisory). Use for handover review, not CI gating.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tools-manifest.json"), "utf8"));
const NAMES = new Set(manifest.tools.map((t) => t.name));
const DOMAINS = new Set(manifest.domains);
const SKILLS_DIR = path.join(REPO_ROOT, "skills");

// JS builtins / namespaces that look like `X.y(` but aren't tools.
const NON_TOOL_PREFIXES = new Set([
  "JSON", "Math", "Object", "Array", "Date", "Promise", "console", "process",
]);
// Markers that make a phantom reference honest (deferred, not a mistake).
const DEFERRAL_MARKER = /\bgap\b|planned|future|doesn'?t exist|not yet|deferred|sub-skill|no mcp tool/i;

const RED = "\x1b[31m", YEL = "\x1b[33m", GRN = "\x1b[32m", DIM = "\x1b[2m", RST = "\x1b[0m";

let dangerous = 0;
let deferred = 0;

const dirs = fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];

for (const d of dirs) {
  const file = path.join(SKILLS_DIR, d.name, "SKILL.md");
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const hits = [];

  lines.forEach((line, idx) => {
    // call-sites `name(` and backticked `name`
    const refs = [
      ...line.matchAll(/\b([a-zA-Z][\w]*)\.([a-zA-Z][\w]*)\s*\(/g),
      ...line.matchAll(/`([a-zA-Z][\w]*)\.([a-zA-Z][\w]*)`/g),
    ];
    for (const r of refs) {
      const dom = r[1];
      const name = `${dom}.${r[2]}`;
      if (NAMES.has(name)) continue;
      if (NON_TOOL_PREFIXES.has(dom)) continue;
      const isCall = /\(\s*$/.test(r[0]) || r[0].endsWith("(");
      // We can only be confident it's *meant* as a tool when the domain is a
      // real MCP domain, or it's written as a call-site.
      if (!DOMAINS.has(dom) && !isCall) continue;
      const safe = DEFERRAL_MARKER.test(line);
      hits.push({ name, line: idx + 1, safe });
      if (safe) deferred++; else dangerous++;
    }
  });

  if (hits.length) {
    console.log(`\n${d.name}`);
    for (const h of hits) {
      const tag = h.safe ? `${DIM}deferred${RST}` : `${RED}DANGEROUS${RST}`;
      console.log(`  ${tag}  ${h.name} ${DIM}(L${h.line})${RST}`);
    }
  }
}

console.log(
  `\n${dangerous ? RED : GRN}${dangerous} dangerous phantom(s)${RST} ` +
    `· ${DIM}${deferred} explicitly-deferred reference(s)${RST}`,
);
if (dangerous === 0) {
  console.log(`${GRN}✓ No unlabeled phantom tool references — clean for handover.${RST}`);
} else {
  console.log(`${YEL}Fix the dangerous refs (real tool, or mark deferred) before handover.${RST}`);
}
process.exit(0);
