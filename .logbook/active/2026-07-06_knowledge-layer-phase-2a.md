# Knowledge Layer Phase 2a/2b — atoms, graph, retrieval, drawer

Created: 2026-07-06
Status: active
Tags: #knowledge-layer #graphrag #atoms #spec-2
Source: docs/spec-2-knowledge-layer.md (DESIGN LOCKED + amendments §14b)
Priority: high

## Plan

Spec IS the plan. Branch: work on `main` per drive-build precedent (Convex dev IS prod; additive only). Orchestration: briefed model-tiered subagents, phase commits, orchestrator deploys.

- [x] 2a.1 Foundation (commit 8d14fe6, deployed): 5 tables + vocabulary (+4 predicates 2nd commit) + gates + supersession engine
- [ ] 2a.2 Retrieval: voyage-finance-2 embeddings (VOYAGE_API_KEY pending operator) + hybrid RRF atoms.search (text lane ships in 2a.4)
- [x] 2a.3 Two-lane atomization (commit 4bf2c21, deployed): atoms.* MCP tools + atomize-document skill + API sweep w/ knowledge-enabled cost wall
- [x] 2a.4 Graph read layer (commit aa8eb53, DEPLOYED + smoke-tested live: expandEntity on facility returns PGs/security/lender/borrower): federated native+atom edges w/ atom-wins dedupe, fan-out ranking, findPaths ScanCache, getDeepContext graph section, 4 MCP tools + cookbook
- [ ] 2a.5 knowledgeItems Phase-A write-through shims (§12)
- [x] 2b.1 Facilities minting — shipped inside 2a.1
- [x] Prospect-side integration (commit 715139e, deployed 2026-07-07): derived visibility asymmetry (spec 6a — includeProspectScoped filter, pre-dedupe, live status read = free promotion graduation), drawer "Prospect intel (N)" toggle, prospect-profile graph button, prospect-intel step 10c (atomize + sharedNeighbors → Graph connections section), outreach-draft provenance gate (spec 6b)
- [x] Drawer inter-ring edges + scale-aware layout (commit 89bf27c): interEdges in expandEntity, cluster springs, auto-fit, label declutter
- [x] 2b.2 Knowledge Graph drawer (commit 61b604e, pushed → Vercel): explorer w/ pivot + breadcrumbs + cross-client badge, force canvas from locked prototype, atom rail, detail card Explore→; nav = graph button in doc-library client rail + client profile header
- [x] First corpus: MMH harness-lane run COMPLETE (skillRun zh78edd1xj5bpp7erhehnkyq5d8a06qs, 21 min, 3 parallel agents + orchestrator patch): 45 atoms, 9 corroborated, 7 contested, 9 superseded (authority-tier + recency working live), 1 facility minted (Quantum→SPV £3.505M) + 2 PGs, 4 entities onboarded, 8/12 marketing docs zero-atom (gates held), 6 gaps logged on the run (CH-id resolution tool, advisor entities, Cedar Brook 01318830 sync, planning-ref identity nuance, 8 vocab suggestions, chunking seam)

## Progress

- 2026-07-06 — Spec locked + amended (da4e1ea, 428fdd9 explorer); drawer UI concept locked via artifact iteration; 2a.1 launched.
- 2026-07-06 eve — 2a.1 + 2a.3 built/deployed; first harness run complete (above); 2a.4 (graph read tools) building; 2b.2 (drawer + nav from doc-library client header) queued next; operator away — autonomous sequential build+deploy authorized.
