# Searchable Type Dropdowns with Custom Type Creation

**Date:** 2026-03-11
**Status:** Approved

## Problem

The bulk upload review table uses plain Select dropdowns for document type, category, and folder columns. With 100+ file types, users must scroll through the entire list to find what they need. There's also no way to add new document types when the system doesn't cover a specific type.

## Solution

### 1. Extract Reusable `SearchableSelect` Component

Extract the existing search/filter/dropdown pattern from the client selector in `src/components/BulkUpload.tsx` into a generic reusable component.

**File:** `src/components/ui/searchable-select.tsx`

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `{ value: string; label: string; group?: string }[]` | Yes | Available options |
| `value` | `string` | Yes | Currently selected value |
| `onSelect` | `(value: string) => void` | Yes | Called when an option is selected |
| `placeholder` | `string` | No | Input placeholder text |
| `allowCreate` | `boolean` | No | Show "Create '[query]'" when no match |
| `onCreateNew` | `(query: string) => void` | No | Called when user clicks create option |
| `compact` | `boolean` | No | Use `h-7 text-xs` sizing for table cells |
| `disabled` | `boolean` | No | Disable the input |
| `groupSeparator` | `boolean` | No | Render visual separators between option groups |

**Behaviour:**
- Closed state: displays selected value or placeholder, styled like current Select trigger
- Click to open: input becomes editable, dropdown appears below with filtered options
- Typing filters options case-insensitively against label
- Keyboard navigation: Arrow Up/Down to highlight options, Enter to select highlighted option, Escape to close
- When `allowCreate={true}` and query doesn't match any option: shows "Create '[query]'" at bottom
- Clicking "Create" calls `onCreateNew(query)`
- Click outside or Escape closes dropdown
- Clear button (X) when a value is selected — clearing sets value to empty string
- Dropdown positioned with `absolute z-[100]`

**Refactoring:**
- Refactor client selector in `BulkUpload.tsx` to use `SearchableSelect`
- Refactor project selector in `BulkUpload.tsx` to use `SearchableSelect`
- Verify no behaviour change after refactor

### 2. Replace Dropdowns in BulkReviewTable

Replace the three Radix Select dropdowns in `src/components/BulkReviewTable.tsx`:

| Column | Current | New | allowCreate |
|--------|---------|-----|-------------|
| Type (`fileTypeDetected`) | `<Select>` with `FILE_TYPES` | `<SearchableSelect>` with `FILE_TYPES` + custom types | `true` |
| Category | `<Select>` with `CATEGORIES` | `<SearchableSelect>` with `CATEGORIES` | `false` |
| Folder (`targetFolder`) | `<Select>` with `folderOptions` | `<SearchableSelect>` with `folderOptions` | `false` |

**Type column options structure:**
- Standard types first (from `FILE_TYPES` in `categories.ts`), shown as a flat searchable list
- Separator: "Custom Types"
- Custom types below (from `fileTypeDefinitions` where `isSystemDefault !== true`)

This mirrors the existing folder dropdown pattern that already separates standard and custom folders.

**Option grouping:** Standard types use `group: "Standard"`, custom types use `group: "Custom Types"`. The `groupSeparator` prop renders a labeled divider between groups. Standard types remain a flat list (not sub-grouped by category) — the search/filter makes category sub-grouping unnecessary.

**Category options:** Show all entries from `FILE_CATEGORIES` (21 items including legacy). No filtering of legacy categories — they exist for backwards compatibility with existing documents.

### 3. Use Existing `fileTypeDefinitions` Table (No New Table)

The existing `fileTypeDefinitions` table in `convex/schema.ts` already supports user-created document types with all the fields we need:

| Existing Field | How We Use It |
|---------------|---------------|
| `fileType` | Display name (e.g. "Development Appraisal") |
| `category` | One of the standard categories |
| `description` | User-provided description for AI classification |
| `isSystemDefault` | `true` = system reference, `false`/`undefined` = user-created custom type |
| `isActive` | Whether the type is available for selection |
| `createdBy` | User who created it |
| `keywords` | Can be empty array on creation, populated later |
| `identificationRules` | Can be empty array on creation, populated later |

The V4 classification pipeline already loads these via `loadConvexReferences()` in `src/v4/lib/reference-library.ts`, so **AI integration works automatically** — no changes needed to the classification route.

**Existing Convex functions to use:**
- `fileTypeDefinitions.getAll` — already returns all active definitions sorted by category then name
- `fileTypeDefinitions.create` or a new lightweight `fileTypeDefinitions.createQuick` mutation for the modal flow

**New mutation needed:** `fileTypeDefinitions.createFromBulkReview` — a simplified creation mutation that accepts just `fileType`, `category`, and `description`, filling in sensible defaults for the other required fields (`keywords: []`, `identificationRules: []`, `isSystemDefault: false`, `isActive: true`, timestamps). Unlike the existing `create` mutation which enforces a 100-word minimum description, this mutation uses a relaxed 10-word minimum — enough for the AI to work with, but not burdensome during a bulk review flow. Validates name uniqueness against all `fileTypeDefinitions` records (including inactive) and the `FILE_TYPES` const array, case-insensitive.

### 4. `CreateCustomTypeModal` Component

**File:** `src/components/CreateCustomTypeModal.tsx`

Triggered when user clicks "Create '[query]'" in the type column's SearchableSelect.

**Fields:**
| Field | Type | Pre-filled | Required | Notes |
|-------|------|-----------|----------|-------|
| Name | text input | Yes (from query) | Yes | Editable, validated for uniqueness |
| Category | SearchableSelect | No | Yes | All categories from `FILE_CATEGORIES` |
| Description | textarea | No | Yes | Placeholder: "Briefly describe this document type so the AI can recognize it in future uploads..." |

**Behaviour:**
- On save: calls `fileTypeDefinitions.createFromBulkReview` mutation, then selects the new type as the value for the current row
- Name validated against `FILE_TYPES` array and existing `fileTypeDefinitions` (case-insensitive)
- On validation error (duplicate name): show inline error message below the name field, modal stays open
- On mutation failure (network/auth): show toast error, modal stays open for retry
- Loading state on save button during mutation
- Cancel dismisses without saving

**Downstream compatibility:** Custom type values stored in `bulkUploadItems.fileTypeDetected` may not exist in the `FILE_TYPES` const array. This is already handled — the system treats `fileTypeDetected` as a free string field, and placement/filing uses the `fileTypeDefinitions` table (which includes the custom type) rather than the const array.

### 5. AI Classification Integration

The V4 pipeline at `src/v4/lib/reference-library.ts` already has `loadConvexReferences()` which queries `fileTypeDefinitions.getAll` and maps records into `ReferenceDocument` objects. Custom types created through the modal will automatically be available to the AI classifier — **but only if a `ConvexHttpClient` is passed via `config.convexClient`**.

**Currently not wired up.** The V4 route at `src/app/api/v4-analyze/route.ts` builds the config with only `anthropicApiKey` and `useMock`. It does not pass a `convexClient`, so `loadConvexReferences()` is never called.

**Required implementation step:**
- Create a `ConvexHttpClient` in the V4 route using `NEXT_PUBLIC_CONVEX_URL` from env
- Pass it as `config.convexClient` in the pipeline config
- This enables both existing `fileTypeDefinitions` (system defaults) AND new custom types to be loaded by the AI classifier

### 6. Promotion Pipeline (Future)

Custom types where `isSystemDefault` is `false` live in the "Custom Types" section of the dropdown. A future admin workflow can:
1. Review frequently-used custom types
2. Create a full `DocumentReference` in the shared reference library (`src/lib/references/`)
3. Add to `FILE_TYPES` in `categories.ts`
4. Set `isSystemDefault: true` on the `fileTypeDefinitions` record

This is out of scope for this implementation but the data model supports it. The existing settings page at `src/app/settings/file-summary-agent/page.tsx` already provides UI for managing `fileTypeDefinitions`.

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/searchable-select.tsx` | **New** — reusable SearchableSelect component extracted from client selector pattern |
| `src/components/CreateCustomTypeModal.tsx` | **New** — modal for creating custom document types |
| `src/components/BulkUpload.tsx` | **Modified** — refactor client/project selectors to use SearchableSelect |
| `src/components/BulkReviewTable.tsx` | **Modified** — replace Select with SearchableSelect for type, category, folder columns; load custom types from `fileTypeDefinitions` |
| `convex/fileTypeDefinitions.ts` | **Modified** — add `createFromBulkReview` mutation |
| `src/lib/categories.ts` | No change (standard types remain here) |
| `convex/schema.ts` | No change (table already exists) |
| `src/app/api/v4-analyze/route.ts` | **Modified** — wire up `ConvexHttpClient` so custom types are loaded by AI classifier |
