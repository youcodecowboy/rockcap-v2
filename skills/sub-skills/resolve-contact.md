# resolve-contact

Given an email address (or a name + organisation), return the canonical `contactId` if one exists, or a `not_found` result with disambiguation candidates when ambiguous.

Used by qualify-and-draft, meeting-capture, attribute-touchpoint, cadence-fire, and any skill that needs to attribute work to a specific person.

## When to use

- Inbound email arrives, need the sender's contactId.
- Meeting transcript names attendees, need to resolve each.
- Touchpoint capture: an external system gives us a name + email pair, we need to map to a `contacts` row.
- Operator says "draft a reply to Sarah", we need to find which Sarah they mean.

## Inputs

Exactly one of (most specific first):

- `email`: string
- `nameAndOrganisation`: `{ name: string, organisation: string | clientId }`
- `nameAlone`: string (only when operator is in a clear deal context that disambiguates)

Optional:

- `triggerContext`: an active project or client id that narrows the search
- `preferredOrganisationId`: explicit clientId to prefer when ambiguous

## Outputs

```ts
type Resolution =
  | { kind: "contact"; contactId: Id<"contacts">; confidence: "high" | "medium" }
  | { kind: "needs_disambiguation"; candidates: ContactCandidate[]; reason: string }
  | { kind: "not_found"; suggestNew: boolean };

type ContactCandidate = {
  contactId: Id<"contacts">;
  name: string;
  email: string | null;
  role: string | null;
  organisationName: string | null;
  lastTouchpointAt: string | null;
};
```

## Workflow

1. **If `email` given**: `contacts.list` filter by exact email match. One hit → confidence high. Multiple hits (rare; usually a shared inbox) → needs_disambiguation. Zero hits → use the email domain to invoke `resolve-company`; if that resolves, suggest creating a contact under that organisation.
2. **If `nameAndOrganisation` given**: resolve organisation first via `resolve-company`. Then search `contacts.getByClient(clientId)` and match name with fuzzy compare. Most recent activity wins ties.
3. **If `nameAlone` given**: dangerous; only proceed if `triggerContext` exists. Search contacts of the project's clientRoles or the chat's open client context. Otherwise return `needs_disambiguation` with top three matches across all contacts.

## Confidence rules

- `high`: exact email match unique, or exact name match within a single organisation.
- `medium`: fuzzy name match within a single organisation, or exact email match where the contact has had touchpoint activity in the last 30 days.

## Style rules

CONVENTIONS apply. The `reason` field on `needs_disambiguation` is one short sentence ("Two Sarahs with this email domain") so the operator can decide without re-reading.

## Tool dependencies

- `contact.list`, `contact.get`, `contact.getByClient`
- `resolve-company` (this sub-skill, when only email or organisation name is given)
- `touchpoint.getByContact` (for recency tie-breakers)

## What goes wrong

1. **Generic email domain** (gmail.com, yahoo.com): cannot resolve organisation from the domain. Fall back to name-based candidates only.
2. **Shared inbox** (info@, contact@): multiple humans behind one email. Surface as needs_disambiguation with all known users of that inbox.
3. **Email belongs to a contact at a different organisation than expected** (e.g., a BDM who's moved firms). Flag and return both options.
4. **Name appears in many organisations** ("John Smith"): without `nameAndOrganisation` or `triggerContext`, return up to five candidates rather than picking arbitrarily.
