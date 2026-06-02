"""
FastAPI query service for the Companies House charges reverse-lookup.

Only Convex calls this (Convex action -> HTTP, with a shared-secret header).
The LLM and end users never touch it directly. Run locally with:

    uvicorn app.main:app --reload

Endpoints:
    GET /health
    GET /lenders?q=PARAGON            -> distinct canonical lenders + charge counts (discovery)
    GET /charges/by-lender?name=...   -> companies charged to a lender (the core feature)
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query

from .db import get_pool

app = FastAPI(title="RockCap Charges Service", version="0.1.0")

_API_KEY = os.environ.get("CHARGES_API_KEY")


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """Shared-secret gate. Mirrors the CRON_SECRET pattern used elsewhere."""
    if not _API_KEY:
        raise HTTPException(500, "CHARGES_API_KEY not configured on the service")
    if x_api_key != _API_KEY:
        raise HTTPException(401, "invalid or missing X-API-Key")


def _data_as_of() -> Optional[str]:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT snapshot_date FROM dataset_versions WHERE is_live ORDER BY loaded_at DESC LIMIT 1"
        ).fetchone()
    return row[0].isoformat() if row else None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/lenders", dependencies=[Depends(require_api_key)])
def lenders(
    q: str = Query(..., min_length=2, description="substring / fuzzy lender query"),
    limit: int = Query(50, le=200),
) -> dict:
    """Discovery: which distinct canonical lenders match `q`, and how many charges each.

    This is what disambiguates "PARAGON" into PARAGON BANK PLC vs PARAGON
    DEVELOPMENT FINANCE LIMITED so the operator/LLM can pick the right entity
    before running the by-lender lookup.
    """
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT lender_canonical,
                   COUNT(*)                                  AS charge_count,
                   COUNT(*) FILTER (WHERE NOT fully_satisfied) AS outstanding_count,
                   COUNT(DISTINCT company_number)            AS company_count
            FROM charges
            WHERE lender_canonical ILIKE %s
            GROUP BY lender_canonical
            ORDER BY charge_count DESC
            LIMIT %s
            """,
            (f"%{q.upper()}%", limit),
        ).fetchall()
    return {
        "query": q,
        "dataAsOf": _data_as_of(),
        "lenders": [
            {
                "lender": r[0],
                "chargeCount": r[1],
                "outstandingCount": r[2],
                "companyCount": r[3],
            }
            for r in rows
        ],
    }


Status = str  # "all" | "outstanding" | "satisfied"


def _status_clause(status: str) -> str:
    if status == "outstanding":
        return " AND NOT fully_satisfied"
    if status == "satisfied":
        return " AND fully_satisfied"
    return ""


@app.get("/charges/by-lender", dependencies=[Depends(require_api_key)])
def charges_by_lender(
    name: str = Query(..., min_length=2, description="canonical lender name (exact, case-insensitive)"),
    status: Status = Query("all", pattern="^(all|outstanding|satisfied)$"),
    registered_since: Optional[str] = Query(None, description="YYYY-MM-DD lower bound on charge date"),
    registered_until: Optional[str] = Query(None, description="YYYY-MM-DD upper bound on charge date"),
    jurisdiction: Optional[str] = Query(None, pattern="^(ew|sc|ni)$"),
    entity_type: Optional[str] = Query(None, pattern="^(company|llp)$"),
    property_contains: Optional[str] = Query(None, min_length=2, description="free-text scheme/location filter"),
    limit: int = Query(500, le=5000),
) -> dict:
    """Sourcing core: distinct companies a lender has charged, with charge facts.

    Returns ONE row per company (not per charge) — the candidate-list shape the
    sourcing flow consumes. Matches the canonical lender name exactly
    (case-insensitive) for precision; resolve fuzzy names via /lenders first.
    """
    where = ["lender_canonical = %s"]
    params: list = [name.upper()]
    status_sql = _status_clause(status)  # applied to row filter below
    if registered_since:
        where.append("date_registered >= %s")
        params.append(registered_since)
    if registered_until:
        where.append("date_registered <= %s")
        params.append(registered_until)
    if jurisdiction:
        where.append("jurisdiction = %s")
        params.append(jurisdiction)
    if entity_type:
        where.append("entity_type = %s")
        params.append(entity_type)
    if property_contains:
        where.append("property ILIKE %s")
        params.append(f"%{property_contains}%")
    clause = "WHERE " + " AND ".join(where) + status_sql

    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            f"""
            SELECT company_number,
                   MIN(jurisdiction)                              AS jurisdiction,
                   MIN(entity_type)                               AS entity_type,
                   COUNT(*)                                       AS charge_count,
                   COUNT(*) FILTER (WHERE NOT fully_satisfied)    AS outstanding_count,
                   MAX(date_registered)                           AS latest_charge,
                   MIN(date_registered)                           AS earliest_charge,
                   (array_agg(property ORDER BY date_registered DESC NULLS LAST))[1] AS recent_property
            FROM charges
            {clause}
            GROUP BY company_number
            ORDER BY latest_charge DESC NULLS LAST
            LIMIT %s
            """,
            (*params, limit),
        ).fetchall()
    return {
        "lender": name.upper(),
        "filters": {
            "status": status,
            "registeredSince": registered_since,
            "registeredUntil": registered_until,
            "jurisdiction": jurisdiction,
            "entityType": entity_type,
            "propertyContains": property_contains,
        },
        "dataAsOf": _data_as_of(),
        "count": len(rows),
        "companies": [
            {
                "companyNumber": r[0],
                "jurisdiction": r[1],
                "entityType": r[2],
                "chargeCount": r[3],
                "outstandingCount": r[4],
                "hasOutstanding": r[4] > 0,
                "latestChargeDate": r[5].isoformat() if r[5] else None,
                "earliestChargeDate": r[6].isoformat() if r[6] else None,
                "recentProperty": r[7],
            }
            for r in rows
        ],
    }


@app.get("/charges/by-company", dependencies=[Depends(require_api_key)])
def charges_by_company(
    number: str = Query(..., min_length=1, description="Companies House company number"),
    include_satisfied: bool = Query(True),
) -> dict:
    """Forward lookup: every chargeholder on a company, grouped.

    Used at intel time to read a borrower's full lender relationships
    (current + historical) once they're being worked as a prospect.
    """
    clause = "WHERE company_number = %s"
    params: list = [number.strip().upper()]
    if not include_satisfied:
        clause += " AND NOT fully_satisfied"
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            f"""
            SELECT lender_canonical,
                   COUNT(*)                                       AS charge_count,
                   COUNT(*) FILTER (WHERE NOT fully_satisfied)    AS outstanding_count,
                   MAX(date_registered)                           AS latest_charge
            FROM charges
            {clause}
            GROUP BY lender_canonical
            ORDER BY outstanding_count DESC, charge_count DESC
            """,
            params,
        ).fetchall()
    return {
        "companyNumber": number.strip().upper(),
        "includeSatisfied": include_satisfied,
        "dataAsOf": _data_as_of(),
        "lenderCount": len(rows),
        "lenders": [
            {
                "lender": r[0],
                "chargeCount": r[1],
                "outstandingCount": r[2],
                "hasOutstanding": r[2] > 0,
                "latestChargeDate": r[3].isoformat() if r[3] else None,
            }
            for r in rows
        ],
    }
