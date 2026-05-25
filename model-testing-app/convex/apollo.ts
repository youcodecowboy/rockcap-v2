import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";

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

// ── Public action: callable from React via useAction + from MCP via the
//    apollo.findEmail tool wrapper. Returns the raw Apollo result; caller
//    decides whether to persist (contacts row, intel report, etc).
export const findPerson = action({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApolloPersonResult | ApolloErrorResult> => {
    return await callApolloMatch(args);
  },
});

// ── Internal-only variant for MCP tool dispatch (skill side, no React deps).
export const findPersonInternal = internalAction({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApolloPersonResult | ApolloErrorResult> => {
    return await callApolloMatch(args);
  },
});
