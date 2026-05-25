# Approval Payload Shapes

Shared reference defining the exact `draftPayload` shape every skill must use when staging an `approvals` row, indexed by `entityType`. Skills load this file to validate the payload they construct before calling `approval.create` or any wrapper.

The approval queue UI renders entity types it recognises with rich previews; entity types it does not recognise fall back to a JSON dump. New entity types should be added here in the same PR that adds an executor for them in `convex/approvals.ts`.

## `gmail_send`

The Gmail send wrapper (`gmailSend.requestSend`) creates approvals of this type. Skills that want to send email through Gmail use the wrapper; they do not construct the approval row directly.

```ts
draftPayload: {
  to: string[];                  // at least one address, RFC822 form
  cc?: string[];
  bcc?: string[];
  subject: string;               // non-empty
  bodyHtml?: string;             // at least one of bodyHtml/bodyText required
  bodyText?: string;
  threadId?: string;             // Gmail thread id, for replies
  inReplyTo?: string;            // RFC822 Message-Id of the message being replied to
  references?: string[];         // RFC822 References chain for threading
}
```

Required fields: `to` (non-empty), `subject` (non-empty), at least one of `bodyHtml` / `bodyText`. The wrapper enforces these; constructing the row manually skips that check.

Executor: `gmailSend.executeApprovedSend`. Refreshes OAuth token if needed, composes RFC822 (multipart/alternative when both body fields present), POSTs to Gmail API, captures a touchpoint with `provider: "gmail"`, `direction: "outbound"`. Returns `{ gmailMessageId, gmailThreadId, touchpointId }`.

## `hubspot_write`

Reserved for HubSpot write-back actions originated by skills (e.g., update a deal stage, add a note to a contact). The executor is not yet wired; entity-specific writes return a stub result for now.

```ts
draftPayload: {
  operation: "create_note" | "update_property" | "update_stage";
  objectType: "contact" | "company" | "deal";
  objectId: string;              // HubSpot id
  changes: Record<string, unknown>;
  noteBody?: string;             // for operation: "create_note"
}
```

## `document_publish`

For documents a skill drafts and wants pushed to a shared location (client portal, lender data room). Executor not yet wired.

```ts
draftPayload: {
  documentRef: Id<"documents">;
  publishTo: "client_portal" | "data_room" | "internal_shared";
  recipients?: string[];         // emails to notify on publish
  expiresAt?: string;            // ISO; auto-revoke access
}
```

## `lender_outreach`

Bulk lender outreach for a deal that's reached terms-shopping phase. Skills compose the lender-side submission pack; the approval lists the lenders being approached. Executor not yet wired; will fan out to per-lender Gmail sends through the gmail_send executor.

```ts
draftPayload: {
  projectId: Id<"projects">;
  lenderClientIds: Id<"clients">[];
  submissionDocumentRefs: Id<"documents">[];
  coverEmailTemplate: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
    variables: Record<string, string>;
  };
}
```

## `client_communication`

A non-email touch to a client (a phone-call reminder, a Slack message, an in-app notification). Executor not yet wired; placeholder structure documented so future skills can use the slot.

```ts
draftPayload: {
  channel: "phone_reminder" | "in_app" | "slack" | "other";
  contactId: Id<"contacts">;
  message: string;
  scheduledFor?: string;          // ISO; if absent, fire immediately on approve
}
```

## `skill_action`

Catch-all for skills that produce structured output other than an outbound message. Used when the action does not fit another type. The approval queue renders this as a raw payload dump; the executor returns a stub. Skills should prefer a specific entity type when one exists.

```ts
draftPayload: {
  skillName: string;
  intent: string;                 // short description of what would happen on approve
  payload: unknown;               // skill-specific
}
```

## `cadence_fire`

When the cadence engine fires a touch and produces an approval, the approval's `entityType` is the underlying touch type (usually `gmail_send`), not `cadence_fire`. This entity type is reserved for the case where a cadence fire produces an action that does not fit any existing type. Future use.

## `other`

Genuine miscellaneous. Skills should avoid; prefer to define a new entity type and update this file.

```ts
draftPayload: unknown;            // free-form
```

## Common fields (every approval, regardless of entityType)

These sit alongside `draftPayload` on the approval row, set by the create mutations:

```ts
{
  entityType,                     // one of the above
  entityRefId?,                   // optional id of the affected entity
  summary: string,                // one-line description for the queue UI
  draftPayload,                   // shape per entityType above
  status: "pending",
  requestedBy: Id<"users">,
  requestedAt: string,            // ISO
  requestSource: "skill" | "background_job" | "cadence" | "manual",
  requestSourceName?: string,     // e.g., "prospect-intel"
  relatedClientId?: Id<"clients">,
  relatedProjectId?: Id<"projects">,
  relatedContactId?: Id<"contacts">,
  relatedCadenceId?: Id<"cadences">,
  expiresAt?: string,             // ISO; auto-expire stale approvals
}
```

## Construction rules

1. **Use the wrapper when one exists.** For Gmail send, use `gmailSend.requestSend`. The wrapper does the kill-switch gate plus the payload sanity check before creating the row.
2. **`summary` is for the queue UI.** Treat it as the headline a human sees in the inbox. "Bridging reachout to John Smith at Acme based on recent charge filing" is good; "Send email" is not.
3. **Always set `requestSourceName` to the skill name.** Makes the approval queue debuggable.
4. **Set `relatedProjectId` and `relatedClientId` whenever they are known.** The queue UI filters and groups by these, and the touchpoint capture for executed gmail_sends links to them.
5. **Use `expiresAt` sparingly.** Most approvals do not need to expire. Use only for time-sensitive touches (a market-news-based reachout that becomes stale in 48 hours, etc.).
6. **Do not mix entity types in a single skill flow.** If a skill needs to both send an email and create a HubSpot note, stage two approvals. This keeps the per-type executor simple and the UI preview clear.
