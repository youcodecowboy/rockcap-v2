/**
 * Backfill clientFolders for mobile-created clients that pre-date
 * commit 0b52853 (2026-04-20, "bootstrap folders + checklist for
 * mobile-created clients").
 *
 * Before 0b52853, `clients.createWithPromotion` (called from the mobile
 * new-client flow) inserted a clients row and patched the HubSpot link
 * but skipped the folder template, checklist init, and intelligence
 * init. Every mobile-created client in that window has an empty folder
 * tree and no checklist.
 *
 * This script enumerates live clients with zero rows in `clientFolders`
 * and, in apply mode, runs the shared bootstrap helper for each via
 * internal.clients.backfillClientBootstrap. The mutation re-checks
 * folder existence per client, so partial runs and re-runs are safe —
 * interrupted runs resume cleanly.
 *
 * Usage (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/backfill-client-folders.ts
 *     # dry-run — prints candidates, writes nothing
 *   npx tsx --env-file=.env.local scripts/backfill-client-folders.ts apply
 *     # execute the backfill for every candidate
 *
 * Required env:
 *   NEXT_PUBLIC_CONVEX_URL
 *   CONVEX_DEPLOY_KEY (apply mode only — generate from Convex dashboard
 *                      Settings → Deploy Keys)
 *
 * Exits with non-zero status if any apply-mode mutation throws.
 */

import { ConvexHttpClient } from "convex/browser";
import { internal } from "../convex/_generated/api";

// ---- CLI ----------------------------------------------------------------

const MODE = process.argv[2] === "apply" ? "apply" : "dry-run";

// ---- Env ----------------------------------------------------------------

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;

if (!CONVEX_URL) {
  console.error(
    "NEXT_PUBLIC_CONVEX_URL not set. Run with: npx tsx --env-file=.env.local scripts/backfill-client-folders.ts",
  );
  process.exit(1);
}
// Dry-run uses an internal query; apply mode also writes. Both paths
// require auth because the query + mutation are internal (not public).
if (!CONVEX_DEPLOY_KEY) {
  console.error(
    "CONVEX_DEPLOY_KEY not set. Generate one from the Convex dashboard (Settings → Deploy Keys) and add to .env.local.",
  );
  process.exit(1);
}

// ---- Main ---------------------------------------------------------------

(async () => {
  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(CONVEX_DEPLOY_KEY);

  console.log(`─── Backfill clientFolders · ${MODE.toUpperCase()} ───\n`);

  const candidates = await client.query(
    internal.clients.listMissingFolders,
    {},
  );

  console.log(
    `Found ${candidates.length} client(s) without any clientFolders rows.\n`,
  );

  if (candidates.length === 0) {
    console.log("Nothing to do. ✓");
    return;
  }

  // Oldest first so the legacy rows we're actually targeting surface
  // visually at the top of the report. localeCompare on ISO strings
  // sorts chronologically.
  candidates.sort((a: any, b: any) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  );

  for (const c of candidates as any[]) {
    const hsTag = c.hubspotCompanyId ? ` [hs:${c.hubspotCompanyId}]` : "";
    console.log(
      `  • ${c.name} (${c.type}/${c.status})${hsTag}  created: ${c.createdAt}`,
    );
  }
  console.log("");

  if (MODE === "dry-run") {
    console.log(
      `Dry-run. Re-run with 'apply' to bootstrap folders for all ${candidates.length} clients.`,
    );
    return;
  }

  // Apply mode — serialize calls so any failure is isolated to one
  // client; partial progress is preserved by the per-mutation idempotency
  // guard in internal.clients.backfillClientBootstrap.
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates as any[]) {
    try {
      const result = await client.mutation(
        internal.clients.backfillClientBootstrap,
        { clientId: c.clientId },
      );
      if ("bootstrapped" in result) {
        ok++;
        console.log(`  ✓ ${c.name}`);
      } else {
        skipped++;
        console.log(`  ∘ ${c.name}  (${result.skipped})`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${c.name} — ${msg.slice(0, 160)}`);
    }
  }

  console.log(
    `\nDone: ${ok} bootstrapped · ${skipped} skipped · ${failed} failed`,
  );

  if (failed > 0) process.exit(2);
})();
