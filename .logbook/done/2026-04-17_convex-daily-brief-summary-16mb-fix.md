# Convex `hubspotSync.dailyBriefSummary` — fix 16MB read-limit overflow

Created: 2026-04-17
Status: done
Tags: #backend #perf #bug
Source:
  - 2026-04-17 — [bug] Convex query blows up on daily brief: `api.hubspotSync.dailyBriefSummary` throws "Too many bytes read in a single function execution (limit: 16777216 bytes / 16MB)" — called from the web app via `useQuery(api.hubspotSync.dailyBriefSummary, isAuthenticated ? { sinceISO: hubspotSince } : 'skip')`. Convex hint: paginate, narrow with indexed queries, or tighten the time window. (Request ID a1a959e273c6c6a9)
Priority: high

## Notes

Shipped 2026-04-17 — commit b5168fe: cap reads with indexed .take(150) for activities + .take(100) for deals/contacts + filter isDeleted inside .take(). Verified against live Convex — query returns cleanly.
