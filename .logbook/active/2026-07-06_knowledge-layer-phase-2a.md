# Knowledge Layer Phase 2a/2b — atoms, graph, retrieval, drawer

Created: 2026-07-06
Status: active
Tags: #knowledge-layer #graphrag #atoms #spec-2
Source: docs/spec-2-knowledge-layer.md (DESIGN LOCKED + amendments §14b)
Priority: high

## Plan

Spec IS the plan. Branch: work on `main` per drive-build precedent (Convex dev IS prod; additive only). Orchestration: briefed model-tiered subagents, phase commits, orchestrator deploys.

- [ ] 2a.1 Foundation (Fable): 5 tables (atoms/atomObservations/documentChunks/facilities/entityCandidates) + vocabulary module + persistence gates + supersession engine (§3, §5, §7)
- [ ] 2a.2 Retrieval: voyage-finance-2 embeddings (VOYAGE_API_KEY pending operator — graceful degradation: text search until key) + hybrid RRF atoms.search
- [ ] 2a.3 Two-lane atomization (§14b.1): ingestionEvents API consumer (incremental) + MCP write tools atoms.createBatch/supersede/linkEntity + atomize-document skill (harness lane for bulk — cost wall)
- [ ] 2a.4 MCP read tools: atoms.search, graph.expandEntity (federated native+atom edges), graph.sharedNeighbors, graph.findPaths + getDeepContext "Graph" section + both CATALOGUEs
- [ ] 2a.5 knowledgeItems Phase-A write-through shims (§12)
- [ ] 2b.1 Facilities minting + prospect-connection check wiring (§14b.4)
- [ ] 2b.2 Knowledge Graph drawer in-app (design locked: session artifact drawer-v0.2 — 80% left drawer, force canvas w/ render-time drift, atom rail w/ node filtering, click-to-expand ⊕, canon tokens)
- [ ] First corpus: MMH via harness lane (Claude Code atomizes the 37 Leighterton docs through MCP tools)

## Progress

- 2026-07-06 — Spec locked + amended (da4e1ea); drawer UI concept locked via artifact iteration; 2a.1 launched.
