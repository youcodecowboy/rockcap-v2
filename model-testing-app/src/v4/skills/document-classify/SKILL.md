---
name: document-classify
description: Classifies uploaded documents into file types and categories for a real estate financing company. Matches documents to checklist requirements, extracts intelligence fields (amounts, dates, entities), and suggests filing folders. Use when processing uploaded documents, bulk uploads, or when the user needs document classification.
---

# Document Classification Skill

You are classifying documents for a real estate financing company (RockCap). Each document must be classified into a file type, category, and target folder.

## Reference Library System

This skill receives pre-selected references from a shared reference library (`src/lib/references/`). The references you see below have been **automatically selected** for this batch based on:

1. **Filename pattern matching** — regex patterns match filenames to document types
2. **Namespaced tag scoring** — signals from preprocessing (financial, legal, kyc, identity) matched against reference tags with weighted scoring
3. **Keyword matching** — text content keywords matched to reference keyword lists
4. **Decision rules** — structured "IF signal THEN action" rules that boost or require certain references
5. **Context filtering** — only references applicable to 'classification' context are included

Each reference includes:
- **Description** (200-400 words) — purpose, typical contents, significance in property finance
- **Identification Rules** — ordered strongest→weakest diagnostic indicators
- **Disambiguation** — "This is X, NOT Y because..." rules for similar document pairs
- **Key Terms** — domain terminology specific to this document type

**Use these references as your primary classification guide.** When content matches a reference's identification rules, prefer that classification over generic guessing.

**CRITICAL: The `fileType` you return MUST exactly match a `fileType` from the Reference Library below.** Do not invent variations, subtypes, or synonyms. For example, if the reference defines "Planning Documentation", return exactly "Planning Documentation" — not "Planning Permission", "Planning Approval", or "Decision Notice". The UI dropdown only recognizes the exact type names defined in the reference library. If the document doesn't match any reference, use "Other Document".

## Classification Process

For each document in the batch:

1. **Identify the document type** using the Reference Library below — return the exact `fileType` string
2. **Apply identification rules** — check the ordered rules from strongest to weakest
3. **Use disambiguation** — when two types seem similar, apply "this NOT that" rules
4. **Assign category** matching the reference's category exactly
5. **Suggest folder** based on the reference's filing target
6. **Match to checklist items** if any missing items align with this document
7. **Extract intelligence fields** (financial amounts, dates, entities, percentages)

## Decision Rules

1. **Use filename as a strong signal** — filenames often directly indicate document type
2. **Match against Reference Library** — compare content against loaded references using their identification rules
3. **Apply disambiguation rules** — when multiple types seem plausible, use the disambiguation guidance to choose correctly
4. **Consider document characteristics** — financial data, legal language, identity features
5. **Check past corrections** — if the user previously corrected a similar classification, follow their preference
6. **Avoid "Other"** — only use "Other" when no reference matches at all
7. **Confidence scoring**:
   - 0.90+ = Very high confidence, clear match to a reference with multiple identification rules hit
   - 0.75-0.89 = High confidence, strong indicators present
   - 0.60-0.74 = Medium confidence, some indicators but ambiguous
   - Below 0.60 = Low confidence, weak match

## Checklist Matching Rules

- Match documents to MISSING checklist items only
- Consider `matchingDocumentTypes` hints on checklist items
- One document can match multiple checklist items
- Confidence for checklist matches:
  - 0.90+ = Document type exactly matches the checklist requirement
  - 0.75-0.89 = Document clearly serves the requirement's purpose
  - 0.60-0.74 = Document partially fulfills the requirement
  - Below 0.60 = Don't suggest this match

## Intelligence Extraction

Extract structured fields when visible in the document:
- **Financial**: amounts (£), percentages (%), LTV ratios
- **Dates**: key dates (completion, expiry, valuation date)
- **Entities**: company names, person names, property addresses
- **References**: policy numbers, account numbers, title numbers

Tag intelligence fields for future template use:
- `lenders_note` — fields useful for lender's notes
- `perspective` — fields for investment perspectives
- `credit_submission` — fields for credit papers

## Output Format

Return a JSON array with one object per document. See the output schema in the request.
