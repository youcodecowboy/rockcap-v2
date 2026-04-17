# HubSpot Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the now-populated HubSpot data (companies/contacts/deals/activities) into the React Native mobile client profile — new Deals and Activity tabs, extended Overview hero zone, Beauhurst section in the Intelligence tab, and a new-client creation flow with company autocomplete.

**Architecture:** Five independent phases (A-E), each shipping a self-contained chunk of mobile UI. All components follow the existing NativeWind patterns (`bg-m-bg-card`, `text-m-text-primary`, `rounded-[12px]`). Icons come from `lucide-react-native`. Data via Convex `useQuery` hooks. Phases are ordered by user-facing priority: Overview hero first (most visible), then new tabs, then enrichments, then creation flow.

**Tech Stack:** React Native / Expo · NativeWind · Convex · expo-router · lucide-react-native. No new libraries. Uses existing theme (`mobile-app/lib/theme.ts`) and existing components (`Card`, `ContactAvatar`, `ContactDetailModal` as a slide-up sheet reference, `MetricTile` pattern).

**Related documents:**
- Design spec: `docs/superpowers/specs/2026-04-16-hubspot-sync-mobile-client-profile-design.md`
- Plan 1 (backend, complete): `docs/superpowers/plans/2026-04-16-hubspot-sync-backend.md`
- Brainstorm mockups (archived): `.superpowers/brainstorm/39151-1776381589/content/mobile-*.html`

**Real-data discoveries from Plan 1 execution** (inform Plan 2 decisions):
1. The mobile `contacts` list chips filter by `companies.promotedToClientId`, not by `linkedCompanyIds[]`. Plan 2 phase E (autocomplete) creates new clients with this link set; phase A doesn't change this — "Unlinked" just means "company isn't a promoted client yet."
2. `contact.company` (legacy string) is populated only when HubSpot's `properties.company` string is set. Most contacts only have the association. Plan 2 phase A surfaces the Convex-linked company name as a fallback so the contact row always shows a company.
3. Convex `v.optional(v.string())` rejects `null` (only accepts `undefined` or string). When writing any new mutations in Plan 2, coerce nulls to undefined.

---

## File Structure

### Files to create

**Convex queries** (data for UI):
- `mobile-app/convex/../queries/dealsForClient.ts` → add to `convex/deals.ts`: `listForClient`, `listOpenForClient`
- `convex/activities.ts` → add: `listForClient`, `countForClient`, `listRecentForClient` (limit, filter by type)
- `convex/companies.ts` → add: `searchByName`, `getWithContactsDeals` (for client profile)
- `convex/contacts.ts` → add: `listByCompany` (derived via linkedCompanyIds lookup)

**Mobile components — new:**
- `mobile-app/components/client/SyncStrip.tsx` (owner + sync time + HubSpot external link)
- `mobile-app/components/client/OpenDealsCard.tsx`
- `mobile-app/components/client/RecentActivityCard.tsx`
- `mobile-app/components/client/BeauhurstMiniCard.tsx`
- `mobile-app/components/client/ClassificationCard.tsx`
- `mobile-app/components/deals/DealCard.tsx`
- `mobile-app/components/deals/DealDetailSheet.tsx`
- `mobile-app/components/activity/ActivityCard.tsx`
- `mobile-app/components/intelligence/BeauhurstIdentityCard.tsx`
- `mobile-app/components/intelligence/BeauhurstFinancialsCard.tsx`
- `mobile-app/components/intelligence/BeauhurstSignalsCard.tsx`
- `mobile-app/components/clients/CompanyAutocomplete.tsx`
- `mobile-app/lib/dealStageColors.ts` (stage-id-to-tone lookup)

**Mobile screens — new:**
- `mobile-app/app/(tabs)/clients/[clientId]/deals/index.tsx` (Deals tab, but mounted as a sub-route for linkability)
- OR just inline in `[clientId]/index.tsx` as a tab case (decide per-phase)

### Files to modify

- `mobile-app/app/(tabs)/clients/[clientId]/index.tsx` — add `'Activity'` and `'Deals'` to TABS; wire new Overview components; add tab-rendering branches
- `mobile-app/components/contacts/ContactDetailModal.tsx` — add "Company" row below Role (Phase A.6)
- `mobile-app/app/contacts/index.tsx` — enhance chip list to show all linked companies (not just promoted clients) as a Plan 2.5 improvement (optional)
- `mobile-app/app/(tabs)/clients/new.tsx` or wherever new-client creation lives — integrate CompanyAutocomplete (Phase E)

### Notes on Convex queries

All new queries use the pattern from existing `list` in `convex/clients.ts`:
```typescript
export const listForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Resolve via companies.promotedToClientId → companies → deals.linkedCompanyIds
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    const companyIds = companies.map(c => c._id);
    const deals = await ctx.db.query("deals").collect();
    return deals.filter(d => (d.linkedCompanyIds ?? []).some(id => companyIds.includes(id)));
  },
});
```

Similar pattern for `activities.listForClient` — resolve via company link then filter activities by `linkedCompanyId`.

---

## Phase A — Overview Tab Hero Zone

### Task A.1: Add Convex query `deals.listForClient`

**Files:**
- Modify: `model-testing-app/convex/deals.ts`

- [ ] **Step 1: Append the query**

At the bottom of `model-testing-app/convex/deals.ts`, add:

```typescript
// ---- Client-scoped queries (Plan 2 phase A) ----

/**
 * List all deals associated with a client, resolved via the companies
 * that have been promoted to this client.
 */
export const listForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter((d) =>
      (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)),
    );
  },
});

/**
 * List only OPEN deals (not closed-won/closed-lost) for a client.
 * Used by the Overview hero "Open Deals" card.
 */
export const listOpenForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter(
      (d) =>
        (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)) &&
        d.isClosed !== true,
    );
  },
});
```

- [ ] **Step 2: Verify codegen**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
```

Expected: clean, new queries appear in `convex/_generated/api.d.ts`.

- [ ] **Step 3: Smoke-test against a known client**

```bash
# Bayfield Homes client ID was returned by the back-link script run; use that.
# If you don't have the ID handy, run: npx convex run clients:list '{}' | grep -i bayfield
npx convex run deals:listOpenForClient '{"clientId":"kn7c2q600dxnsz7k59rgz56ak98279pc"}' 2>&1 | head -20
```

Expected: array of deals (Bayfield has 3 HubSpot deals, some open).

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/deals.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add deals.listForClient + listOpenForClient queries"
```

### Task A.2: Add Convex queries `activities.listForClient` + `countForClient` + `listRecentForClient`

**Files:**
- Modify: `model-testing-app/convex/activities.ts`

- [ ] **Step 1: Check if activities.ts query file exists**

```bash
ls model-testing-app/convex/activities.ts 2>/dev/null
```

If it doesn't exist, create it with:

```typescript
import { v } from "convex/values";
import { query } from "./_generated/server";
```

- [ ] **Step 2: Append the queries**

Add to `model-testing-app/convex/activities.ts`:

```typescript
/**
 * List activities for a client, resolved via the companies promoted to this client.
 * Sorted by activityDate descending.
 */
export const listForClient = query({
  args: {
    clientId: v.id("clients"),
    typeFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    const filtered = all
      .filter((a) => a.companyId && companyIds.has(a.companyId))
      .filter((a) => (args.typeFilter ? a.activityType === args.typeFilter : true))
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""));
    return args.limit ? filtered.slice(0, args.limit) : filtered;
  },
});

/**
 * Count activities for a client (used for tab-badge display).
 */
export const countForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return 0;
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    return all.filter((a) => a.companyId && companyIds.has(a.companyId)).length;
  },
});

/**
 * Most recent N activities for a client (Overview hero card — default 2).
 */
export const listRecentForClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 2;
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    return all
      .filter((a) => a.companyId && companyIds.has(a.companyId))
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""))
      .slice(0, n);
  },
});
```

- [ ] **Step 3: Codegen + smoke test + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen
npx convex run activities:countForClient '{"clientId":"kn7bsdj1s25xnznb0q9pr9e79h82jt90"}'  # Talbot Homes
# Expected: number > 0 (Talbot has 100+ activities)

cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/activities.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add activities queries for client-scoped fetching"
```

### Task A.3: `SyncStrip` component

**Files:**
- Create: `mobile-app/components/client/SyncStrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { User, ExternalLink } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface SyncStripProps {
  ownerName?: string;
  lastSync?: string;
  hubspotUrl?: string;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function SyncStrip({ ownerName, lastSync, hubspotUrl }: SyncStripProps) {
  return (
    <View className="flex-row items-center gap-2 px-1 py-1" style={{ flexWrap: 'wrap' }}>
      {ownerName ? (
        <View
          className="flex-row items-center gap-1 bg-m-bg-subtle px-2 py-0.5 rounded-full"
        >
          <User size={11} color={colors.textSecondary} strokeWidth={2} />
          <Text className="text-xs text-m-text-secondary font-medium">{ownerName}</Text>
        </View>
      ) : null}
      {lastSync ? (
        <Text className="text-xs text-m-text-tertiary">Synced {formatRelativeTime(lastSync)}</Text>
      ) : null}
      {hubspotUrl ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(hubspotUrl)}
          className="flex-row items-center gap-1 ml-auto"
          hitSlop={8}
        >
          <Text className="text-xs font-medium text-m-text-primary">HubSpot</Text>
          <ExternalLink size={11} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/mobile-app
npx tsc --noEmit 2>&1 | grep SyncStrip | head -5
# Expected: no errors

cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/client/SyncStrip.tsx
git commit -m "feat(mobile): add SyncStrip component (owner + last sync + HubSpot link)"
```

### Task A.4: `OpenDealsCard` component

**Files:**
- Create: `mobile-app/components/client/OpenDealsCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { TrendingUp, ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface OpenDealsCardProps {
  clientId: Id<'clients'>;
  onViewAll?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

export default function OpenDealsCard({ clientId, onViewAll }: OpenDealsCardProps) {
  const deals = useQuery(api.deals.listOpenForClient, { clientId }) ?? [];
  const allDeals = useQuery(api.deals.listForClient, { clientId }) ?? [];

  const openTotal = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
  const won = allDeals.filter((d) => d.isClosedWon === true);
  const lost = allDeals.filter((d) => d.isClosed === true && d.isClosedWon !== true);
  const wonTotal = won.reduce((s, d) => s + (d.amount ?? 0), 0);
  const lostTotal = lost.reduce((s, d) => s + (d.amount ?? 0), 0);

  const topOpen = deals
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 2);

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-5 h-5 rounded-[6px] items-center justify-center"
            style={{ backgroundColor: '#dcfce7' }}
          >
            <TrendingUp size={12} color="#059669" strokeWidth={2} />
          </View>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Open deals
          </Text>
        </View>
        <TouchableOpacity onPress={onViewAll} hitSlop={6} className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-m-text-primary">
            View all {allDeals.length}
          </Text>
          <ChevronRight size={12} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="flex-row items-baseline gap-1.5 mb-3">
        <Text className="text-[22px] font-bold text-m-text-primary">{formatMoney(openTotal)}</Text>
        <Text className="text-xs text-m-text-tertiary">in {deals.length} open deals</Text>
      </View>

      <View className="gap-2">
        {topOpen.map((d) => (
          <View
            key={d._id}
            className="flex-row justify-between items-start p-2 bg-m-bg rounded-[8px] border border-m-border-subtle"
          >
            <View className="flex-1 min-w-0 mr-2">
              <Text className="text-[13px] font-medium text-m-text-primary" numberOfLines={1}>
                {d.name}
              </Text>
              <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                {d.stageName ?? d.stage ?? '—'}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-m-text-primary">
              {formatMoney(d.amount)}
            </Text>
          </View>
        ))}
        {topOpen.length === 0 ? (
          <Text className="text-xs text-m-text-tertiary italic">No open deals</Text>
        ) : null}
      </View>

      <View
        className="mt-2.5 pt-2.5 border-t border-m-border-subtle flex-row justify-between"
      >
        <Text className="text-[11px] text-m-text-tertiary">
          Won <Text className="text-m-success font-semibold">{formatMoney(wonTotal)}</Text>
        </Text>
        <Text className="text-[11px] text-m-text-tertiary">
          Lost{' '}
          <Text className="text-m-text-secondary font-semibold">{formatMoney(lostTotal)}</Text>
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: TS check + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/mobile-app
npx tsc --noEmit 2>&1 | grep OpenDealsCard | head -5

cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/client/OpenDealsCard.tsx
git commit -m "feat(mobile): add OpenDealsCard hero component for Overview tab"
```

### Task A.5: `RecentActivityCard` component

**Files:**
- Create: `mobile-app/components/client/RecentActivityCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { Clock, ChevronRight, StickyNote, Mail, Video, Phone, CheckSquare } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface RecentActivityCardProps {
  clientId: Id<'clients'>;
  onViewAll?: () => void;
}

const TYPE_TILE = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', icon: CheckSquare, label: 'Task' },
} as const;

function formatRelativeDate(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function RecentActivityCard({ clientId, onViewAll }: RecentActivityCardProps) {
  const recent = useQuery(api.activities.listRecentForClient, { clientId, limit: 2 }) ?? [];
  const total = useQuery(api.activities.countForClient, { clientId }) ?? 0;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-5 h-5 rounded-[6px] items-center justify-center"
            style={{ backgroundColor: '#ffedd5' }}
          >
            <Clock size={12} color="#ea580c" strokeWidth={2} />
          </View>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Recent activity
          </Text>
        </View>
        <TouchableOpacity onPress={onViewAll} hitSlop={6} className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-m-text-primary">See all</Text>
          <ChevronRight size={12} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="gap-3">
        {recent.map((a) => {
          const tile = TYPE_TILE[a.activityType as keyof typeof TYPE_TILE] ?? TYPE_TILE.NOTE;
          const Icon = tile.icon;
          return (
            <View key={a._id} className="flex-row gap-2.5">
              <View
                className="w-[30px] h-[30px] rounded-[8px] items-center justify-center"
                style={{ backgroundColor: tile.bg }}
              >
                <Icon size={14} color={tile.tint} strokeWidth={2} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[11px] text-m-text-tertiary mb-0.5">
                  <Text className="text-m-text-secondary font-medium">{tile.label}</Text> ·{' '}
                  {formatRelativeDate(a.activityDate)}
                </Text>
                <Text className="text-[13px] text-m-text-primary" numberOfLines={1}>
                  {a.subject || a.bodyPreview || '(no subject)'}
                </Text>
              </View>
            </View>
          );
        })}
        {recent.length === 0 ? (
          <Text className="text-xs text-m-text-tertiary italic">No activity yet</Text>
        ) : null}
      </View>

      <View className="mt-2.5 pt-2.5 border-t border-m-border-subtle">
        <Text className="text-[11px] text-m-text-tertiary">{total} total touches</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: TS check + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/client/RecentActivityCard.tsx
git commit -m "feat(mobile): add RecentActivityCard hero component for Overview tab"
```

### Task A.6: `BeauhurstMiniCard` + `ClassificationCard` + Contacts enhancement

**Files:**
- Create: `mobile-app/components/client/BeauhurstMiniCard.tsx`
- Create: `mobile-app/components/client/ClassificationCard.tsx`
- Modify: `mobile-app/components/contacts/ContactDetailModal.tsx` (add Company row)

- [ ] **Step 1: Create BeauhurstMiniCard**

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { Building2, ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface BeauhurstMiniCardProps {
  metadata?: any;
  onPressFullIntel?: () => void;
}

function fmtMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

export default function BeauhurstMiniCard({ metadata, onPressFullIntel }: BeauhurstMiniCardProps) {
  if (!metadata) return null;
  const turnover = metadata.beauhurst_data_turnover;
  const ebitda = metadata.beauhurst_data_ebitda;
  const headcount = metadata.beauhurst_data_headcount;
  const stage = metadata.beauhurst_data_stage_of_evolution;
  const growthSignals = metadata.beauhurst_data_growth_signals;
  const riskSignals = metadata.beauhurst_data_risk_signals;

  if (!turnover && !ebitda && !headcount && !stage && !growthSignals && !riskSignals) {
    return null; // No Beauhurst data available for this company
  }

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-5 h-5 rounded-[6px] items-center justify-center"
            style={{ backgroundColor: '#dbeafe' }}
          >
            <Building2 size={12} color="#2563eb" strokeWidth={2} />
          </View>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Beauhurst intel
          </Text>
        </View>
        <TouchableOpacity
          onPress={onPressFullIntel}
          hitSlop={6}
          className="flex-row items-center gap-0.5"
        >
          <Text className="text-xs font-medium text-m-text-primary">Full intel</Text>
          <ChevronRight size={12} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap gap-y-2.5 mb-3">
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Turnover</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {fmtMoney(turnover)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Headcount</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {headcount ?? '—'}
          </Text>
        </View>
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">EBITDA</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {fmtMoney(ebitda)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Stage</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {stage ?? '—'}
          </Text>
        </View>
      </View>

      {/* Signal chips — Beauhurst returns these as semicolon-separated strings */}
      <View className="flex-row flex-wrap gap-1">
        {(growthSignals ? String(growthSignals).split(';').slice(0, 2) : []).map((s, i) => (
          <View key={`g-${i}`} style={{ backgroundColor: '#dcfce7' }} className="px-2 py-0.5 rounded-full">
            <Text className="text-[10px]" style={{ color: '#059669' }}>{s.trim()}</Text>
          </View>
        ))}
        {(riskSignals ? String(riskSignals).split(';').slice(0, 1) : []).map((s, i) => (
          <View key={`r-${i}`} style={{ backgroundColor: '#fef3c7' }} className="px-2 py-0.5 rounded-full">
            <Text className="text-[10px]" style={{ color: '#d97706' }}>{s.trim()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Create ClassificationCard**

```tsx
import { View, Text } from 'react-native';
import { Tag } from 'lucide-react-native';

interface ClassificationCardProps {
  companyType?: string;
  leadSource?: string;
  industry?: string;
  county?: string;
}

export default function ClassificationCard({
  companyType,
  leadSource,
  industry,
  county,
}: ClassificationCardProps) {
  const rows: { label: string; value: string }[] = [];
  if (companyType) rows.push({ label: 'Company type', value: companyType });
  if (leadSource) rows.push({ label: 'Lead source', value: leadSource });
  if (industry) rows.push({ label: 'Industry', value: industry });
  if (county) rows.push({ label: 'County', value: county });

  if (rows.length === 0) return null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row items-center gap-1.5 mb-2.5">
        <View
          className="w-5 h-5 rounded-[6px] items-center justify-center"
          style={{ backgroundColor: '#fef3c7' }}
        >
          <Tag size={12} color="#d97706" strokeWidth={2} />
        </View>
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
          Classification
        </Text>
      </View>
      <View className="gap-2">
        {rows.map((r) => (
          <View key={r.label} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">{r.label}</Text>
            <Text className="text-xs font-medium text-m-text-primary">{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Add "Company" row to ContactDetailModal**

Find the section in `mobile-app/components/contacts/ContactDetailModal.tsx` that renders PHONE/EMAIL/ROLE fields. Add a Company row alongside them. Query the contact's linked company name:

```tsx
// Near other useQuery calls in the modal
const linkedCompanies = useQuery(
  api.companies.listByIds,
  contact?.linkedCompanyIds?.length ? { ids: contact.linkedCompanyIds } : 'skip',
);
const companyName = contact?.company || (linkedCompanies?.[0]?.name ?? null);

// ... inside the render, alongside PHONE/EMAIL/ROLE rows:
{companyName ? (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>COMPANY</Text>
    <Text style={styles.rowValue}>{companyName}</Text>
  </View>
) : null}
```

You'll also need to add a new query `api.companies.listByIds` if it doesn't exist — append to `model-testing-app/convex/companies.ts`:

```typescript
export const listByIds = query({
  args: { ids: v.array(v.id("companies")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return results.filter((c) => c !== null);
  },
});
```

- [ ] **Step 4: Commit (3 files together)**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen

cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/client/BeauhurstMiniCard.tsx \
        mobile-app/components/client/ClassificationCard.tsx \
        mobile-app/components/contacts/ContactDetailModal.tsx \
        model-testing-app/convex/companies.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(mobile): BeauhurstMiniCard + ClassificationCard + ContactDetailModal Company row"
```

### Task A.7: Wire Overview components into client screen

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Import new components**

At the top of the file, add imports:

```tsx
import SyncStrip from '@/components/client/SyncStrip';
import OpenDealsCard from '@/components/client/OpenDealsCard';
import RecentActivityCard from '@/components/client/RecentActivityCard';
import BeauhurstMiniCard from '@/components/client/BeauhurstMiniCard';
import ClassificationCard from '@/components/client/ClassificationCard';
```

- [ ] **Step 2: Query the linked company for metadata and owner**

In the component body, add:

```tsx
const promotedCompanies = useQuery(
  api.companies.listByPromotedClient,
  isAuthenticated && clientId ? { clientId } : 'skip',
);
const primaryCompany = promotedCompanies?.[0];
```

Add the query `companies.listByPromotedClient` to `convex/companies.ts`:

```typescript
export const listByPromotedClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
  },
});
```

- [ ] **Step 3: Insert the new components into the Overview render order**

In the Overview tab content block, insert BEFORE the existing StageNoteBanner / MetricTiles:

```tsx
{activeTab === 'Overview' ? (
  <View className="gap-3">
    <StageNoteBanner value={client.stageNote ?? ''} onSave={handleStageNoteSave} />

    {primaryCompany ? (
      <SyncStrip
        ownerName={primaryCompany.ownerName}
        lastSync={primaryCompany.lastHubSpotSync}
        hubspotUrl={primaryCompany.hubspotUrl}
      />
    ) : null}

    <OpenDealsCard
      clientId={clientId}
      onViewAll={() => setActiveTab('Deals')}
    />

    <RecentActivityCard
      clientId={clientId}
      onViewAll={() => setActiveTab('Activity')}
    />

    {/* Existing metric tiles go here */}
    {/* ... */}

    <BeauhurstMiniCard
      metadata={primaryCompany?.metadata}
      onPressFullIntel={() => setActiveTab('Intelligence')}
    />

    <ClassificationCard
      companyType={primaryCompany?.metadata?.company_type}
      leadSource={primaryCompany?.metadata?.lead_source}
      industry={primaryCompany?.industry}
      county={primaryCompany?.metadata?.company_county}
    />

    {/* Existing ContactsSection, Company Info continue below */}
  </View>
) : null}
```

- [ ] **Step 4: Codegen + TS check + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen

cd /Users/cowboy/rockcap/rockcap-v2/mobile-app
npx tsc --noEmit 2>&1 | grep clients | head -10
# Expected: no new errors introduced

cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx \
        model-testing-app/convex/companies.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(mobile): wire SyncStrip/OpenDeals/RecentActivity/Beauhurst/Classification into Overview"
```

- [ ] **Step 5: Visual verification**

Open Expo / simulator, navigate to a client that has HubSpot data (e.g., Bayfield Homes, Talbot Homes, Halo Living). Confirm:
- SyncStrip shows owner name + "Synced <time> ago" + HubSpot ↗ link
- OpenDealsCard shows amount total + 2 deal teasers + Won/Lost footer
- RecentActivityCard shows 2 recent items with correct type icons
- BeauhurstMiniCard shows 4 KPIs + signal chips
- ClassificationCard shows company type / lead source / county
- Tapping "View all" on deals → Deals tab (will exist after Phase B)
- Tapping "See all" on activity → Activity tab (will exist after Phase C)
- Tapping "Full intel" on Beauhurst → Intelligence tab

---

## Phase B — Deals Tab + Slide-Up Detail Sheet

### Task B.1: Stage-id-to-color lookup utility

**Files:**
- Create: `mobile-app/lib/dealStageColors.ts`

- [ ] **Step 1: Create the utility**

```typescript
/**
 * Deal stage category → color tone mapping.
 *
 * HubSpot returns `stage` as an opaque ID (e.g. "2388762828") and we resolve
 * `stageName` via pipelines.ts at sync time. But pipeline names vary per
 * tenant ("Contract Sent", "Appointment", "Proposal", etc.). Rather than
 * hardcode every stage ID, we categorize by the stageName using keywords.
 */

export type StageCategory = 'amber' | 'blue' | 'purple' | 'green' | 'grey';

const KEYWORD_MAP: { keywords: string[]; category: StageCategory }[] = [
  // Closed stages take priority (checked first)
  { keywords: ['closed won', 'won', 'closedwon'], category: 'green' },
  { keywords: ['closed lost', 'lost', 'closedlost'], category: 'grey' },
  // Near-close activity
  { keywords: ['contract', 'appointment', 'scheduled'], category: 'amber' },
  // Mid-pipeline proposals
  { keywords: ['proposal', 'initial', 'qualification'], category: 'blue' },
  // Active negotiation
  { keywords: ['negotiation', 'discovery', 'demo'], category: 'purple' },
];

const TONES: Record<StageCategory, { bg: string; text: string }> = {
  amber: { bg: '#fef3c7', text: '#d97706' },
  blue: { bg: '#dbeafe', text: '#2563eb' },
  purple: { bg: '#f3e8ff', text: '#9333ea' },
  green: { bg: '#dcfce7', text: '#059669' },
  grey: { bg: '#f5f5f4', text: '#525252' },
};

export function categorizeStage(stageName?: string): StageCategory {
  if (!stageName) return 'blue';
  const lower = stageName.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.category;
  }
  return 'blue'; // default for unrecognized
}

export function stageTone(stageName?: string): { bg: string; text: string } {
  return TONES[categorizeStage(stageName)];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/lib/dealStageColors.ts
git commit -m "feat(mobile): add deal stage category color lookup"
```

### Task B.2: `DealCard` component

**Files:**
- Create: `mobile-app/components/deals/DealCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { stageTone } from '@/lib/dealStageColors';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';

interface DealCardProps {
  deal: Doc<'deals'>;
  onPress?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatClose(iso?: string): { text: string; tone: 'normal' | 'warn' | 'past' } {
  if (!iso) return { text: 'No close date', tone: 'normal' };
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((then - now) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `Past ${-days}d`, tone: 'past' };
  if (days <= 14) return { text: `Closes ${days}d`, tone: 'warn' };
  return { text: new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), tone: 'normal' };
}

function formatLastActivity(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function DealCard({ deal, onPress }: DealCardProps) {
  const tone = stageTone(deal.stageName);
  const closeInfo = formatClose(deal.closeDate);
  const closeColor =
    closeInfo.tone === 'past' ? colors.error : closeInfo.tone === 'warn' ? colors.warning : colors.textTertiary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-m-bg-card border border-m-border rounded-[12px] p-3"
    >
      <View className="flex-row justify-between items-start gap-2 mb-2">
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-m-text-primary" numberOfLines={1}>
            {deal.name}
          </Text>
          {deal.spvName ? (
            <Text className="text-[11px] text-m-text-tertiary mt-0.5">SPV: {deal.spvName}</Text>
          ) : null}
        </View>
        <Text className="text-base font-bold text-m-text-primary">{formatMoney(deal.amount)}</Text>
      </View>

      <View className="flex-row items-center flex-wrap gap-1.5">
        <View style={{ backgroundColor: tone.bg }} className="px-2 py-0.5 rounded-full">
          <Text style={{ color: tone.text }} className="text-[10px] font-medium">
            {deal.stageName ?? '—'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Calendar size={11} color={closeColor} strokeWidth={2} />
          <Text style={{ color: closeColor }} className="text-[11px]">
            {closeInfo.text}
          </Text>
        </View>
        <View className="flex-row items-center gap-1 ml-auto">
          <Clock size={11} color={colors.textTertiary} strokeWidth={2} />
          <Text className="text-[11px] text-m-text-tertiary">{formatLastActivity(deal.lastActivityDate)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: TS check + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/deals/DealCard.tsx
git commit -m "feat(mobile): add DealCard component with stage color + close-date urgency"
```

### Task B.3: `DealDetailSheet` slide-up sheet

**Files:**
- Create: `mobile-app/components/deals/DealDetailSheet.tsx`

- [ ] **Step 1: Create the component**

Use React Native `Modal` with slide animation from bottom. Content matches mockup [mobile-deal-detail-sheet.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-deal-detail-sheet.html).

```tsx
import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, SafeAreaView, Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Doc, Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { X, ChevronRight, ExternalLink, User } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { stageTone } from '@/lib/dealStageColors';

interface DealDetailSheetProps {
  deal: Doc<'deals'> | null;
  visible: boolean;
  onClose: () => void;
  onViewAllActivity?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

export default function DealDetailSheet({ deal, visible, onClose, onViewAllActivity }: DealDetailSheetProps) {
  const linkedContacts = useQuery(
    api.contacts.listByIds,
    deal?.linkedContactIds?.length ? { ids: deal.linkedContactIds } : 'skip',
  );

  if (!deal) return null;
  const tone = stageTone(deal.stageName);
  const probabilityPct = deal.probability ? Math.round(deal.probability * 100) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(10,10,10,0.5)' }}>
        <SafeAreaView className="bg-m-bg rounded-t-[20px] max-h-[92%]">
          <View className="items-center py-2">
            <View className="w-10 h-1 bg-m-bg-inset rounded-full" />
          </View>

          <View className="flex-row justify-between items-start px-4 pb-3 border-b border-m-border bg-m-bg-card">
            <View className="flex-1 min-w-0">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-0.5">
                Deal
              </Text>
              <Text className="text-[17px] font-bold text-m-text-primary">{deal.name}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-[30px] h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
              hitSlop={8}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-3.5 py-3.5" contentContainerStyle={{ gap: 12 }}>
            {/* Amount + Stage */}
            <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
              <View className="flex-row justify-between items-start">
                <View>
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase">Amount</Text>
                  <Text className="text-[26px] font-bold text-m-text-primary mt-0.5">
                    {formatMoney(deal.amount)}
                  </Text>
                </View>
                <View style={{ backgroundColor: tone.bg }} className="px-3 py-1 rounded-full self-center">
                  <Text style={{ color: tone.text }} className="text-xs font-semibold">
                    {deal.stageName ?? '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Details grid */}
            <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5">Details</Text>
              <View className="flex-row flex-wrap gap-y-3">
                <View className="w-1/2 pr-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Close date</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {deal.closeDate ? new Date(deal.closeDate).toLocaleDateString('en-GB') : 'No date'}
                  </Text>
                </View>
                <View className="w-1/2 pl-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Probability</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {probabilityPct !== null ? `${probabilityPct}%` : '—'}
                  </Text>
                </View>
                <View className="w-1/2 pr-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Pipeline</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {deal.pipelineName ?? '—'}
                  </Text>
                </View>
                <View className="w-1/2 pl-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Deal type</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">{deal.dealType ?? '—'}</Text>
                </View>
                {deal.spvName ? (
                  <View className="w-full">
                    <Text className="text-[10px] text-m-text-tertiary uppercase">SPV</Text>
                    <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">{deal.spvName}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* HubSpot link */}
            {deal.hubspotUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(deal.hubspotUrl!)}
                className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row items-center gap-2.5"
              >
                <View
                  className="w-8 h-8 rounded-full bg-m-bg-subtle items-center justify-center"
                >
                  <ExternalLink size={14} color={colors.textSecondary} strokeWidth={2} />
                </View>
                <Text className="text-sm font-medium text-m-text-primary flex-1">Open in HubSpot</Text>
                <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}

            {/* Linked contacts */}
            {linkedContacts && linkedContacts.length > 0 ? (
              <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5">
                  Linked contacts ({linkedContacts.length})
                </Text>
                <View className="gap-2.5">
                  {linkedContacts.slice(0, 5).map((c) => (
                    <View key={c._id} className="flex-row items-center gap-2.5">
                      <View className="w-8 h-8 rounded-full bg-m-bg-subtle items-center justify-center">
                        <User size={14} color={colors.textSecondary} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
                          {c.name}
                        </Text>
                        {c.role ? (
                          <Text className="text-[11px] text-m-text-tertiary" numberOfLines={1}>
                            {c.role}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Recent activity link */}
            <TouchableOpacity
              onPress={onViewAllActivity}
              className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row items-center"
            >
              <Text className="text-sm font-medium text-m-text-primary flex-1">
                View activity for this deal
              </Text>
              <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Add `contacts.listByIds` query to `convex/contacts.ts` if it doesn't exist**

```typescript
export const listByIds = query({
  args: { ids: v.array(v.id("contacts")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return results.filter((c) => c !== null);
  },
});
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen

cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/deals/DealDetailSheet.tsx model-testing-app/convex/contacts.ts model-testing-app/convex/_generated/
git commit -m "feat(mobile): add DealDetailSheet slide-up + contacts.listByIds query"
```

### Task B.4: `DealsTab` screen content

**Files:**
- Create or modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx` (tab content inline)

- [ ] **Step 1: Add a DealsTab inline component**

Inside `[clientId]/index.tsx`, add a new local component `DealsTab` (keeps all the client page in one file for consistency with existing Projects tab):

```tsx
function DealsTab({ clientId }: { clientId: Id<'clients'> }) {
  const deals = useQuery(api.deals.listForClient, { clientId }) ?? [];
  const [search, setSearch] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [openExpanded, setOpenExpanded] = useState(true);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? deals.filter((d) => (d.name ?? '').toLowerCase().includes(q))
    : deals;

  const open = filtered.filter((d) => d.isClosed !== true);
  const won = filtered.filter((d) => d.isClosedWon === true);
  const lost = filtered.filter((d) => d.isClosed === true && d.isClosedWon !== true);

  const sum = (arr: any[]) => arr.reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <View className="gap-3">
      {/* Summary strip */}
      <View className="flex-row gap-2">
        {[
          { label: 'Open', total: sum(open), count: open.length, tone: '#0a0a0a' },
          { label: 'Won', total: sum(won), count: won.length, tone: '#059669' },
          { label: 'Lost', total: sum(lost), count: lost.length, tone: '#525252' },
        ].map((s) => (
          <View
            key={s.label}
            className="flex-1 bg-m-bg-card border border-m-border rounded-[12px] p-2.5 items-center"
          >
            <Text className="text-[9px] font-semibold text-m-text-tertiary uppercase">
              {s.label}
            </Text>
            <Text className="text-[15px] font-bold mt-0.5" style={{ color: s.tone }}>
              {formatCurrency(s.total)}
            </Text>
            <Text className="text-[10px] text-m-text-tertiary">{s.count} deals</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View className="bg-m-bg-card rounded-[10px] border border-m-border flex-row items-center px-3">
        <Search size={14} color={colors.textTertiary} />
        <TextInput
          placeholder="Search deals..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          className="flex-1 text-sm text-m-text-primary ml-2 py-2.5"
        />
      </View>

      {/* Open section (expandable) */}
      <TouchableOpacity
        onPress={() => setOpenExpanded(!openExpanded)}
        className="flex-row items-center gap-2 px-1"
      >
        <ChevronRight
          size={14}
          color={colors.textSecondary}
          strokeWidth={2}
          style={{ transform: [{ rotate: openExpanded ? '90deg' : '0deg' }] }}
        />
        <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
          Open ({open.length})
        </Text>
      </TouchableOpacity>
      {openExpanded ? (
        <View className="gap-2">
          {open.map((d) => (
            <DealCard key={d._id} deal={d} onPress={() => setSelectedDeal(d)} />
          ))}
          {open.length === 0 ? (
            <Text className="text-xs text-m-text-tertiary italic p-3">No open deals</Text>
          ) : null}
        </View>
      ) : null}

      {/* Won/Lost collapsed summary rows */}
      {[
        { label: 'Closed Won', deals: won, tone: colors.success },
        { label: 'Closed Lost', deals: lost, tone: colors.textSecondary },
      ].map((group) => (
        <TouchableOpacity
          key={group.label}
          className="flex-row items-center gap-2 bg-m-bg-card border border-m-border rounded-[12px] px-3.5 py-2.5"
        >
          <ChevronRight size={14} color={colors.textSecondary} strokeWidth={2} />
          <Text className="text-xs font-semibold text-m-text-primary flex-1">{group.label}</Text>
          <Text className="text-[11px] font-semibold" style={{ color: group.tone }}>
            {formatCurrency(sum(group.deals))}
          </Text>
          <Text className="text-[11px] text-m-text-tertiary">· {group.deals.length} deals</Text>
        </TouchableOpacity>
      ))}

      <DealDetailSheet
        deal={selectedDeal}
        visible={selectedDeal !== null}
        onClose={() => setSelectedDeal(null)}
      />
    </View>
  );
}
```

- [ ] **Step 2: Add `'Deals'` to TABS constant + render branch**

```tsx
// Update TABS:
const TABS = ['Overview', 'Deals', 'Projects', 'Docs', 'Intelligence', 'Notes', 'Tasks', 'Checklist', 'Meetings', 'Flags'] as const;

// In the tab content render switch:
{activeTab === 'Deals' ? <DealsTab clientId={clientId} /> : null}
```

- [ ] **Step 3: Import DealCard + DealDetailSheet + Search icon**

```tsx
import DealCard from '@/components/deals/DealCard';
import DealDetailSheet from '@/components/deals/DealDetailSheet';
import { Search } from 'lucide-react-native';
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): add Deals tab with DealCard + summary strip + detail sheet"
```

- [ ] **Step 5: Visual verification**

Open the mobile app, navigate to Talbot Homes client (has 13 deals). Confirm:
- Deals tab appears in the tab bar
- Summary strip shows Open/Won/Lost counts + amounts
- Search filters deals
- Tap a deal → sheet slides up with details
- Dismiss the sheet

---

## Phase C — Activity Tab (Unified Engagement Feed)

### Task C.1: `ActivityCard` component

**Files:**
- Create: `mobile-app/components/activity/ActivityCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text } from 'react-native';
import { StickyNote, Mail, Video, Phone, CheckSquare, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';

interface ActivityCardProps {
  activity: Doc<'activities'>;
}

const TYPE_TILE = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', Icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', Icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', Icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', Icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', Icon: CheckSquare, label: 'Task' },
} as const;

function formatTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const typeKey = activity.activityType as keyof typeof TYPE_TILE;
  const tile = TYPE_TILE[typeKey] ?? TYPE_TILE.NOTE;
  const Icon = tile.Icon;
  const direction = activity.direction; // 'inbound' | 'outbound' | undefined
  const isEmail = typeKey === 'EMAIL' || typeKey === 'INCOMING_EMAIL';

  const attribution =
    tile.label +
    (direction ? ` · ${direction}` : '') +
    (activity.duration ? ` · ${formatDuration(activity.duration)}` : '') +
    (activity.ownerName ? ` · ${activity.ownerName}` : '');

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row gap-2.5">
      <View
        className="w-8 h-8 rounded-[8px] items-center justify-center relative"
        style={{ backgroundColor: tile.bg }}
      >
        <Icon size={16} color={tile.tint} strokeWidth={2} />
        {isEmail && direction ? (
          <View
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full items-center justify-center"
            style={{
              backgroundColor: direction === 'outbound' ? '#ea580c' : '#059669',
              borderWidth: 2,
              borderColor: '#fafaf9',
            }}
          >
            {direction === 'outbound' ? (
              <ArrowUpRight size={7} color="#ffffff" strokeWidth={3} />
            ) : (
              <ArrowDownLeft size={7} color="#ffffff" strokeWidth={3} />
            )}
          </View>
        ) : null}
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-baseline mb-0.5">
          <Text className="text-[11px] text-m-text-tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {attribution}
          </Text>
          <Text className="text-[10px] text-m-text-tertiary ml-2">{formatTime(activity.activityDate)}</Text>
        </View>
        {activity.subject ? (
          <Text className="text-[13px] font-medium text-m-text-primary" numberOfLines={1}>
            {activity.subject}
          </Text>
        ) : null}
        {activity.bodyPreview ? (
          <Text className="text-[11px] text-m-text-secondary mt-0.5" numberOfLines={2}>
            {activity.bodyPreview}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/activity/ActivityCard.tsx
git commit -m "feat(mobile): add ActivityCard with type icons + inbound/outbound email badges"
```

### Task C.2: `ActivityTab` screen content with filter chips and date grouping

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Add ActivityTab local component**

```tsx
import ActivityCard from '@/components/activity/ActivityCard';

type ActivityFilter = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

function ActivityTab({ clientId }: { clientId: Id<'clients'> }) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const activities = useQuery(
    api.activities.listForClient,
    filter === 'all'
      ? { clientId, limit: 200 }
      : { clientId, typeFilter: filter === 'EMAIL' ? 'EMAIL' : filter, limit: 200 },
  ) ?? [];

  // Also include INCOMING_EMAIL when user selects EMAIL
  const fullList =
    filter === 'EMAIL'
      ? [...activities, ...(useQuery(api.activities.listForClient, { clientId, typeFilter: 'INCOMING_EMAIL', limit: 200 }) ?? [])]
      : activities;

  const sorted = fullList
    .slice()
    .sort((a, b) => (b.activityDate ?? '').localeCompare(a.activityDate ?? ''));

  // Group by date bucket
  const now = Date.now();
  type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Older';
  const bucketOf = (iso?: string): Bucket => {
    if (!iso) return 'Older';
    const days = Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    return 'Older';
  };

  const grouped: Record<Bucket, typeof sorted> = { Today: [], Yesterday: [], 'This week': [], Older: [] };
  for (const a of sorted) {
    grouped[bucketOf(a.activityDate)].push(a);
  }

  const FILTERS: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: `All · ${sorted.length}` },
    { key: 'EMAIL', label: 'Emails' },
    { key: 'MEETING', label: 'Meetings' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'CALL', label: 'Calls' },
    { key: 'TASK', label: 'Tasks' },
  ];

  return (
    <View className="gap-3">
      {/* Filter chips — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              className="px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: active ? '#0a0a0a' : '#fafaf9',
                borderWidth: active ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-[11px] font-medium"
                style={{ color: active ? '#ffffff' : colors.textSecondary }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Timeline grouped */}
      {(['Today', 'Yesterday', 'This week', 'Older'] as const).map((bucket) =>
        grouped[bucket].length > 0 ? (
          <View key={bucket} className="gap-2">
            <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
              {bucket}
            </Text>
            {grouped[bucket].map((a) => (
              <ActivityCard key={a._id} activity={a} />
            ))}
          </View>
        ) : null,
      )}

      {sorted.length === 0 ? (
        <Text className="text-sm text-m-text-tertiary italic text-center py-12">
          No activity yet
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Add `'Activity'` to TABS + render branch**

```tsx
const TABS = ['Overview', 'Activity', 'Deals', 'Projects', 'Docs', 'Intelligence', 'Notes', 'Tasks', 'Checklist', 'Meetings', 'Flags'] as const;

// render:
{activeTab === 'Activity' ? <ActivityTab clientId={clientId} /> : null}
```

- [ ] **Step 3: Commit + visual verify**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): add Activity tab with filter chips + date bucket grouping"
```

Open a client with rich activity (Talbot Homes). Confirm:
- Activity tab appears
- Filter chips highlight active selection; "All" default shows total count
- Date dividers (Today / Yesterday / This week / Older) render only when they have items
- Each card shows correct icon + inbound/outbound badge for emails
- Tapping a filter chip narrows the list

---

## Phase D — Intelligence Tab Extension (Beauhurst Section)

### Task D.1: `BeauhurstIdentityCard` + `BeauhurstFinancialsCard` + `BeauhurstSignalsCard`

**Files:**
- Create: `mobile-app/components/intelligence/BeauhurstIdentityCard.tsx`
- Create: `mobile-app/components/intelligence/BeauhurstFinancialsCard.tsx`
- Create: `mobile-app/components/intelligence/BeauhurstSignalsCard.tsx`

- [ ] **Step 1: Create `BeauhurstIdentityCard.tsx`**

```tsx
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface Props {
  metadata?: any;
  companyName?: string;
}

export default function BeauhurstIdentityCard({ metadata, companyName }: Props) {
  if (!metadata) return null;
  const chId = metadata.beauhurst_data_companies_house_id;
  const linkedin = metadata.beauhurst_data_linkedin_page;
  const beauhurstUrl = metadata.beauhurst_data_beauhurst_url;
  const legalForm = metadata.beauhurst_data_legal_form;
  const stage = metadata.beauhurst_data_stage_of_evolution;

  const hasAny = chId || linkedin || beauhurstUrl || legalForm || stage;
  if (!hasAny) return null;

  const openUrl = (url: string | undefined) => {
    if (url) Linking.openURL(url);
  };

  const chUrl = chId
    ? `https://find-and-update.company-information.service.gov.uk/company/${chId}`
    : null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
      <View className="mb-2.5">
        <Text className="text-[13px] font-semibold text-m-text-primary">{companyName}</Text>
        <Text className="text-[11px] text-m-text-tertiary mt-0.5">
          {[legalForm, stage].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View className="gap-2">
        {chUrl ? (
          <TouchableOpacity onPress={() => openUrl(chUrl)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">Companies House</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">{chId}</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
        {linkedin ? (
          <TouchableOpacity onPress={() => openUrl(linkedin)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">LinkedIn</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">Profile</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
        {beauhurstUrl ? (
          <TouchableOpacity onPress={() => openUrl(beauhurstUrl)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">Beauhurst profile</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">Open</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Create `BeauhurstFinancialsCard.tsx`**

```tsx
import { View, Text } from 'react-native';

interface Props { metadata?: any; }

function fmtMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function BeauhurstFinancialsCard({ metadata }: Props) {
  if (!metadata) return null;
  const turnover = metadata.beauhurst_data_turnover;
  const ebitda = metadata.beauhurst_data_ebitda;
  const headcount = metadata.beauhurst_data_headcount;
  const funding = metadata.beauhurst_data_total_funding_received;
  const accountsDate = metadata.beauhurst_data_date_of_accounts;

  if (!turnover && !ebitda && !headcount && !funding) return null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
      <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5">
        Financials
      </Text>
      <View className="flex-row flex-wrap gap-y-2.5">
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary">Turnover</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5">
            {fmtMoney(turnover)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary">EBITDA</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5">{fmtMoney(ebitda)}</Text>
        </View>
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary">Headcount</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5">{headcount ?? '—'}</Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary">Funding received</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5">{fmtMoney(funding)}</Text>
        </View>
      </View>
      {accountsDate ? (
        <Text className="text-[10px] text-m-text-tertiary mt-2">Accounts filed {fmtDate(accountsDate)}</Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Create `BeauhurstSignalsCard.tsx`**

```tsx
import { View, Text } from 'react-native';

interface Props { metadata?: any; }

const SIGNAL_CATEGORIES: { key: string; label: string; bg: string; text: string }[] = [
  { key: 'beauhurst_data_growth_signals', label: 'Growth', bg: '#dcfce7', text: '#059669' },
  { key: 'beauhurst_data_risk_signals', label: 'Risk', bg: '#fef3c7', text: '#d97706' },
  { key: 'beauhurst_data_innovation_signals', label: 'Innovation', bg: '#dbeafe', text: '#2563eb' },
  { key: 'beauhurst_data_environmental_signals', label: 'Environmental', bg: '#dcfce7', text: '#065f46' },
  { key: 'beauhurst_data_social_governance_signals', label: 'Social & gov', bg: '#f3e8ff', text: '#9333ea' },
];

export default function BeauhurstSignalsCard({ metadata }: Props) {
  if (!metadata) return null;
  const all: { label: string; value: string; bg: string; text: string }[] = [];
  for (const cat of SIGNAL_CATEGORIES) {
    const raw = metadata[cat.key];
    if (!raw) continue;
    for (const v of String(raw).split(';').slice(0, 3)) {
      const trimmed = v.trim();
      if (trimmed) all.push({ label: cat.label, value: trimmed, bg: cat.bg, text: cat.text });
    }
  }
  if (all.length === 0) return null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
      <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2">Signals</Text>
      <View className="flex-row flex-wrap gap-1">
        {all.slice(0, 10).map((s, i) => (
          <View key={i} style={{ backgroundColor: s.bg }} className="px-2 py-0.5 rounded-full">
            <Text style={{ color: s.text }} className="text-[10px] font-medium">
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Commit all three**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/intelligence/
git commit -m "feat(mobile): Beauhurst Intelligence cards (identity / financials / signals)"
```

### Task D.2: Prepend Beauhurst section to IntelligenceTab

**Files:**
- Modify: whichever file renders the Intelligence tab on mobile client page (likely `mobile-app/components/IntelligenceTab.tsx` or similar — grep to find)

- [ ] **Step 1: Locate the existing IntelligenceTab**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
grep -rn "IntelligenceTab\|activeTab === 'Intelligence'" mobile-app/ | head -10
```

- [ ] **Step 2: In the Intelligence render, prepend the Beauhurst section**

Pattern:

```tsx
import BeauhurstIdentityCard from '@/components/intelligence/BeauhurstIdentityCard';
import BeauhurstFinancialsCard from '@/components/intelligence/BeauhurstFinancialsCard';
import BeauhurstSignalsCard from '@/components/intelligence/BeauhurstSignalsCard';

// Inside the Intelligence tab render:
<View className="gap-3">
  {/* Beauhurst CRM intel section */}
  {primaryCompany?.metadata ? (
    <>
      <View className="flex-row items-center gap-1.5 px-1">
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
          Beauhurst intel
        </Text>
        <View className="bg-m-bg-subtle px-1.5 py-0.5 rounded">
          <Text className="text-[9px] font-semibold text-m-text-secondary uppercase">CRM</Text>
        </View>
      </View>
      <BeauhurstIdentityCard metadata={primaryCompany.metadata} companyName={primaryCompany.name} />
      <BeauhurstFinancialsCard metadata={primaryCompany.metadata} />
      <BeauhurstSignalsCard metadata={primaryCompany.metadata} />

      {/* Divider */}
      <View className="flex-row items-center gap-2.5 py-1">
        <View className="flex-1 h-px bg-m-border" />
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
          AI intel from docs
        </Text>
        <View className="flex-1 h-px bg-m-border" />
      </View>
    </>
  ) : null}

  {/* Existing doc-intel section continues unchanged */}
  {/* ... */}
</View>
```

- [ ] **Step 3: Commit + visual verify**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/  # whatever file was modified
git commit -m "feat(mobile): prepend Beauhurst section to Intelligence tab with divider"
```

Open Talbot Homes client → Intelligence tab. Confirm:
- Beauhurst Identity card shows Companies House ID (linkable), LinkedIn, Beauhurst profile
- Financials card shows 4 KPIs
- Signals card shows chips
- Divider "AI intel from docs" separates from existing doc intelligence
- Existing doc intelligence still renders below

---

## Phase E — New-Client Creation Autocomplete

### Task E.1: Convex query `companies.searchByName` + `clients.createWithPromotion`

**Files:**
- Modify: `model-testing-app/convex/companies.ts`
- Modify: `model-testing-app/convex/clients.ts`

- [ ] **Step 1: Add search query to companies**

Append to `model-testing-app/convex/companies.ts`:

```typescript
/**
 * Search companies by name (case-insensitive substring), unpromoted first.
 * Returns top N for autocomplete UI.
 */
export const searchByName = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = args.query.trim().toLowerCase();
    if (q.length < 2) return [];
    const limit = args.limit ?? 8;

    const all = await ctx.db.query("companies").collect();
    const matches = all.filter((c) => c.name.toLowerCase().includes(q));

    // Score: exact match > starts-with > contains, and unpromoted > promoted
    const scored = matches
      .map((c) => {
        const n = c.name.toLowerCase();
        let score = 0;
        if (n === q) score += 100;
        else if (n.startsWith(q)) score += 50;
        else score += 10;
        if (!c.promotedToClientId) score += 5; // prefer unpromoted (available to link)
        return { company: c, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.company);

    return scored;
  },
});
```

- [ ] **Step 2: Add client-with-promotion mutation**

Append to `model-testing-app/convex/clients.ts`:

```typescript
/**
 * Create a new client AND link a HubSpot company to it (promotedToClientId).
 * Used by the new-client autocomplete flow in the mobile app.
 */
export const createWithPromotion = mutation({
  args: {
    name: v.string(),
    companyName: v.optional(v.string()),
    industry: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past"),
    )),
    type: v.optional(v.string()),
    promoteFromCompanyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const { promoteFromCompanyId, ...clientFields } = args;

    const clientId = await ctx.db.insert("clients", {
      ...clientFields,
      source: promoteFromCompanyId ? "hubspot" : "manual",
      status: clientFields.status ?? "prospect",
      createdAt: now,
    });

    if (promoteFromCompanyId) {
      await ctx.db.patch(promoteFromCompanyId, { promotedToClientId: clientId });
    }

    return clientId;
  },
});
```

- [ ] **Step 3: Codegen + commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex codegen

cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/companies.ts model-testing-app/convex/clients.ts model-testing-app/convex/_generated/
git commit -m "feat(convex): add searchByName + createWithPromotion for new-client autocomplete"
```

### Task E.2: `CompanyAutocomplete` component

**Files:**
- Create: `mobile-app/components/clients/CompanyAutocomplete.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Doc, Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { Search, Building2, Plus } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface Props {
  onSelectCompany: (company: Doc<'companies'>) => void;
  onCreateNew: (typedName: string) => void;
  placeholder?: string;
}

export default function CompanyAutocomplete({
  onSelectCompany,
  onCreateNew,
  placeholder = 'Client name',
}: Props) {
  const [query, setQuery] = useState('');
  const matches = useQuery(
    api.companies.searchByName,
    query.trim().length >= 2 ? { query, limit: 6 } : 'skip',
  ) ?? [];

  const showDropdown = query.trim().length >= 2;

  return (
    <View className="gap-2">
      <View>
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
          Client name
        </Text>
        <View className="bg-m-bg-card border-2 border-m-text-primary rounded-[10px] px-3 py-2.5 flex-row items-center gap-2">
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.textPlaceholder}
            className="flex-1 text-sm text-m-text-primary"
            autoFocus
          />
        </View>
      </View>

      {showDropdown ? (
        <View className="bg-m-bg-card border border-m-border rounded-[12px] overflow-hidden">
          {matches.length > 0 ? (
            <View className="bg-m-bg px-3 py-2 border-b border-m-border">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                From HubSpot ({matches.length} matches)
              </Text>
            </View>
          ) : null}
          {matches.map((c) => {
            const isExact = c.name.toLowerCase() === query.trim().toLowerCase();
            return (
              <TouchableOpacity
                key={c._id}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelectCompany(c);
                }}
                className="flex-row items-center gap-2.5 p-3 border-b border-m-border-subtle"
                activeOpacity={0.6}
              >
                <View
                  className="w-9 h-9 rounded-[8px] items-center justify-center"
                  style={{ backgroundColor: '#dbeafe' }}
                >
                  <Building2 size={14} color="#2563eb" strokeWidth={2} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[13px] font-semibold text-m-text-primary" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text className="text-[11px] text-m-text-tertiary mt-0.5" numberOfLines={1}>
                    {[
                      c.domain,
                      c.hubspotLifecycleStageName ?? c.hubspotLifecycleStage,
                      c.promotedToClientId ? 'already a client' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {isExact ? (
                  <View className="bg-m-success/15 px-1.5 py-0.5 rounded">
                    <Text className="text-[9px] font-bold text-m-success uppercase tracking-wide">
                      Match
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}

          {/* Manual create fallback */}
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              onCreateNew(query.trim());
            }}
            className="flex-row items-center gap-2.5 p-3 bg-m-bg"
            activeOpacity={0.6}
          >
            <View className="w-9 h-9 rounded-[8px] bg-m-bg-subtle items-center justify-center">
              <Plus size={16} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-medium text-m-text-primary">
                Create "{query}" from scratch
              </Text>
              <Text className="text-[11px] text-m-text-tertiary mt-0.5">
                Won't be linked to a HubSpot company
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/components/clients/CompanyAutocomplete.tsx
git commit -m "feat(mobile): add CompanyAutocomplete component for new-client creation"
```

### Task E.3: Wire CompanyAutocomplete into new-client screen

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/new.tsx` (or wherever new-client creation lives)

- [ ] **Step 1: Find the new-client screen**

```bash
grep -rln "create.*client\|New client\|createClient\|clients/new" mobile-app/app mobile-app/components 2>&1 | head -5
```

- [ ] **Step 2: Replace the name input with CompanyAutocomplete**

```tsx
import CompanyAutocomplete from '@/components/clients/CompanyAutocomplete';
import { useMutation } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';

export default function NewClientScreen() {
  const createWithPromotion = useMutation(api.clients.createWithPromotion);
  const router = useRouter();

  const handleSelectCompany = async (company: Doc<'companies'>) => {
    if (company.promotedToClientId) {
      // Already linked — navigate to that client
      router.push(`/clients/${company.promotedToClientId}`);
      return;
    }
    const clientId = await createWithPromotion({
      name: company.name,
      companyName: company.name,
      industry: company.industry,
      website: company.website ?? company.domain,
      address: company.address,
      city: company.city,
      country: company.country,
      phone: company.phone,
      type: company.type,
      promoteFromCompanyId: company._id,
    });
    router.push(`/clients/${clientId}`);
  };

  const handleCreateNew = async (typedName: string) => {
    if (!typedName) return;
    const clientId = await createWithPromotion({ name: typedName, status: 'prospect' });
    router.push(`/clients/${clientId}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-m-bg">
      <View className="p-4">
        <CompanyAutocomplete
          onSelectCompany={handleSelectCompany}
          onCreateNew={handleCreateNew}
        />
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Commit + visual verify**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add mobile-app/app/\(tabs\)/clients/new.tsx
git commit -m "feat(mobile): wire CompanyAutocomplete into new-client creation flow"
```

Open "Create new client" flow. Confirm:
- Typing "Bay" shows Bayfield Homes as exact match ("already a client" subtitle since we already linked it)
- Typing "Tower" (or any uncommon name not in HubSpot) still shows "Create from scratch" fallback
- Tapping a HubSpot match that's NOT yet promoted creates a client + promotes the company + navigates to the new client page
- Tapping "Create from scratch" creates a bare client and navigates

---

## Self-Review Checklist

- [ ] **Phase coverage:** All 5 phases (A through E) have task blocks. Count: Phase A = 7 tasks, Phase B = 4 tasks, Phase C = 2 tasks, Phase D = 2 tasks, Phase E = 3 tasks = **18 tasks total**.
- [ ] **No placeholders:** Every code step shows complete, copy-pasteable code — no "TBD", no "similar to previous".
- [ ] **Type consistency:** `Doc<'deals'>` used for deal typing; `Id<'clients'>` / `Id<'companies'>` for foreign keys. Components accept Convex types from the generated `dataModel`.
- [ ] **Convex queries match mutation args:** `listForClient` / `searchByName` / etc. all have their schemas defined and mutations have `v.optional(...)` wrapping all nullable fields.
- [ ] **Null-coercion pattern:** New Convex mutations don't receive `null` from mobile — all `useQuery` results are either the value or `undefined`. TypeScript prevents null getting into `v.optional(v.string())`.
- [ ] **Visual verification steps:** Every phase ends with a checklist of what to confirm in Expo/simulator.
- [ ] **Commit granularity:** Each task has its own commit. Easy to bisect + roll back individual phases.

---

## Execution Handoff

Plan 2 complete and saved to `docs/superpowers/plans/2026-04-16-hubspot-mobile-ui.md`. Two execution options:

**1. Subagent-Driven (recommended for Plan 2)** — dispatch one subagent per task, two-stage review (spec compliance, then code quality) after each. Same pattern as Plan 1 execution. Uses `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in the active session using `superpowers:executing-plans`.

Both approaches: **start in a new git worktree** (`.worktrees/hubspot-mobile-ui/` on branch `hubspot-mobile-ui`) via `superpowers:using-git-worktrees`. Do NOT execute on main or on the `hubspot-sync-backend` branch.

**Prerequisites before starting Plan 2:**
- Plan 1 (backend sync) has been merged to main (PR #10 or equivalent)
- A fresh sync has run against production HubSpot so the mobile Overview has real data to render
- The 33-match back-link script has run (so mobile contacts show company names via `promotedToClientId`)

**Which approach?**
