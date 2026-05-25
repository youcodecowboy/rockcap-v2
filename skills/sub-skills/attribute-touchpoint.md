# attribute-touchpoint

Given an inbound or outbound communication event from any provider (Gmail, Fireflies, HubSpot, manual), attribute it to the right person, deal, and thread. Used by the Gmail read sync, Fireflies sync, HubSpot activity sync, and any skill that writes to the unified `touchpoints` table.

## When to use

Every time a communication event needs to land in `touchpoints` with the right foreign keys. Skills do not write touchpoints directly; they call this sub-skill so attribution rules stay consistent.

## Inputs

Required:

- `provider`: one of `gmail`, `hubspot`, `fireflies`, `calendar`, `manual`, `other`
- `direction`: `inbound`, `outbound`, `internal`
- `kind`: `email`, `call`, `meeting`, `note`, `message`, `event`, `other`
- `occurredAt`: ISO timestamp
- `participantEmails`: array of email strings; sender first for inbound, recipients first for outbound
- `payloadRef`: provider-specific id (Gmail message id, Fireflies meeting id, HubSpot activity id)
- `subject`: optional subject or title
- `bodyExcerpt`: optional first ~500 chars

Optional:

- `threadId`: when the provider gives one (Gmail threadId, etc.)
- `providerEnrichment`: provider-specific structured data
- `priorContext`: hints from the calling sync (e.g., "this is in reply to approvalId X")

## Outputs

```ts
{
  touchpointId: Id<"touchpoints">;
  attributedContact: Id<"contacts"> | null;
  attributedClient: Id<"clients"> | null;
  attributedProject: Id<"projects"> | null;
  isDuplicate: boolean;
  threadGrouping: { threadId: string; touchpointCount: number } | null;
}
```

## Workflow

1. **Dedup check**: `touchpoint.findByProviderRef(provider, payloadRef)`. If exists, return its id with `isDuplicate: true`. Sync loops should be idempotent.
2. **Resolve the counterparty contact**: invoke `resolve-contact` on each participant email. Prefer the sender (for inbound) or the primary recipient (for outbound) as the main `contactId`.
3. **Attribute to a deal**:
   - If `threadId` is set, find prior touchpoints in the same thread and inherit their `relatedProjectId` if consistent.
   - Else if the resolved contact has exactly one active project, attribute there.
   - Else if `priorContext.approvalId` is set, inherit the approval's `relatedProjectId`.
   - Else leave `relatedProjectId` unset; the touchpoint persists without project attribution.
4. **Attribute to a client**: if a project was attributed, the client falls out of the project's clientRoles. If no project but the resolved contact has a `clientId`, use that.
5. **Insert the touchpoint** via `touchpoint.internalCreate` with all resolved fields.
6. **Return** the new id plus attribution outcome.

## Style rules

CONVENTIONS apply. One that matters: skill should never invent attribution. If the resolution chain produces no contact/project/client, the touchpoint still lands with whatever was resolved; missing fields stay null. Downstream skills can re-attribute later.

## Tool dependencies

- `touchpoint.findByProviderRef`, `touchpoint.internalCreate`
- `resolve-contact` (this sub-skills directory)
- `contact.get`, `project.list`
- `touchpoint.getByThread` (for thread-based attribution)

## What goes wrong

1. **Sender unresolved**: contact resolution fails. Touchpoint still lands with `participantEmails` populated; `contactId` stays null. Future resolutions can patch.
2. **Thread spans multiple projects**: two consecutive touchpoints in the same Gmail thread reference different deals. Skill flags and uses the most-recent prior attribution.
3. **Provider gives no payloadRef**: cannot dedup. Skill computes a synthetic ref from `provider + occurredAt + participantEmails hash` and proceeds; flags the synthetic-ref case.
4. **Bulk replay** (e.g., HubSpot backfill running through years of history): skill writes all touchpoints in chronological order so thread inheritance works correctly.
