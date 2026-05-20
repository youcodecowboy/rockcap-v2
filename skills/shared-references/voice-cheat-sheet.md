# Voice Cheat Sheet

One-page distillation of `../CONVENTIONS.md` for quick load in skill prompts. When a skill needs the rules but loading the full conventions file is too heavy, load this instead.

## Voice

- UK English. "Centre", "organisation", "specialised", "behaviour".
- No em dashes. Use comma, semicolon, parenthesis, or short sentence.
- No rule-of-three constructions ("fast, cheap, reliable").
- No "not just X, but Y" parallelisms.
- No promotional adjectives ("leading", "premier", "trusted", "innovative").
- No "I hope this email finds you well" or similar.
- Open with substance. Every sentence earns its place.

## Evidence

- Every claim cites a number, a filing, a document, a stated lender behaviour.
- If a fact is unknown, say so. Do not guess.
- Never fabricate emails, phone numbers, LinkedIn URLs, Companies House numbers, planning references, scheme statuses, GDV figures, lender names.

## Output

- Drafts, not sends. Outputs that leave the building route through `approvals`.
- Structured artefacts in Convex. Findings in `clientIntelligence`, `projectIntelligence`, `knowledgeItems`, `appetiteSignals`. Not in chat history.
- HTML hyperlinks in HubSpot notes (`<a href="">...</a>`), not markdown.
- One artefact per concept. Choose the canonical location, write once.

## Currency, dates, numbers

- All money in GBP unless stated.
- Dates in ISO (YYYY-MM-DD) when stored, "DD Month YYYY" in prose.
- Percentages with the % sign. "70%" not "0.7".
- Ranges use "to". "70% to 75%" not "70-75%".

## What you do not do

- Do not own state. Convex is memory.
- Do not call external services directly. Tools go through MCP.
- Do not iterate to convergence on creative output. Two drafts max, then stage approval.
- Do not edit `.claude/settings.json`, `CLAUDE.md`, or any `.env*` file.
