# Spec 2 — Knowledge Layer (GraphRAG)

**Status:** DESIGN LOCKED 2026-07-06 (three-agent design session + orchestrator reconciliation). Builds *after* Spec 1.
**Owner:** RockCap
**Depends on:** [Spec 1 — Drive Ingestion Backbone](./spec-1-drive-ingestion-backbone.md) (hard prerequisite: the `ingestionEvents` feed), existing entity model, existing MCP tools, v4 extraction pipeline
**Supersedes:** the earlier draft of this document (2026-06). The problem statement stands; the architecture below replaces the draft's open questions with decisions.
**Guiding research:** `docs/cloud-storage-sync-investigation.md`

---

## 1. Purpose

RockCap runs on a layer of MCP tools driven by Claude Code over a central system of record. The quality of those tools is bounded by how well they can *find and reason over* accumulated information about companies, deals, lenders, and people.

This build turns the corpus into a queryable knowledge layer so the MCP tools can:
- retrieve **atomic facts with source provenance** instead of re-reading whole documents,
- answer **multi-hop / cross-client** questions ("which of our clients have exposure to lender X?" — the operator's canonical query),
- and **reduce hallucination** by grounding answers in a connected, provenance-stamped graph.

The graph is **people- and lender-orientated**: most clients have no connections to each other, and when they do it is through the people and lenders attached to them. Capturing those connections — and *never* capturing trivia like "both clients are UK-based" — is the design's central obligation.

---

## 2. Governing principles

### 2.1 Federation: two edge sources of equal rank

1. **Native edges** — relations already encoded in structural tables: `projects.clientRoles` (borrower/lender/developer on a deal), `contacts` (+ `linkedCompanyIds`, `by_email`), `companiesHouseOfficers` / `companiesHousePSC`, `clients.relatedCompaniesHouseNumbers` (group SPVs), `appetiteSignals`.
2. **Atom edges** — facts extracted from documents, Companies House sweeps, Apollo, or operators that have **no structural home** (a guarantee in a facility letter, a person who advises two clients, a charge linking a lender to a prospect's SPV).

**Rule: a fact that fits a structural field goes in the structural field; atoms never duplicate native edges; the graph query layer federates both at read time.**

### 2.2 Derived connections are traversed, never stored

"Co-lends with" is two `funds_project` edges meeting at a project node. "Shares a director" is a 2-hop walk through CH officer rows. Storing derived edges is how graphs bloat and drift; computing them at query time at RockCap's scale is a few indexed queries.

### 2.3 Layering: tables act, atoms know, hubs bridge

- **Operational tables** (`clients`, `projects`, `contacts`, `companiesHouse*`): canonical for *who exists* and *what the app acts on*. Atoms never subsume them. The knowledge layer writes back into them only through existing idempotent mutations (e.g. a high-confidence lender fact fires `projects.addLenderRole`); anything non-idempotent stages an `approvals` row.
- **Derived hub entities** (`facilities`): minted deterministically *from atoms* when n-ary fact clusters need a node. Rebuildable from atoms at any time.
- **Atoms**: every extracted fact, with provenance and lifecycle. The only layer the atomizer writes directly.

One-line test: *if the app acts on it, it's a table; if the app knows it, it's an atom; if atoms cluster around a missing noun, it's a derived hub.*

### 2.4 Noise is made unrepresentable

Predicates validate against a **versioned code-module vocabulary** (not a schema union — the vocabulary must grow without Convex schema pushes, and dev IS prod). There is no `located_in_country` predicate, so a UK-ness edge *cannot exist*. Additions are deliberate one-line PRs, the same discipline as the MCP catalogue.

### 2.5 The agent is the query planner

No retrieval router. The consumer is Claude Code holding MCP tools; multi-hop reasoning happens as a sequence of tool calls with reasoning between hops, pruning branches as it goes. The graph's job is to be a well-indexed, provenance-rich substrate with three or four sharp traversal tools (§9).

### 2.6 Provenance is non-negotiable

Every atom links to every source that asserted it, down to page / sheet+row. This is the trust and audit story in regulated finance, and what makes the graph safe to feed an LLM.

---

## 3. Data model

Five new tables. All additive; `knowledgeItems` retires via a three-phase shim (§12), never a big bang.

### 3.1 `atoms` — canonical facts

**One row per fact identity** `(subjectType, subjectId, predicate, qualifier, object-kind)`. Five documents restating the same GDV converge on ONE atom (with five observations, §3.2) — near-duplicate rows would dilute vector search and multiply maintenance.

```ts
atoms: defineTable({
  // ── Fact ──
  statement: v.string(),               // one self-contained sentence; the embedded + searched text
  subjectType: v.union(v.literal("client"), v.literal("project"), v.literal("contact"),
                       v.literal("company"), v.literal("facility"), v.literal("candidate")),
  subjectId: v.string(),               // stringified Convex id
  predicate: v.string(),               // validated in code against the vocabulary module (§5)
  objectEntityType: v.optional(v.union(/* same literals as subjectType */)),
  objectEntityId: v.optional(v.string()),        // set ⇒ EDGE
  objectLiteral: v.optional(v.object({           // set ⇒ ATTRIBUTE (exactly one of the two)
    value: v.any(),                              // canonicalized (ISO dates, raw numbers)
    valueType: v.union(v.literal("currency"), v.literal("number"), v.literal("percentage"),
                       v.literal("date"), v.literal("string"), v.literal("range")),
    currency: v.optional(v.string()),
    unit: v.optional(v.string()),
  })),
  qualifier: v.optional(v.string()),   // multi-instance disambiguation ("Senior" vs "Mezzanine"); part of identity
  // ── Scope (denormalized for filtered retrieval) ──
  clientId: v.optional(v.id("clients")),         // owning scope; null = company-wide
  projectId: v.optional(v.id("projects")),
  // ── Time & lifecycle ──
  asOf: v.optional(v.string()),        // when true in the world (from doc content/date)
  observedAt: v.string(),              // latest observation time
  status: v.union(v.literal("active"), v.literal("contested"),
                  v.literal("superseded"), v.literal("retired")),
  supersededBy: v.optional(v.id("atoms")),
  supersessionReason: v.optional(v.union(v.literal("revised"), v.literal("removed_from_source"),
    v.literal("document_trashed"), v.literal("operator"))),
  confidence: v.number(),              // corroboration-adjusted (§7)
  salience: v.optional(v.number()),    // IDF-informed ranking weight (§6.2)
  primarySourceType: v.string(),       // most-authoritative observation's sourceType (display convenience)
  embedding: v.array(v.float64()),     // 1024-dim (§13)
})
  .index("by_subject", ["subjectType", "subjectId", "status"])
  .index("by_object", ["objectEntityType", "objectEntityId", "status"])
  .index("by_client_status", ["clientId", "status"])
  .index("by_predicate", ["predicate", "status"])
  .searchIndex("search_statement", { searchField: "statement",
    filterFields: ["clientId", "subjectType", "status"] })
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1024,
    filterFields: ["clientId", "subjectType", "status"] })
```

Entity-neighborhood expansion = one query on `by_subject` + one on `by_object` — outbound and inbound edges, each carrying a readable sentence.

### 3.2 `atomObservations` — per-source provenance

A **separate indexed table**, not an array on the atom: Convex can't index into arrays, and re-extraction needs a `by_document` lookup (design reconciliation: this merges "atom-per-document provenance" with "canonical atoms" — complete provenance, clean graph).

```ts
atomObservations: defineTable({
  atomId: v.id("atoms"),
  sourceType: v.union(v.literal("document"), v.literal("companies_house"), v.literal("apollo"),
                      v.literal("operator"), v.literal("skill"), v.literal("migration")),
  documentId: v.optional(v.id("documents")),
  contentChecksum: v.optional(v.string()),       // WHICH revision asserted this
  locator: v.optional(v.object({ page: v.optional(v.number()), sheet: v.optional(v.string()),
    row: v.optional(v.number()), cellRange: v.optional(v.string()), section: v.optional(v.string()) })),
  sourceText: v.optional(v.string()),            // verbatim snippet — the reliable audit anchor
  externalRef: v.optional(v.string()),           // CH charge/filing ID, Apollo ID, skillRunId, userId
  extractedValue: v.optional(v.any()),           // what THIS source said (may differ from canonical)
  observedAt: v.string(),
  authorityTier: v.number(),                     // §7 document-type authority
  superseded: v.optional(v.boolean()),           // same-lineage replacement marker
})
  .index("by_atom", ["atomId"])
  .index("by_document", ["documentId"])
```

**v1 locator caveat:** v4's parsed xlsx `textContent` is `Row N: cell | cell` lines — column letters/cell addresses don't survive, so spreadsheet locators are `{sheet, row}` until the deep-extraction pipeline lands, then upgrade to cell ranges. `sourceText` is the dependable anchor either way.

### 3.3 `facilities` — the n-ary hub, minted day one

A loan facility (lender × borrower × project × tranche × terms) is the single most connection-bearing object in the domain — the node behind "lender X across N clients" and "two lenders on one project". `projects.clientRoles` is too thin (role string only); qualifier-grouping alone would leave the hottest queries string-matching.

```ts
facilities: defineTable({
  projectId: v.id("projects"),
  lenderClientId: v.optional(v.id("clients")),    // clients row, type="lender"; optional (external lender)
  lenderCompanyId: v.optional(v.id("companies")), // CH company when known
  borrowerClientId: v.optional(v.id("clients")),
  tranche: v.optional(v.string()),                // "senior" | "mezzanine" | "bridge" | "equity"
  // Materialized terms — mirrors of winning atoms, rebuildable at any time
  amountGBP: v.optional(v.number()),
  interestRate: v.optional(v.number()),
  maturityDate: v.optional(v.string()),
  securitySummary: v.optional(v.string()),
  status: v.optional(v.string()),                 // "indicative" | "live" | "repaid" | "defaulted"
  dedupeKey: v.string(),                          // `${projectId}:${lenderKey}:${tranche ?? "single"}`
  createdFrom: v.union(v.literal("atomizer"), v.literal("operator"), v.literal("migration")),
  lastRebuiltAt: v.string(),
})
  .index("by_project", ["projectId"])
  .index("by_lender", ["lenderClientId"])
  .index("by_lender_company", ["lenderCompanyId"])
  .index("by_dedupe", ["dedupeKey"])
```

**Minting is deterministic, no LLM judgment:** when facility-shaped predicates arrive (`lends_to`, `has_loan_amount`, `has_interest_rate`, `matures_on`, `secured_by`), the pipeline upserts by `dedupeKey` and re-materializes columns from active atoms. Facility creation with an onboarded lender also fires the already-idempotent `projects.addLenderRole` (native edge write-back). `clientRoles` remains what the UI/skills read for "who's on this deal"; `facilities` is what the graph traverses for terms and cross-client lender queries.

### 3.4 `documentChunks` — the narrative dual index

Atoms win on fact-dense, tabular, rare-entity content (appraisals, facility letters). Narrative documents (legal opinions, reports) lose meaning when shredded into sentences — for those, chunk retrieval wins. Both, in one vector space, RRF-merged.

```ts
documentChunks: defineTable({
  documentId: v.id("documents"),
  contentChecksum: v.string(),          // chunks are disposable derivatives of ONE revision
  chunkIndex: v.number(),
  text: v.string(),
  tokenCount: v.optional(v.number()),
  locator: v.optional(v.object({ page: v.optional(v.number()), sheet: v.optional(v.string()),
    section: v.optional(v.string()) })),
  clientId: v.optional(v.id("clients")),
  projectId: v.optional(v.id("projects")),
  embedding: v.array(v.float64()),
})
  .index("by_document", ["documentId"])
  .searchIndex("search_text", { searchField: "text", filterFields: ["clientId"] })
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1024,
    filterFields: ["clientId"] })
```

On re-extraction: delete the document's chunks and recreate (unlike atoms, chunks carry no identity worth preserving).

### 3.5 `entityCandidates` — provisional entities

```ts
entityCandidates: defineTable({
  mentionText: v.string(),
  normalizedName: v.string(),
  guessedType: v.union(v.literal("person"), v.literal("company")),
  contextSnippet: v.optional(v.string()),
  sourceDocumentId: v.optional(v.id("documents")),
  status: v.union(v.literal("pending"), v.literal("resolved"), v.literal("dismissed")),
  resolvedToType: v.optional(v.string()),
  resolvedToId: v.optional(v.string()),
  enrichmentAttempts: v.number(),
})
  .index("by_normalized_name", ["normalizedName"])
  .index("by_status", ["status"])
```

Lifecycle: (1) atoms MAY reference a candidate — the fact is never dropped, and candidate-mediated connections surface flagged as unconfirmed; (2) an enrichment worker processes pending candidates — people → Apollo → `contacts` row (per standing operator feedback: every key person surfaced gets a contact row), companies → CH search → `companiesHouseCompanies` link; (3) on resolution, all referencing atoms are re-pointed in one mutation; the candidate keeps `resolvedTo` as a tombstone so re-extraction resolves instantly; (4) the same normalized mention across documents reuses one candidate — "this unknown person keeps appearing" is itself a surfaced signal.

---

## 4. Entity resolution

**Canonical keys, in precedence order:**

| Entity | Key 1 | Key 2 | Key 3 |
|---|---|---|---|
| Company (client, lender, SPV) | Companies House number | HubSpot company ID | normalized legal name |
| Person | email (`contacts.by_email`) | LinkedIn URL / Apollo ID | name + company context |
| Project/scheme | Convex `projects` ID via shortcode | scheme aliases | address |

**Roster injection at atomization time.** The atomizer prompt receives a roster and must resolve every mention to a roster ID or emit it as unresolved (→ candidate). Assembled per run:
- *Client-scoped:* the client row (+ group SPV numbers/names via `relatedCompaniesHouseNumbers`), its projects (+ shortcodes + scheme aliases), its contacts (names, emails, roles).
- *Global:* **all lenders** — lenders are already global `clients` rows (`type="lender"`), a small high-value list. This makes cross-client lender resolution automatic: both clients' documents resolve "Hampshire Trust" to the same row. **No ER machinery needed for the most important entity class.** Plus `companiesHouseCompanies` rows fuzzy-matching detected entities.

Companies resolve by CH number when the document states one (facility letters and charges usually do), else name-match, else provisional.

---

## 5. Relational predicate vocabulary

Direction convention: **subject —predicate→ object**, active voice. ~18 at launch; additions are one-line vocabulary-module PRs. `N` = native (structural — listed so the traversal layer federates them, never stored as atoms); `A` = atom-stored.

**Financing (the lender-centric core):**

| Predicate | Direction | Typical source | Store |
|---|---|---|---|
| `funds_project` | lender → project | `clientRoles`; docs add tranche qualifier | N + A(qualifier) |
| `lends_to` | lender → company | facility letters, loan terms | A |
| `holds_charge_over` | chargeholder → company | CH charges (on materialization, §8) | A |
| `guarantees` | person/company → facility | facility letters, PGs, KYC | A |
| `granted_security_over` | company → asset/scheme | debentures, legal charges | A |
| `refinanced_by` | project/facility → lender | docs, operator | A |
| `has_appetite_for` | lender → deal-shape | `appetiteSignals` | N |

**People (the connective tissue):**

| Predicate | Direction | Typical source | Store |
|---|---|---|---|
| `officer_of` | person → company | CH officer appointments | N |
| `psc_of` | person → company | CH PSC register | N |
| `works_at` | person → company (role qualifier) | Apollo, docs, HubSpot | N |
| `advises` | person/firm → client/project (capacity: solicitor, QS, agent, broker) | professional reports, legal docs | A |
| `introduced` | person → client/deal | operator notes | A |
| `formerly_at` | person → company | Apollo history, docs | A |

**Corporate structure:** `parent_of` (company → company; CH group walk; A), `spv_of_group` (company → client group; `relatedCompaniesHouseNumbers`; N), `renamed_from` (company → prior name; CH; A).

**Property/deal context:** `developing` (client → scheme; `clientRoles`; N), `owns_site` (company → scheme/address; title docs; A), `acquired_site_from` (company → company; legal docs; A).

**Attribute predicates** (objectLiteral side — `has_gdv`, `has_loan_amount`, `has_interest_rate`, `matures_on`, `has_registration_number`, `has_registered_office`, `planning_status`, …) live in the same vocabulary module with the same review bar.

**Explicitly excluded:** symmetric/derivable predicates (`co_lends_with`, `shares_director_with`, `competitor_of` — all 2-hop traversals) and geographic/categorical trivia (`based_in_uk`). The vocabulary review question for any proposal: *is it selective (shared by 2–5 entities, not all), and does sharing it imply a real-world mechanism?* Same registered office passes (implies group/formation agent); UK-ness fails.

---

## 6. Signal quality — the policy layer

### 6.1 Extraction gates (all three required)

1. **Anchored** — every atom attaches to a roster entity or a *promotable* mention (person with full name + role/employer; company with CH number or registered address). Machine-checked at persistence: no `subjectId` and no candidate payload ⇒ rejected. "The market remains challenging" is knowledge about nothing.
2. **Discriminating — the peer test** — would this statement distinguish the entity from a typical peer *in RockCap's world* (UK property finance)? "UK-based developer", "requires planning permission" fail; "develops later-living retirement schemes exclusively" passes.
3. **Material** — amounts/valuations, terms (rate, LTV, covenants), parties and roles, dates/milestones, obligations and conditions, security and charges, ownership and control, status changes, stated appetite. Standard boilerplate excluded — *unless it deviates from standard*, which is exactly the signal.

**Atomizer instruction block (goes in the prompt after the roster):**

> Extract atomic facts from this document. An atomic fact is ONE self-contained sentence that would remain true and meaningful if read with no surrounding context, attached to ONE subject entity from the roster above (or a new person/company you can identify precisely).
>
> EXTRACT a fact only if ALL three hold:
> 1. **Anchored** — it is about a specific rostered or precisely-identifiable entity. Never about "the market," "the borrower generally," or an unnamed party.
> 2. **Discriminating** — it would help distinguish this entity from a typical UK property-finance peer. If the statement would be true of most developers, most lenders, or most schemes, do not extract it.
> 3. **Material** — it is an amount, term, party/role, date/milestone, obligation, security interest, ownership/control fact, status change, or stated appetite/preference.
>
> EXTRACT (examples):
> - "Hampshire Trust Bank provides a £3.2M senior facility to Bayfield Homes (Wellington) Ltd at SONIA + 4.25%, maturing 2027-09-30." *(facility letter)*
> - "The Wellington Road scheme has a GDV of £4.2M across 6 units." *(appraisal)*
> - "James Carter is a director of both Bayfield Homes Ltd and Marlow Property Group Ltd." *(KYC — cross-entity control fact)*
> - "Planning consent 23/01847/FUL for 6 dwellings was granted by Test Valley BC on 2026-03-14 subject to a s106 contribution of £48,000." *(planning)*
> - "Bayfield Homes (Wellington) Ltd granted a debenture and first legal charge over the Wellington Road site to Hampshire Trust Bank on 2026-04-02." *(security)*
> - "The facility includes a personal guarantee from James Carter capped at £500,000." *(obligation)*
>
> DO NOT EXTRACT (examples):
> - "Bayfield Homes is a UK-based property developer." *(true of nearly every client — fails discrimination)*
> - "The property market has experienced volatility in recent months." *(unanchored commentary)*
> - "The valuation was prepared in accordance with RICS Red Book standards." *(boilerplate)*
> - "The borrower must comply with all applicable laws." *(standard clause, no deviation)*
> - "The scheme is subject to obtaining planning permission." *(generic; extract only the specific application, decision, or condition)*
> - "The directors are experienced in residential development." *(marketing prose)*
>
> When a number appears in multiple places with different values, extract each with its exact source location — do not reconcile them yourself.

### 6.2 Connective value — how shared attributes earn edge status

Layered mechanism:
- **Vocabulary-side (primary):** most noise is unrepresentable (§2.4, §5).
- **Traversal-not-storage:** connections emerge where direct edges meet at nodes; only attributes that survived the gates are available to join on, and UK-ness never got in. Same-registered-office connections surface at query time as a join on the attribute value.
- **IDF guard at ranking:** maintain cheap frequency stats per (predicate, objectEntityId); a lender with edges to 40 of 46 clients contributes less ranking weight per edge than one with 2. Downweight, never delete — the aggregate ("this lender is everywhere") is itself portfolio signal, and this self-corrects future vocabulary mistakes.

---

## 7. Dedup, corroboration, contradiction, supersession

**One canonical atom per identity; every source occurrence is an observation.**

**Same-lineage supersession** (document D re-extracted at new checksum): load observations `by_document` D → group by atom → diff candidate facts by identity key:
- key matches, canonical-compare value equal → keep atom, append/refresh observation. Identity preserved, no churn.
- key matches, value differs → new observations supersede D's old ones; canonical value re-resolved (below); prior atom state preserved via `supersededBy` when the winner changes.
- key present before, absent now → D's observations marked superseded; if no other live observations remain, atom → `superseded / removed_from_source`. History survives.

**Cross-document value resolution** (design reconciliation — layered):
1. If `asOf` differs materially → newest `asOf` wins: a temporal update (a newer valuation), not a contradiction.
2. Comparable/absent `asOf` → **document-type authority tier**: executed legal documents > facility letters/term sheets > valuations/appraisals > internal briefs > emails; recency breaks ties within a tier; then confidence.
3. Tolerance exceeded between contemporaneous live sources → `status: "contested"`; retrieval **returns the contest**: "£4.0M per facility letter dated X (appraisal dated Y states £4.2M)." Trustworthier than silently picking one. Contests are internal data quality — no approvals row; they surface on the health panel.

**Corroboration:** independent live observations raise confidence, bounded (`min(0.98, base + 0.05·(n−1))`). (Known v1 simplification: a brief generated from an appraisal is not independent of it; ignored for now.)

**Document trashed** (Drive trash or soft-delete): its observations are superseded; atoms with no remaining live observations → `superseded / document_trashed`. **Atoms are never hard-deleted** — provenance is the audit story.

---

## 8. Non-document producers & the Companies House bright line

All producers write the same atoms table via observations, discriminated by `sourceType` (document / companies_house / apollo / operator / skill / migration) with source-appropriate `externalRef` provenance.

**The 3.5M-charge question — hybrid with a bright line:**
- **Query live, don't mirror:** exhaustive sweeps ("every charge lender X holds in the UK") hit the charges-service via existing `sourcing.*` tools at retrieval time. Mass CH data would drown the graph and duplicate a self-updating store.
- **Materialize on relevance:** when an external fact connects **two entities the graph already tracks** (a known lender's charge over a known client's group SPV; an officer shared between a client and a prospect), it is promoted to an atom with CH provenance. Triggers: prospect-intel / lender-intel runs, deal-intake, the group-mapping walk, operator confirmation of a sourcing result.

"Which of our clients does lender X lend to?" answers **instantly from the graph** (materialized edges + native `clientRoles`); "who else in the UK does lender X charge?" stays a live federated sweep. **The graph holds what's ours; the services hold the world's.**

---

## 9. MCP tool surface (agentic traversal)

Four new tools; Claude is the query planner; every result carries provenance inline.

- **`graph.expandEntity`** `{entityType, entityId, predicates?, direction?, includeAttributes?, includeCandidates?, limit?}` → `{entity, edges: [{predicate, direction, other, qualifier?, asOf?, confidence, provenance}], attributes, nativeEdges}`. Federates atom + native edges in one response (native edges synthesized on the fly from `clientRoles`, contacts, CH mirrors — never stored twice).
- **`graph.sharedNeighbors`** `{entities: [...], predicateFilter?, via?: "people"|"companies"|"lenders"|"any"}` — the "what connects these?" primitive.
- **`graph.findPaths`** — bounded path search, `maxHops ≤ 3`, ranked edge chains.
- **`atoms.search`** — hybrid: vector + full-text over `statement`, RRF-merged, filters `clientId`/`subject`/`predicate`/`status`.

**Worked example** — *"Which of our clients have exposure to Hampshire Trust Bank?"*
```
1. atoms.search({query: "Hampshire Trust Bank"})   → resolves the lender entity
2. graph.expandEntity({entityType: "client", entityId: HTB,
     predicates: ["funds_project","lends_to","holds_charge_over"], direction: "out"})
   → nativeEdges: funds_project → Comberton (clientRoles: Fireside borrower, HTB lender)
     edges: lends_to → Fireside Capital ("Senior £3.2M", Facility Letter v4 p.2, asOf 2026-03)
            holds_charge_over → Bayfield SPV Ltd (CH charge 0482 7719 3301)
3. (agent) maps projects → borrower clients — answers with three exposures, each cited.
```
Two tool calls, no router, every claim provenance-backed.

**Existing tools benefit without consumer changes:** the four `*.getDeepContext` tools append a bounded **"Graph"** section — top-K edges by salience, cross-client edges always included (rarest, highest-value). This is also where `knowledgeItems`' historic under-surfacing is finally fixed, by supersession.

**Operator hygiene tools:** `atom.correct`, `atom.retire`, `atom.mergeEntities` — direct internal writes (the approvals gate governs actions *leaving* the system, not data hygiene). Every correction appends to a corrections corpus (pattern: `skills/corpora/document-classification-corrections.md`) periodically folded into the atomizer prompt's negative examples.

---

## 10. Hygiene & instrumentation

- **`retrievalLog`** (thin): query, tool, atom IDs returned, atom IDs cited. Yields **utilization** (atoms cited / stored, rolling 90d) and **dead weight** (never-returned atoms by predicate) — the vocabulary's report card.
- **Health panel** (`/settings/knowledge`): atom counts and per-entity distribution, contested count + age, persistence-gate rejection rate, orphan count, superseded-chain depth outliers, per-predicate utilization.
- **Nightly integrity sweep** (piggybacks Spec 1's reconcile cron pattern): re-point atoms after entity merges, flag dangling refs, age out stale contests, refresh IDF stats.

---

## 11. Atomizer runtime

- **Input:** v4's `textContent` (already parsed, 50K-char cap) + v4 `category`/`fileTypeDetected` for routing + the roster (§4).
- **Model tiering:** **Sonnet-class default** — atomization is a judgment task (roster linking, the peer test, restraint about boilerplate); small models are systematically bad at restraint and would flood gate 2. **Escalate to Opus/Fable-class** for facility agreements, intercreditor deeds, corporate-structure/KYC packs (routed by v4 category). Yield: 10–40 atoms fact-dense, 0–10 narrative; **~$0.05–0.15/doc**, up to ~$1 for escalated legal docs. Steady state (Spec 1's settle window debounces to a handful of hydrations/day): a few dollars a day.
- **Scheduling:** the atomizer is a consumer of Spec 1's **`ingestionEvents`** — async after `applyExtraction`, keyed to `contentChecksum` for idempotency, inheriting the settle-window debounce for free: an all-day editing session atomizes once.

---

## 12. `knowledgeItems` retirement (three phases; dev IS prod, so no big bang)

- **Phase A (ship atoms):** tables land. `knowledgeLibrary.addKnowledgeItem` and `documents.saveDocumentIntelligence` become **write-through shims** — keep writing knowledgeItems exactly as today *and* emit an attribute atom via a `fieldPath → predicate` mapping module (unmapped fieldPaths → escape-hatch predicate `states` with `qualifier: fieldPath`). Readers untouched; atoms accumulate.
- **Phase B (switch readers):** new retrieval tools ship; `getDeepContext`/`getClientIntelligence` read atoms; the legacy knowledgeItems MCP tools become adapter views returning atom-derived rows in the legacy shape — existing skills keep working unmodified.
- **Phase C (retire):** one-time migration converts remaining rows (`sourceType: "migration"`; precedent: `convex/migrations/migrateToKnowledgeItems.ts`), shims flip to atoms-only, table frozen, dropped after a quiet month. The **Phase-3 backfill** (pre-Drive documents' v4 outputs → atoms, logged in `.logbook` 2026-07-06) runs alongside C.
- `appetiteSignals` stays a specialized native-federated lane in v1 (it is nearly atom-shaped; fold-in is a Phase C decision, not a prerequisite).

---

## 13. Embeddings & scale

- **Model: Voyage `voyage-finance-2`, 1024 dims** — finance-domain-tuned, Anthropic's recommended embeddings partner, $0.12/M tokens; new env `VOYAGE_API_KEY`. (Fallback if a second vendor is unwanted: OpenAI `text-embedding-3-small`.) Decide before Phase 2a; changing later = re-embedding the corpus (~$12, an afternoon).
- **Scale check:** 50 clients × 100–300 docs = 5k–15k docs; ~25 atoms/doc avg → **125k–375k atoms** + ~15 chunks/doc → **75k–225k chunks**. Convex vector indexes handle millions of vectors; ~6 of 32 allowed indexes used. Full-corpus embedding ≈ ~$12 one-time; atomization LLM cost dominates regardless. **No graph DB, no external vector DB, at any plausible RockCap scale.**

---

## 14. Scoping posture

Three-person firm: **no read-side ACLs** — cross-client visibility is the product, not the leak. Guardrails: (1) every atom carries scope tags (`clientId?`/`projectId?`) so future filtering is a query change, not a migration; (2) nothing leaves the system without an `approvals` row (unchanged); (3) new `skills/CONVENTIONS.md` rule: *outbound drafts may cite only same-client or public-source (CH) atoms; cross-client-derived facts inform strategy but never appear verbatim in external documents.* Enforced as a skill-layer convention, auditable via provenance.

---

## 14b. Amendments (2026-07-06, post-Spec-1 live run)

1. **Two-lane atomization (operator decision — cost control, mirrors the import wall; TIGHTENED 2026-07-07).** The `ingestionEvents` API consumer (§11) handles ONLY changes to documents already atomized once (observations under a prior checksum — a changed doc ≈ cents). First-time atomization is ALWAYS harness-lane, even for knowledge-enabled clients: automate ingestion on changes, never on first import. Mass work — initial client onboarding, backfills, the pre-Drive migration — runs through the **Claude Code harness lane**: Phase 2a must ship MCP write tools (`atoms.createBatch`, `atoms.supersede`, `atoms.linkEntity`) and an `atomize-document` skill so the harness reads `textContent` via existing tools and writes atoms via MCP at subscription cost, never API cost. Both lanes hit the same persistence gates (anchoring machine-checked server-side; the harness cannot bypass the noise rules).
2. **Lenses, not separate graphs.** "Overarching" views (lender-wide, regional lending knowledge, people-centric) are entry points + aggregations over the ONE graph — lender nodes are already global; scope tags + predicate families (financing/people/structure/property) are the segmentation. No thematic sub-graphs are ever built or synced.
3. **Hub fan-out rule.** Traversal tools return top-K edges by salience + aggregate counts ("edges to 27 clients — expand?"), never full neighborhoods — protects both UI and LLM context at scale.
4. **Prospect-connection check.** When prospect-intel creates a prospect's entities, run `graph.sharedNeighbors` against the existing graph and surface hits ("shares a director with client X") in the intel brief. Wire into the prospect-intel skill contract at Phase 2b.
5. **Operator UI (upgrades "possible later" to Phase 2b scope).** A per-client Knowledge Graph **drawer** (~80% width, own toolbar + atom side-rail + pan/zoom force canvas, click-to-expand neighborhoods), opened from the doc library / client header. Canon tokens (`src/lib/colors.ts` entityTypes). Design prototype: session artifact 2026-07-06. 2D force-directed (Obsidian-style), NOT 3D/three.js.
6a. **Prospect-scope visibility asymmetry (operator decision 2026-07-07).** "Prospect atoms" are DERIVED, never flagged: an atom is prospect-scoped iff its owning `clientId` row has `status: "prospect"`. Read-side rule: viewing a prospect → no filter (prospecting sees the whole graph, including client edges — that's where connection-hunting pays); viewing a client → prospect-scoped atoms excluded by default, revealed by an "include prospect intel" toggle in the drawer toolbar. MCP/LLM lane defaults to unfiltered (agents want everything; drafting rules gate what leaves). **Promotion is free**: `client.activate` flips the owning row's status and every atom graduates automatically — then document-tier atoms (4–5) supersede the prospect-era intel-tier atoms (1–2) as deal docs arrive, so the graph self-cleans its sourcing as the relationship deepens.
6b. **Prospect flow + provenance-gated citations (operator decision 2026-07-07).** prospect-intel atomizes gathered intel (CH/Apollo/web) via the harness lane and runs `graph.sharedNeighbors` against the existing graph; hits land in a "Graph connections" section of the intel brief. outreach-draft may use connection hits in intro lines ONLY when the cited atoms'/edges' provenance is public record (`sourceType: companies_house` or native CH edges) — client-document-derived knowledge informs strategy but is never cited to a prospect. Machine-checkable at draft time via sourceType.
6. **The drawer is an EXPLORER, not a report (operator decision 2026-07-06).** Any node can be pivoted to ("Explore this entity"): the canvas re-centers on that entity via `graph.expandEntity` and loads its FULL neighborhood — released from the client scope the operator entered through (a person's officerships across clients, a lender's whole book). A **breadcrumb stack** records the pivot path (client → person → company → …); clicking a crumb goes shallower. Cross-scope views show a **"cross-client scope" badge** (ties to the CONVENTIONS outbound-citation rule). Every pivot obeys the hub fan-out rule (top-K by salience + "N more — expand" chips). This is the same recursive expandEntity call the LLM lane uses — one backend, two consumers.

## 15. Phasing

- **Phase 2a — Atomization + baseline retrieval.** Tables, vocabulary module, atomizer (ingestionEvents consumer), `atoms.search` hybrid retrieval, knowledgeItems Phase-A shims, **`getDeepContext` Graph section** (pulled forward — cheap, fixes a known gap).
- **Phase 2b — Graph enrichment.** `facilities` minting, `graph.expandEntity` / `sharedNeighbors` / `findPaths`, entityCandidates + enrichment worker, CH materialization triggers, hygiene tools + health panel.
- **Phase 2c — Portfolio layer.** IDF stats + salience ranking, retrievalLog instrumentation, knowledgeItems Phases B–C, the pre-Drive backfill, contested-atom UX polish.

---

## 16. Success criteria

- MCP tools answer document-grounded questions **with source citations** (page / sheet+row) without ingesting whole documents.
- "Which clients have exposure to lender X?" answered in ≤3 tool calls, every edge provenance-backed, including CH-materialized charges.
- Zero atoms violating the discrimination gate in a sampled audit ("UK-based" class noise structurally impossible).
- Contested facts are *surfaced*, not silently resolved.
- Knowledge stays fresh automatically via Spec 1's feed; an all-day editing session produces exactly one re-atomization.
- `knowledgeItems` consumers keep working through every phase of its retirement.
