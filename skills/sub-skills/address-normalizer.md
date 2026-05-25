# address-normalizer

Normalise UK property and registered office addresses into a canonical form for matching. Used by `resolve-company` (for shared-address relationship detection), `deal-intake` (scheme address matching), and `companiesHouse` linkage (already implemented inline in the existing `convex/companiesHouse.ts` — this sub-skill documents and consolidates the canon).

## When to use

- Two address strings need to be compared for equivalence.
- An incoming scheme address needs matching against existing `projects.address` or `projects.zip`.
- A company address from Companies House needs deduping against an internal record.

## Inputs

- `address`: string. Free-form UK address. May or may not include postcode, building number, building name, town, county.

## Outputs

```ts
{
  raw: string;                  // input unchanged
  normalised: string;           // lowercase, whitespace-collapsed, punctuation-stripped
  hash: string;                 // sha-256 of normalised (or similar; for storage and indexing)
  postcode: string | null;      // UK postcode if extractable, in the form "SW1A 1AA"
  postcodeOutward: string | null;  // outward only, e.g. "SW1A"
  components: {
    buildingNumber: string | null;
    buildingName: string | null;
    street: string | null;
    locality: string | null;
    town: string | null;
    county: string | null;
  };
}
```

## Workflow

1. Trim, lowercase, collapse whitespace.
2. Strip punctuation except hyphens (keep "stoke-on-trent") and forward slashes (keep "unit 3a/4").
3. Extract postcode using the UK pattern `[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2}`. Format canonically: outward + single space + inward, both uppercase. If no postcode, `postcode: null`.
4. Replace common abbreviations:
   - `st.` → `street`, `rd.` → `road`, `ave.` → `avenue`, `ln.` → `lane`, `pl.` → `place`, `sq.` → `square`, `gdns` → `gardens`
   - `flat` and `apt` unify to `flat`
   - `building` → leave; "unit" stays; "block" stays
5. Parse components by heuristic: building number is leading digit; building name is alpha-only first segment; rest splits on commas.
6. Hash the normalised string for storage; this matches the pattern used in `convex/companiesHouse.ts` `getAddressHash`.

## Style rules

- Output is deterministic. Same input always produces the same hash.
- Do not invent postcodes from town names. If the postcode is missing, leave it null.
- Do not "fix" misspellings. The whole point is to canonicalise without losing information.

## Tool dependencies

None. Pure string manipulation.

## What goes wrong

1. **Address is not UK-shaped**: an overseas company's registered office. Skill returns components on best-effort basis; postcode will be null.
2. **Partial address**: just a postcode, or just a town. Skill returns what it can; matching downstream is lower confidence.
3. **Two addresses match on hash but were entered by different humans**: that's the point. Use the hash for matching and the raw input for display.
4. **PO Box addresses**: tagged in `components.locality` as "PO Box N". Distinct from physical address; do not consider equivalent.

## Implementation note

The existing `convex/companiesHouse.ts` has a `getAddressHash` function that already does this. This sub-skill documents the canonical version. When BL-5.5 unified `document.extract` lands and skills need address normalisation, the same function should be used (extracted into a shared utility) so the hash stays consistent across the codebase.
