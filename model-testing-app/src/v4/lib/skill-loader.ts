// =============================================================================
// V4 SKILL LOADER
// =============================================================================
// Loads SKILL.md files following Anthropic's progressive disclosure pattern:
// Level 1: Metadata (name + description from YAML frontmatter) — always loaded
// Level 2: Instructions (SKILL.md body) — loaded when skill is triggered
// Level 3: References — loaded on demand from the shared Reference Library

import type { SkillMetadata, SkillDefinition } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// SKILL REGISTRY
// =============================================================================

// Use process.cwd() since __dirname in Next.js points to the build output, not source
const SKILLS_DIR = path.join(process.cwd(), 'src', 'v4', 'skills');

/** Cache of loaded skill definitions */
const _skillCache = new Map<string, SkillDefinition>();

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Expects format:
 * ---
 * name: skill-name
 * description: What it does
 * ---
 */
function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter (--- ... ---)');
  }

  const yamlContent = match[1];
  const body = match[2].trim();

  // Simple YAML parsing (name and description only)
  const metadata: SkillMetadata = { name: '', description: '' };

  for (const line of yamlContent.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) metadata.name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) metadata.description = descMatch[1].trim();
  }

  if (!metadata.name || !metadata.description) {
    throw new Error('SKILL.md frontmatter must include both "name" and "description"');
  }

  return { metadata, body };
}

/**
 * Load a skill definition from disk.
 * Returns the skill with metadata and instructions loaded.
 */
export function loadSkill(skillName: string): SkillDefinition {
  // Check cache
  const cached = _skillCache.get(skillName);
  if (cached) return cached;

  const skillPath = path.join(SKILLS_DIR, skillName);
  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`Skill "${skillName}" not found at ${skillMdPath}`);
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  const skill: SkillDefinition = {
    metadata,
    skillPath,
    instructions: body,
    // References come from the shared Reference Library, not per-skill
  };

  _skillCache.set(skillName, skill);
  return skill;
}

/**
 * Get metadata for all available skills (Level 1 — always loaded).
 * This is lightweight and can be included in system prompts.
 */
export function getAllSkillMetadata(): SkillMetadata[] {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];

    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    return skillDirs.map(name => {
      try {
        const skill = loadSkill(name);
        return skill.metadata;
      } catch {
        return null;
      }
    }).filter((m): m is SkillMetadata => m !== null);
  } catch {
    return [];
  }
}

/**
 * Clear the skill cache (e.g., after skill files are updated).
 */
export function clearSkillCache(): void {
  _skillCache.clear();
}
