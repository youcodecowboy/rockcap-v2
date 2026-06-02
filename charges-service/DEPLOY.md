# Deploying charges-service to Render

Goal: get the charges API live on Render so the Convex `sourcing.*` tools work
end-to-end. Three independent switches must all be flipped: **(A)** service +
DB on Render, **(B)** data loaded, **(C)** Convex env pointed at the service.

The service needs only two env vars: `DATABASE_URL` (the Render Postgres) and
`CHARGES_API_KEY` (shared secret). It does NOT need a Companies House key — the
CH enrichment runs Convex-side using the existing `COMPANIES_HOUSE_API_KEY`.

---

## A. Render dashboard (you — only you can do these)

### 1. Postgres
- New → Postgres. Name `rockcap-charges-db`. Region: **Frankfurt** (EU — UK data)
  or match your Convex region for lowest latency.
- **Storage: set ≥ 10 GB** — the 3.5M-row table + two trigram GIN indexes
  (lender + property) are several GB, and the load briefly holds two copies
  during the atomic swap.
- After it provisions, copy both the **Internal** and **External** connection
  strings from the dashboard.

### 2. Web service
- New → Web Service → connect the `rockcap-v2` repo, branch
  `feat/charges-service-sourcing` (or `main` after you merge).
- **Root Directory:** `charges-service`
- **Runtime:** Python 3
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health check path:** `/health`
- **Plan:** Starter (always-on — no cold start)
- **Environment variables:**
  - `DATABASE_URL` = the Postgres **Internal** connection string (same Render network)
  - `CHARGES_API_KEY` = the shared secret (see chat / generate with
    `python -c "import secrets; print(secrets.token_urlsafe(32))"`)

When it's live, note the public URL, e.g. `https://rockcap-charges-api.onrender.com`.

(The `render.yaml` Blueprint mirrors this config for reference; manual setup is
simplest for a monorepo subdirectory.)

---

## B. Schema + data load (I can run these, given the External DB URL)

From `charges-service/` with the venv active, pointed at Render's **External**
connection string (Render appends `?sslmode=require`):

```bash
export DATABASE_URL="<render EXTERNAL connection string>"

# schema
.venv/bin/python -c "import os,psycopg; psycopg.connect(os.environ['DATABASE_URL'],autocommit=True).execute(open('app/schema.sql').read())"

# load the snapshot (data lives in ~/ch-bulk/extracted, ~48s locally; longer over the network)
.venv/bin/python -m etl.load --dir ~/ch-bulk/extracted --run 3256 --snapshot-date 2026-05-30
```

The loader uses the safe staging-then-swap pattern with validation gates, so a
bad load aborts without touching live data.

---

## C. Point Convex at the service (I can run these)

```bash
cd model-testing-app
npx convex env set CHARGES_SERVICE_URL "https://<your-render-service>.onrender.com"
npx convex env set CHARGES_API_KEY "<the same shared secret>"
npx convex deploy   # makes the sourcedCompanies table + sourcing.* functions live
```

---

## D. Smoke test

```bash
# service directly
curl -s -H "X-API-Key: $CHARGES_API_KEY" \
  "https://<service>.onrender.com/lenders?q=PARAGON&limit=3"

# then via Convex (MCP / chat): sourcing.searchLenders { query: "paragon dev finance" }
#                                sourcing.fromLender   { lender: "PARAGON DEVELOPMENT FINANCE LIMITED", registeredSince: "2024-01-01" }
```

Once this passes, push the `RockCap-MCP` `docs/sourcing-catalogue` branch — the
catalogued tools now actually work for the client.
