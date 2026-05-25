# Schema Migrations Playbook

Every Convex schema change follows this playbook. The goal is that no migration ever causes data loss or downtime, and every change can be rolled back.

## Three rules

1. **Additive only by default.** New tables, new optional fields, new indexes. Removing or renaming anything is a multi-step change, never a one-shot.
2. **Preview deployment first.** Schema changes ship to a Convex preview deployment, are exercised against representative data, and only then promote to production.
3. **Idempotent migrations.** A migration script that runs twice produces the same result as running it once. The Convex migration runner can re-invoke after a failure.

## Migration shapes

### Additive (low-risk)

Adding a new optional field or a new table. No existing rows need to change.

Steps:
1. Edit `model-testing-app/convex/schema.ts`. Add the new table or new optional field. Add any required indexes.
2. Deploy to preview. Verify type generation succeeds (`npx convex dev` in preview mode generates `_generated/` without errors).
3. Land the PR. Promote to production.

No rollback procedure needed beyond `git revert`. The new field stays optional; existing reads ignore it.

### Backfill (medium-risk)

Adding a new field that existing rows need populated. The new field is added as optional, then a backfill migration sets values, then (later, as a separate change) the field can be made required if needed.

Steps:
1. Add the field as optional in `schema.ts`. Deploy.
2. Write a backfill `internalMutation` in `model-testing-app/convex/migrations/`. Idempotent: check if the field is already set, skip if so.
3. Run the backfill on preview. Verify the row count matches expectations.
4. Run the backfill on production via the Convex dashboard or `convex run`.
5. Only after all rows have the value, in a separate PR, make the field required if the application needs it.

Rollback: the field stays optional, existing code paths still work. Revert the backfill mutation if it produced bad data, write a corrective mutation.

### Two-step deprecation (medium-risk)

Removing a field or a table. Never done in one shot.

Steps:
1. Step one: stop writing to the field. All call sites updated to read from the new location (if any) and not write to the old. The field remains in `schema.ts` as optional. Deploy. Observe production for at least one week to confirm no consumer reads the field.
2. Step two: remove the field from `schema.ts`. Add a migration that drops the field from existing rows (Convex schema validation enforces this on next write; explicit migration is cleaner). Deploy.

Rollback after step one: trivial, re-enable writes. Rollback after step two: harder; requires restoring from backup or re-deriving the field from elsewhere. This is why the one-week observation window between steps matters.

### Field-type change (high-risk)

Never done in place. Instead:

1. Add a new field with the new type alongside the old.
2. Backfill the new field from the old via an idempotent mutation.
3. Cut consumers over to the new field.
4. Two-step-deprecate the old field per the previous shape.

This shape is reserved for cases where the type genuinely needs to change. Renaming a field for stylistic reasons is not worth the cost.

### Index addition (low-risk)

Adding a new index to an existing table.

Steps:
1. Add the index to `defineTable(...).index(...)` in `schema.ts`. Deploy.
2. Convex builds the index in the background; existing queries continue using the old index path.

Rollback: drop the index from `schema.ts` in a follow-up commit.

## Convex-specific gotchas

- **Required-field additions on existing rows fail validation.** Any new field must be `v.optional(...)` until every existing row has been backfilled. Marking it required without a backfill bricks every read of the table.
- **Index removal does not delete the index data immediately.** Convex retains it for some period; do not expect storage savings to materialise instantly.
- **Schema changes deploy as part of the function deploy.** A failed deploy that includes a schema mutation can leave the production schema in a partially-applied state if the deploy is killed mid-way. Use the Convex CLI's transactional deploy.
- **Soft delete is the convention for business entities.** Add `isDeleted`, `deletedAt`, `deletedBy` rather than hard-deleting. This is observed in `clients`, `projects`, `documents`, `internalDocuments`, `bulkUploadBatches`, `bulkUploadItems`, `codifiedExtractions`, `companies`. New core entities should follow.

## Migration PR checklist

Every PR that touches `model-testing-app/convex/schema.ts` includes:

- [ ] Migration shape declared (additive / backfill / two-step deprecation / field-type change / index addition)
- [ ] If backfill or deprecation, the migration script lives in `model-testing-app/convex/migrations/`
- [ ] If backfill, idempotency verified by running it twice in preview
- [ ] If deprecation, the one-week observation window is documented in the PR description
- [ ] `Rollback:` section in the PR description explains how to reverse the change
- [ ] No required-field additions to existing tables without a paired backfill
- [ ] Indexes added if new query patterns are introduced

## When in doubt

Skip the in-place change. Do it in two steps. The cost of a careful migration is small; the cost of a botched one in production is large.
