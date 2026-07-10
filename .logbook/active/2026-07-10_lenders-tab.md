# Lenders tab — dedicated lender surface in the nav

**Started:** 2026-07-10
**Origin:** Continuation of the lost lender-side chat (session 78dd0106). The backend
fortification (PR #82 lender dedup/upsert, facility lifecycle; PR #83 Atlas focus)
shipped; this builds the UI surface that was planned but never started.

## Goal
Docs-style master-detail page at `/lenders`: virtualized lender sidebar + profile
canvas per lender — stated appetite (appetiteSignals), observed behaviour
(facilities book, computed avg deal size), linked projects, contacts, Companies
House group charges, and one-click knowledge graph (drawer with selectEntryOnMount).

## Plan
- [x] Research: nav, docs layout precedent, lender data model, layouts kit
- [x] Convex: public `knowledge/facilities.listByLender` query (by_lender index)
      with project/borrower name enrichment + observed stats (avg deal size on
      executed basis, fallback all-priced)
- [x] Nav: add `/lenders` item (Landmark icon) to Sidebar.tsx
- [x] UI: `src/app/(desktop)/lenders/` — page.tsx + LendersSidebar + LenderProfile
- [x] `npx next build` from model-testing-app — clean; vitest convex/knowledge 118/118
- [x] Branch `lenders-tab`, PR #87: https://github.com/youcodecowboy/rockcap-v2/pull/87

## Remaining
- [ ] Merge PR #87 + Convex deploy (new query must ship with frontend)
- [ ] Live click-through on a wave-ingested lender (e.g. Allica) post-deploy

## Notes
- Lenders are `clients` rows with `type === "lender"` — no new table.
- Primary profile query already exists: `appetiteSignals.lenderGetDeepContext`.
- Lender identity color: `colors.entityTypes.lender` (#14b8a6 teal).
- KnowledgeGraphDrawer is fixed-overlay only; mount at page level (docs pattern).
