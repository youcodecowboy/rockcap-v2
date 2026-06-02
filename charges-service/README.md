# charges-service

Reverse chargeholder lookup over the Companies House **Mortgage/Charges Snapshot
(Product 199)**. Answers the question the CH API and bulk data products can't:

> *"Show me every company with a registered charge held by a given lender"* —
> e.g. all companies charged to **Paragon Development Finance Limited**.

The public CH charges API is company-number-forward only (`/company/{n}/charges`),
and no free bulk product carries charges. Prod199 is the one dataset that does;
this service ingests it, indexes the chargeholder, and exposes a reverse lookup.

## Why this is a separate service

It's a Python + Postgres app deployed to **Render**, independent of the Next.js
app (`model-testing-app/`). Convex reaches it over HTTP, the same way it already
calls the live Companies House API. The LLM/MCP path is:

```
Claude -> MCP tool (companies.searchByChargeholder)
       -> Convex action -> HTTP (+ X-API-Key) -> this service -> Postgres
```

## What the data looks like (validated against run 3256, snapshot 2026-05-30)

- ~565k companies with a mortgage, ~2.4M charge records; 3.16M person-entitled
  records in the E&W file alone.
- Each charge gives us `RN` (borrower company number, **mandatory**), `PE`
  (chargeholder / lender name, **mandatory**), charge id (`CC`/`CN`), dates, and
  satisfaction status (`NM`/`DF`).
- **The hard part is entity resolution on the lender name.** "PARAGON" alone is
  51,619 `PARAGON BANK PLC` (buy-to-let) vs 1,923 `PARAGON DEVELOPMENT FINANCE
  LIMITED` (the dev-finance competitor) plus many spelling variants. See
  `etl/canonicalize.py` — a naive `LIKE '%PARAGON%'` would merge them and mislead.

## Layout

```
app/
  main.py          FastAPI query service (see Endpoints below)
  db.py            shared Postgres connection pool
  schema.sql       charges table + pg_trgm index + dataset_versions
etl/
  parser.py        streaming state-machine parser for the Prod199 .dat format
  canonicalize.py  lender-name normalisation + embedded-CRN extraction
  load.py          parse -> staging table -> validate -> atomic swap (re-baseline)
render.yaml        Render Blueprint (db + web service + refresh cron)
```

## Endpoints

All require `X-API-Key`. Resolve a fuzzy lender via `/lenders` first, then use the
exact canonical name for `/charges/by-lender`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /lenders?q=` | **discovery** — distinct canonical lenders matching `q` + charge/company counts (disambiguates PARAGON BANK vs PARAGON DEV FINANCE) |
| `GET /charges/by-lender?name=` | **sourcing core** — distinct companies a lender has charged, one row each, with charge facts + recent scheme/property |
| `GET /charges/by-company?number=` | **forward** — every chargeholder on a company, grouped (intel-time lender profile) |

`/charges/by-lender` filters: `status` (all\|outstanding\|satisfied), `registered_since`,
`registered_until` (YYYY-MM-DD), `jurisdiction` (ew\|sc\|ni), `entity_type` (company\|llp),
`property_contains` (free-text scheme/location), `limit`.

## Local dev

```bash
cd charges-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set DATABASE_URL + CHARGES_API_KEY

# create the schema
psql "$DATABASE_URL" -f app/schema.sql

# load a snapshot (data lives outside the repo)
python -m etl.load --dir ~/ch-bulk/extracted --run 3256 --snapshot-date 2026-05-30

# serve
uvicorn app.main:app --reload
# curl -H "X-API-Key: $CHARGES_API_KEY" \
#   "localhost:8000/charges/by-lender?name=PARAGON%20DEVELOPMENT%20FINANCE%20LIMITED"
```

Quick parser sanity check without a database:

```bash
python -m etl.parser ~/ch-bulk/extracted/Prod199_3256_ew_30052026050501.dat PARAGON
```

## Refreshing the data

- **Quarterly:** request a fresh Prod199, run `etl.load` — it loads into a
  staging table, runs validation gates, and atomically swaps it live (zero
  downtime; aborts leaving the old data intact if a gate fails).
- **Daily (future):** Prod201 mortgage-update files applied incrementally via a
  gap-aware cron, once recurring SFTP / Bulk Cloud Gateway access is granted.
  Until then the quarterly snapshot is the source of truth.

## Access

Prod199 is a restricted bulk product (not on the public data-products page),
requested from `bulkproducts@companieshouse.gov.uk`. Recurring automated pulls
use the **Bulk Cloud Gateway** (SFTP) — send an RSA public key to be issued a
profile:

```bash
ssh-keygen -t rsa -b 2048 -m PEM -f ~/.ssh/companieshouse_bulk
# email only the .pub file; never the private key
```
