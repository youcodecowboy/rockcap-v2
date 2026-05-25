import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// Apollo.io integration — primary email discovery surface for prospect-intel.
//
// Why Apollo: Apollo specialises in B2B contact discovery; their people-match
// endpoint takes (first_name, last_name, organization_name) and returns the
// best-matching person record with email, email status, LinkedIn URL, title.
// Email status field tells us whether the email is verified (safe to send),
// unverified (don't send without manual confirmation), or unavailable.
//
// Architecture:
// - This action calls Apollo API directly via fetch (action runtime supports
//   external HTTP). Requires APOLLO_API_KEY in Convex env. Set via:
//     npx convex env set APOLLO_API_KEY <your-key>
// - findPerson is the public action — UI components call it via useAction.
// - The MCP tool apollo.findEmail wraps the same logic for skill use.
// - This module does NOT persist results. The caller (PeopleTab, or the
//   skill via cadence.create / contact.create) decides whether to write
//   the email to a contacts row. Keeps the action's job narrow.
//
// Cost note: Apollo charges per email reveal. The single-people-match
// endpoint typically costs 1 credit per successful reveal. The UI surfaces
// "Find email via Apollo" as an explicit operator action so credit
// consumption is intentional rather than accidental.

const APOLLO_BASE_URL = "https://api.apollo.io";

interface ApolloPersonResult {
  ok: true;
  found: boolean;
  email?: string;
  emailStatus?: string; // "verified" | "unverified" | "questionable" | "unavailable" | ...
  title?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  apolloPersonId?: string;
  organization?: {
    name?: string;
    domain?: string;
    linkedinUrl?: string;
  };
}

interface ApolloErrorResult {
  ok: false;
  error: string;
  detail?: string;
}

async function callApolloMatch(args: {
  firstName: string;
  lastName: string;
  companyName?: string;
  companyDomain?: string;
}): Promise<ApolloPersonResult | ApolloErrorResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "APOLLO_API_KEY not set in Convex env",
      detail: "Run: npx convex env set APOLLO_API_KEY <your-key>",
    };
  }

  // Build the match payload. Apollo's match endpoint takes name + ANY
  // additional identifiers (organization, domain) to disambiguate.
  const body: Record<string, unknown> = {
    first_name: args.firstName,
    last_name: args.lastName,
    // reveal_personal_emails: false, // we only want business email
    reveal_phone_number: false,
  };
  if (args.companyName) body.organization_name = args.companyName;
  if (args.companyDomain) body.domain = args.companyDomain;

  let res: Response;
  try {
    res = await fetch(`${APOLLO_BASE_URL}/v1/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    return { ok: false, error: "network_error", detail: e?.message ?? String(e) };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: "apollo_auth_error",
      detail: `HTTP ${res.status} — verify APOLLO_API_KEY is valid`,
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: "apollo_rate_limit",
      detail: "HTTP 429 — Apollo rate limit hit; retry in 60s",
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `apollo_http_${res.status}`,
      detail: text.slice(0, 300),
    };
  }

  let data: any;
  try {
    data = await res.json();
  } catch (e: any) {
    return { ok: false, error: "apollo_parse_error", detail: e?.message ?? String(e) };
  }

  // Apollo's response shape varies — the match endpoint returns either
  // { person: {...} } when found OR { person: null } when not found.
  const person = data?.person;
  if (!person) {
    return { ok: true, found: false };
  }

  return {
    ok: true,
    found: true,
    email: person.email ?? undefined,
    emailStatus: person.email_status ?? undefined,
    title: person.title ?? undefined,
    linkedinUrl: person.linkedin_url ?? undefined,
    photoUrl: person.photo_url ?? undefined,
    apolloPersonId: person.id ?? undefined,
    organization: person.organization
      ? {
          name: person.organization.name,
          domain: person.organization.primary_domain ?? person.organization.website_url,
          linkedinUrl: person.organization.linkedin_url,
        }
      : undefined,
  };
}

// ── v1.2.4 caching layer ──
// apolloLookups table stores recent results keyed by (firstName, lastName,
// companyKey). 30-day TTL. Read-then-call-then-write so re-clicks of "Find
// email" don't re-charge Apollo for the same combination.

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeCompanyKey(name: string | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+(limited|ltd|plc|llp)\s*$/i, "").trim();
}

export const findCachedLookupInternal = internalQuery({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("apolloLookups")
      .withIndex("by_lookup_key", (q) =>
        q
          .eq("firstName", args.firstName)
          .eq("lastName", args.lastName)
          .eq("companyKey", args.companyKey),
      )
      .order("desc")
      .take(1);
    const latest = rows[0];
    if (!latest) return null;
    const fetchedMs = new Date(latest.fetchedAt).getTime();
    if (Date.now() - fetchedMs > CACHE_TTL_MS) return null;
    return { result: latest.result, fetchedAt: latest.fetchedAt, cacheId: latest._id };
  },
});

export const writeLookupCacheInternal = internalMutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyKey: v.string(),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apolloLookups", {
      firstName: args.firstName,
      lastName: args.lastName,
      companyKey: args.companyKey,
      result: args.result,
      fetchedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

async function findPersonCachedOrFresh(
  ctx: any,
  args: {
    firstName: string;
    lastName: string;
    companyName?: string;
    companyDomain?: string;
    skipCache?: boolean;
  },
): Promise<(ApolloPersonResult | ApolloErrorResult) & { cached?: boolean; cachedAt?: string }> {
  const companyKey = normalizeCompanyKey(args.companyName);

  // Read cache unless explicitly bypassed
  if (!args.skipCache) {
    const cached = await ctx.runQuery(internal.apollo.findCachedLookupInternal, {
      firstName: args.firstName,
      lastName: args.lastName,
      companyKey,
    });
    if (cached) {
      return { ...cached.result, cached: true, cachedAt: cached.fetchedAt };
    }
  }

  // Cache miss — call Apollo
  const fresh = await callApolloMatch(args);

  // Only cache successful results (ok: true). Errors aren't cached because
  // they're often transient (rate limits, key not set) and would persist
  // the operator's bad experience past the underlying fix.
  if (fresh.ok) {
    await ctx.runMutation(internal.apollo.writeLookupCacheInternal, {
      firstName: args.firstName,
      lastName: args.lastName,
      companyKey,
      result: fresh,
    });
  }

  return { ...fresh, cached: false };
}

// ── Public action: callable from React via useAction + from MCP via the
//    apollo.findEmail tool wrapper. Returns the raw Apollo result; caller
//    decides whether to persist (contacts row, intel report, etc).
//    v1.2.4: cached for 30 days against (firstName, lastName, companyName).
export const findPerson = action({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
    skipCache: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await findPersonCachedOrFresh(ctx, args);
  },
});

// ── Internal-only variant for MCP tool dispatch (skill side, no React deps).
export const findPersonInternal = internalAction({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
    skipCache: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await findPersonCachedOrFresh(ctx, args);
  },
});
