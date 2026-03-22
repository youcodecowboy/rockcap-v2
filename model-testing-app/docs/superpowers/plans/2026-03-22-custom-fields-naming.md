# LIB-01 + FIL-02: Custom Fields & Flexible Document Naming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable naming patterns with custom tokens at the project/client level, a Rename dialog in the file context menu, and per-document custom field values that feed into document codes.

**Architecture:** Extends the existing `metadata.documentNaming` config on clients/projects with a token-based pattern array. Adds `displayName` and `customFieldValues` to the documents schema. A new naming config resolver utility handles inheritance (client → project). The Rename dialog and NamingPatternBuilder are new React components; the existing DocumentNamingSettings is rewritten to use the pattern builder.

**Tech Stack:** Convex (backend mutations/queries), Next.js App Router, React, Tailwind CSS, shadcn/ui components, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-22-custom-fields-naming-design.md`

---

## File Structure

### Backend (Convex)

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add `displayName`, `customFieldValues` to documents table |
| `convex/documents.ts` | Modify | Add `documents.rename` mutation, extend `documents.update` args |

### Shared Utilities

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/namingConfig.ts` | Create | Resolve active naming config (inheritance, migration, token assembly) |
| `src/lib/documentCodeUtils.ts` | Modify | Extend `generateDocumentCode()` to accept pattern config |
| `src/lib/documentNaming.ts` | Modify | Extend `generateDocumentName()` to accept pattern config |

### Frontend Components

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/settings/NamingPatternBuilder.tsx` | Create | Token chip builder with add/remove/reorder |
| `src/components/settings/DocumentNamingSettings.tsx` | Rewrite | Use NamingPatternBuilder, custom token management, inheritance |
| `src/components/RenameDocumentDialog.tsx` | Create | Rename dialog with display name, code, and field values |
| `src/app/docs/components/FileCard.tsx` | Modify | Add "Rename" to menu, displayName fallback rendering |
| `src/app/docs/components/FileDetailPanel.tsx` | Modify | displayName fallback rendering |
| `src/app/docs/reader/[documentId]/page.tsx` | Modify | displayName fallback rendering |

---

## Task 1: Schema changes — add `displayName` and `customFieldValues`

**Files:**
- Modify: `convex/schema.ts` (~line 228)

- [ ] **Step 1: Add new fields to documents table**

In `convex/schema.ts`, find the documents table definition. After the `versionNote` field (around line 227), add:

```typescript
    // Display & naming
    displayName: v.optional(v.string()),
    customFieldValues: v.optional(v.record(v.string(), v.string())),
```

- [ ] **Step 2: Regenerate Convex types**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(LIB-01): add displayName and customFieldValues to documents schema"
```

---

## Task 2: Add `documents.rename` mutation and extend `documents.update`

**Files:**
- Modify: `convex/documents.ts`

- [ ] **Step 1: Add `displayName` and `customFieldValues` to `documents.update` args**

In the `update` mutation (around line 688), add to the args object:

```typescript
    displayName: v.optional(v.string()),
    customFieldValues: v.optional(v.record(v.string(), v.string())),
```

Then in the handler's `cleanUpdates` logic (around line 788), add these fields to the patch:

```typescript
    if (args.displayName !== undefined) cleanUpdates.displayName = args.displayName;
    if (args.customFieldValues !== undefined) cleanUpdates.customFieldValues = args.customFieldValues;
```

- [ ] **Step 2: Add `documents.rename` mutation**

Append to `convex/documents.ts`:

```typescript
export const rename = mutation({
  args: {
    id: v.id("documents"),
    displayName: v.optional(v.string()),
    customFieldValues: v.optional(v.record(v.string(), v.string())),
    documentCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Document not found");

    const updates: any = {};

    if (args.displayName !== undefined) {
      updates.displayName = args.displayName;
    }

    if (args.customFieldValues !== undefined) {
      updates.customFieldValues = args.customFieldValues;
    }

    if (args.documentCode !== undefined) {
      // Check for duplicate codes
      if (args.documentCode) {
        const existing = await ctx.db
          .query("documents")
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect();
        const duplicate = existing.find(
          (d) => d.documentCode === args.documentCode && d._id !== args.id
        );
        if (duplicate) {
          // Auto-suffix to avoid duplicate
          let suffix = 1;
          let candidateCode = `${args.documentCode}-${suffix}`;
          while (existing.some((d) => d.documentCode === candidateCode && d._id !== args.id)) {
            suffix++;
            candidateCode = `${args.documentCode}-${suffix}`;
          }
          updates.documentCode = candidateCode;
        } else {
          updates.documentCode = args.documentCode;
        }
      } else {
        updates.documentCode = args.documentCode;
      }
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }

    return updates.documentCode || doc.documentCode;
  },
});
```

- [ ] **Step 3: Verify build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add convex/documents.ts
git commit -m "feat(LIB-01): add documents.rename mutation and extend documents.update"
```

---

## Task 3: Create naming config resolver utility

**Files:**
- Create: `src/lib/namingConfig.ts`

- [ ] **Step 1: Create the naming config utility**

```typescript
/**
 * Naming config resolver — handles inheritance, migration, and token assembly.
 * Reads from project/client metadata.documentNaming.
 */

export interface CustomToken {
  id: string;
  label: string;
  type: "text";
  required: boolean;
}

export interface DocumentNamingConfig {
  code: string;
  pattern: string[];
  separator: string;
  customTokens: CustomToken[];
  inheritFromClient?: boolean;
}

const BUILT_IN_TOKENS = ["CLIENT", "TYPE", "PROJECT", "DATE"] as const;
const DEFAULT_PATTERN: string[] = ["CLIENT", "TYPE", "PROJECT", "DATE"];
const DEFAULT_SEPARATOR = "-";
const RESERVED_TOKEN_IDS = new Set(BUILT_IN_TOKENS.map((t) => t.toLowerCase()));
const MAX_CUSTOM_TOKENS = 8;

/**
 * Resolve the active naming config for a document context.
 * Project overrides client if it has its own config.
 * Handles migration from old string-format pattern.
 */
export function resolveNamingConfig(
  projectMetadata?: any,
  clientMetadata?: any
): DocumentNamingConfig {
  // Check project first (if not inheriting)
  const projectNaming = projectMetadata?.documentNaming;
  if (projectNaming && !projectNaming.inheritFromClient) {
    return normalizeConfig(projectNaming);
  }

  // Fall back to client
  const clientNaming = clientMetadata?.documentNaming;
  if (clientNaming) {
    return normalizeConfig(clientNaming);
  }

  // Default
  return {
    code: "",
    pattern: DEFAULT_PATTERN,
    separator: DEFAULT_SEPARATOR,
    customTokens: [],
  };
}

/**
 * Normalize a raw config from metadata — handles migration from string to array format.
 */
function normalizeConfig(raw: any): DocumentNamingConfig {
  let pattern: string[];

  if (Array.isArray(raw.pattern)) {
    pattern = raw.pattern;
  } else if (typeof raw.pattern === "string") {
    // Migration: parse old string format like "{client}-{type}-{date}"
    const sep = raw.separator || DEFAULT_SEPARATOR;
    pattern = raw.pattern
      .split(sep)
      .map((t: string) => t.replace(/[{}]/g, "").toUpperCase().trim())
      .filter(Boolean);
  } else {
    pattern = DEFAULT_PATTERN;
  }

  return {
    code: raw.code || "",
    pattern,
    separator: raw.separator || DEFAULT_SEPARATOR,
    customTokens: raw.customTokens || [],
    inheritFromClient: raw.inheritFromClient,
  };
}

/**
 * Assemble a document code from a naming config and token values.
 */
export function assembleDocumentCode(
  config: DocumentNamingConfig,
  tokenValues: Record<string, string>
): string {
  const parts: string[] = [];

  for (const token of config.pattern) {
    const key = token.toLowerCase();
    const value = tokenValues[key];
    if (value) {
      parts.push(value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    }
    // Skip tokens with no value (omit from code)
  }

  return parts.join(config.separator);
}

/**
 * Get built-in token values from document metadata.
 */
export function getBuiltInTokenValues(
  clientCode: string,
  category: string,
  projectCode?: string,
  date?: string | Date
): Record<string, string> {
  const values: Record<string, string> = {};

  if (clientCode) values.client = clientCode;
  if (category) values.type = abbreviateCategory(category);
  if (projectCode) values.project = projectCode;

  const d = date ? new Date(date) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  values.date = `${dd}${mm}${yy}`;

  return values;
}

// IMPORTANT: Import abbreviateCategory from the existing documentCodeUtils.ts
// Do NOT duplicate the category mapping — reuse the canonical one.
import { abbreviateCategory } from './documentCodeUtils';
// The implementer must ensure abbreviateCategory is exported from documentCodeUtils.ts
// (add `export` keyword if it's currently a module-private function).

/**
 * Validate a custom token ID against reserved names.
 */
export function validateTokenId(id: string): string {
  const normalized = id.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (RESERVED_TOKEN_IDS.has(normalized)) {
    return `${normalized}_custom`;
  }
  return normalized;
}

/**
 * Generate a token ID from a label.
 */
export function labelToTokenId(label: string): string {
  const raw = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return validateTokenId(raw);
}

export { BUILT_IN_TOKENS, DEFAULT_PATTERN, DEFAULT_SEPARATOR, MAX_CUSTOM_TOKENS };
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/namingConfig.ts
git commit -m "feat(LIB-01): add naming config resolver with inheritance and migration"
```

---

## Task 4: Create NamingPatternBuilder component

**Files:**
- Create: `src/components/settings/NamingPatternBuilder.tsx`

- [ ] **Step 1: Create the pattern builder component**

This is the visual token chip builder with add/remove/reorder, separator selector, and live preview.

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  BUILT_IN_TOKENS,
  type DocumentNamingConfig,
  type CustomToken,
  assembleDocumentCode,
  getBuiltInTokenValues,
} from '@/lib/namingConfig';

interface NamingPatternBuilderProps {
  config: DocumentNamingConfig;
  onChange: (config: DocumentNamingConfig) => void;
  sampleClientCode?: string;
  sampleProjectCode?: string;
  sampleCategory?: string;
  disabled?: boolean;
}

export default function NamingPatternBuilder({
  config,
  onChange,
  sampleClientCode = "ACME",
  sampleProjectCode = "PARK28",
  sampleCategory = "Appraisals",
  disabled = false,
}: NamingPatternBuilderProps) {
  const allAvailableTokens = [
    ...BUILT_IN_TOKENS.map((t) => ({ id: t, label: t, isBuiltIn: true })),
    ...config.customTokens.map((t) => ({ id: t.id.toUpperCase(), label: t.label, isBuiltIn: false })),
  ];

  const unusedTokens = allAvailableTokens.filter(
    (t) => !config.pattern.includes(t.id)
  );

  const handleAddToken = (tokenId: string) => {
    onChange({ ...config, pattern: [...config.pattern, tokenId] });
  };

  const handleRemoveToken = (index: number) => {
    const newPattern = [...config.pattern];
    newPattern.splice(index, 1);
    onChange({ ...config, pattern: newPattern });
  };

  const handleMoveToken = (index: number, direction: -1 | 1) => {
    const newPattern = [...config.pattern];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newPattern.length) return;
    [newPattern[index], newPattern[newIndex]] = [newPattern[newIndex], newPattern[index]];
    onChange({ ...config, pattern: newPattern });
  };

  const handleSeparatorChange = (sep: string) => {
    onChange({ ...config, separator: sep });
  };

  // Generate preview
  const sampleTokenValues: Record<string, string> = {
    ...getBuiltInTokenValues(sampleClientCode, sampleCategory, sampleProjectCode),
  };
  // Add sample values for custom tokens
  for (const ct of config.customTokens) {
    sampleTokenValues[ct.id] = "ABC123";
  }
  const previewCode = assembleDocumentCode(config, sampleTokenValues);

  return (
    <div className="space-y-4">
      {/* Pattern chips */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Naming Pattern</label>
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-gray-50 rounded-lg border min-h-[44px]">
          {config.pattern.map((token, index) => (
            <div key={`${token}-${index}`} className="flex items-center gap-0.5">
              {index > 0 && (
                <span className="text-gray-400 text-xs font-mono mx-0.5">{config.separator}</span>
              )}
              <Badge
                variant="secondary"
                className={`text-xs font-mono gap-1 ${
                  BUILT_IN_TOKENS.includes(token as any)
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-purple-100 text-purple-700 border-purple-200'
                } ${disabled ? 'opacity-60' : ''}`}
              >
                {!disabled && index > 0 && (
                  <button onClick={() => handleMoveToken(index, -1)} className="hover:text-blue-900">
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {token}
                {!disabled && index < config.pattern.length - 1 && (
                  <button onClick={() => handleMoveToken(index, 1)} className="hover:text-blue-900">
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                {!disabled && (
                  <button onClick={() => handleRemoveToken(index)} className="hover:text-red-600 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            </div>
          ))}

          {/* Add token dropdown */}
          {!disabled && unusedTokens.length > 0 && (
            <Select onValueChange={handleAddToken}>
              <SelectTrigger className="w-auto h-7 text-xs border-dashed gap-1 px-2">
                <Plus className="w-3 h-3" />
                <SelectValue placeholder="Add token" />
              </SelectTrigger>
              <SelectContent>
                {unusedTokens.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.label} {!t.isBuiltIn && <span className="text-purple-500">(custom)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Separator</label>
        <Select value={config.separator} onValueChange={handleSeparatorChange} disabled={disabled}>
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-">- (dash)</SelectItem>
            <SelectItem value="_">_ (underscore)</SelectItem>
            <SelectItem value=".">. (dot)</SelectItem>
            <SelectItem value=" ">(space)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-lg border p-3">
        <p className="text-xs text-gray-500 mb-1">Preview</p>
        <p className="text-sm font-mono font-medium text-gray-900">
          {previewCode || <span className="text-gray-400 italic">No tokens selected</span>}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/NamingPatternBuilder.tsx
git commit -m "feat(LIB-01): add NamingPatternBuilder component with token chips and preview"
```

---

## Task 5: Rewrite DocumentNamingSettings to use pattern builder

**Files:**
- Modify: `src/components/settings/DocumentNamingSettings.tsx`

- [ ] **Step 1: Rewrite DocumentNamingSettings**

Read the existing file first. Then rewrite it to:

1. Import and use `NamingPatternBuilder`
2. Add a "Custom Tokens" section with add/edit/delete
3. Add inheritance banner for project-level (read-only when inheriting, "Override" toggle)
4. Keep existing abbreviation input and bulk-apply functionality
5. Use `resolveNamingConfig()` from `namingConfig.ts` for initial state
6. Save the updated `DocumentNamingConfig` format to metadata

Key structure:
- **Top:** Inheritance banner (project only) — "Inheriting from [Client]. Override?" toggle
- **Abbreviation input** (existing, kept)
- **NamingPatternBuilder** component
- **Custom Tokens section** — "Add Custom Token" form (label, required toggle) + list with delete
- **Bulk Apply** section (existing, kept — now uses pattern config)
- **Save button**

The implementer should read the existing component carefully, preserve the props interface, and keep the `onSave` / `onShortcodeChange` callbacks working. The save payload changes from `{ code, pattern?: string }` to the full `DocumentNamingConfig` object.

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/DocumentNamingSettings.tsx
git commit -m "feat(LIB-01): rewrite DocumentNamingSettings with pattern builder and custom tokens"
```

---

## Task 6: Create RenameDocumentDialog

**Files:**
- Create: `src/components/RenameDocumentDialog.tsx`

- [ ] **Step 1: Create the rename dialog**

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';
import {
  resolveNamingConfig,
  assembleDocumentCode,
  getBuiltInTokenValues,
  BUILT_IN_TOKENS,
  type DocumentNamingConfig,
} from '@/lib/namingConfig';

interface RenameDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    _id: Id<"documents">;
    fileName: string;
    displayName?: string;
    documentCode?: string;
    customFieldValues?: Record<string, string>;
    category?: string;
    clientId?: Id<"clients">;
    projectId?: Id<"projects">;
  };
  clientMetadata?: any;
  projectMetadata?: any;
  clientCode?: string;
  projectCode?: string;
}

export default function RenameDocumentDialog({
  isOpen,
  onClose,
  document,
  clientMetadata,
  projectMetadata,
  clientCode = "",
  projectCode = "",
}: RenameDocumentDialogProps) {
  const renameMutation = useMutation(api.documents.rename);

  const namingConfig = useMemo(
    () => resolveNamingConfig(projectMetadata, clientMetadata),
    [projectMetadata, clientMetadata]
  );

  const [displayName, setDisplayName] = useState(document.displayName || document.fileName || "");
  const [customizeCode, setCustomizeCode] = useState(false);
  const [manualCode, setManualCode] = useState(document.documentCode || "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    document.customFieldValues || {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when document changes
  useEffect(() => {
    setDisplayName(document.displayName || document.fileName || "");
    setCustomizeCode(false);
    setManualCode(document.documentCode || "");
    setFieldValues(document.customFieldValues || {});
  }, [document._id]);

  // Assemble auto code from pattern + field values
  const builtInValues = getBuiltInTokenValues(
    clientCode || namingConfig.code,
    document.category || "",
    projectCode,
    undefined
  );
  const allTokenValues = { ...builtInValues, ...fieldValues };
  const autoCode = assembleDocumentCode(namingConfig, allTokenValues);

  const effectiveCode = customizeCode ? manualCode : autoCode;

  const handleFieldChange = (tokenId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [tokenId]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await renameMutation({
        id: document._id,
        displayName: displayName.trim() || undefined,
        customFieldValues: Object.keys(fieldValues).length > 0 ? fieldValues : undefined,
        documentCode: effectiveCode || undefined,
      });
      toast.success("Document renamed");
      onClose();
    } catch (error) {
      console.error("Rename failed:", error);
      toast.error("Failed to rename document");
    } finally {
      setIsSaving(false);
    }
  };

  // Separate built-in and custom tokens from the pattern
  const builtInTokensInPattern = namingConfig.pattern.filter((t) =>
    (BUILT_IN_TOKENS as readonly string[]).includes(t)
  );
  const customTokensInPattern = namingConfig.pattern.filter(
    (t) => !(BUILT_IN_TOKENS as readonly string[]).includes(t)
  );
  const customTokenDefs = namingConfig.customTokens.filter((ct) =>
    customTokensInPattern.includes(ct.id.toUpperCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Rename Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Section 1: Display Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={document.fileName}
            />
            <p className="text-xs text-gray-500">The name shown in the document library.</p>
          </div>

          {/* Section 2: Document Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Document Code</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Customize</span>
                <Switch
                  checked={customizeCode}
                  onCheckedChange={setCustomizeCode}
                  className="scale-75"
                />
              </div>
            </div>
            {customizeCode ? (
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter custom code"
                className="font-mono text-sm"
              />
            ) : (
              <div className="bg-gray-50 rounded-md border px-3 py-2">
                <p className="text-sm font-mono text-gray-700">
                  {autoCode || <span className="text-gray-400 italic">No code (fill in fields below)</span>}
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Field Values */}
          {(builtInTokensInPattern.length > 0 || customTokenDefs.length > 0) && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Field Values</Label>

              {/* Built-in tokens (read-only) */}
              {builtInTokensInPattern.map((token) => (
                <div key={token} className="flex items-center gap-3">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs font-mono w-20 justify-center">
                    {token}
                  </Badge>
                  <Input
                    value={builtInValues[token.toLowerCase()] || ""}
                    disabled
                    className="flex-1 text-sm font-mono bg-gray-50"
                  />
                </div>
              ))}

              {/* Custom tokens (editable) */}
              {customTokenDefs.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3">
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs font-mono w-20 justify-center">
                    {ct.label}
                    {ct.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Badge>
                  <Input
                    value={fieldValues[ct.id] || ""}
                    onChange={(e) => handleFieldChange(ct.id, e.target.value)}
                    placeholder={ct.label}
                    className="flex-1 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/RenameDocumentDialog.tsx
git commit -m "feat(FIL-02): add RenameDocumentDialog with display name, code, and field values"
```

---

## Task 7: Add "Rename" to file context menu + displayName fallback

**Files:**
- Modify: `src/app/docs/components/FileCard.tsx`

- [ ] **Step 1: Add `onRename` prop and menu item**

Read `FileCard.tsx` first. Then:

1. Add `onRename?: () => void` to the component's props interface (~line 78)
2. In `renderDropdownItems()` (~line 174), after the "View Details" item (~line 176-179) and before "Open in Reader", insert:

```typescript
        {onRename && (
          <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onRename)}>
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
        )}
```

3. Add `Pencil` to the Lucide imports.

- [ ] **Step 2: Update display name rendering**

Find where `document.documentCode || document.fileName` is used for display (list view ~line 292, grid view ~line 403). Replace with:

```typescript
{document.displayName || document.documentCode || document.fileName}
```

Also add `displayName` and `customFieldValues` to the document interface/type used by this component (~line 39-56).

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/docs/components/FileCard.tsx
git commit -m "feat(FIL-02): add Rename to file context menu and displayName fallback"
```

---

## Task 8: Wire RenameDocumentDialog into document library

**Files:**
- Modify: `src/app/docs/components/FileList.tsx` (or wherever FileCard is rendered with its callbacks)
- Modify: `src/app/docs/components/FileDetailPanel.tsx`

- [ ] **Step 1: Wire rename in the file list**

Read the file that renders `FileCard` with its callback props (likely `FileList.tsx` or a parent). Add:

1. State: `const [renamingDoc, setRenamingDoc] = useState<any>(null);`
2. Pass `onRename={() => setRenamingDoc(doc)}` to each FileCard
3. Render `<RenameDocumentDialog>` conditionally:

```typescript
{renamingDoc && (
  <RenameDocumentDialog
    isOpen={!!renamingDoc}
    onClose={() => setRenamingDoc(null)}
    document={renamingDoc}
    clientMetadata={client?.metadata}
    projectMetadata={project?.metadata}
    clientCode={client?.metadata?.documentNaming?.code || ""}
    projectCode={project?.projectShortcode || ""}
  />
)}
```

The implementer will need to check how client/project data is available in this component's scope. It may already be loaded via props or context.

- [ ] **Step 2: Update displayName in FileDetailPanel**

In `FileDetailPanel.tsx`, find where the document name is displayed and apply the same fallback:

```typescript
{document.displayName || document.documentCode || document.fileName}
```

- [ ] **Step 3: Update displayName in document reader page**

In `src/app/docs/reader/[documentId]/page.tsx`, find the header where the document name displays and apply the fallback.

- [ ] **Step 4: Update displayName in overview tabs**

Search for document name rendering in:
- `src/app/clients/[clientId]/components/ClientOverviewTab.tsx` (recent documents section)
- `src/app/clients/[clientId]/projects/[projectId]/components/ProjectOverviewTab.tsx` (recent documents section)

Apply the same `displayName || documentCode || fileName` fallback wherever document names appear.

- [ ] **Step 5: Update download filename in convex-file route**

In `src/app/api/convex-file/route.ts`, the route already accepts a `filename` param for `Content-Disposition`. No backend change needed — but update any frontend callers that pass `fileName` to instead pass `displayName || documentCode || fileName`. Check the download handlers in `FileCard.tsx`, `FileDetailPanel.tsx`, and the reader page.

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/app/docs/components/FileList.tsx src/app/docs/components/FileDetailPanel.tsx src/app/docs/reader/\[documentId\]/page.tsx src/app/clients/\[clientId\]/components/ClientOverviewTab.tsx src/app/clients/\[clientId\]/projects/\[projectId\]/components/ProjectOverviewTab.tsx
git commit -m "feat(FIL-02): wire RenameDocumentDialog into document library and update displayName rendering"
```

---

## Task 9: Extend code generation functions for pattern config

**Files:**
- Modify: `src/lib/documentCodeUtils.ts`
- Modify: `src/lib/documentNaming.ts`

- [ ] **Step 1: Extend `generateDocumentCode()` in documentCodeUtils.ts**

Add an optional `namingConfig` parameter. When provided, use it to assemble the code instead of the hardcoded pattern. When not provided, fall back to the existing behavior (backward compatible).

```typescript
import { assembleDocumentCode, getBuiltInTokenValues, type DocumentNamingConfig } from './namingConfig';

export function generateDocumentCode(
  clientName: string,
  category: string,
  projectName: string | undefined,
  uploadedAt: string | Date,
  namingConfig?: DocumentNamingConfig,
  customFieldValues?: Record<string, string>
): string {
  // New path: use pattern config
  if (namingConfig && namingConfig.pattern.length > 0) {
    const builtIn = getBuiltInTokenValues(
      namingConfig.code || abbreviateText(clientName, 8),
      category,
      projectName ? abbreviateText(projectName, 10) : undefined,
      uploadedAt
    );
    const allValues = { ...builtIn, ...(customFieldValues || {}) };
    const code = assembleDocumentCode(namingConfig, allValues);
    if (code) return code;
  }

  // Existing fallback (unchanged)
  const clientAbbr = abbreviateText(clientName, 8);
  const typeAbbr = abbreviateCategory(category);
  const date = formatDateDDMMYY(uploadedAt);
  // ... rest of existing logic
}
```

The implementer should read the existing function and add the new path at the top, keeping all existing logic as the fallback.

- [ ] **Step 2: Extend `generateDocumentName()` in documentNaming.ts**

This function takes an options object. Add two new optional fields to it:

```typescript
export function generateDocumentName(options: {
  projectShortcode: string;
  category: string;
  isInternal: boolean;
  uploaderInitials: string;
  version?: string;
  date?: Date;
  // NEW: optional pattern config
  namingConfig?: DocumentNamingConfig;
  customFieldValues?: Record<string, string>;
}): string {
  // New path: if namingConfig provided with custom pattern, use it
  if (options.namingConfig && options.namingConfig.pattern.length > 0 && !options.isInternal) {
    const builtIn = getBuiltInTokenValues(
      options.namingConfig.code || options.projectShortcode,
      options.category,
      options.projectShortcode,
      options.date
    );
    const allValues = { ...builtIn, ...(options.customFieldValues || {}) };
    const code = assembleDocumentCode(options.namingConfig, allValues);
    if (code) return code;
  }

  // Existing fallback (unchanged) — handles internal docs and legacy behavior
  // ... keep all existing logic below ...
}
```

Import `assembleDocumentCode`, `getBuiltInTokenValues`, `DocumentNamingConfig` from `./namingConfig`.

**Note:** Internal documents (`isInternal: true`) always use the existing `ROCK-INT-{TOPIC}-{DATE}` pattern — the custom pattern is bypassed.

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/lib/documentCodeUtils.ts src/lib/documentNaming.ts
git commit -m "feat(LIB-01): extend code generation functions to accept pattern config"
```

---

## Task 10: Final build verification, backlog update, and push

- [ ] **Step 1: Full build check**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Update backlog document**

Mark LIB-01 and FIL-02 as complete in `docs/BACKLOG-2026-03-22.md` with root cause and fix description.

- [ ] **Step 3: Final commit and push**

```bash
git add docs/BACKLOG-2026-03-22.md
git commit -m "docs: mark LIB-01 and FIL-02 as complete in backlog"
git push
```

---

## Implementation Notes

**Backward compatibility:** All changes are backward compatible. Documents without `displayName` show `documentCode || fileName`. Clients/projects without the new `DocumentNamingConfig` format fall back to the default pattern via the `normalizeConfig()` migration in `namingConfig.ts`.

**Custom token limit:** Max 8 custom tokens per client/project. Enforced in the UI (disable "Add" button when at limit).

**Download filename:** The `/api/convex-file` route already accepts a `filename` param (from the FIL-01 fix). Callers should update to pass `displayName || documentCode || fileName` instead of just `fileName`.

**Bulk apply with custom tokens:** When bulk-applying codes from Settings, documents missing required custom token values get codes assembled from available tokens only. The user can fill in missing values per-document via the Rename dialog later.

**`FileList.tsx` vs `FileCard.tsx` rendering:** FileCard handles both grid and list view rendering. FileList may not need separate display name changes if it delegates to FileCard. The implementer should verify.

**Duplicate code check performance:** The `documents.rename` mutation scans all non-deleted documents for code uniqueness. This matches the existing `updateDocumentCode` pattern. For future optimization, consider adding a Convex index on `documentCode`.

**`onSave` callback shape change:** The `DocumentNamingSettings` rewrite (Task 5) changes the save payload from `{ code, pattern?: string }` to the full `DocumentNamingConfig` object. The parent components (`ClientSettingsPanel.tsx` and `ProjectSettingsPanel.tsx`) handle `onSave` and write to `metadata.documentNaming`. The implementer must update those parent handlers to accept and store the new shape. Since `metadata` is `v.any()`, no schema change is needed — just ensure the parent writes the full config object.

**`abbreviateCategory` export:** The existing `abbreviateCategory()` in `documentCodeUtils.ts` may be a module-private function. The implementer must add the `export` keyword to it so `namingConfig.ts` can import it. If the mappings differ between files, use the `documentCodeUtils.ts` version as canonical.
