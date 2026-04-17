/**
 * Back-link script — one-shot.
 * Reads scripts/backlink-matches.json and writes companies.promotedToClientId
 * for each entry where the client name matches.
 *
 * Idempotent: safe to re-run. Skips entries already linked to the same client.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/backlink-clients.ts [--dry]
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRY = process.argv.includes('--dry');
const MATCHES_PATH = join(__dirname, 'backlink-matches.json');

type Match = { hubspotCompanyId: string; clientName: string; reason: string };

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error('NEXT_PUBLIC_CONVEX_URL not set');
  process.exit(1);
}

async function main() {
  const matches = JSON.parse(readFileSync(MATCHES_PATH, 'utf-8')) as Match[];
  console.log(`\nBack-link script — ${matches.length} matches${DRY ? ' (DRY RUN)' : ''}\n`);

  const convex = new ConvexHttpClient(CONVEX_URL!);
  const results = { linked: 0, alreadyLinked: 0, withMultipleMatches: 0, skipped: 0, errors: 0 };

  for (const match of matches) {
    const tag = `[${match.reason}]`;
    const label = `${match.clientName} → HS ${match.hubspotCompanyId}`;

    if (DRY) {
      console.log(`DRY  ${label}  ${tag}`);
      continue;
    }

    try {
      const result = (await convex.mutation(api.hubspotSync.backlink.backlinkCompanyToClient, {
        hubspotCompanyId: match.hubspotCompanyId,
        clientName: match.clientName,
      })) as {
        linked: boolean;
        clientId?: string;
        alreadyLinked?: boolean;
        multipleMatches?: boolean;
        reason?: string;
      };

      if (result.linked) {
        if (result.alreadyLinked) {
          console.log(`SKIP ${label}  ${tag}  (already linked${result.multipleMatches ? ', multi-match' : ''})`);
          results.alreadyLinked++;
        } else {
          const suffix = result.multipleMatches ? ' [multi-match — oldest picked]' : '';
          console.log(`OK   ${label}  ${tag}  → ${result.clientId}${suffix}`);
          results.linked++;
        }
        if (result.multipleMatches) results.withMultipleMatches++;
      } else {
        console.log(`WARN ${label}  ${tag}  → ${result.reason}`);
        results.skipped++;
      }
    } catch (err) {
      console.log(`FAIL ${label}  ${tag}  → ${(err as Error).message}`);
      results.errors++;
    }
  }

  console.log('\nSummary:');
  console.log(`  linked:              ${results.linked}`);
  console.log(`  alreadyLinked:       ${results.alreadyLinked}`);
  console.log(`  withMultipleMatches: ${results.withMultipleMatches}`);
  console.log(`  skipped:             ${results.skipped}`);
  console.log(`  errors:              ${results.errors}`);
  console.log(`  total:               ${matches.length}`);
}

main().catch((e) => {
  console.error('\n✗ Back-link script failed:', e);
  process.exit(1);
});
