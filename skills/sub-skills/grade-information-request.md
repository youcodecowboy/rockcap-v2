# grade-information-request

Given a raw information request (from a lender's IC pack, a solicitor's diligence checklist, or any structured list of items), produce graded `knowledgeChecklistItems` payloads with priority, isBlocking, rockcapStatus, and lenderStatus per BL-1.5.

Used by info-request-grader (primary), deal-triage (when promoting an ad-hoc request to the formal checklist), and ic-paper-drafter (when an IC submission has embedded info requirements).

## When to use

When a list of "things we need" arrives and needs to be turned into checklist rows with the right priority and blocking flags.

## Inputs

Required:

- `projectId`: the deal the request is for
- `rawItems[]`: array of `{ name, description?, dueBy?, blockingFlag?, priorityHint? }`. Usually the output of an extraction step against the source document or email.
- `sourceLenderClientId`: who the requirements are coming from

Optional:

- `defaultPriority`: applied to items without an explicit priority hint; default `required`
- `dueByDate`: aggregate deadline; applied per-item if individual due dates are missing

## Outputs

```ts
type GradedRequirement = {
  // Either the existing requirement if we matched, or a new row to create
  existingRequirementId?: Id<"knowledgeChecklistItems">;
  newRequirement?: {
    name: string;
    category: string;
    priority: "required" | "nice_to_have" | "optional";
    matchingDocumentTypes: string[];
    isCustom: true;
    customSource: "llm";
  };

  // Graded fields (BL-1.5 extension)
  isBlocking: boolean;
  rockcapStatus: "not_started" | "in_progress" | "complete";
  lenderStatus: "not_requested" | "requested" | "received" | "accepted" | "rejected";

  // Provenance
  sourceLenderClientId: Id<"clients">;
  rawDescription: string;
  matchConfidence: "high" | "medium" | "low" | "new";
};

type GradeResult = { items: GradedRequirement[]; notes: string[] };
```

## Workflow

1. For each raw item, attempt to match against existing `knowledgeChecklistItems` for the project. Match criteria:
   - Name similarity (Jaccard over tokens, threshold 0.6)
   - Matching document types overlap
   - Same category
   Match confidence is `high` if name similarity > 0.85, `medium` 0.6-0.85, `low` 0.4-0.6, `new` if below 0.4.
2. For matches: capture the existing requirement id, do not create a new row.
3. For non-matches: build a new requirement payload. Map the raw item to a canonical document type from `fileTypeDefinitions` if possible; otherwise use the raw name.
4. Grade each item:
   - **priority**: use `priorityHint` if provided; map "must have" or "required" to `required`, "preferred" or "would like" to `nice_to_have`, "would help" or "optional" to `optional`. Default to `defaultPriority`.
   - **isBlocking**: true if the source text contains explicit blocking language ("conditional on", "cannot proceed without", "credit will not be issued unless"). Also true for `priority: required` items in `post_credit` phase. Default false.
   - **rockcapStatus**: if any matching document is on file for this project, set `in_progress`; if a checklist item already links to a document, set `complete`. Else `not_started`.
   - **lenderStatus**: `requested` initially (the lender just asked).
5. Return the graded items.

## Style rules

CONVENTIONS apply. Two that matter most:

- **Use canonical names.** When creating new requirements, name them from the canon (`fileTypeDefinitions`) if possible. Avoid inventing names that drift from the rest of the system.
- **Bias to required for ambiguous items.** When `priorityHint` is unclear, default to required. Under-requesting documents is more harmful than over-requesting.

## Tool dependencies

- `knowledge.getChecklistByProject`, `knowledge.addItem`
- `fileTypeDefinitions.list` (canonical document types)
- `documents.getByProject` (for `rockcapStatus` derivation)

## What goes wrong

1. **Highly specific lender wording** ("RICS-qualified Red Book valuation by an approved panel valuer with maximum special assumption disclosure"): skill keeps the full description in `rawDescription`, maps the canonical name to `RedBook Valuation`.
2. **Item that already exists at higher priority**: skill keeps the existing higher priority; does not downgrade. Notes the source's lower priority for audit.
3. **Item conflicts with another item** ("provide the appraisal" and "provide the valuation" treated as distinct): skill creates both as separate items unless name similarity is high.
4. **Lender asks for something nonsensical**: skill captures verbatim, sets `priority: optional` and `isCustom: true`. The operator can override or remove.
