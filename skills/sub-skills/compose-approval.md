# compose-approval

Sub-skill: a focused, reusable workflow step that multiple skills call. Given a draft payload and a target entity type, stage an `approvals` row in the right shape.

Loaded by any skill that produces output destined for the approval queue. The skill provides the entity-type-specific content; this sub-skill handles the structural conventions (summary text, related-entity wiring, source attribution).

## When to use

Use whenever a skill needs to stage an approval and does not want to repeat the boilerplate. Particularly useful for:

- Gmail send (covered by the higher-level `gmail.requestSend` wrapper; this sub-skill is the layer beneath for skills that want fine-grained control).
- HubSpot write-back.
- Document publish.
- Lender outreach (bulk-fan-out, when wired).
- Skill action (catch-all when a specific type does not fit).

Not for:

- Inserting a row directly into a Convex table that does not require human review (use the table's own mutation).
- Background jobs that have admin-level autonomy (those use internal mutations, not approvals).

## Inputs

Required:

- `entityType`: one of the values in `../shared-references/approval-payload-shapes.md`.
- `summary`: one-line description of what the human in the queue will see.
- `draftPayload`: shape-checked against `entityType` per the payload shapes reference.
- `requestSourceName`: skill name invoking this sub-skill.

Optional (set when known, omit otherwise):

- `relatedClientId`
- `relatedProjectId`
- `relatedContactId`
- `relatedCadenceId`
- `entityRefId`: id of the entity the approval acts on, if relevant
- `expiresAt`: ISO timestamp for auto-expiry

## Outputs

Returns:

- `approvalId`: id of the new `approvals` row

Persists:

- A new `approvals` row with `status: "pending"` and `requestSource: "skill"` (overridden if the caller is a cadence or background job).

## Workflow

1. **Validate the payload against the shape for `entityType`** by loading `../shared-references/approval-payload-shapes.md` and checking required fields.
2. **Compose the summary** if the caller did not provide one. The summary is for the queue UI; it should be readable as "what this approval would do" in one line. Drop into the imperative if helpful ("Send bridging reachout to John Smith"). Avoid filler like "Approve this to ...".
3. **Resolve related-entity links.** If `relatedContactId` was not provided but the draft payload contains a recipient email, attempt a contact lookup. If `relatedProjectId` was not provided but the related contact is linked to an active project, attach it.
4. **Set `requestSource` and `requestSourceName`.** The default is `"skill"`. Override to `"cadence"` if the caller is `cadence-fire`; override to `"background_job"` if the caller is a non-skill internal flow.
5. **Call `approval.create`** with the assembled fields. Return the new id.
6. **Stop.** Do not approve. Do not execute. Approvals are human-reviewed.

## Style rules

- The summary text follows CONVENTIONS voice rules even though it is a UI string. UK English, no em dashes, no promotional adjectives.
- Do not include sensitive content in the summary. If the draft payload contains a deal name that should not appear in queue overview lists, abstract: "Outreach to {Borrower MD}" rather than naming the scheme.

## Tool dependencies

- `approval.create` (the canonical Convex mutation)
- Optional: `contact.findByEmail` for related-entity resolution
- Optional: `project.getActiveByContact` for related-entity resolution

## What goes wrong

1. **The payload does not match the shape.** Stop with a clear error citing the missing or malformed field. Do not stage a malformed approval.
2. **Required-but-missing related-entity context.** Some entity types should always have `relatedProjectId` (e.g., `lender_outreach`). If the caller did not provide it and resolution failed, stop and surface.
3. **Duplicate approval risk.** If the caller is firing a cadence and the cadence has already produced an approval in the last hour (check `relatedCadenceId` index), stop. Cadence engine should not double-fire; defensive check here is belt and braces.
