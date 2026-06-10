# Deal sectors (canonical)

The controlled sector vocabulary used to match a prospect's activity to RockCap's track record (hook-ladder rung 9, via `caseStudy.matchForProspect`). Keep in lockstep with `DEAL_SECTORS` in the app's `convex/lib/dealBook.ts`.

| Key | Label | Notes |
|---|---|---|
| `residential` | residential | for-sale housing/apartments |
| `btr_rental` | BTR/rental | build-to-rent, PRS, multifamily |
| `student_pbsa` | student | purpose-built student accommodation |
| `co_living` | co-living | |
| `mixed_use` | mixed-use | |
| `commercial` | commercial | office / retail |
| `industrial_logistics` | industrial/logistics | warehouse, distribution, sheds |
| `hotel_leisure` | hotel/leisure | incl. aparthotel |

**Inference is best-effort and draft-only.** The app infers a sector from a project's name/description/tags when deriving drafts; an operator confirms it before the case study is hook-eligible. Most-specific sectors win over generic `residential`/`commercial`.
