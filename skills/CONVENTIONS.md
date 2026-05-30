# Skills Conventions

The style and operating rules every RockCap skill follows. These apply to SKILL.md files, references, drafted emails, IC papers, monitoring summaries, anything a skill emits.

The conventions exist because skills produce work that goes in front of clients, lenders, professional advisers, and the team. Inconsistency erodes the firm's voice and forces every output to be hand-edited before it ships.

## Voice rules

These come from the brief and apply to every word a skill produces. For external-facing outreach specifically, the canonical voice (Alex Lundberg's: opener skeleton, sign-off, verbatim quirks, hard rules) lives in `shared-references/rockcap-outreach-voice.md` and sits on top of these firm-wide rules.

1. **UK English throughout.** Property finance terminology in the UK form. "Centre" not "center", "organisation" not "organization", "specialised" not "specialized", "behaviour" not "behavior". "Cheque" not "check" when meaning the document. Currency in GBP unless the deal is explicitly cross-border.
2. **No em dashes anywhere.** Replace with a comma, a semicolon, a parenthesis, or a short sentence. The em dash is a tell; it makes output read as machine-written. The same rule applies to long en dashes used in prose.
3. **No rule-of-three constructions.** Avoid "fast, cheap, and reliable" patterning. Avoid the "not just X, but Y" construction. Avoid promotional adjectives. State facts, not aspirations.
4. **Concise and factual.** No flowery openings. No restating the prompt. No "as discussed". Open with the substance. Every paragraph earns its place.
5. **Evidence-first.** Every claim is grounded in a number, a filing, a document, a stated lender behaviour. If a skill can cite a source, it does. If it cannot, it qualifies the claim ("based on the operator's notes" or "subject to confirmation").
6. **Never fabricate.** Skills do not invent email addresses, phone numbers, LinkedIn URLs, Companies House numbers, planning references, scheme statuses, GDV figures, or lender names. If a fact is unknown, the skill says so explicitly or asks.
7. **HTML hyperlinks in HubSpot notes.** Use `<a href="...">label</a>`, not markdown link syntax. HubSpot renders markdown unevenly; HTML renders consistently.
8. **British property and finance vocabulary.** "Bridging finance" not "bridge loan" (use "bridge loan" only when the deal is structured that specific way). "Development finance" for term construction lending. "Valuation" not "appraisal". "GDV" for gross development value, "TDC" for total development cost. "LTGDV" for loan-to-GDV.

## Output shape rules

These apply to the structure of what skills produce.

1. **Draft, do not send.** Outputs that leave the building, emails, lender submissions, client communications, public document publications, route through the Approval table. A skill creates an `approvals` row; a human approves; an internal action executes. Skills never bypass.
2. **Hold structured artefacts in Convex.** Intelligence findings go into `clientIntelligence` or `projectIntelligence` or `knowledgeItems` or `appetiteSignals`, depending on shape. Skill output that lives only in chat history is lost work.
3. **One artefact per concept.** Do not write the same finding into three tables hoping one stays current. Choose the canonical location per CONVENTIONS, write once, link from others if needed.
4. **Cite the source.** When writing intelligence or notes, set `sourceType` and `sourceRef` so the trail back to the document or meeting is preserved.
5. **Prefer queryIntelligence and loadReference first.** Before triggering a deep extraction or a reclassify, check whether the answer is already in structured intelligence. The brief's "resolution chain" is references first, then `queryIntelligence`, then ordinary tools, then `reclassify` only if those cannot answer.

## File structure

Every skill lives at `skills/skills/{skill-name}/` with this shape:

```
skill-name/
├── SKILL.md             The orchestration file Claude reads
├── references/          Detailed knowledge the skill loads on demand
│   └── README.md        Index of available references
└── corpora/             Optional: anonymised exemplars (good and bad)
    └── README.md        Index of corpora
```

`SKILL.md` is the short, scannable orchestration document. It describes triggers, inputs, the high-level workflow, and which references to load when. Detail lives in `references/`. The skill loader pulls SKILL.md first; references are loaded by name when the workflow says so.

## Tool invocation

Skills call tools through the MCP server (BL-5.1). The MCP server exposes Convex queries and mutations under domain-namespaced tool names: `deal.*`, `person.*`, `lender.*`, `document.*`, `approval.*`. Skills do not call HTTP routes directly; they do not import app code.

When a skill needs information, it calls a read tool. When it needs to make a change that affects users or the outside world, it routes through approval. When it needs to compose multiple steps, it uses primitives like `deal.get_full_context` (one tool call, full deal payload) rather than ten round trips.

## Error handling

1. **Stop on missing input.** If a required input is absent, ask. Do not guess.
2. **Fail loudly on tool errors.** If a tool returns an error, surface it. Do not silently fall back to an inferior path unless the SKILL.md explicitly defines that fallback.
3. **No partial sends.** If a draft cannot be completed (missing context, conflicting intelligence, etc.), do not stage a half-finished approval. Surface the gap and stop.

## What skills do not do

1. Skills do not own state. They reason and orchestrate; they do not maintain in-memory data across calls. Convex is the memory.
2. Skills do not talk to external services directly. Gmail, HubSpot, Companies House, Fireflies are reached through the app's tools, never via a direct API call inside the skill.
3. Skills do not write to settings tables, config tables, or anything that controls the kill switches. Those are operator surfaces.
4. Skills do not iterate to convergence on creative output without human review. Two drafts maximum before an approval is staged; the human edits from there.
