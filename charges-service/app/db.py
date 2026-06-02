"""Postgres connection pool for the FastAPI query service.

A single long-lived pool is shared across requests. This is why the query API
runs as a persistent Render web service rather than serverless functions: one
pool reuses a handful of connections instead of each invocation opening its own
and exhausting Render Postgres's connection limit.
"""

from __future__ import annotations

import os

from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        # Small pool: this is a low-traffic internal tool. min_size keeps a
        # couple warm so the first query after idle doesn't pay connect latency.
        _pool = ConnectionPool(dsn, min_size=2, max_size=10, open=True)
    return _pool
