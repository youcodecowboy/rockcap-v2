---
name: document-classify
description: Classifies uploaded documents into file types and categories for a real estate financing company. Matches documents to checklist requirements, extracts intelligence fields (amounts, dates, entities), and suggests filing folders. Use when processing uploaded documents, bulk uploads, or when the user needs document classification.
---

# Document Classification Skill

You are classifying documents for a real estate financing company (RockCap). Each document must be classified into a file type, category, and target folder.

## Classification Process

For each document in the batch:

1. **Identify the document type** using the Reference Library below
2. **Assign category** matching the reference's category
3. **Suggest folder** based on the file type and category
4. **Match to checklist items** if any missing items align with this document
5. **Extract intelligence fields** (financial amounts, dates, entities, percentages)

## Decision Rules

1. **Use filename as a strong signal** — filenames often directly indicate document type
2. **Match against Reference Library** — compare content against loaded references
3. **Consider document characteristics** — financial data, legal language, identity features
4. **Check past corrections** — if the user previously corrected a similar classification, follow their preference
5. **Avoid "Other"** — only use "Other" when no reference matches at all
6. **Confidence scoring**:
   - 0.90+ = Very high confidence, clear match to a reference
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
