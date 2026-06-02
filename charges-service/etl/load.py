"""
Load a Prod199 snapshot into Postgres using the safe staging-then-swap pattern.

Strategy (blue/green for data):
  1. Parse all 6 .dat files -> normalised (charge, lender) rows.
  2. COPY them into a fresh `charges_staging` table (live `charges` untouched).
  3. Build indexes on staging, then run validation gates.
  4. If gates pass, atomically RENAME staging -> live inside one transaction.
  5. Record the dataset_versions row; drop the old table.

This keeps the live API serving the previous snapshot until the instant of the
swap, and aborts cleanly (leaving live data intact) if the new load looks wrong.

Usage:
    python -m etl.load --dir ~/ch-bulk/extracted --run 3256 --snapshot-date 2026-05-30
"""

from __future__ import annotations

import argparse
import glob
import os
from datetime import date

import psycopg

from .canonicalize import canonicalize
from .parser import parse_file

# Filename -> (jurisdiction, entity_type). Matches CH naming, e.g.
# Prod199_3256_ew_30052026050501.dat / ..._ew_llp_....dat
_FILE_TAGS = [
    ("_ew_llp_", ("ew", "llp")),
    ("_ni_llp_", ("ni", "llp")),
    ("_sc_llp_", ("sc", "llp")),
    ("_ew_", ("ew", "company")),
    ("_ni_", ("ni", "company")),
    ("_sc_", ("sc", "company")),
]


def _tags_for(path: str) -> tuple[str, str]:
    base = os.path.basename(path)
    for needle, tags in _FILE_TAGS:
        if needle in base:
            return tags
    return ("unknown", "unknown")


def _iter_rows(data_dir: str, snapshot_run: int):
    """Yield tuples ready for COPY into charges_staging."""
    for path in sorted(glob.glob(os.path.join(data_dir, "Prod199_*.dat"))):
        jurisdiction, entity_type = _tags_for(path)
        for charge in parse_file(path):
            if not charge.company_number or not charge.persons_entitled:
                continue
            for pe in charge.persons_entitled:
                c = canonicalize(pe)
                yield (
                    charge.company_number,
                    charge.charge_id,
                    charge.charge_id_type,
                    c.raw,
                    c.canonical,
                    c.crn,
                    charge.amount_secured,
                    charge.description,
                    charge.property_particulars,
                    charge.date_registered,
                    charge.date_created,
                    charge.fully_satisfied,
                    charge.date_satisfied,
                    jurisdiction,
                    entity_type,
                    snapshot_run,
                )


_STAGING_DDL = """
DROP TABLE IF EXISTS charges_staging;
-- INCLUDING IDENTITY gives staging its own sequence (independent of the live
-- table), so the post-swap DROP of charges_old has no shared dependency.
-- Indexes are built after COPY for speed, so they are NOT copied here.
CREATE TABLE charges_staging (LIKE charges INCLUDING DEFAULTS INCLUDING IDENTITY);
"""

_COPY_SQL = """
COPY charges_staging
    (company_number, charge_id, charge_id_type, lender_raw, lender_canonical,
     lender_crn, amount_secured, description, property, date_registered,
     date_created, fully_satisfied, date_satisfied, jurisdiction, entity_type,
     snapshot_run)
FROM STDIN
"""


def load(data_dir: str, snapshot_run: int, snapshot_date: date, min_rows: int = 1_000_000) -> None:
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(_STAGING_DDL)
            n = 0
            with cur.copy(_COPY_SQL) as cp:
                for row in _iter_rows(data_dir, snapshot_run):
                    cp.write_row(row)
                    n += 1
            conn.commit()
            print(f"copied {n:,} (charge, lender) rows into charges_staging")

            # ---- validation gates (abort the swap if any fail) ----
            staged = cur.execute("SELECT COUNT(*) FROM charges_staging").fetchone()[0]
            assert staged >= min_rows, f"row-count gate failed: {staged:,} < {min_rows:,}"
            null_co = cur.execute(
                "SELECT COUNT(*) FROM charges_staging WHERE company_number IS NULL OR company_number = ''"
            ).fetchone()[0]
            assert null_co == 0, f"null company_number gate failed: {null_co:,} rows"
            # Smoke lookup: a known lender must resolve.
            paragon = cur.execute(
                "SELECT COUNT(*) FROM charges_staging WHERE lender_canonical = %s",
                ("PARAGON DEVELOPMENT FINANCE LIMITED",),
            ).fetchone()[0]
            assert paragon > 0, "smoke gate failed: no PARAGON DEVELOPMENT FINANCE charges"
            print(f"gates passed: {staged:,} rows, 0 null companies, {paragon:,} Paragon Dev Finance charges")

            # ---- build indexes on staging ----
            cur.execute("ALTER TABLE charges_staging ADD PRIMARY KEY (id)")
            cur.execute("CREATE INDEX ON charges_staging (lender_canonical)")
            cur.execute("CREATE INDEX ON charges_staging USING gin (lender_canonical gin_trgm_ops)")
            cur.execute("CREATE INDEX ON charges_staging (company_number)")
            cur.execute("CREATE INDEX ON charges_staging (fully_satisfied)")
            cur.execute("CREATE INDEX ON charges_staging (date_registered)")
            cur.execute("CREATE INDEX ON charges_staging USING gin (property gin_trgm_ops)")
            conn.commit()

            # ---- atomic swap ----
            cur.execute("ALTER TABLE IF EXISTS charges RENAME TO charges_old")
            cur.execute("ALTER TABLE charges_staging RENAME TO charges")
            cur.execute("UPDATE dataset_versions SET is_live = FALSE")
            cur.execute(
                """INSERT INTO dataset_versions
                   (snapshot_run, snapshot_date, row_count, source_files, is_live)
                   VALUES (%s, %s, %s, %s, TRUE)""",
                (snapshot_run, snapshot_date, staged, data_dir),
            )
            conn.commit()
            cur.execute("DROP TABLE IF EXISTS charges_old")
            conn.commit()
            print(f"swap complete — live snapshot is now run {snapshot_run} ({snapshot_date})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="directory of extracted Prod199 .dat files")
    ap.add_argument("--run", type=int, required=True, help="snapshot run number (e.g. 3256)")
    ap.add_argument("--snapshot-date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--min-rows", type=int, default=1_000_000)
    args = ap.parse_args()
    load(args.dir, args.run, date.fromisoformat(args.snapshot_date), args.min_rows)


if __name__ == "__main__":
    main()
