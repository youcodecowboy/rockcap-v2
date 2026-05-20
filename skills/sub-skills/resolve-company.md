# resolve-company

Sub-skill: given an input identifier (a company name, an email domain, a Companies House number, or a free-form description), return a canonical resolution to either an existing `clients` row, an existing `companies` row (HubSpot projection), a Companies House record, or a clear "no match" with disambiguation candidates.

Used by prospect-intel, qualify-and-draft, cadence-fire, and any other skill that needs to attribute work to the right organisation.

## When to use

- Inbound email and the sender's domain needs resolving to a company we work with.
- A name comes up in conversation and we need to figure out whether the company is a current client, a prospect we have history with, or new.
- A Companies House number is provided and we need to know if RockCap already has it on file.
- A scheme address comes up and we want to find the developer SPV.

## Inputs

Exactly one of (in order of preference, most specific first):

- `companiesHouseNumber`: string (e.g., "01234567", "SC123456")
- `emailDomain`: string (e.g., "developer.co.uk"; the @-prefix is stripped if present)
- `companyName`: string (legal or trading name)
- `freeDescription`: string (e.g., "the developer of the Wimbledon Park scheme")

Optional:

- `triggerHint`: context that helps disambiguate ("inbound reply", "planning hit", "referral from John")

## Outputs

A `Resolution` object:

```ts
type Resolution =
  | { kind: "client"; clientId: Id<"clients">; confidence: "high" | "medium" }
  | { kind: "hubspot_company"; companyId: Id<"companies">; promotedToClientId?: Id<"clients">; confidence: "high" | "medium" }
  | { kind: "companies_house"; companyNumber: string; companyName: string; confidence: "high" | "medium" | "low" }
  | { kind: "no_match"; candidates: ResolutionCandidate[] }
  | { kind: "needs_disambiguation"; candidates: ResolutionCandidate[]; reason: string };

type ResolutionCandidate = {
  source: "client" | "hubspot_company" | "companies_house";
  identifier: string;
  displayName: string;
  hint: string;       // distinguishing feature, e.g., "incorporated 2018", "based in Manchester"
};
```

## Workflow

1. **If `companiesHouseNumber` is given**, look up directly via `companies-house.getCompanyProfile`. Then check whether a `clients` row references this company number; if yes, return `kind: "client"`. Else check `companiesHouseCompanies` cache; return `kind: "companies_house"` either way.
2. **If `emailDomain` is given**, search `clients` for a row whose `companyName` or trading name matches a domain-to-name heuristic. Search `companies` (HubSpot projection) for `domain` field match. If exactly one hit, return it with `confidence: "high"`. If multiple plausible hits, return `kind: "needs_disambiguation"`. If none, return `kind: "no_match"` with candidates suggested via Companies House name search using the domain root.
3. **If `companyName` is given**, search `clients.list` for matches. Search `companies` for matches. Search Companies House. Score matches by exact-vs-fuzzy match plus incorporation recency (younger active companies score above old dissolved ones). Return the top match if confidence is high, else needs_disambiguation with top three candidates.
4. **If `freeDescription` is given**, attempt to extract a scheme address or a recognisable company name. Search internal first (intelligence might already link a scheme to a developer); fall back to Companies House. If extraction fails, return `kind: "no_match"` with no candidates and surface for human disambiguation.
5. **Apply the `triggerHint`** as a tie-breaker when scoring candidates. "Planning hit" weights towards active development SPVs; "referral" weights towards parent or sponsor entities; "inbound reply" weights towards the company whose email domain we last touched.

## Confidence guidance

- `high`: exact match on a unique identifier (Companies House number, registered email domain on a single client) OR exact name match plus one corroborating signal.
- `medium`: name match with multiple corroborating signals, or fuzzy match with strong supporting evidence.
- `low`: best-effort match. Caller should display the resolution and ask for human confirmation before writing.

## Style rules

- The `displayName` in candidates uses the trading name if available, else the legal name. Avoid showing only the legal name when it differs significantly from how the company refers to itself.
- The `hint` is one short clause. "Incorporated 2018", "based in Manchester", "active development SPV". Not a paragraph.

## Tool dependencies

- `client.list`, `client.checkExists`
- `companies.list`, `companies.getByDomain` (where indexed)
- `companies-house.searchCompanies`, `companies-house.getCompanyProfile`
- `intelligence.queryIntelligence` (for scheme-to-developer lookups via `freeDescription` path)

## What goes wrong

1. **Email domain is a generic provider** (gmail.com, hotmail.com, etc.). The skill returns `kind: "no_match"` with `reason: "generic_email_domain"` and surfaces immediately; no point searching.
2. **Companies House search is rate-limited.** Defer the search, return `kind: "needs_disambiguation"` with a candidate built from internal data only and a hint that CH lookup is pending.
3. **The match is to a security agent or trustee** (e.g., a charge filing in the name of "Apex Corporate Trustees"). Detect by known-name list, return `kind: "no_match"` with `reason: "match_was_security_agent"` so the caller does not attribute work to the trustee.
4. **The match is to a dissolved company.** Return the match with `confidence: "low"` and a hint indicating dissolution. Caller decides whether to proceed.
5. **Multiple equally-scored candidates.** Return up to three; do not pick arbitrarily.

## Caching

If the resolution is `high` confidence and the input was `emailDomain` or `companyName`, write the mapping into a small cache (a `knowledgeItems` row with `fieldPath: "resolution_cache.email_to_client"` etc.). Subsequent calls with the same input return from cache without re-querying Companies House. Cache lifetime is 30 days; longer is fine because the relationship is stable, but a refresh after a month catches name changes and dissolutions.
