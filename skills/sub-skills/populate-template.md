# populate-template

Wrap the cross-cutting `template.populate(template, data) → file` primitive (BL-5.6, planned) with skill-side conveniences: variable validation, missing-variable detection, output staging.

Used by deal-intake (underwriting model), terms-package-build (client + lender docs), ic-paper-drafter (IC paper), case-study-author (case study), monitoring-watcher (monitoring summary).

## When to use

Any time a skill needs to produce a populated document from a template and structured data. Skills do not call the underlying primitive directly; they go through this sub-skill for the validation layer.

## Inputs

Required:

- `templateRef`: `{ name: string }` (e.g., `"client-indicative-terms"`, `"ic-paper"`) or `{ documentId: Id<"documents"> }` for ad-hoc templates
- `data`: object whose keys match the template's expected variables

Optional:

- `outputFilenameHint`: human-readable filename; otherwise derived from template name + project shortcode
- `targetStorage`: which storage bucket / scope to write into; defaults based on template's intended audience

## Outputs

```ts
type PopulateResult = {
  fileStorageId: Id<"_storage">;
  outputFilename: string;
  missingVariables: string[];           // variables the template expected but data did not provide
  defaultedVariables: string[];         // variables the template offered a default for and data did not provide
  unusedDataKeys: string[];             // data keys the template did not consume
  contentHash: string;
};
```

## Workflow

1. Resolve the template. If `name`, find the registered template by name in `modelingTemplates` or the file-storage canonical templates. If `documentId`, load that file.
2. Inspect the template's variable manifest (the sidecar `.template.md` per `skills/templates/README.md`). Required vs optional variables.
3. Diff against `data`:
   - For each required variable, must be present in data. If missing, stop and return with `missingVariables` populated.
   - For each optional variable, record presence; if absent, use the template's default.
   - Record any data keys the template does not consume in `unusedDataKeys` (warning only).
4. Call `template.populate(templateRef, data)` via the underlying primitive.
5. Write the output to storage. Filename: `{template.name}-{project.shortcode}-{dateYYYYMMDD}.{ext}` unless overridden.
6. Compute content hash for cache and dedup.
7. Return the result.

## Style rules

CONVENTIONS apply. One that matters: skill never silently substitutes a default for a required variable. Missing-required is an error, not a warning.

## Tool dependencies

- `template.populate` (BL-5.6, planned)
- `modelingTemplates.list`, `modelingTemplates.get` (for `name` lookup)
- `documents.get` (for `documentId` lookup)
- Convex file storage write

## What goes wrong

1. **Template not found**: skill returns a clear error; caller knows to check the template registration.
2. **Required variable missing**: skill returns with `missingVariables` populated and no file. Caller can populate and retry.
3. **Variable type mismatch**: template expects a number, data provided a string. Skill attempts a coercion (parseFloat etc.); if coercion fails, error.
4. **Template malformed**: cannot be parsed. Skill returns the underlying error.
5. **Data contains keys the template does not consume**: not an error. Logged in `unusedDataKeys` for the operator's awareness.

## Implementation status

The primitive `template.populate` is BL-5.6, planned. Until it ships, this sub-skill's interface is the design target; callers can stub the underlying call and store a placeholder file marked `populated: false` until the primitive arrives.
