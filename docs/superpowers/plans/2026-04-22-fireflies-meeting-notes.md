# Fireflies.ai Transcripts → Meeting-Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute file-authoring tasks per-task with review checkpoints. Phase E is a one-off Convex action the user will invoke.

**Goal:** Detect Fireflies.ai-generated call transcripts among incoming HubSpot notes and reclassify them as `MEETING_NOTE` activities. Surface them in the mobile app's Meetings section alongside calendar meetings — both scheduling records (MEETING) and their post-call transcripts (MEETING_NOTE) live in one place, with the Fireflies summary visible and the full transcript collapsible.

**Architecture:** Content-based detection inside `parseEngagement`. Fireflies uses a highly consistent HTML template for every transcript — URL pattern `app.fireflies.ai/view/*` combined with the boilerplate phrase `"Time markers in this document"` gives two orthogonal signals with near-zero false-positive rate. On detection, extract structured data (title, date, duration, participants, transcript URL) from the body and write the activity with `activityType='MEETING_NOTE'` plus new `sourceIntegration='fireflies'` and `transcriptUrl` metadata. One-off Convex migration action retroactively reclassifies existing matches.

**Tech Stack:** TypeScript regex parsing, Convex mutations (action for migration), vitest for detection/parser unit tests, React Native / NativeWind for mobile UI.

**Design decisions (confirmed with user):**
1. **`MEETING_NOTE` as a new activityType** — not `MEETING`, because the calendar event itself is already synced as `MEETING`. Keeps the two records distinct and linkable.
2. **Full transcript HTML stored** in `bodyHtml` so users can view it without leaving the app; summary shows by default, full transcript collapsible.
3. **Retroactive migration** — one-off action walks existing activities and reclassifies matches.
4. **Fireflies badge + "Open transcript" button** on meeting-note rows in the meetings tab.

**Data confidence:** Inspected a real Fireflies transcript (engagement `433554732255`, Comberton on Jan 26 2026). The template is deterministic; detection + extraction logic is derived from real data, not speculation.

---

## Known unknowns (flag at setup, don't block)

1. **Fireflies template changes over time.** If they redesign their HubSpot output format, our regex extraction could silently break. Mitigation: the detection signal (URL + boilerplate phrase) is the most stable part; extraction uses defensive fallbacks (title → first `<h3>` else activity subject else `"Fireflies transcript"`; duration → regex or undefined). A broken regex produces a less-polished row, never a crashed handler.

2. **Non-English transcripts.** Fireflies likely localizes some strings. The "Time markers in this document" boilerplate might be translated. We only have an English sample. For now: English-only detection. If non-English transcripts exist, we'll add language-specific markers as a follow-up.

3. **Summary extraction quality.** The current `bodyPreview` (first 400 chars stripped) includes title/date/emails before getting to real content. Plan carries over this behaviour for MVP; a cleaner preview (skip meta block, start at first `<h4>` section) is a polish pass in a later task.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `model-testing-app/src/lib/hubspot/fireflies.ts` | `isFirefliesTranscript()` + `parseFirefliesTranscript()` pure functions |
| `model-testing-app/src/lib/hubspot/__tests__/fireflies.test.ts` | Unit tests with real fixture data |
| `model-testing-app/convex/hubspotSync/migrations.ts` | `reclassifyFirefliesNotes` internal action (one-off migration) |

### Modified files

| Path | Change |
|---|---|
| `model-testing-app/src/lib/hubspot/activities.ts` | Call `isFirefliesTranscript` / `parseFirefliesTranscript` inside `parseEngagement`; update `HubSpotEngagement` type + case-NOTE branch |
| `model-testing-app/convex/schema.ts` | Add `sourceIntegration: v.optional(v.string())` + `transcriptUrl: v.optional(v.string())` to activities table |
| `model-testing-app/convex/hubspotSync/activities.ts` | `syncActivityFromHubSpot` accepts + stores new fields |
| `model-testing-app/src/app/api/hubspot/webhook-process/route.ts` | Pass new fields through when upserting engagements |
| `model-testing-app/src/app/api/hubspot/sync-all/route.ts` | Same pass-through for full sync path |
| `mobile-app/app/(tabs)/index.tsx` | Add `'meeting-note'` ActivityKind, filter inclusion in Meetings, kind-to-icon, kind-to-action-phrase |
| `mobile-app/app/(tabs)/clients/[clientId]/index.tsx` | Same additions (client detail activity stream) |
| `model-testing-app/convex/hubspotSync/_debug.ts` | Delete (no longer needed once migration ships) |

---

## Phase A — Pure-function detection + parser (TDD)

### Task 1: Write `fireflies.ts` with TDD

**Files:**
- Create: `model-testing-app/src/lib/hubspot/fireflies.ts`
- Create test: `model-testing-app/src/lib/hubspot/__tests__/fireflies.test.ts`
- Create fixture: `model-testing-app/src/lib/hubspot/__tests__/fixtures/fireflies-comberton.html` — paste the real body we extracted from engagement 433554732255

- [ ] **Step 1: Create the fixture**

Create `model-testing-app/src/lib/hubspot/__tests__/fixtures/fireflies-comberton.html` — paste the full `metadata.body` HTML that we extracted earlier. The engineer should fetch it fresh from HubSpot to avoid copy-paste drift:

```bash
KEY=$(grep '^HUBSPOT_API_KEY=' model-testing-app/.env.local | cut -d= -f2)
curl -s "https://api.hubapi.com/engagements/v1/engagements/433554732255" \
  -H "Authorization: Bearer $KEY" \
  | python3 -c "import json, sys; print(json.load(sys.stdin)['metadata']['body'])" \
  > model-testing-app/src/lib/hubspot/__tests__/fixtures/fireflies-comberton.html
```

Expected: ~8KB HTML file with structured Fireflies content.

- [ ] **Step 2: Write the failing tests**

Create `model-testing-app/src/lib/hubspot/__tests__/fireflies.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isFirefliesTranscript,
  parseFirefliesTranscript,
} from '../fireflies';

const firefliesFixture = readFileSync(
  join(__dirname, 'fixtures/fireflies-comberton.html'),
  'utf-8',
);

const humanNoteWithFirefliesLink = `
  <p>Trigger Type: Level 3 Check-in</p>
  <p>Meeting took place on <a href="https://app.fireflies.ai/view/01KMZ4QCSE9XMSDNB60RXE48X8">Fireflies recording</a></p>
  <p>Suggested Hook: Follow up on indicative term sheets</p>
`;

const plainNote = '<p>Just a regular human note, no integration involved</p>';

describe('isFirefliesTranscript', () => {
  it('detects a real Fireflies transcript', () => {
    expect(isFirefliesTranscript(firefliesFixture)).toBe(true);
  });

  it('rejects a human note that merely references a Fireflies URL', () => {
    expect(isFirefliesTranscript(humanNoteWithFirefliesLink)).toBe(false);
  });

  it('rejects a plain human note', () => {
    expect(isFirefliesTranscript(plainNote)).toBe(false);
  });

  it('rejects empty / null / undefined input', () => {
    expect(isFirefliesTranscript('')).toBe(false);
    expect(isFirefliesTranscript(null as any)).toBe(false);
    expect(isFirefliesTranscript(undefined as any)).toBe(false);
  });
});

describe('parseFirefliesTranscript', () => {
  const parsed = parseFirefliesTranscript(firefliesFixture);

  it('extracts the meeting title from the first <h3>', () => {
    expect(parsed.title).toBe('Comberton');
  });

  it('extracts the transcript URL', () => {
    expect(parsed.transcriptUrl).toBe(
      'https://app.fireflies.ai/view/01KFRND0FCR2XQWMNFGMP2K976',
    );
  });

  it('extracts duration in milliseconds (14 mins → 14*60*1000)', () => {
    expect(parsed.duration).toBe(14 * 60 * 1000);
  });

  it('extracts participant emails, deduplicated', () => {
    expect(parsed.participantEmails).toEqual(
      expect.arrayContaining([
        'jbird@bayfieldhomes.co.uk',
        'alex@rockcap.uk',
        'mthompson@falcogroup.co.uk',
      ]),
    );
    // No duplicates
    expect(new Set(parsed.participantEmails).size).toBe(
      parsed.participantEmails.length,
    );
  });

  it('returns graceful undefined/empty for fields it cannot extract', () => {
    const result = parseFirefliesTranscript('<p>not a transcript</p>');
    expect(result.title).toBeUndefined();
    expect(result.transcriptUrl).toBeUndefined();
    expect(result.duration).toBeUndefined();
    expect(result.participantEmails).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx vitest run src/lib/hubspot/__tests__/fireflies.test.ts
```
Expected: FAIL — `../fireflies` module not found.

- [ ] **Step 4: Write the implementation**

Create `model-testing-app/src/lib/hubspot/fireflies.ts`:

```typescript
/**
 * Fireflies.ai call-transcript detection + parsing.
 *
 * HubSpot does NOT attach any integration-source metadata to
 * Fireflies-generated notes (no source, sourceId, appId — the note is
 * created via the account owner's OAuth token, so from HubSpot's
 * perspective it looks like a manual note). HubSpot's UI label "Note
 * created via Fireflies.ai Call Transcripts" is inferred from body
 * content alone.
 *
 * We use the same approach: content-based detection. Fireflies outputs
 * an extremely consistent HTML template for every transcript. Two
 * signals both must be present for classification:
 *
 *   1. URL pattern `https://app.fireflies.ai/view/{id}` — present in
 *      every transcript (header link + body time-markers + footer).
 *   2. Boilerplate phrase `"Time markers in this document"` — appears
 *      only in Fireflies-generated notes, not in human notes that
 *      merely reference a Fireflies URL.
 *
 * Both together give near-zero false-positive rate while staying
 * robust to individual-field variations.
 */

const FIREFLIES_URL_RX = /https:\/\/app\.fireflies\.ai\/view\/([A-Za-z0-9]+)/i;
const TIME_MARKERS_RX = /Time markers in this document/i;
const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const H3_CONTENT_RX = /<h3[^>]*>([^<]+)<\/h3>/i;
const DURATION_MINS_RX = /<p[^>]*>\s*(\d+)\s*mins?\s*<\/p>/i;

/**
 * True iff `bodyHtml` is a Fireflies.ai-generated call transcript
 * (as opposed to a human note that merely references one).
 */
export function isFirefliesTranscript(bodyHtml: string | null | undefined): boolean {
  if (!bodyHtml) return false;
  return FIREFLIES_URL_RX.test(bodyHtml) && TIME_MARKERS_RX.test(bodyHtml);
}

export interface FirefliesTranscript {
  /** Meeting title from the top-level <h3>. Undefined if not present. */
  title?: string;
  /** Fireflies-hosted transcript URL. Undefined if not present. */
  transcriptUrl?: string;
  /** Meeting duration in milliseconds. Undefined if not parseable. */
  duration?: number;
  /** Participant email addresses, deduplicated. Empty array if none found. */
  participantEmails: string[];
}

/**
 * Extract structured fields from a Fireflies transcript's HTML body.
 * Every field is defensively best-effort — missing extraction returns
 * undefined / empty rather than throwing, so a template drift can
 * degrade gracefully rather than break the handler.
 */
export function parseFirefliesTranscript(bodyHtml: string): FirefliesTranscript {
  // Title — first <h3> content
  const titleMatch = bodyHtml.match(H3_CONTENT_RX);
  const title = titleMatch?.[1]?.trim();

  // Transcript URL — first Fireflies view URL
  const urlMatch = bodyHtml.match(FIREFLIES_URL_RX);
  const transcriptUrl = urlMatch?.[0];

  // Duration — "N mins" in its own <p> near the top
  const durationMatch = bodyHtml.match(DURATION_MINS_RX);
  const duration = durationMatch
    ? parseInt(durationMatch[1], 10) * 60 * 1000
    : undefined;

  // Participant emails — dedupe and preserve first-seen order
  const allEmails = bodyHtml.match(EMAIL_RX) ?? [];
  const seen = new Set<string>();
  const participantEmails: string[] = [];
  for (const e of allEmails) {
    const lower = e.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      participantEmails.push(e);
    }
  }

  return {
    title,
    transcriptUrl,
    duration,
    participantEmails,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/hubspot/__tests__/fireflies.test.ts
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/fireflies.ts \
        model-testing-app/src/lib/hubspot/__tests__/fireflies.test.ts \
        model-testing-app/src/lib/hubspot/__tests__/fixtures/fireflies-comberton.html
git commit -m "feat(fireflies): detection + field-extraction pure functions (TDD)"
```

---

## Phase B — Sync integration

### Task 2: Wire detection into `parseEngagement` + update engagement shape

**Files:**
- Modify: `model-testing-app/src/lib/hubspot/activities.ts`

- [ ] **Step 1: Update the `HubSpotEngagement` interface**

Add `sourceIntegration` and `transcriptUrl` to the interface. Before:

```typescript
export interface HubSpotEngagement {
  id: string;
  type: EngagementType | 'UNKNOWN';
  timestamp: string;
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
```

Change the `type` union to include `'MEETING_NOTE'`:

```typescript
export type EngagementType =
  | 'EMAIL'
  | 'INCOMING_EMAIL'
  | 'MEETING'
  | 'MEETING_NOTE'
  | 'CALL'
  | 'NOTE'
  | 'TASK';
```

Add the two new optional fields to the interface:

```typescript
export interface HubSpotEngagement {
  // ... existing fields unchanged ...
  sourceIntegration?: 'fireflies';
  transcriptUrl?: string;
}
```

- [ ] **Step 2: Add import + update the NOTE branch in `parseEngagement`**

Top of the file, add:

```typescript
import { isFirefliesTranscript, parseFirefliesTranscript } from './fireflies';
```

Replace the existing NOTE branch inside `parseEngagement`. Before:

```typescript
} else if (type === 'NOTE') {
  base.bodyHtml = md.body;
  base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
}
```

After:

```typescript
} else if (type === 'NOTE') {
  const body = md.body;
  // Detect Fireflies.ai-generated call transcripts by content
  // signature (HubSpot doesn't attach integration source metadata —
  // see fireflies.ts for rationale).
  if (isFirefliesTranscript(body)) {
    const parsed = parseFirefliesTranscript(body);
    // Reclassify: this activity becomes a MEETING_NOTE — same
    // activity record, different type. Downstream (UI, filters)
    // treats it as a meeting-related artefact rather than a note.
    base.type = 'MEETING_NOTE';
    base.subject = parsed.title ?? 'Call transcript';
    base.bodyHtml = body;
    base.bodyPreview = body ? stripHtml(body).slice(0, 400) : undefined;
    base.duration = parsed.duration;
    base.toEmails = parsed.participantEmails;
    base.sourceIntegration = 'fireflies';
    base.transcriptUrl = parsed.transcriptUrl;
  } else {
    // Plain human note — unchanged from before.
    base.bodyHtml = body;
    base.bodyPreview = body ? stripHtml(body).slice(0, 400) : undefined;
  }
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx next build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/activities.ts
git commit -m "feat(fireflies): reclassify Fireflies transcripts as MEETING_NOTE in parseEngagement"
```

---

### Task 3: Schema additions

**Files:**
- Modify: `model-testing-app/convex/schema.ts`

- [ ] **Step 1: Add the two new optional fields to the `activities` table**

Find the `activities` table definition. Add near the end of its field list (keep all existing fields):

```diff
 activities: defineTable({
   // ... existing fields ...
+  // Set on Fireflies.ai-detected transcripts (and potentially other
+  // integrations in the future). Mainly used by UI to show a source
+  // badge; not used for filtering or routing.
+  sourceIntegration: v.optional(v.string()),
+  // Direct link out to the source integration's canonical view
+  // (e.g. https://app.fireflies.ai/view/{id}). Nullable; only present
+  // when the engagement came from an integration that has such a
+  // public URL.
+  transcriptUrl: v.optional(v.string()),
 })
```

No new index needed — we don't query by these.

- [ ] **Step 2: Regenerate Convex types**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
```
Expected: success without errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts
# If codegen produced changes:
git add model-testing-app/convex/_generated/ 2>/dev/null || true
git commit -m "feat(fireflies): schema — sourceIntegration + transcriptUrl on activities"
```

---

### Task 4: Mutation accepts the new fields

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/activities.ts`

- [ ] **Step 1: Add args to `syncActivityFromHubSpot`**

Find the `args` object. Add:

```diff
 args: {
   // ... existing args ...
   metadata: v.optional(v.any()),
+  sourceIntegration: v.optional(v.string()),
+  transcriptUrl: v.optional(v.string()),
   hubspotCompanyId: v.optional(v.string()),
   // ... rest ...
 },
```

- [ ] **Step 2: Add to the `fields` object in the handler**

Find the `fields` object. Add:

```diff
 const fields = {
   // ... existing fields ...
   metadata: args.metadata,
+  sourceIntegration: args.sourceIntegration,
+  transcriptUrl: args.transcriptUrl,
   hubspotOwnerId: args.hubspotOwnerId,
   // ... rest ...
 };
```

The patch-no-undefined pattern already in this mutation correctly handles these as optional.

- [ ] **Step 3: Build check**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen && npx next build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/activities.ts
git add model-testing-app/convex/_generated/ 2>/dev/null || true
git commit -m "feat(fireflies): syncActivityFromHubSpot accepts sourceIntegration + transcriptUrl"
```

---

### Task 5: Pass new fields through sync routes

**Files:**
- Modify: `model-testing-app/src/app/api/hubspot/webhook-process/route.ts`
- Modify: `model-testing-app/src/app/api/hubspot/sync-all/route.ts`

- [ ] **Step 1: Update `webhook-process/route.ts` engagement upsert call**

Find the `fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, { ... })` call inside the `action === 'engagement'` block. Add the two fields to the mutation arguments:

```diff
 await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
   hubspotActivityId: eng.id,
   activityType: eng.type,
   activityDate: eng.timestamp,
   // ... existing fields ...
   metadata: eng.metadata,
+  sourceIntegration: eng.sourceIntegration,
+  transcriptUrl: eng.transcriptUrl,
   hubspotCompanyId: objectId,
   // ... rest ...
 });
```

- [ ] **Step 2: Update `sync-all/route.ts` engagement upsert call**

Find the `upsertEngagement` helper function. It calls the same mutation. Add the same two fields:

```diff
 await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
   hubspotActivityId: eng.id,
   activityType: eng.type,
   activityDate: eng.timestamp,
   // ... existing fields ...
+  sourceIntegration: eng.sourceIntegration,
+  transcriptUrl: eng.transcriptUrl,
   // ... rest ...
 });
```

- [ ] **Step 3: Build check**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx next build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/app/api/hubspot/webhook-process/route.ts \
        model-testing-app/src/app/api/hubspot/sync-all/route.ts
git commit -m "feat(fireflies): pass sourceIntegration + transcriptUrl through sync routes"
```

---

## Phase C — Mobile UI

### Task 6: Add `meeting-note` ActivityKind + filter inclusion

**Files:**
- Modify: `mobile-app/app/(tabs)/index.tsx`

- [ ] **Step 1: Add the new kind to the union type**

```diff
 type ActivityKind =
   | 'email-in'
   | 'email-out'
   | 'meeting'
+  | 'meeting-note'
   | 'doc'
   | 'client'
   | 'note'
   | 'call'
   | 'other';
```

- [ ] **Step 2: Handle `MEETING_NOTE` in `activityKindFromType`**

```diff
 function activityKindFromType(t: string | undefined, direction?: string | null): ActivityKind {
   switch (t) {
     case 'EMAIL':
       return direction === 'inbound' ? 'email-in' : 'email-out';
     case 'INCOMING_EMAIL':
       return 'email-in';
     case 'MEETING':
       return 'meeting';
+    case 'MEETING_NOTE':
+      return 'meeting-note';
     case 'NOTE':
       return 'note';
     case 'CALL':
       return 'call';
     default:
       return 'other';
   }
 }
```

- [ ] **Step 3: Include `meeting-note` in the Meetings filter chip**

```diff
 const ACTIVITY_FILTERS: { label: string; match: ActivityKind[] | null }[] = [
   { label: 'All', match: null },
   { label: 'Emails', match: ['email-in', 'email-out'] },
-  { label: 'Meetings', match: ['meeting'] },
+  { label: 'Meetings', match: ['meeting', 'meeting-note'] },
   { label: 'Calls', match: ['call'] },
   { label: 'Notes', match: ['note'] },
 ];
```

Notes: `meeting-note` deliberately **NOT** in the Notes filter — the whole point of this feature is to get transcripts out of the Notes section and into Meetings.

- [ ] **Step 4: Add tile styling for `meeting-note` in `tileFor`**

```diff
 function tileFor(k: ActivityKind) {
   switch (k) {
     // ... existing cases ...
     case 'meeting':
       return { bg: '#dbeafe', tint: '#2563eb', Icon: Video };
+    case 'meeting-note':
+      // Purple to distinguish transcripts from calendar meetings
+      // while staying in the "meetings" visual family.
+      return { bg: '#ede9fe', tint: '#7c3aed', Icon: FileText };
     // ... rest ...
   }
 }
```

- [ ] **Step 5: Add action-phrase mapping in the row builder**

Find the `const action =` chain in `activityRows` construction. Add:

```diff
 const action =
   kind === 'email-out'
     ? 'sent an email'
     : kind === 'email-in'
       ? 'received an email'
       : kind === 'meeting'
         ? 'scheduled a meeting'
+        : kind === 'meeting-note'
+          ? 'recorded a meeting'
         : kind === 'call'
           ? 'logged a call'
           : kind === 'note'
             ? 'added a note'
             : 'logged activity';
```

- [ ] **Step 6: Build check**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/mobile-app
npx expo export --platform all 2>&1 | tail -10 || echo "Expo export may not be available; skip if so"
```
Or just visually check the file compiles by running `npx tsc --noEmit` on the mobile-app.

- [ ] **Step 7: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/index.tsx
git commit -m "feat(fireflies): home stream treats MEETING_NOTE as meeting-kind activity"
```

---

### Task 7: Client-profile activity stream + Fireflies badge

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Mirror the kind mapping + filter updates from Task 6**

Apply the same four changes (ActivityKind union, activityKindFromType case, Meetings filter inclusion, tileFor styling, action phrase) in this file. Look for the same function names (`activityKindFromType`, `tileFor`, `ACTIVITY_FILTERS` — may have different names).

If the client-profile screen doesn't have its own copies of these helpers and imports from index.tsx or a shared utility, no changes needed beyond verifying the filter chip list.

- [ ] **Step 2: Add the Fireflies badge + summary-text treatment**

Find the activity row rendering. Where a row is rendered, add logic for when `kind === 'meeting-note'`:

- Show a small "Fireflies" pill badge next to the title
- When the row is tapped / expanded, render the `bodyPreview` as summary + a "View full transcript" expandable section showing `bodyHtml` rendered as HTML (or a plain-text fallback)
- If `transcriptUrl` is present, add an "Open in Fireflies" button that opens the URL externally

The exact component structure depends on the existing activity detail view. Pattern to follow:

```tsx
{kind === 'meeting-note' && (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
    <View style={{
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: '#ede9fe',
      borderRadius: 4,
    }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: '#7c3aed' }}>
        FIREFLIES
      </Text>
    </View>
  </View>
)}
```

For the full transcript toggle, use the existing expandable pattern in the codebase (look for `useState` toggles with `isExpanded` or similar in activity detail components).

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(fireflies): client profile shows Fireflies badge + transcript toggle"
```

---

## Phase D — One-off migration for existing activities

### Task 8: `reclassifyFirefliesNotes` Convex action

**Files:**
- Create: `model-testing-app/convex/hubspotSync/migrations.ts`

- [ ] **Step 1: Write the migration action**

Create `model-testing-app/convex/hubspotSync/migrations.ts`:

```typescript
import { v } from 'convex/values';
import { internalMutation, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';

/**
 * One-off migration: walk the activities table, find NOTE rows that
 * look like Fireflies.ai transcripts (same detection signal used at
 * sync time), and reclassify them in-place as MEETING_NOTE with
 * extracted metadata.
 *
 * Runs as an internalAction because we want to call into the parsing
 * library (fireflies.ts) which lives in src/ and can't be imported
 * from a Convex mutation. The action calls a bridge endpoint — same
 * pattern as recurringSync.ts and processWebhookEvent.
 *
 * Trigger from the Convex dashboard:
 *   Functions → hubspotSync/migrations → runFirefliesBackfill → Run
 *
 * Idempotent: re-running on already-migrated records is a no-op
 * (activityType is already MEETING_NOTE; detection doesn't match NOTE
 * anymore for those rows).
 */

const BATCH_SIZE = 50;

export const runFirefliesBackfill = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    maxBatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const maxBatches = args.maxBatches ?? 50; // safety cap

    const apiBase = process.env.NEXT_APP_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!apiBase || !cronSecret) {
      return { error: 'NEXT_APP_URL or CRON_SECRET not configured' };
    }

    const normalized = apiBase.match(/^https?:\/\//)
      ? apiBase
      : `https://${apiBase}`;
    const url = `${normalized.replace(/\/$/, '')}/api/hubspot/fireflies-backfill`;

    let cursor: string | null = null;
    let totalScanned = 0;
    let totalMatched = 0;
    let totalMigrated = 0;
    let batches = 0;
    const errors: string[] = [];

    while (batches < maxBatches) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': cronSecret,
        },
        body: JSON.stringify({ cursor, batchSize: BATCH_SIZE, dryRun }),
      });

      if (!res.ok) {
        errors.push(`batch ${batches}: HTTP ${res.status}`);
        break;
      }

      const json: any = await res.json();
      totalScanned += json.scanned ?? 0;
      totalMatched += json.matched ?? 0;
      totalMigrated += json.migrated ?? 0;
      batches++;

      if (json.isDone) break;
      cursor = json.nextCursor ?? null;
      if (!cursor) break;
    }

    return {
      totalScanned,
      totalMatched,
      totalMigrated,
      batches,
      dryRun,
      errors,
    };
  },
});
```

- [ ] **Step 2: Create the bridge endpoint that does the heavy lifting**

Create `model-testing-app/src/app/api/hubspot/fireflies-backfill/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import {
  isFirefliesTranscript,
  parseFirefliesTranscript,
} from '@/lib/hubspot/fireflies';

/**
 * One-off migration endpoint: paginated scan of existing NOTE
 * activities, reclassify any that match the Fireflies signature.
 *
 * Auth: X-Cron-Secret header. Called only by the migration action in
 * convex/hubspotSync/migrations.ts.
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { cursor, batchSize = 50, dryRun = false } = body;

  const page: any = await fetchQuery(
    api.hubspotSync.migrations.listNotePageForFirefliesBackfill,
    { cursor: cursor ?? null, pageSize: batchSize },
  );

  let matched = 0;
  let migrated = 0;
  for (const note of page.items) {
    const body = note.bodyHtml ?? '';
    if (!isFirefliesTranscript(body)) continue;
    matched++;

    if (dryRun) continue;

    const parsed = parseFirefliesTranscript(body);
    await fetchMutation(
      api.hubspotSync.migrations.reclassifyActivityAsFirefliesMeetingNote,
      {
        activityId: note._id,
        subject: parsed.title ?? 'Call transcript',
        duration: parsed.duration,
        toEmails: parsed.participantEmails,
        transcriptUrl: parsed.transcriptUrl,
      },
    );
    migrated++;
  }

  return NextResponse.json({
    scanned: page.items.length,
    matched,
    migrated,
    isDone: page.isDone,
    nextCursor: page.continueCursor,
    dryRun,
  });
}
```

- [ ] **Step 3: Add the supporting Convex query + mutation**

Back to `model-testing-app/convex/hubspotSync/migrations.ts`, append:

```typescript
import { query } from '../_generated/server';

/**
 * Paginated page of NOTE-type activities for the Fireflies backfill.
 * Uses the by_activity_type index so we only scan notes.
 */
export const listNotePageForFirefliesBackfill = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('activities')
      .withIndex('by_activity_type', (q) =>
        q.eq('activityType', 'NOTE'),
      )
      .order('desc')
      .paginate({
        numItems: args.pageSize ?? 50,
        cursor: args.cursor,
      });
    return {
      items: result.page.map((a: any) => ({
        _id: a._id,
        bodyHtml: a.bodyHtml,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * In-place reclassification of a NOTE activity as MEETING_NOTE with
 * the Fireflies-extracted metadata. Idempotent-friendly — if the
 * activity already has activityType='MEETING_NOTE', no-op.
 */
export const reclassifyActivityAsFirefliesMeetingNote = internalMutation({
  args: {
    activityId: v.id('activities'),
    subject: v.string(),
    duration: v.optional(v.number()),
    toEmails: v.optional(v.array(v.string())),
    transcriptUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing: any = await ctx.db.get(args.activityId);
    if (!existing) return { found: false };
    if (existing.activityType === 'MEETING_NOTE') {
      return { found: true, alreadyMigrated: true };
    }

    const patch: Record<string, any> = {
      activityType: 'MEETING_NOTE',
      subject: args.subject,
      sourceIntegration: 'fireflies',
    };
    if (args.duration !== undefined) patch.duration = args.duration;
    if (args.toEmails !== undefined) patch.toEmails = args.toEmails;
    if (args.transcriptUrl !== undefined) {
      patch.transcriptUrl = args.transcriptUrl;
    }

    await ctx.db.patch(args.activityId, patch);
    return { found: true, migrated: true };
  },
});
```

- [ ] **Step 4: Add the route to middleware**

`model-testing-app/src/middleware.ts` — add to `isPublicRoute`:

```diff
   '/api/hubspot/webhook-process(.*)',
+  '/api/hubspot/fireflies-backfill(.*)',
```

- [ ] **Step 5: Regenerate + build**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen && npx next build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/migrations.ts \
        model-testing-app/src/app/api/hubspot/fireflies-backfill/route.ts \
        model-testing-app/src/middleware.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(fireflies): one-off backfill action to reclassify existing NOTE transcripts"
```

---

## Phase E — User-triggered migration + verify

### Task 9: User runs the backfill dry-run, then real run

This is user action, not code. Document for clarity:

- [ ] **Step 1: Dry run from Convex dashboard**

Convex dashboard → Functions → `hubspotSync/migrations` → `runFirefliesBackfill` → Run with args:

```json
{ "dryRun": true }
```

Expected output: `totalScanned: N`, `totalMatched: M`, `totalMigrated: 0` (dry run doesn't write). `M` should be the number of Fireflies transcripts sitting in the NOTE pool that will get reclassified.

- [ ] **Step 2: Real run**

Run again with `{}` (or `{ "dryRun": false }`). Expected: `totalMigrated` equals the previous dry-run's `totalMatched`.

- [ ] **Step 3: Spot-check one migrated activity**

Convex dashboard → Data → `activities` → filter `activityType='MEETING_NOTE'` → pick a recent one. Verify:
- `activityType` is `MEETING_NOTE`
- `subject` is a meeting title (e.g. "Comberton")
- `sourceIntegration` is `"fireflies"`
- `transcriptUrl` is a `https://app.fireflies.ai/view/...` link
- `duration` is a number (milliseconds)
- `toEmails` is an array of participant emails
- `bodyHtml` still contains the full transcript

- [ ] **Step 4: Verify mobile UI**

Open mobile app → home → Activity Stream → **Meetings** tab. Should see reclassified transcripts listed alongside calendar meetings with a Fireflies badge. Tap one → summary visible + option to expand full transcript + "Open in Fireflies" button (if the client-detail screen surfaces this).

---

## Task 10: Cleanup + final build + push

- [ ] **Step 1: Delete the `_debug.ts` query (no longer needed)**

```bash
rm model-testing-app/convex/hubspotSync/_debug.ts
cd model-testing-app && npx convex codegen
```

- [ ] **Step 2: Full build + tests**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx next build 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (especially the new `fireflies.test.ts`), build succeeds, `/api/hubspot/fireflies-backfill` appears in the route list.

- [ ] **Step 3: Commit cleanup + push**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add -A model-testing-app/convex/hubspotSync/
git commit -m "chore(fireflies): remove _debug query after backfill ships"
git push
```

---

## Success metric

One week after backfill runs:
- All Fireflies transcripts (historical + new via webhook) live in Convex as `activityType='MEETING_NOTE'`
- Mobile Meetings tab shows actual meetings AND transcripts, visually distinguishable
- Users can tap any transcript row → see summary → expand to full transcript OR open Fireflies directly
- Zero Fireflies-sourced records left in the Notes section

---

## Out of scope (deferred)

- **Linking MEETING_NOTEs to actual MEETINGs by participant/date proximity.** A future polish pass could match a meeting-note to the calendar meeting it transcribes, so clicking a meeting shows the linked transcript inline. Needs fuzzy matching; not blocking.
- **Smarter summary extraction** that skips the title/date/emails header block and starts at the first `<h4>` section. MVP uses the existing `bodyPreview` unchanged.
- **Other AI note-takers.** `sourceIntegration` is generic; detection is Fireflies-specific. When Gong / Grain / Otter / etc. appear, add detectors in a sibling file — architecture supports it.
- **Non-English transcripts.** Current detection relies on the English boilerplate phrase "Time markers in this document." If Fireflies localizes, we add language-specific markers.
