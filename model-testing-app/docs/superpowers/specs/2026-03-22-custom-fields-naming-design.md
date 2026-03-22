# LIB-01 + FIL-02: Custom Fields & Flexible Document Naming

> **Status:** Approved design
> **Priority:** High | **Effort:** High | **Category:** Doc Library + File Mgmt
> **Date:** 2026-03-22

## Problem

The auto-naming system generates document codes with a fixed pattern (`{CLIENT}-{TYPE}-{PROJECT}-{DATE}`) that cannot be customized. Users need:

1. Configurable naming patterns with custom tokens at the project/client level
2. A Rename option in the file context menu to set display names and fill in per-document field values
3. Per-document custom field values that feed into the naming pattern
4. Client-level defaults that projects inherit with optional override

## Decisions

| Question | Answer |
|----------|--------|
| What does "Rename" edit? | Both a free-form `displayName` AND the `documentCode` (with custom field values) |
| Where are per-document fields edited? | Single Rename dialog from the three-dot menu — name, code, and fields all in one place |
| How are custom fields used in naming? | Custom tokens can be added to the naming pattern; per-document values fill them |
| Pattern configuration level? | Client-level sets default, project-level can override (inheritance with toggle) |

## Schema Changes

### Documents table — add two fields

```
displayName: v.optional(v.string())
```
Human-friendly name, freely editable. Falls back to `documentCode`, then `fileName` for display. This is what shows in the UI as the file's name.

```
customFieldValues: v.optional(v.record(v.string(), v.string()))
```
A `Record<string, string>` storing per-document values for custom naming tokens. Example:
```json
{ "loan_ref": "LN-2026-042", "version": "V2" }
```

### Clients table — extend `metadata.documentNaming`

Currently stores `{ code: string, pattern?: string }`. Extend to:

```typescript
interface DocumentNamingConfig {
  code: string;                    // Client abbreviation (existing, e.g. "FIRESIDE")
  pattern: string[];               // Ordered token list, e.g. ["CLIENT", "TYPE", "LOAN_REF", "DATE"]
  separator: string;               // Token separator, default "-"
  customTokens: CustomToken[];     // Custom tokens defined for naming
}

interface CustomToken {
  id: string;          // e.g. "loan_ref" — auto-generated from label
  label: string;       // e.g. "Loan Reference"
  type: "text";        // Text only for naming tokens
  required: boolean;   // Whether this must be filled on every document
}
```

Default pattern (when no config exists): `["CLIENT", "TYPE", "PROJECT", "DATE"]` with separator `"-"`.

### Projects table — same extension on `metadata.documentNaming`

Projects inherit the client's naming config by default. If the project has its own `documentNaming` in metadata, it overrides. The existing `inheritFromClient` flag controls this.

## Naming Pattern Builder (Settings > Naming Tab)

Replaces the current `DocumentNamingSettings` component content with a richer pattern builder.

### Layout

**1. Abbreviation input** (existing) — client code or project shortcode at the top.

**2. Pattern builder** — a horizontal row of token chips showing the current pattern:

```
[ CLIENT ] - [ TYPE ] - [ LOAN_REF ] - [ DATE ]
```

- Each chip is removable (X button)
- Chips can be reordered via arrow buttons (simple, no drag-and-drop)
- Below the chips: "Add token" dropdown listing available tokens:
  - **Built-in:** `CLIENT`, `TYPE`, `PROJECT`, `DATE`
  - **Custom:** Any custom tokens defined below
- Separator dropdown: `-` (default), `_`, `.`, ` ` (space)

**3. Custom tokens section** — below the pattern builder.

- "Add Custom Token" button → inline form: Label, ID (auto-slug from label), Required toggle
- List of defined custom tokens with edit/delete
- These appear as available tokens in the "Add token" dropdown above

**4. Live preview** — example document code assembled from the pattern with sample values:

```
Preview: FIRESIDE-VAL-LN2026042-220326
```

**5. Inheritance indicator** (project level only) — banner at top: "Inheriting naming pattern from [Client Name]." with an "Override" toggle. When inheriting, the pattern builder is read-only with muted styling.

**6. Bulk apply section** (existing) — "Apply pattern to N documents without codes". Now uses the new pattern. Generates codes for documents that have enough token values; skips documents missing required custom token values.

## Rename Dialog (Three-Dot Menu)

New "Rename" option added to the file context menu in `FileCard.tsx`, positioned after "View Details".

### Dialog Sections

**Section 1 — Display Name**
- Text input for the human-friendly name
- Defaults to current `displayName`, or `fileName` if never set
- Free-form text, no constraints

**Section 2 — Document Code**
- Shows the auto-assembled code from the pattern, read-only by default
- "Customize" toggle switches to manual edit mode (freeform text input)
- When in auto mode, code updates live as field values change below

**Section 3 — Field Values**
- One input row per token in the active naming pattern that accepts per-document values
- Built-in tokens (`CLIENT`, `TYPE`, `DATE`) shown as read-only chips (derived from document metadata)
- Custom tokens (`LOAN_REF`, `VERSION`, etc.) are editable text inputs
- Required tokens show a red asterisk
- Placeholder text from the token's label

**Footer:** Save button (updates `displayName`, `customFieldValues`, and optionally `documentCode`) + Cancel.

### Example Flow

User clicks Rename on a valuation report. Dialog shows:
- Display Name: `"Q4 Valuation - Wellington Place"`
- Document Code: `FIRESIDE-VAL-LN2026042-220326` (auto, read-only)
- Fields:
  - CLIENT: `FIRESIDE` (read-only)
  - TYPE: `VAL` (read-only)
  - Loan Ref: `LN-2026-042` (editable)
  - DATE: `220326` (read-only)

## Display Name Integration

Everywhere a document name is currently shown using `fileName`, change to prefer:

```
displayName || documentCode || fileName
```

Key locations:
- `FileCard.tsx` — card title
- `FileList.tsx` — list row name
- `FileDetailPanel.tsx` — detail sheet header
- `docs/reader/[documentId]/page.tsx` — reader page header
- Overview tab recent documents sections
- Download filename (update `/api/convex-file` route to use `displayName`)

## Auto-Code Generation on Upload

Extend the document code generation functions:

**Note:** The codebase has two code generation paths:
- `src/lib/documentCodeUtils.ts` — `generateDocumentCode()` used by settings preview and manual code assignment
- `src/lib/documentNaming.ts` — `generateDocumentName()` used by the actual upload/filing pipeline in `bulkQueueProcessor.ts`

**Both** need updating to accept a `namingConfig` parameter and assemble codes from the token-based pattern instead of hardcoded format. The `documentNaming.ts` function is the primary target since it handles the upload flow. The `documentCodeUtils.ts` function is used for preview and bulk-apply in settings.

- Accept a `namingConfig` parameter with the pattern, separator, token values, and custom field values
- For custom tokens with no value yet (new uploads), assemble what's available — omit tokens with no value and their separators
- If all required tokens have values, assemble the complete code automatically

A new utility `src/lib/namingConfig.ts` resolves the active naming config:
- Takes `projectId` and `clientId`
- Returns project's config if it has its own; otherwise returns client's config
- Falls back to the default pattern `["CLIENT", "TYPE", "PROJECT", "DATE"]`
- Used by both the Rename dialog and the code generation function

## Backend Changes

### New mutation: `documents.rename`

```
Args: {
  id: Id<"documents">,
  displayName?: string,
  customFieldValues?: Record<string, string>,
  documentCode?: string,
}
```

Updates the document with the provided fields. If `documentCode` is not provided but `customFieldValues` changed, re-generates the code from the active naming pattern.

### Modify: `documents.update`

Add `displayName` and `customFieldValues` to the accepted args (alongside existing classification fields).

### No new queries needed

The naming config is resolved client-side from already-loaded project/client data using the `namingConfig.ts` utility. No extra Convex query.

## Files Changed Summary

| Change | File |
|--------|------|
| Add `displayName`, `customFieldValues` to documents schema | `convex/schema.ts` |
| Add `documents.rename` mutation | `convex/documents.ts` |
| Add `displayName`, `customFieldValues` to `documents.update` | `convex/documents.ts` |
| Extend code generation for pattern config | `src/lib/documentCodeUtils.ts` |
| Extend code generation for upload pipeline | `src/lib/documentNaming.ts` |
| New: naming config resolver utility | `src/lib/namingConfig.ts` |
| New: naming pattern builder component | `src/components/settings/NamingPatternBuilder.tsx` |
| Rewrite DocumentNamingSettings to use pattern builder | `src/components/settings/DocumentNamingSettings.tsx` |
| New: rename dialog component | `src/components/RenameDocumentDialog.tsx` |
| Add "Rename" to file context menu | `src/app/docs/components/FileCard.tsx` |
| Display name fallback rendering | `src/app/docs/components/FileCard.tsx` |
| Display name fallback rendering | `src/app/docs/components/FileList.tsx` |
| Display name fallback rendering | `src/app/docs/components/FileDetailPanel.tsx` |
| Display name fallback rendering | `src/app/docs/reader/[documentId]/page.tsx` |
| Update download filename | `src/app/api/convex-file/route.ts` |

## Edge Cases & Migration

### Duplicate document codes

The existing `updateDocumentCode` mutation enforces uniqueness by scanning documents. When the Rename dialog or auto-generation produces a duplicate code, auto-append a numeric suffix (`-1`, `-2`, etc.) — the same pattern already used by the bulk-apply code in `DocumentNamingSettings.tsx`. The Rename dialog should show the final code (with suffix if needed) before saving.

### Migration: string-format pattern to array

Existing clients/projects may have `metadata.documentNaming.pattern` stored as a string (e.g., `"{client}-{type}-{date}"`). The `namingConfig.ts` resolver must handle both formats:
- If `pattern` is a `string[]` → use as-is (new format)
- If `pattern` is a `string` → parse it into tokens by splitting on separator and mapping to uppercase token names
- If `pattern` is `undefined` → fall back to default `["CLIENT", "TYPE", "PROJECT", "DATE"]`

No Convex migration needed — the resolver handles both formats at read time. New saves always write the array format.

### `inheritFromClient` storage location

The `inheritFromClient` flag is stored inside `metadata.documentNaming.inheritFromClient: boolean` on the project. When `true` (or when `documentNaming` is absent from project metadata), the naming config resolver reads from the client's `metadata.documentNaming` instead. The project settings Naming tab reads this flag to show the "Inheriting from [Client Name]" banner.

**Inheritance is atomic** — the entire `DocumentNamingConfig` (pattern, separator, customTokens) is inherited or overridden as a unit. A project that overrides gets its own complete copy of the config. This avoids complexity of mixing client-level tokens with project-level patterns. When a project clicks "Override," the UI pre-populates with the client's current config as a starting point.

Keys in `customFieldValues` on documents correspond to the `id` field of `CustomToken` (e.g., `{ "loan_ref": "LN-2026-042" }` maps to a `CustomToken` with `id: "loan_ref"`).

### Server-side naming config during upload

The upload/filing pipeline in `bulkQueueProcessor.ts` calls `generateDocumentCode()`. This runs client-side in the browser. The processor already has access to the selected client and project objects (passed as context). The extended `generateDocumentCode()` accepts an optional `namingConfig` parameter. The caller reads `project.metadata?.documentNaming` (falling back to `client.metadata?.documentNaming`) and passes it in. No new Convex query needed — the data is already loaded.

### `PROJECT` token for client-level documents

Documents at client level (`isBaseDocument: true`, no `projectId`) skip the `PROJECT` token when assembling the code — the token is omitted and its separator is removed. This matches the existing behavior in `generateDocumentCode()`.

### Custom token ID validation

Custom token IDs are validated against reserved built-in names: `CLIENT`, `TYPE`, `PROJECT`, `DATE`. If collision detected, the UI appends `_custom` to the ID (e.g., `date_custom`). Maximum 8 custom tokens per client/project.

### Internal documents

Internal documents (`ROCK-INT-{TOPIC}-{DATE}`) do not participate in the custom naming system. They retain their hardcoded pattern via `generateInternalDocumentCode()`.

## Out of Scope

- Drag-and-drop token reordering (arrow buttons sufficient for settings)
- Naming tokens from canonical data fields (keep naming tokens separate from extraction fields)
- Bulk rename UI (users rename one at a time via three-dot menu; bulk apply from Settings handles codes)
- Version-aware naming (version field exists separately, not integrated into naming pattern)
