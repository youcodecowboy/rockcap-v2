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
- [ ] Convex: public `knowledge/facilities.listByLender` query (by_lender index)
      with project/borrower name enrichment + observed stats (avg deal size on
      executed basis, fallback all-priced)
- [ ] Nav: add `/lenders` item (Landmark icon) to Sidebar.tsx
- [ ] UI: `src/app/(desktop)/lenders/` — page.tsx + LendersSidebar + LenderProfile
- [ ] `npx next build` from model-testing-app, fix errors
- [ ] Branch, commit, push, PR

## Notes
- Lenders are `clients` rows with `type === "lender"` — no new table.
- Primary profile query already exists: `appetiteSignals.lenderGetDeepContext`.
- Lender identity color: `colors.entityTypes.lender` (#14b8a6 teal).
- KnowledgeGraphDrawer is fixed-overlay only; mount at page level (docs pattern).
