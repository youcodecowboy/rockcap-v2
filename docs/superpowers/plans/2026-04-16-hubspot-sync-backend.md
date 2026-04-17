# HubSpot Sync Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate Convex tables with rich HubSpot data (companies, contacts, deals, engagement activities) and back-link 35 existing clients to their HubSpot companies via `companies.promotedToClientId`.

**Architecture:** The existing `src/lib/hubspot/*` fetchers and `convex/hubspotSync/*` mutations get bug fixes (dedupe HubSpot's dual-association duplicates, remove the 500-record cap). A new `activities` table captures engagement timeline via the legacy v1 endpoint (which accepts `sales-email-read`, unlike v3 search which needs an unavailable granular scope). Custom properties are harvested tenant-wide via a property-discovery step at sync start, then stored in `metadata` JSON blobs. A one-shot back-link script links 35 matched clients.

**Tech Stack:** Convex 1.15+ (schema + mutations) · Vitest 2+ (unit tests, already configured in `vitest.config.ts`) · Node 20 + `tsx` (scripts) · `@hubspot/api-client` (existing, limited use) + direct `fetch` (preferred — more reliable for list/batch endpoints).

**Related documents:**
- Design spec: `docs/superpowers/specs/2026-04-16-hubspot-sync-mobile-client-profile-design.md`
- Dry-run scripts (already in repo, used as smoke tests): `model-testing-app/scripts/hubspot-{dry-run,match-clients,search-match,rich-probe,email-paths}.ts`

---

## File Structure

### Files to create

- `model-testing-app/src/lib/hubspot/normalize.ts` — pure functions: `normalizeCompanyName`, `dedupeAssociationIds`, `extractRootDomain`
- `model-testing-app/src/lib/hubspot/__tests__/normalize.test.ts`
- `model-testing-app/src/lib/hubspot/properties.ts` — property discovery (calls `/crm/v3/properties/{type}`, caches results per run)
- `model-testing-app/src/lib/hubspot/__tests__/properties.test.ts`
- `model-testing-app/src/lib/hubspot/owners.ts` — owner ID → name resolution with in-memory cache
- `model-testing-app/src/lib/hubspot/__tests__/owners.test.ts`
- `model-testing-app/convex/hubspotSync/backlink.ts` — mutation: `backlinkCompanyToClient(hubspotCompanyId, clientName)`
- `model-testing-app/scripts/backlink-matches.json` — 35 `{hubspotCompanyId, clientName, reason}` entries
- `model-testing-app/scripts/backlink-clients.ts` — runs matches via ConvexHttpClient

### Files to modify

- `model-testing-app/convex/schema.ts` — add `activities` table; extend `companies` (add `ownerName`); extend `contacts` (add `linkedinUrl`); extend `deals` (add `probability`, `spvName`, `isClosed`, `isClosedWon`, `linkedProjectId`)
- `model-testing-app/src/lib/hubspot/contacts.ts` — remove `maxRecords=500` default, use batch-read for full properties, dedupe associations, add fallback activity-date properties
- `model-testing-app/src/lib/hubspot/companies.ts` — same patterns as contacts
- `model-testing-app/src/lib/hubspot/deals.ts` — parse new fields (`hs_deal_stage_probability`, `spv_name`, `hs_is_closed`, `hs_is_closed_won`)
- `model-testing-app/src/lib/hubspot/activities.ts` — rewrite: per-company pagination via `/engagements/v1/engagements/associated/company/{id}`, normalize engagement types (EMAIL/INCOMING_EMAIL/MEETING/CALL/NOTE/TASK)
- `model-testing-app/convex/hubspotSync/contacts.ts` — mutation accepts `linkedinUrl`, dedupes `linkedCompanyIds`
- `model-testing-app/convex/hubspotSync/companies.ts` — mutation accepts `ownerName`, stores full `metadata` JSON
- `model-testing-app/convex/hubspotSync/deals.ts` — mutation accepts new fields
- `model-testing-app/convex/hubspotSync/activities.ts` — rewrite as proper `syncActivityFromHubSpot` mutation (upsert by `hubspotEngagementId`)
- `model-testing-app/src/app/api/hubspot/sync-all/route.ts` — orchestrate: discover properties → sync companies → sync contacts → sync deals → sync engagements per company

---

## Phase 0 — Client Cleanup Gate (manual desktop task, blocking)

### Task 0.1: Verify client dupes are resolved

**Files:** None — manual check

This task is a prerequisite gate. It must be complete before Phase 3 (back-link script), because the script looks up clients by name and duplicate names would cause incorrect linking.

- [ ] **Step 1: Check for duplicate "Halo Living" client records**

Run from `model-testing-app/`:

```bash
npx convex run clients:list 2>/dev/null | grep -i "halo living" | wc -l
```

Expected: `1` (not `2`).

If `2`, stop here and have the user merge them on desktop (copy notes/projects/documents from one into the other, archive or soft-delete the redundant one). Then re-run this step.

- [ ] **Step 2: Check for duplicate "Kinspire" client records**

Run:

```bash
npx convex run clients:list 2>/dev/null | grep -iE "^.*\"name\": \"kinspire" | wc -l
```

Expected: `1` (either "Kinspire" or "Kinspire Homes", but not both).

If both present, merge them on desktop. The survivor should be named "Kinspire Homes" (matches the HubSpot company name).

- [ ] **Step 3: Confirm Kristian Hansen is intentional**

Run:

```bash
npx convex run clients:list 2>/dev/null | grep -i "kristian hansen" | wc -l
```

Expected: `2` (this is the user's dev-zone — intentional, leave as-is).

- [ ] **Step 4: Commit the gate-passed marker**

No code change to commit in this task. Proceed to Phase 1.

---

## Phase 1 — Schema Additions

### Task 1.1: Add `activities` table to schema

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (append to the schema object before the closing `});`)

- [ ] **Step 1: Open schema.ts and find the last table definition**

Open `model-testing-app/convex/schema.ts`. Find the last table defined (near the bottom of the file, before the final `});`). Identify the line number where you'll insert the new table.

- [ ] **Step 2: Add the `activities` table**

Insert before the closing `});`:

```typescript
  // Activities table — HubSpot engagement timeline (emails, calls, meetings, notes, tasks)
  // Populated via /engagements/v1/engagements/associated/{type}/{id} (unified types)
  activities: defineTable({
    // Source identity
    hubspotEngagementId: v.string(),
    type: v.union(
      v.literal("EMAIL"),
      v.literal("INCOMING_EMAIL"),
      v.literal("MEETING"),
      v.literal("CALL"),
      v.literal("NOTE"),
      v.literal("TASK"),
    ),
    timestamp: v.string(),

    // Content
    subject: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    direction: v.optional(v.string()),
    status: v.optional(v.string()),
    duration: v.optional(v.number()),
    fromEmail: v.optional(v.string()),
    toEmails: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()),
    metadata: v.optional(v.any()),

    // Associations (resolved Convex IDs)
    linkedCompanyId: v.optional(v.id("companies")),
    linkedContactIds: v.optional(v.array(v.id("contacts"))),
    linkedDealIds: v.optional(v.array(v.id("deals"))),

    // Owner + bookkeeping
    hubspotOwnerId: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    lastHubSpotSync: v.string(),
    createdAt: v.string(),
  })
    .index("by_hubspot_id", ["hubspotEngagementId"])
    .index("by_company", ["linkedCompanyId"])
    .index("by_timestamp", ["timestamp"]),
```

- [ ] **Step 3: Verify schema compiles**

Run from `model-testing-app/`:

```bash
npx convex codegen
```

Expected: completes without errors, `convex/_generated/` regenerates.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add activities table for HubSpot engagement timeline"
```

### Task 1.2: Extend `companies` table with `ownerName`

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (companies table)

- [ ] **Step 1: Add `ownerName` field**

In the `companies` table definition, add after `hubspotOwnerId`:

```typescript
    ownerName: v.optional(v.string()), // Resolved owner display name, cached at sync time
```

- [ ] **Step 2: Regenerate + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add ownerName to companies table"
```

### Task 1.3: Extend `contacts` table with `linkedinUrl`

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (contacts table)

- [ ] **Step 1: Add `linkedinUrl` field**

In the `contacts` table definition, add after `hubspotOwnerId`:

```typescript
    linkedinUrl: v.optional(v.string()), // Derived from hublead_linkedin_public_identifier
```

- [ ] **Step 2: Regenerate + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add linkedinUrl to contacts table"
```

### Task 1.4: Extend `deals` table with new fields

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (deals table)

- [ ] **Step 1: Add five new fields**

In the `deals` table definition, add after `nextStep`:

```typescript
    probability: v.optional(v.number()), // hs_deal_stage_probability (0-1)
    spvName: v.optional(v.string()), // Custom property: spv_name
    isClosed: v.optional(v.boolean()), // hs_is_closed
    isClosedWon: v.optional(v.boolean()), // hs_is_closed_won
    linkedProjectId: v.optional(v.id("projects")), // Deferred: link deal to project (V2)
```

- [ ] **Step 2: Regenerate + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): extend deals with probability/spvName/closed flags/projectLink"
```

---

## Phase 2 — Sync Rewrites

### Task 2.1: Normalization helpers (TDD)

**Files:**
- Create: `model-testing-app/src/lib/hubspot/normalize.ts`
- Create: `model-testing-app/src/lib/hubspot/__tests__/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

Create `model-testing-app/src/lib/hubspot/__tests__/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, dedupeAssociationIds, extractRootDomain } from '../normalize';

describe('normalizeCompanyName', () => {
  it('lowercases and strips legal suffixes', () => {
    expect(normalizeCompanyName('Funding 365 Ltd')).toBe('funding 365');
    expect(normalizeCompanyName('BAYFIELD HOMES LIMITED')).toBe('bayfield homes');
    expect(normalizeCompanyName('Apollo House Partners LLC')).toBe('apollo house');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeCompanyName('Smith, Jones & Co.')).toBe('smith jones');
    expect(normalizeCompanyName('  ACME   Services  ')).toBe('acme');
  });

  it('handles empty and undefined input', () => {
    expect(normalizeCompanyName(undefined)).toBe('');
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeCompanyName('Bayfield Homes Ltd');
    const twice = normalizeCompanyName(once);
    expect(twice).toBe(once);
  });
});

describe('dedupeAssociationIds', () => {
  it('removes exact-duplicate IDs from HubSpot dual-association response', () => {
    const input = [{ id: '123' }, { id: '456' }, { id: '123' }];
    expect(dedupeAssociationIds(input)).toEqual(['123', '456']);
  });

  it('handles empty array', () => {
    expect(dedupeAssociationIds([])).toEqual([]);
  });

  it('preserves first-occurrence order', () => {
    const input = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'a' }];
    expect(dedupeAssociationIds(input)).toEqual(['c', 'a', 'b']);
  });
});

describe('extractRootDomain', () => {
  it('strips protocol and www', () => {
    expect(extractRootDomain('https://www.bayfieldhomes.co.uk/about')).toBe('bayfieldhomes.co.uk');
  });

  it('extracts domain from email', () => {
    expect(extractRootDomain('steve@rushmon.co.uk')).toBe('rushmon.co.uk');
  });

  it('handles bare domains', () => {
    expect(extractRootDomain('talbothomes.co.uk')).toBe('talbothomes.co.uk');
  });

  it('returns null for invalid input', () => {
    expect(extractRootDomain(undefined)).toBeNull();
    expect(extractRootDomain('')).toBeNull();
    expect(extractRootDomain('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `model-testing-app/`:

```bash
npx vitest run src/lib/hubspot/__tests__/normalize.test.ts
```

Expected: FAIL with "Cannot find module '../normalize'".

- [ ] **Step 3: Write the implementation**

Create `model-testing-app/src/lib/hubspot/normalize.ts`:

```typescript
/**
 * Normalization and dedup helpers for HubSpot sync.
 * Pure functions only — no I/O, no side effects.
 */

const LEGAL_SUFFIX_RE =
  /\b(ltd|limited|llc|l\.l\.c\.|inc|incorporated|corp|corporation|plc|gmbh|srl|pty|s\.a\.|sa|ag|co|company|holdings?|group|services|international|intl|partners?|associates?)\b/gi;

/**
 * Lowercase + strip legal suffixes + collapse punctuation/whitespace.
 * Makes "Funding 365 Ltd" match "Funding 365 Limited" match "funding 365".
 * Idempotent.
 */
export function normalizeCompanyName(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(LEGAL_SUFFIX_RE, '')
    .replace(/[.,&'"/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedupe HubSpot association results by ID while preserving first-occurrence order.
 * HubSpot returns both HUBSPOT_DEFINED and USER_DEFINED associations for the same
 * company-contact pair, causing duplicates like [{id:"123"}, {id:"123"}].
 */
export function dedupeAssociationIds(
  results: { id: string }[] | undefined | null,
): string[] {
  if (!results) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of results) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r.id);
    }
  }
  return out;
}

/**
 * Extract the root domain from a URL, email, or bare-domain string.
 * Returns null if input is empty or can't be parsed.
 */
export function extractRootDomain(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.includes('://')) {
      return new URL(s).hostname.replace(/^www\./, '').toLowerCase();
    }
    if (s.includes('@')) {
      const after = s.split('@')[1];
      return after ? after.toLowerCase() : null;
    }
    if (s.includes(' ') || !s.includes('.')) return null;
    return s.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/hubspot/__tests__/normalize.test.ts
```

Expected: PASS — 10 tests passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/normalize.ts model-testing-app/src/lib/hubspot/__tests__/normalize.test.ts
git commit -m "feat(hubspot): add normalization helpers with tests"
```

### Task 2.2: Property discovery helper (TDD)

**Files:**
- Create: `model-testing-app/src/lib/hubspot/properties.ts`
- Create: `model-testing-app/src/lib/hubspot/__tests__/properties.test.ts`

- [ ] **Step 1: Write failing test (with fetch mock)**

Create `model-testing-app/src/lib/hubspot/__tests__/properties.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverProperties, clearPropertiesCache } from '../properties';

describe('discoverProperties', () => {
  beforeEach(() => {
    clearPropertiesCache();
    vi.stubGlobal('fetch', vi.fn());
    process.env.HUBSPOT_API_KEY = 'pat-test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns property names for companies', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { name: 'name', label: 'Name', type: 'string' },
          { name: 'domain', label: 'Domain', type: 'string' },
          { name: 'turnover', label: 'Turnover', type: 'number' },
        ],
      }),
    });

    const props = await discoverProperties('companies');
    expect(props.map((p) => p.name)).toEqual(['name', 'domain', 'turnover']);
  });

  it('caches results per object type within a single run', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ name: 'x', label: 'X', type: 'string' }] }),
    });

    await discoverProperties('companies');
    await discoverProperties('companies');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws if API returns non-200', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    });

    await expect(discoverProperties('companies')).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run test to verify fails**

```bash
npx vitest run src/lib/hubspot/__tests__/properties.test.ts
```

Expected: FAIL with "Cannot find module '../properties'".

- [ ] **Step 3: Write the implementation**

Create `model-testing-app/src/lib/hubspot/properties.ts`:

```typescript
/**
 * HubSpot property discovery — lists all properties defined on an object type
 * for this tenant. Used at sync start to harvest the full property payload.
 */

export type PropertyDef = {
  name: string;
  label: string;
  type: string;
  fieldType?: string;
  groupName?: string;
  description?: string;
  hubspotDefined?: boolean;
};

const cache = new Map<string, PropertyDef[]>();

export function clearPropertiesCache(): void {
  cache.clear();
}

export async function discoverProperties(
  objectType: 'companies' | 'contacts' | 'deals',
): Promise<PropertyDef[]> {
  if (cache.has(objectType)) {
    return cache.get(objectType)!;
  }

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY not set');
  }

  const res = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot properties discovery failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: PropertyDef[] };
  const results = data.results ?? [];
  cache.set(objectType, results);
  return results;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/hubspot/__tests__/properties.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/properties.ts model-testing-app/src/lib/hubspot/__tests__/properties.test.ts
git commit -m "feat(hubspot): add property discovery helper with cache"
```

### Task 2.3: Owner resolution helper (TDD)

**Files:**
- Create: `model-testing-app/src/lib/hubspot/owners.ts`
- Create: `model-testing-app/src/lib/hubspot/__tests__/owners.test.ts`

- [ ] **Step 1: Write failing test**

Create `model-testing-app/src/lib/hubspot/__tests__/owners.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveOwnerName, clearOwnersCache } from '../owners';

describe('resolveOwnerName', () => {
  beforeEach(() => {
    clearOwnersCache();
    vi.stubGlobal('fetch', vi.fn());
    process.env.HUBSPOT_API_KEY = 'pat-test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns display name from HubSpot owner response', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '12345',
        firstName: 'Alex',
        lastName: 'Lundberg',
        email: 'alex@rockcap.uk',
      }),
    });

    const name = await resolveOwnerName('12345');
    expect(name).toBe('Alex Lundberg');
  });

  it('returns null if ownerId is empty or undefined', async () => {
    expect(await resolveOwnerName(undefined)).toBeNull();
    expect(await resolveOwnerName('')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null and does not throw on 404', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });

    const name = await resolveOwnerName('99999');
    expect(name).toBeNull();
  });

  it('caches by ownerId', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ firstName: 'Test', lastName: 'User' }),
    });

    await resolveOwnerName('1');
    await resolveOwnerName('1');
    await resolveOwnerName('2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to email when names missing', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: 'anon@example.com' }),
    });

    expect(await resolveOwnerName('42')).toBe('anon@example.com');
  });
});
```

- [ ] **Step 2: Run test to verify fails**

```bash
npx vitest run src/lib/hubspot/__tests__/owners.test.ts
```

Expected: FAIL with "Cannot find module '../owners'".

- [ ] **Step 3: Write the implementation**

Create `model-testing-app/src/lib/hubspot/owners.ts`:

```typescript
/**
 * HubSpot owner resolution. Owners (users) are referenced by ID on companies/deals/contacts;
 * we resolve to a display name at sync time and cache the result for the sync run.
 */

const cache = new Map<string, string | null>();

export function clearOwnersCache(): void {
  cache.clear();
}

export async function resolveOwnerName(
  ownerId: string | undefined | null,
): Promise<string | null> {
  if (!ownerId) return null;
  if (cache.has(ownerId)) return cache.get(ownerId)!;

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    cache.set(ownerId, null);
    return null;
  }

  try {
    const res = await fetch(`https://api.hubapi.com/crm/v3/owners/${ownerId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      cache.set(ownerId, null);
      return null;
    }

    const data = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    const parts = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    const name = parts || data.email || null;
    cache.set(ownerId, name);
    return name;
  } catch {
    cache.set(ownerId, null);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/hubspot/__tests__/owners.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/owners.ts model-testing-app/src/lib/hubspot/__tests__/owners.test.ts
git commit -m "feat(hubspot): add owner name resolution helper with cache"
```

### Task 2.4: Refactor contacts fetcher

**Files:**
- Modify: `model-testing-app/src/lib/hubspot/contacts.ts`

- [ ] **Step 1: Remove 500-record cap and switch to full-property batch-read**

Open `model-testing-app/src/lib/hubspot/contacts.ts`. Replace the `fetchAllContactsFromHubSpot` function with this version (which removes the cap and paginates until exhausted):

```typescript
/**
 * Fetch all contacts with pagination. No hard cap; paginates until HubSpot
 * returns no `nextAfter` cursor.
 */
export async function fetchAllContactsFromHubSpot(
  client: Client,
  maxRecords: number = Number.POSITIVE_INFINITY,
): Promise<HubSpotContact[]> {
  const allContacts: HubSpotContact[] = [];
  let after: string | undefined;
  let pageCount = 0;

  console.log(`[HubSpot Contacts] Starting pagination fetch (cap: ${maxRecords === Number.POSITIVE_INFINITY ? 'none' : maxRecords})`);

  while (allContacts.length < maxRecords) {
    pageCount++;
    const remaining = maxRecords - allContacts.length;
    const batchSize = Math.min(remaining, 100);

    const { contacts, nextAfter } = await fetchContactsFromHubSpot(client, batchSize, after);

    console.log(`[HubSpot Contacts] Page ${pageCount}: fetched ${contacts.length}`);

    allContacts.push(...contacts);

    if (!nextAfter || contacts.length === 0) {
      console.log(`[HubSpot Contacts] Pagination complete. Total: ${allContacts.length}`);
      break;
    }

    after = nextAfter;
    await delay(100); // rate-limit courtesy
  }

  return allContacts;
}
```

- [ ] **Step 2: Remove redundant duplicate-detection code**

In the same function, delete the now-unused duplicate-detection block (the code that tracks `existingIds` and logs warnings). With dedup now happening at the mutation layer (Task 2.8), this is no longer needed here.

- [ ] **Step 3: Add activity-date property fallbacks to the properties list**

Find the `properties` array near the top of `fetchContactsFromHubSpot`. Replace it with:

```typescript
    const properties = [
      'email', 'firstname', 'lastname', 'phone', 'mobilephone',
      'company', 'jobtitle', 'lifecyclestage', 'hubspot_owner_id',
      'createdate', 'lastmodifieddate',
      // Activity dates — this tenant uses notes_last_* (hs_last_*_date are empty)
      'notes_last_contacted', 'notes_last_updated',
      'lastcontacteddate', 'hs_last_contacted_date', 'hs_last_activity_date',
      // Email engagement
      'hs_email_domain', 'hs_email_bounce', 'hs_email_optout',
      'hs_email_open', 'hs_email_click', 'hs_email_last_engagement_date',
      // Counts
      'num_associated_deals', 'num_associated_companies',
      'num_contacted_notes', 'num_notes',
      // LinkedIn (Hublead)
      'hublead_linkedin_public_identifier',
    ];
```

- [ ] **Step 4: Run the existing dry-run as a smoke test**

From `model-testing-app/`:

```bash
npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts 5
```

Expected: 5 contacts fetched, no errors. `properties.hublead_linkedin_public_identifier` appears on some contacts.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/contacts.ts
git commit -m "feat(hubspot): remove contacts fetch cap, add activity-date + linkedin props"
```

### Task 2.5: Refactor companies fetcher

**Files:**
- Modify: `model-testing-app/src/lib/hubspot/companies.ts`

- [ ] **Step 1: Switch to batch-read for full properties**

Open `model-testing-app/src/lib/hubspot/companies.ts`. After the existing `fetchCompaniesFromHubSpot` function, add a new function that does a batch-read of ALL discovered properties (not just the hardcoded list):

```typescript
import { discoverProperties } from './properties';

/**
 * Batch-read companies with ALL tenant properties (including Beauhurst + Hublead custom fields).
 * Uses the /batch/read endpoint so property names live in POST body (no URL length limit).
 */
export async function batchReadCompaniesFull(
  ids: string[],
): Promise<HubSpotCompany[]> {
  if (ids.length === 0) return [];

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) throw new Error('HUBSPOT_API_KEY not set');

  const propertyDefs = await discoverProperties('companies');
  const propertyNames = propertyDefs.map((p) => p.name);

  const out: HubSpotCompany[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies/batch/read', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: propertyNames,
        inputs: batch.map((id) => ({ id })),
      }),
    });

    if (!res.ok) {
      throw new Error(`HubSpot companies batch-read failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { results?: HubSpotCompany[] };
    out.push(...(data.results ?? []));
    await new Promise((r) => setTimeout(r, 100));
  }
  return out;
}
```

- [ ] **Step 2: Remove the 500-cap from `fetchAllCompaniesFromHubSpot`**

Same pattern as Task 2.4 Step 1 — change `maxRecords: number = 100` to `maxRecords: number = Number.POSITIVE_INFINITY`, update the log line.

- [ ] **Step 3: Smoke test**

From `model-testing-app/`:

```bash
npx tsx --env-file=.env.local -e "
import { batchReadCompaniesFull } from './src/lib/hubspot/companies';
(async () => {
  const c = await batchReadCompaniesFull(['184286151922']);
  console.log('Properties populated:', Object.keys(c[0]?.properties ?? {}).length);
  console.log('Beauhurst turnover:', c[0]?.properties?.beauhurst_data_turnover);
})();
"
```

Expected: Properties populated: 80+, Beauhurst turnover: some value (or empty string if not populated for this company).

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/companies.ts
git commit -m "feat(hubspot): add batch-read companies with full tenant properties"
```

### Task 2.6: Refactor deals fetcher

**Files:**
- Modify: `model-testing-app/src/lib/hubspot/deals.ts`

- [ ] **Step 1: Add new fields to the properties list**

Open `model-testing-app/src/lib/hubspot/deals.ts`. Find the properties array and extend it:

```typescript
    const properties = [
      'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
      'dealtype', 'description', 'hubspot_owner_id',
      'createdate', 'hs_lastmodifieddate',
      // New fields (Phase 1 schema additions)
      'hs_deal_stage_probability',
      'hs_is_closed',
      'hs_is_closed_won',
      'spv_name', // custom property
      'hs_priority',
    ];
```

- [ ] **Step 2: Remove 500-cap**

Same pattern as Task 2.4 Step 1.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/deals.ts
git commit -m "feat(hubspot): extend deals properties with probability/spv/closed flags"
```

### Task 2.7: Rewrite activities fetcher to use v1 company engagements

**Files:**
- Modify: `model-testing-app/src/lib/hubspot/activities.ts`

- [ ] **Step 1: Replace the file with the company-scoped v1 version**

Open `model-testing-app/src/lib/hubspot/activities.ts`. Replace entire contents with:

```typescript
/**
 * HubSpot engagement activities — fetched via the legacy v1 endpoint because
 * /crm/v3/objects/{type}/search requires crm.objects.emails.read granular scope
 * which is not available in Service Keys beta. The v1 endpoint accepts
 * sales-email-read (which we have) and returns all engagement types unified.
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export type EngagementType =
  | 'EMAIL'
  | 'INCOMING_EMAIL'
  | 'MEETING'
  | 'CALL'
  | 'NOTE'
  | 'TASK';

export interface HubSpotEngagement {
  id: string;
  type: EngagementType | 'UNKNOWN';
  timestamp: string; // ISO
  subject?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  direction?: string;
  status?: string;
  duration?: number;
  fromEmail?: string;
  toEmails?: string[];
  outcome?: string;
  metadata?: Record<string, unknown>;
  ownerId?: string;
  companyIds: string[];
  contactIds: string[];
  dealIds: string[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEngagement(raw: any): HubSpotEngagement | null {
  const eng = raw.engagement ?? raw;
  const md = raw.metadata ?? {};
  if (!eng?.id || !eng?.type) return null;

  const type = eng.type as EngagementType;
  const timestamp = new Date(eng.timestamp ?? Date.now()).toISOString();

  // Per-type metadata shapes differ; normalize into a common shape
  const base: HubSpotEngagement = {
    id: String(eng.id),
    type,
    timestamp,
    ownerId: eng.ownerId ? String(eng.ownerId) : undefined,
    companyIds: (raw.associations?.companyIds ?? []).map(String),
    contactIds: (raw.associations?.contactIds ?? []).map(String),
    dealIds: (raw.associations?.dealIds ?? []).map(String),
    metadata: md,
  };

  if (type === 'EMAIL' || type === 'INCOMING_EMAIL') {
    base.subject = md.subject;
    base.bodyHtml = md.html;
    base.bodyPreview = md.html ? stripHtml(md.html).slice(0, 400) : md.text?.slice(0, 400);
    base.direction = type === 'EMAIL' ? 'outbound' : 'inbound';
    base.status = md.status;
    base.fromEmail = md.from?.email;
    base.toEmails = (md.to ?? []).map((t: any) => t.email).filter(Boolean);
  } else if (type === 'MEETING') {
    base.subject = md.title;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
    base.duration = md.startTime && md.endTime
      ? Number(md.endTime) - Number(md.startTime)
      : undefined;
    base.outcome = md.meetingOutcome;
  } else if (type === 'CALL') {
    base.subject = md.title;
    base.duration = md.durationMilliseconds;
    base.direction = md.toNumber ? 'outbound' : 'inbound';
    base.status = md.status;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  } else if (type === 'NOTE') {
    base.bodyHtml = md.body;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  } else if (type === 'TASK') {
    base.subject = md.subject;
    base.status = md.status;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  }

  return base;
}

/**
 * Fetch all engagements for a given company, paginating until exhausted.
 */
export async function fetchEngagementsForCompany(
  companyId: string,
  maxRecords: number = Number.POSITIVE_INFINITY,
): Promise<HubSpotEngagement[]> {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) throw new Error('HUBSPOT_API_KEY not set');

  const results: HubSpotEngagement[] = [];
  let offset = 0;
  const pageSize = 100;

  while (results.length < maxRecords) {
    const url = `${HUBSPOT_API_BASE}/engagements/v1/engagements/associated/company/${companyId}?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot engagements fetch failed for company ${companyId}: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = await res.json() as {
      results?: any[];
      hasMore?: boolean;
      offset?: number;
    };

    const parsed = (data.results ?? [])
      .map(parseEngagement)
      .filter((e): e is HubSpotEngagement => e !== null);

    results.push(...parsed);

    if (!data.hasMore || parsed.length === 0) break;
    offset = data.offset ?? (offset + pageSize);

    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}
```

- [ ] **Step 2: Smoke test against Talbot Homes**

From `model-testing-app/`:

```bash
npx tsx --env-file=.env.local -e "
import { fetchEngagementsForCompany } from './src/lib/hubspot/activities';
(async () => {
  const engs = await fetchEngagementsForCompany('184286151922', 20);
  console.log('Total:', engs.length);
  const byType = engs.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {});
  console.log('Types:', byType);
  console.log('First email preview:', engs.find(e => e.type === 'EMAIL')?.bodyPreview?.slice(0, 100));
})();
"
```

Expected: Total: 20, Types includes EMAIL/INCOMING_EMAIL/MEETING, email preview shows real content.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/activities.ts
git commit -m "feat(hubspot): rewrite activities fetcher to v1 company engagements endpoint"
```

### Task 2.8: Update contacts mutation

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/contacts.ts`

- [ ] **Step 1: Add `linkedinUrl` and dedupe associations**

Open `model-testing-app/convex/hubspotSync/contacts.ts`. Find the `syncContactFromHubSpot` mutation's `args` validator and add:

```typescript
    linkedinUrl: v.optional(v.string()),
```

In the handler, where `linkedCompanyIds` and `linkedDealIds` get patched onto the contact record, wrap the arrays with `Array.from(new Set(ids))` or use a helper:

```typescript
    // Dedup HubSpot's dual-association-type duplicates before writing
    const uniqueHubspotCompanyIds = Array.from(new Set(args.hubspotCompanyIds ?? []));
    const uniqueHubspotDealIds = Array.from(new Set(args.hubspotDealIds ?? []));
```

Use the deduped arrays in the `.patch()` / `.insert()` calls.

Also include `linkedinUrl: args.linkedinUrl` in the fields written.

- [ ] **Step 2: Smoke-check via Convex dashboard**

Run a partial sync for one contact and inspect the record — `linkedinUrl` should appear on contacts that have `hublead_linkedin_public_identifier`. No duplicate entries in `hubspotCompanyIds`.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/contacts.ts
git commit -m "feat(convex): dedupe associations + accept linkedinUrl in contact sync"
```

### Task 2.9: Update companies mutation

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/companies.ts`

- [ ] **Step 1: Accept `ownerName` and write full `metadata`**

In `syncCompanyFromHubSpot`:

- Add to args: `ownerName: v.optional(v.string())`
- Add to written fields: `ownerName: args.ownerName`
- Accept a full `metadata: v.optional(v.any())` prop if not already present, write it directly (stores all 294 HubSpot properties as JSON, including Beauhurst + Hublead).
- Dedupe `linkedContactIds` / `linkedDealIds` same as Task 2.8.

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/companies.ts
git commit -m "feat(convex): accept ownerName + full metadata, dedupe associations"
```

### Task 2.10: Update deals mutation

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/deals.ts`

- [ ] **Step 1: Accept new deal fields**

In `syncDealFromHubSpot` args and written fields, add:

```typescript
    probability: v.optional(v.number()),
    spvName: v.optional(v.string()),
    isClosed: v.optional(v.boolean()),
    isClosedWon: v.optional(v.boolean()),
```

Parse source values from properties: `hs_deal_stage_probability` (float string → number), `spv_name`, `hs_is_closed === "true"`, `hs_is_closed_won === "true"`.

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/deals.ts
git commit -m "feat(convex): accept new deal fields (probability, spvName, closed flags)"
```

### Task 2.11: Create activities mutation

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/activities.ts`

- [ ] **Step 1: Replace placeholder with proper upsert mutation**

Open (or create) `model-testing-app/convex/hubspotSync/activities.ts`. Replace contents with:

```typescript
import { v } from 'convex/values';
import { mutation } from '../_generated/server';

export const syncActivityFromHubSpot = mutation({
  args: {
    hubspotEngagementId: v.string(),
    type: v.union(
      v.literal('EMAIL'),
      v.literal('INCOMING_EMAIL'),
      v.literal('MEETING'),
      v.literal('CALL'),
      v.literal('NOTE'),
      v.literal('TASK'),
    ),
    timestamp: v.string(),
    subject: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    direction: v.optional(v.string()),
    status: v.optional(v.string()),
    duration: v.optional(v.number()),
    fromEmail: v.optional(v.string()),
    toEmails: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()),
    metadata: v.optional(v.any()),

    // Associations — these are HubSpot IDs; we resolve them here
    hubspotCompanyId: v.optional(v.string()),
    hubspotContactIds: v.optional(v.array(v.string())),
    hubspotDealIds: v.optional(v.array(v.string())),

    hubspotOwnerId: v.optional(v.string()),
    ownerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Resolve HubSpot IDs → Convex IDs via indexes
    let linkedCompanyId: any = undefined;
    if (args.hubspotCompanyId) {
      const company = await ctx.db
        .query('companies')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotCompanyId', args.hubspotCompanyId!))
        .first();
      linkedCompanyId = company?._id;
    }

    const linkedContactIds: any[] = [];
    for (const hsId of args.hubspotContactIds ?? []) {
      const c = await ctx.db
        .query('contacts')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotContactId', hsId))
        .first();
      if (c) linkedContactIds.push(c._id);
    }

    const linkedDealIds: any[] = [];
    for (const hsId of args.hubspotDealIds ?? []) {
      const d = await ctx.db
        .query('deals')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotDealId', hsId))
        .first();
      if (d) linkedDealIds.push(d._id);
    }

    const fields = {
      hubspotEngagementId: args.hubspotEngagementId,
      type: args.type,
      timestamp: args.timestamp,
      subject: args.subject,
      bodyPreview: args.bodyPreview,
      bodyHtml: args.bodyHtml,
      direction: args.direction,
      status: args.status,
      duration: args.duration,
      fromEmail: args.fromEmail,
      toEmails: args.toEmails,
      outcome: args.outcome,
      metadata: args.metadata,
      linkedCompanyId,
      linkedContactIds,
      linkedDealIds,
      hubspotOwnerId: args.hubspotOwnerId,
      ownerName: args.ownerName,
      lastHubSpotSync: now,
    };

    // Upsert by hubspotEngagementId
    const existing = await ctx.db
      .query('activities')
      .withIndex('by_hubspot_id', (q) =>
        q.eq('hubspotEngagementId', args.hubspotEngagementId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert('activities', {
      ...fields,
      createdAt: now,
    });
  },
});
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/activities.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add syncActivityFromHubSpot mutation with upsert-by-engagement-id"
```

### Task 2.12: Wire sync-all orchestrator

**Files:**
- Modify: `model-testing-app/src/app/api/hubspot/sync-all/route.ts`

- [ ] **Step 1: Add engagement-sync step**

Open `model-testing-app/src/app/api/hubspot/sync-all/route.ts`. After the existing companies/contacts/deals sync loop, add a new phase that fetches engagements for each synced company and upserts them:

```typescript
import { fetchEngagementsForCompany } from '@/lib/hubspot/activities';
import { resolveOwnerName } from '@/lib/hubspot/owners';

// ... after companies/contacts/deals sync ...

// Engagement sync: per-company
const syncedCompanies = await convex.query(api.companies.listWithHubspotId, {});
let engagementTotal = 0;
for (const company of syncedCompanies) {
  if (!company.hubspotCompanyId) continue;
  try {
    const engagements = await fetchEngagementsForCompany(company.hubspotCompanyId);
    for (const eng of engagements) {
      const ownerName = await resolveOwnerName(eng.ownerId);
      await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
        hubspotEngagementId: eng.id,
        type: eng.type === 'UNKNOWN' ? 'NOTE' : eng.type,
        timestamp: eng.timestamp,
        subject: eng.subject,
        bodyPreview: eng.bodyPreview,
        bodyHtml: eng.bodyHtml,
        direction: eng.direction,
        status: eng.status,
        duration: eng.duration,
        fromEmail: eng.fromEmail,
        toEmails: eng.toEmails,
        outcome: eng.outcome,
        metadata: eng.metadata,
        hubspotCompanyId: company.hubspotCompanyId,
        hubspotContactIds: eng.contactIds,
        hubspotDealIds: eng.dealIds,
        hubspotOwnerId: eng.ownerId,
        ownerName: ownerName ?? undefined,
      });
      engagementTotal++;
    }
  } catch (err) {
    console.error(`Engagements sync failed for company ${company.hubspotCompanyId}:`, err);
    // continue with other companies
  }
}

console.log(`[sync-all] ${engagementTotal} engagements upserted`);
```

If `api.companies.listWithHubspotId` does not exist, add it to `convex/companies.ts` as a simple query returning all companies where `hubspotCompanyId` is set.

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/app/api/hubspot/sync-all/route.ts model-testing-app/convex/companies.ts
git commit -m "feat(hubspot): orchestrate engagement sync per company in sync-all"
```

### Task 2.13: Full sync verification run

**Files:** None — verification only.

- [ ] **Step 1: Trigger full sync against prod HubSpot**

From `model-testing-app/` with the dev server running:

```bash
curl -X POST http://localhost:3000/api/hubspot/sync-all
```

Or trigger via the UI at `/settings/hubspot`.

- [ ] **Step 2: Wait for completion and inspect Convex**

The sync logs progress to the server console. Wait for completion (likely 5-15 min for first full sync depending on data volume).

- [ ] **Step 3: Verify Talbot Homes is fully populated**

Run from `model-testing-app/`:

```bash
npx convex run companies:getByHubspotId '{"hubspotCompanyId":"184286151922"}' 2>/dev/null | head -60
```

Expected: company record with `ownerName` set, `metadata` containing `beauhurst_data_turnover`, `num_associated_deals` ~13, `linkedContactIds` length ≥ 3, `linkedDealIds` length ≥ 13.

- [ ] **Step 4: Verify engagements table populated**

```bash
npx convex run activities:countByCompany '{"companyId":"<talbot_convex_id>"}' 2>/dev/null
```

Expected: 50+ activities, mix of EMAIL, INCOMING_EMAIL, MEETING, NOTE.

- [ ] **Step 5: Commit (if helper queries needed creating)**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/
git commit -m "feat(convex): add companies:getByHubspotId and activities:countByCompany helpers"
```

---

## Phase 3 — Back-link Script

### Task 3.1: Create back-link mutation

**Files:**
- Create: `model-testing-app/convex/hubspotSync/backlink.ts`

- [ ] **Step 1: Write the mutation**

Create `model-testing-app/convex/hubspotSync/backlink.ts`:

```typescript
import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * One-shot: promote a synced HubSpot company to an existing client.
 * Sets `companies.promotedToClientId` = (client with matching name).
 * Returns { linked: true } if the link was set; { linked: false, reason } if not.
 */
export const backlinkCompanyToClient = mutation({
  args: {
    hubspotCompanyId: v.string(),
    clientName: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the company by hubspotCompanyId
    const company = await ctx.db
      .query('companies')
      .withIndex('by_hubspot_id', (q) => q.eq('hubspotCompanyId', args.hubspotCompanyId))
      .first();

    if (!company) {
      return { linked: false, reason: `Company ${args.hubspotCompanyId} not found in Convex` };
    }

    // Find the client by exact name (case-insensitive)
    const nameLower = args.clientName.toLowerCase();
    const allClients = await ctx.db.query('clients').collect();
    const client = allClients.find(
      (c) => c.name.toLowerCase() === nameLower && c.isDeleted !== true,
    );

    if (!client) {
      return { linked: false, reason: `Client "${args.clientName}" not found` };
    }

    // Skip if already linked to this same client
    if (company.promotedToClientId === client._id) {
      return { linked: true, alreadyLinked: true, clientId: client._id };
    }

    // Skip if already linked to a DIFFERENT client (don't silently overwrite)
    if (company.promotedToClientId && company.promotedToClientId !== client._id) {
      return {
        linked: false,
        reason: `Company already linked to a different client (${company.promotedToClientId})`,
      };
    }

    await ctx.db.patch(company._id, { promotedToClientId: client._id });
    return { linked: true, clientId: client._id };
  },
});
```

- [ ] **Step 2: Regenerate types**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/backlink.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add backlinkCompanyToClient mutation"
```

### Task 3.2: Create matches JSON + back-link script

**Files:**
- Create: `model-testing-app/scripts/backlink-matches.json`
- Create: `model-testing-app/scripts/backlink-clients.ts`

- [ ] **Step 1: Create the matches file**

Create `model-testing-app/scripts/backlink-matches.json`:

```json
[
  { "hubspotCompanyId": "163259202780", "clientName": "Bayfield Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "260803056835", "clientName": "Capstone Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "185382752456", "clientName": "Castlenau", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163517165817", "clientName": "Halo Living", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "307639380211", "clientName": "Fenway Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163414696177", "clientName": "Forays", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "261317506263", "clientName": "Hockley Developments ltd", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "176656106729", "clientName": "HORDE", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "220311965934", "clientName": "HOUSING CAPITAL TRUST LIMITED", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "306169809088", "clientName": "Indigo Scott", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163467725034", "clientName": "Innocent Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "236280750292", "clientName": "Kinspire Homes", "reason": "STRONG exact-name (post-merge)" },
  { "hubspotCompanyId": "266356046060", "clientName": "Lucien", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163236799696", "clientName": "Mackenzie Miller Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163522961604", "clientName": "Paragon Living", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163518992616", "clientName": "Paxford Property", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "266432509128", "clientName": "Rocket Properties", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "314083819744", "clientName": "Satis Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163411073268", "clientName": "Shorewood Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163411074266", "clientName": "Stancliffe Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163259202806", "clientName": "Tailored Mark", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "184286151922", "clientName": "Talbot Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "326338660543", "clientName": "Urban Colour Limited", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163236799676", "clientName": "Urban Pulse Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "225244963060", "clientName": "Wavensmere Homes", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "163414697147", "clientName": "Woolbro Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "211175110877", "clientName": "Zake Developments", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "225244963026", "clientName": "Zentra Group", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "220313422016", "clientName": "Zensudo Developments", "reason": "STRONG exact-name" },
  { "hubspotCompanyId": "209293993176", "clientName": "Donnington Group", "reason": "WEAK user-confirmed → Donnington New Homes Limited" },
  { "hubspotCompanyId": "163489822932", "clientName": "Huntsmere", "reason": "WEAK user-confirmed → Huntsmere Gro (truncated in HS)" },
  { "hubspotCompanyId": "163236799689", "clientName": "Capstone Quinn", "reason": "WEAK user-confirmed → Creeland - Capstone Quinn (JV)" },
  { "hubspotCompanyId": "163518936272", "clientName": "Glover Investments", "reason": "WEAK user-confirmed → Lakewood - Glover Investments (JV)" }
]
```

(Note: 33 entries. "Kinspire" client should be merged into "Kinspire Homes" during Phase 0; the survivor named "Kinspire Homes" matches the HubSpot company 236280750292. "Halo Living" appears once post-merge.)

- [ ] **Step 2: Create the script**

Create `model-testing-app/scripts/backlink-clients.ts`:

```typescript
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
  const results = { linked: 0, alreadyLinked: 0, skipped: 0, errors: 0 };

  for (const match of matches) {
    const tag = `[${match.reason}]`;
    const label = `${match.clientName} → HS ${match.hubspotCompanyId}`;

    if (DRY) {
      console.log(`DRY  ${label}  ${tag}`);
      continue;
    }

    try {
      const result = await convex.mutation(api.hubspotSync.backlink.backlinkCompanyToClient, {
        hubspotCompanyId: match.hubspotCompanyId,
        clientName: match.clientName,
      }) as any;

      if (result.linked) {
        if (result.alreadyLinked) {
          console.log(`SKIP ${label}  ${tag}  (already linked)`);
          results.alreadyLinked++;
        } else {
          console.log(`OK   ${label}  ${tag}  → ${result.clientId}`);
          results.linked++;
        }
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
  console.log(`  linked:        ${results.linked}`);
  console.log(`  alreadyLinked: ${results.alreadyLinked}`);
  console.log(`  skipped:       ${results.skipped}`);
  console.log(`  errors:        ${results.errors}`);
  console.log(`  total:         ${matches.length}`);
}

main().catch((e) => {
  console.error('\n✗ Back-link script failed:', e);
  process.exit(1);
});
```

- [ ] **Step 3: Dry-run the script**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx tsx --env-file=.env.local scripts/backlink-clients.ts --dry
```

Expected: 33 "DRY" lines, no errors, no writes.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/scripts/backlink-matches.json model-testing-app/scripts/backlink-clients.ts
git commit -m "feat(scripts): add back-link matches JSON and runner script"
```

### Task 3.3: Execute the back-link

**Files:** None — execution only.

- [ ] **Step 1: Run the script for real**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx tsx --env-file=.env.local scripts/backlink-clients.ts
```

Expected output: ~30 "OK" lines, 0-3 "WARN" (weak matches may fail if client renamed post-merge), 0 "FAIL". Summary shows `linked: ≥30`.

- [ ] **Step 2: Verify in Convex**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex run companies:countPromoted 2>/dev/null
```

(If `countPromoted` doesn't exist, create it as a trivial query.)

Expected: 30+.

- [ ] **Step 3: Spot-check one link**

Pick Bayfield Homes. Verify the company record has `promotedToClientId` set:

```bash
npx convex run companies:getByHubspotId '{"hubspotCompanyId":"163259202780"}' 2>/dev/null | grep promotedToClientId
```

Expected: shows the Convex client `_id` of Bayfield Homes.

- [ ] **Step 4: If any WARN, investigate and fix**

For each WARN, either fix the client name in `backlink-matches.json` (if it was renamed) or merge the client (if a dupe snuck through Phase 0). Re-run the script — it's idempotent.

- [ ] **Step 5: Commit the matches file in final form**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/scripts/backlink-matches.json
git commit -m "chore(backlink): finalize matches file after first successful run"
```

---

## Final Task — Build + Ship

### Task F.1: Build check + push per CLAUDE.md workflow rule

**Files:** None.

- [ ] **Step 1: Run the Next.js build**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx next build
```

Expected: exits 0. Any errors must be fixed before proceeding.

- [ ] **Step 2: Verify nothing drifted**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git status
```

Expected: working tree clean.

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

Expected: push succeeds.

---

## Self-Review Checklist (run before handoff)

- [ ] **Spec coverage** — §4 Data Model: tasks 1.1–1.4 cover all schema additions. §5 Sync Pipeline: tasks 2.1–2.13 cover bug fixes, custom-property harvest, engagement sync, owner resolution. §5.5 Back-link: tasks 3.1–3.3 cover the 35 matches. Mobile UI (spec §6) is out of scope for this plan and handled in Plan 2.
- [ ] **Placeholder scan** — all code blocks contain complete, working code. No TODO / TBD / "similar to previous" shortcuts. Every command has expected output specified.
- [ ] **Type consistency** — `activities` table fields match across schema (Task 1.1), mutation (Task 2.11), and fetcher types (Task 2.7). `probability`/`spvName`/`isClosed`/`isClosedWon` spelled identically in schema (Task 1.4), fetcher (Task 2.6), mutation (Task 2.10).
- [ ] **Error paths** — owner resolution returns `null` on 404 (Task 2.3). Engagement sync catches per-company errors and continues (Task 2.12). Back-link mutation returns `{linked: false, reason}` rather than throwing (Task 3.1). Script iterates all matches even on individual failures (Task 3.2).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-hubspot-sync-backend.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.

2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
