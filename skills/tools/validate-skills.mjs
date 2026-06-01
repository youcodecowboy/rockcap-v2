#!/usr/bin/env node
// validate-skills.mjs — the hard gate for skill-forge.
//
// Verifies that a SKILL.md (or every skill) only INVOKES MCP tools that
// actually exist in tools-manifest.json. The skills repo lives separately
// from the app, so this manifest (refreshed live via `meta.listTools`) is the
// only thing that knows which tools are real.
//
// Severity model — deliberately conservative so the gate stays trustworthy:
//   ERROR (exit 1):   a tool INVOCATION `domain.tool(` whose domain is real
//                     but whose full name is not in the manifest. This is the
//                     failure mode we must never let reach main — a skill that
//                     tells Claude to call a tool that doesn't exist.
//   WARN  (exit 0):   missing v2 template sections; reference links that don't
//                     resolve. Surfaced, not blocking — skeleton skills are
//                     legitimately incomplete, and prose can look like a path.
//
// Usage:
//   node tools/validate-skills.mjs               # validate every skill
//   node tools/validate-skills.mjs path/to/SKILL.md [...]
//
// Run from the skills repo root (or anywhere — paths resolve off this file).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "tools-manifest.json");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");

const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

// ── Load the manifest ────────────────────────────────────────
if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(
    `${RED}FATAL${RST} tools-manifest.json not found at ${MANIFEST_PATH}\n` +
      `       Refresh it first: ask Claude to "refresh the tool manifest" ` +
      `(calls meta.listTools).`,
  );
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const TOOL_NAMES = new Set(manifest.tools.map((t) => t.name));
const DOMAINS = new Set(manifest.domains);

// The v2-hardened SKILL.md template (skills/README.md). Missing => WARN.
const REQUIRED_SECTIONS = [
  "## Trigger",
  "## Inputs",
  "## Dedup",
  "## Outputs",
  "## High-level workflow",
  "## Tool dependencies",
  "## What goes wrong",
];

// ── Collect target files ─────────────────────────────────────
function allSkillFiles() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name, "SKILL.md"))
    .filter((p) => fs.existsSync(p));
}

const args = process.argv.slice(2).filter((a) => a !== "--all");
const targets = args.length ? args.map((a) => path.resolve(a)) : allSkillFiles();

if (targets.length === 0) {
  console.log(`${YEL}No SKILL.md files found to validate.${RST}`);
  process.exit(0);
}

// ── Validate one file ────────────────────────────────────────
function validate(file) {
  const errors = [];
  const warnings = [];
  const text = fs.readFileSync(file, "utf8");
  const skillDir = path.dirname(file);

  // (1) Tool invocations: `domain.tool(`  — the hard gate.
  // Only flag call-sites whose domain is real but full name is unknown; this
  // avoids false positives on field paths like `project.gdv` (no parens).
  const callRe = /\b([a-zA-Z][\w]*)\.([a-zA-Z][\w]*)\s*\(/g;
  const flagged = new Set();
  let m;
  while ((m = callRe.exec(text)) !== null) {
    const name = `${m[1]}.${m[2]}`;
    if (TOOL_NAMES.has(name)) continue; // real tool — fine
    if (!DOMAINS.has(m[1])) continue; // not an MCP domain — not our concern
    if (flagged.has(name)) continue;
    flagged.add(name);
    errors.push(
      `invokes \`${name}(…)\` — not a real tool. ` +
        `Closest real tools in the '${m[1]}' domain: ` +
        [...TOOL_NAMES]
          .filter((t) => t.startsWith(m[1] + "."))
          .slice(0, 6)
          .join(", "),
    );
  }

  // (2) Required sections — WARN only.
  for (const sec of REQUIRED_SECTIONS) {
    if (!text.includes(sec)) warnings.push(`missing section "${sec}"`);
  }

  // (3) Reference links to local .md files — WARN if unresolved.
  const linkRe = /\(((?:\.\.\/|references\/)[^)]+\.md)\)/g;
  while ((m = linkRe.exec(text)) !== null) {
    const rel = m[1];
    if (!fs.existsSync(path.resolve(skillDir, rel))) {
      warnings.push(`reference link does not resolve: ${rel}`);
    }
  }

  return { errors, warnings };
}

// ── Run ──────────────────────────────────────────────────────
let totalErrors = 0;
let totalWarnings = 0;

for (const file of targets) {
  const rel = path.relative(REPO_ROOT, file);
  if (!fs.existsSync(file)) {
    console.log(`${RED}✗ ${rel} — file not found${RST}`);
    totalErrors++;
    continue;
  }
  const { errors, warnings } = validate(file);
  totalErrors += errors.length;
  totalWarnings += warnings.length;

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${GRN}✓${RST} ${rel}`);
    continue;
  }
  console.log(`${errors.length ? RED + "✗" : YEL + "!"}${RST} ${rel}`);
  for (const e of errors) console.log(`    ${RED}ERROR${RST} ${e}`);
  for (const w of warnings) console.log(`    ${YEL}warn ${RST} ${DIM}${w}${RST}`);
}

console.log(
  `\n${totalErrors ? RED : GRN}${targets.length} file(s) · ` +
    `${totalErrors} error(s) · ${totalWarnings} warning(s)${RST}`,
);
if (totalErrors > 0) {
  console.log(
    `${RED}Validation failed.${RST} A skill references a tool that doesn't exist. ` +
      `Fix the tool name (see suggestions above) or refresh the manifest, then retry.`,
  );
  process.exit(1);
}
process.exit(0);
