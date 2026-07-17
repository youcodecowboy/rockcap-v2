#!/usr/bin/env node
// Regenerate src/lib/skillPrompts.generated.ts from the canonical skill md
// files in ../skills/. The Convex→Next bridge routes (classify-reply-intent,
// cadence-compose, meeting-prep-respond) load their system prompts from
// these md files at runtime — which works locally but fails on Vercel,
// where ../skills/ is outside the project root and absent from the function
// bundle. The generated module is the deploy-safe fallback: routes try the
// disk read first (so local edits apply instantly) and fall back to the
// embedded copy.
//
// Run after editing any of the source md files:
//   node scripts/embed-skill-prompts.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "..");

const SOURCES = [
  { exportName: "CLASSIFY_REPLY_INTENT_PROMPT", file: "skills/sub-skills/classify-reply-intent.md" },
  { exportName: "CADENCE_FIRE_SKILL_PROMPT", file: "skills/skills/cadence-fire/SKILL.md" },
  { exportName: "MEETING_PREP_SKILL_PROMPT", file: "skills/skills/meeting-prep/SKILL.md" },
  // prospecting v3: reply-draft route system prompt (the inbound-reply composer).
  { exportName: "QUALIFY_AND_DRAFT_SKILL_PROMPT", file: "skills/skills/reply-draft/SKILL.md" },
  // prospecting v3: intel-revalidate diff pass (route reads from disk + has an
  // inline fallback, but embed it so the deployed function has a copy too).
  { exportName: "INTEL_REVALIDATE_SKILL_PROMPT", file: "skills/skills/intel-revalidate/SKILL.md" },
];

let out = `// GENERATED FILE — do not edit by hand.
// Source of truth: the md files in ../skills/ (see scripts/embed-skill-prompts.mjs).
// Regenerate after editing them: node scripts/embed-skill-prompts.mjs
//
// Why this exists: the API routes that load these prompts read the md files
// from disk at runtime, but ../skills/ is outside the Vercel project root and
// is not bundled into the deployed functions. Routes fall back to these
// embedded copies when the disk read fails.

`;

for (const { exportName, file } of SOURCES) {
  const content = readFileSync(join(repoRoot, file), "utf-8");
  out += `// From ${file}\nexport const ${exportName} = ${JSON.stringify(content)};\n\n`;
}

const target = join(appRoot, "src/lib/skillPrompts.generated.ts");
writeFileSync(target, out);
console.log(`wrote ${target} (${out.length} bytes, ${SOURCES.length} prompts)`);
