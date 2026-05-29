# Doc type: company one-pager

The hard structure (as prose, until template-fill lands in v2) for a single-page company brief. Used by `document-author` when `docType` is "Company One-Pager". Pair with `document-house-style.md` for voice and HTML rules.

## Purpose
A one-page brief on a company or prospect, for internal use or to brief a colleague before a warm intro. Fits one A4 page.

## Required sections (in order; omit any with no data rather than padding)
1. **Header.** `<h1>` company name, then a one-line standfirst: what they do and where (e.g. "Surrey-based residential developer, active across the South East").
2. **Snapshot.** A `<table>`: incorporation date, company number, status, registered office, directors and PSCs. Pull from the Companies House profile.
3. **Track record / activity.** Recent schemes or charges if known, most recent first. Cite the source (charge register, filed accounts). If none on file, omit the section.
4. **Financial signals.** Any GDV, loan, lender, or value facts on file, each cited. Never invent. If none, omit.
5. **Why relevant to RockCap.** One short paragraph grounded in the data above (product fit, geography, lender DNA). No speculation about specific deals.

## Data sources (via `client.getDeepContext`)
Companies House profile + charges, the intelligence row, track record / schemes, contacts.

## Avoid
- Speculative deal sizing or valuations.
- Unverified lender relationships.
- Generic boilerplate ("a leading developer") not supported by data.
