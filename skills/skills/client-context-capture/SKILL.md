# client-context-capture

Turns an operator's freeform primary knowledge about a client or deal into durable, structured, citable intelligence. This is how the things that happen **off the page** — a meeting, a phone call, personal history with the principals, a read on who really makes decisions — get into the system instead of evaporating at the end of a chat.

**Why this exists (2026-05-31):** client intelligence is otherwise built only from uploaded documents and online research. The operator's own first-hand knowledge had no way in, and the agent reasoned without it. This skill is the operator-input lane. See `../prospect-pipeline-gates.md` for the prospect flow and `docs/superpowers/specs/2026-05-31-client-context-capture-design.md` for the design.

**Provenance, not approval.** Operator-stated knowledge is primary truth flowing *into* the system, so unlike outward-facing actions it writes directly — there is no approval gate. Every write is dated and attributed to the operator so the agent can later cite "you told me on {date}" and weight primary input appropriately.

## Trigger

Operator-invoked. Common forms:

- "I met with {client}, here's a load of context: …"
- "Add context to {client/deal}: …"
- "Log this about {deal}: …"
- "Remember this about {client}: …"
- "Quick note on {client} — …" (may route to a note rather than intelligence; see step 4)

## Inputs

- `clientId` and/or `projectId` — the target. If only a name is given, resolve it via `client.list` / `project.list` first; if ambiguous, ask.
- The freeform `context` text — whatever the operator dumps. Any length, any structure.

## Dedup

- **dedupKey**: `clientId` (or `projectId`).
- **dedupWindowDays**: 0 — captures are append-only by design; the same client can be captured many times a day. Do NOT block on a recent run.
- The running md is a *log*, not a deduped set. If the new input clearly restates an existing recent block, note that in the new block ("reiterates {date}") rather than skipping the capture.

## High-level workflow

1. **Start the run.** `skillRun.start({ skillName: "client-context-capture", input: { clientId/projectId } })`. Use the returned `runId`.

2. **Confirm scope (REQUIRED — do not skip).** Decide whether the input is **client-level**, **deal/project-level**, or **spans both**, and **confirm with the operator before writing when it is ambiguous.** Some knowledge is client-wide (who the principals are, their reputation, their banking relationships); some is deal-only (this scheme's exit plan, this deal's pricing expectation); some spans both. A wrong placement pollutes the wrong reference and is hard to unpick. Rules:
   - The operator named a **deal** → default to `projectId`, but lift genuinely client-wide facts to the client.
   - The operator named only a **client** but the content is clearly about one live deal → surface that and ask which to file it under.
   - Mixed dump → split it: client-wide facts to the client, deal-specific facts to the deal. Confirm the split if non-obvious.
   - When in doubt, ask. Never guess silently.

3. **Decompose into up to three destinations** (each only when warranted):
   - **3a. Structured facts → `intelligence.addKnowledgeItem`** (`sourceType: "manual"`). For each discrete, supersedable assertion (a corrected decision-maker, a stated GDV, a refinance date, a confirmed equity figure): one knowledge item with `fieldPath`, `label`, `value`, `valueType`, `sourceText` = the operator's own words **verbatim**, `context` = "operator capture {date}", `addedBy` = the operator. Target `clientId` or `projectId` per step 2. Assertions only — never a hunch (see 3c).
   - **3b. Profile patch → `clientIntelligence` / `projectIntelligence`** (via the existing update mutations) ONLY where the fact is unambiguously structural — a new key person, a corrected primary contact. Conservative: if unsure, leave it as prose in the md (3c), do not force a profile field.
   - **3c. Running md append → `intelligence.appendContext` (ALWAYS).** This is the primary deliverable and is written on every run. Compose one dated block per the format below and append it (the tool prepends, newest-first). Everything the operator said lands here as prose, including anything too soft to structure. Hunches are allowed but **marked `(unconfirmed)`**.

4. **Note vs intel fork.** If the input is genuinely a *note* — a to-do ("chase their solicitor for the SPA"), a reminder, a "draft X" prompt — rather than knowledge about the entity, route it to `note.create` (markdown) instead of, or in addition to, the intelligence destinations. Notes and intelligence are separate lanes; say which you used. Read existing notes first with `note.listByClient` / `note.listByProject` if you might be duplicating.

5. **Report back.** A tight summary: scope chosen (client / deal / both), what landed where (N facts, which profile fields touched, md appended yes/no, any note created), and call out anything you left as prose because it was too soft to structure. Then `skillRun.complete` with `status`, a one-line `brief`, `linkedClientId`/`linkedProjectId`, and any gaps.

## Running-md block format

Reverse-chronological (the tool prepends). One block per capture, fixed header so it renders + parses consistently:

```
## 2026-05-31 — operator capture ({operator})
**Source:** {in-person meeting | call | personal knowledge | hunch}
- {fact / observation}
- {fact / observation} (unconfirmed)
{free prose where bullets don't fit}
```

- The header line is `## {YYYY-MM-DD} — operator capture ({name})`.
- The `**Source:**` line says where it came from in a few words.
- Mark anything the operator is guessing at `(unconfirmed)`.

## Outputs

- `clientIntelligence.contextMarkdown` (or `projectIntelligence.contextMarkdown`) — the dated block, always.
- Zero or more `knowledgeItems` with `sourceType: "manual"` and verbatim `sourceText`.
- Conservative profile patches where clearly structural.
- Optionally a `note` (separate lane) when the input is a note, not intelligence.

What it does not do:

- Does not send anything or take any outward-facing action — it only writes inward intelligence/notes.
- Does not write the activity feed (`activities`) or the legacy `recentUpdates` field.
- Does not promote hunches to structured facts.
- Does not require or pass through an approval gate (operator input is primary truth).

## Style rules

All rules from `../../CONVENTIONS.md` apply. The ones that matter most here:

- **Verbatim provenance.** A structured fact's `sourceText` is the operator's own words, unparaphrased — that is the citation.
- **No fabrication / no inference creep.** Capture what the operator said. Mark guesses `(unconfirmed)`; never upgrade a guess to an asserted `knowledgeItem`.
- **Conservative structuring.** When unsure whether something is a clean structured fact or just colour, leave it as md prose. The md is lossless; the structured layer should stay clean.
- **UK English, ISO dates in evidence, GBP.**

## Tool dependencies

- `client.list` / `project.list` / `client.get` / `project.get` — resolve + read the target.
- `prospect.getDeepContext` / `client.getDeepContext` / `project.getDeepContext` — read existing context before adding (avoid restating).
- `intelligence.appendContext` — the running md append (the primary write).
- `intelligence.addKnowledgeItem` — structured manual facts.
- `note.create` / `note.update` / `note.listByClient` / `note.listByProject` — the note lane.
- `skillRun.start` / `skillRun.complete` — run bookkeeping.

Profile patches use the existing `intelligence.updateClientIntelligence` / `updateProjectIntelligence` mutations where exposed; otherwise leave the fact in the md.

## What goes wrong

1. **Ambiguous client-vs-deal.** The skill asks before writing (step 2). Never silent placement.
2. **Operator states a hunch.** Captured in the md marked `(unconfirmed)`; NOT promoted to a `knowledgeItem`.
3. **Contradicts a document-sourced fact.** The manual item supersedes by the same `(target, fieldPath, qualifier)` tuple (operator-stated is primary); the prior is retained as `superseded`, and the md block notes the conflict so the operator can see both.
4. **Input is really a note, not intel.** Route to `note.create`; say so.
5. **No intelligence row yet (brand-new client/deal).** `intelligence.appendContext` creates the row on first capture — never fails on absence.
6. **Huge unstructured dump.** Structure the clean assertions, put the rest in the md as prose, and surface in the report what you left unstructured so the operator can refine.

## References

This skill is light on references by design — the substrate (`addKnowledgeItem`, `appendContext`, notes) carries the structure. The one convention that matters is the running-md block format above. Voice + structuring rules live in `../../CONVENTIONS.md`.
