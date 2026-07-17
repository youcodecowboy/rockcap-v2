"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus, X, ChevronRight, ArrowLeft } from "lucide-react";

// Sourcing tab — prospect candidates sourced from the charges register, worked
// one BATCH at a time (a batch = one sourcing run against a lender). Level 1 is
// the batches overview + the "source from a lender" control; level 2 is the
// per-batch triage view (filter → bulk-dismiss the junk, promote the keepers).
//
// Frontend-only: groups batches client-side from sourcing.list and uses the
// live list / promote / setState functions. No backend changes.

type Row = any;

type Batch = {
  batch: string;
  lender: string;
  sourcedAt: string;
  total: number;
  counts: { new: number; reviewed: number; promoted: number; dismissed: number };
  remaining: number; // new + reviewed (still to action)
};

function groupBatches(rows: Row[]): Batch[] {
  const map = new Map<string, Batch>();
  for (const r of rows) {
    const key = r.sourcingBatch ?? `${r.sourcedFromLender}`;
    let b = map.get(key);
    if (!b) {
      b = {
        batch: key,
        lender: r.sourcedFromLender,
        sourcedAt: r.createdAt ?? "",
        total: 0,
        counts: { new: 0, reviewed: 0, promoted: 0, dismissed: 0 },
        remaining: 0,
      };
      map.set(key, b);
    }
    b.total++;
    b.counts[r.sourcingState as keyof Batch["counts"]]++;
    if (r.createdAt && r.createdAt > b.sourcedAt) b.sourcedAt = r.createdAt;
  }
  const out = [...map.values()];
  for (const b of out) b.remaining = b.counts.new + b.counts.reviewed;
  // Most-recently-sourced first.
  out.sort((a, b) => b.sourcedAt.localeCompare(a.sourcedAt));
  return out;
}

export function SourcingTab() {
  const colors = useColors();
  const all = (useQuery(api.sourcing.list as any, {}) as Row[] | undefined) ?? [];
  const batches = useMemo(() => groupBatches(all), [all]);
  const [openBatch, setOpenBatch] = useState<string | null>(null);

  if (openBatch) {
    const batch = batches.find((b) => b.batch === openBatch);
    const rows = all.filter((r) => (r.sourcingBatch ?? r.sourcedFromLender) === openBatch);
    return (
      <BatchTriage
        batch={batch}
        rows={rows}
        onBack={() => setOpenBatch(null)}
        colors={colors}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SourceControl colors={colors} />
      <BatchesOverview batches={batches} onOpen={setOpenBatch} colors={colors} />
    </div>
  );
}

// ── Source from a lender ──────────────────────────────────────────────────
function SourceControl({ colors }: { colors: any }) {
  const searchLenders = useAction(api.sourcing.searchLenders);
  const sourceFromLender = useAction(api.sourcing.sourceFromLender);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [since, setSince] = useState("");
  const [status, setStatus] = useState("all");
  const [sourcing, setSourcing] = useState(false);

  async function doSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSelected(null);
    try {
      const res: any = await searchLenders({ query: query.trim(), limit: 10 });
      setMatches(res.lenders ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lender search failed");
    } finally {
      setSearching(false);
    }
  }

  async function doSource() {
    if (!selected) return;
    setSourcing(true);
    try {
      const res: any = await sourceFromLender({
        lender: selected,
        status,
        registeredSince: since || undefined,
        limit: 500,
      });
      toast.success(
        `Sourced ${res.totalCandidates} from ${selected}: ${res.inserted} new, ${res.alreadyInBook} already in book` +
          (res.truncated ? " (capped at 500 — narrow with a date)" : ""),
      );
      setQuery("");
      setMatches(null);
      setSelected(null);
      setSince("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sourcing failed");
    } finally {
      setSourcing(false);
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        background: colors.bg.card,
        padding: 14,
      }}
    >
      <div style={{ ...labelStyle(colors), marginBottom: 8 }}>Source from a lender you know</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="e.g. paragon development finance"
          style={inputStyle(colors)}
        />
        <button onClick={doSearch} disabled={searching} style={btnStyle(colors.accent.blue, searching)}>
          <Search size={12} /> {searching ? "Searching…" : "Find lender"}
        </button>
      </div>

      {matches && matches.length === 0 && (
        <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 8 }}>No matching lenders.</div>
      )}
      {matches && matches.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {matches.map((m) => (
            <button
              key={m.lender}
              onClick={() => setSelected(m.lender)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 3,
                border: `1px solid ${selected === m.lender ? colors.entityTypes.prospect : colors.border.default}`,
                background: selected === m.lender ? `${colors.entityTypes.prospect}14` : colors.bg.cardAlt,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 11, color: colors.text.primary, fontWeight: 500 }}>{m.lender}</span>
              <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: "ui-monospace, monospace" }}>
                {m.companyCount} cos · {m.outstandingCount} outstanding
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${colors.border.light}`,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: colors.text.muted }}>Registered since</span>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} style={inputStyle(colors, 150)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle(colors, 150)}>
            <option value="all">all charges</option>
            <option value="outstanding">outstanding only</option>
            <option value="satisfied">satisfied only</option>
          </select>
          <button onClick={doSource} disabled={sourcing} style={btnStyle(colors.accent.green, sourcing)}>
            {sourcing ? "Sourcing… (may take a few min)" : `Source candidates`}
          </button>
          {sourcing && (
            <span style={{ fontSize: 10, color: colors.text.dim }}>
              enriching each company via Companies House…
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Level 1: batches overview ─────────────────────────────────────────────
function BatchesOverview({
  batches,
  onOpen,
  colors,
}: {
  batches: Batch[];
  onOpen: (b: string) => void;
  colors: any;
}) {
  if (batches.length === 0) {
    return (
      <div
        style={{
          border: `1px dashed ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          textAlign: "center",
          color: colors.text.muted,
          fontSize: 12,
        }}
      >
        No sourcing batches yet. Find a lender above and source its borrowers as candidates.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={labelStyle(colors)}>Batches</div>
      {batches.map((b) => {
        const done = b.remaining === 0;
        return (
          <button
            key={b.batch}
            onClick={() => onOpen(b.batch)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              border: `1px solid ${colors.border.default}`,
              borderLeft: `3px solid ${done ? colors.border.mid : colors.entityTypes.prospect}`,
              borderRadius: 4,
              background: colors.bg.card,
              cursor: "pointer",
              textAlign: "left",
              opacity: done ? 0.7 : 1,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.text.primary }}>{b.lender}</div>
              <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 3, display: "flex", gap: 8 }}>
                <span>{b.total} companies</span>
                <span>· sourced {b.sourcedAt.slice(0, 10)}</span>
                <span style={{ color: done ? colors.text.dim : colors.entityTypes.prospect }}>
                  {done ? "✓ done" : `${b.remaining} to review`}
                </span>
                {b.counts.promoted > 0 && <span style={{ color: colors.accent.green }}>{b.counts.promoted} promoted</span>}
                {b.counts.dismissed > 0 && <span style={{ color: colors.text.dim }}>{b.counts.dismissed} dismissed</span>}
              </div>
            </div>
            <ChevronRight size={16} color={colors.text.dim} />
          </button>
        );
      })}
    </div>
  );
}

// ── Level 2: per-batch triage ─────────────────────────────────────────────
function BatchTriage({
  batch,
  rows,
  onBack,
  colors,
}: {
  batch: Batch | undefined;
  rows: Row[];
  onBack: () => void;
  colors: any;
}) {
  const router = useRouter();
  const promote = useMutation(api.sourcing.promote);
  const setState = useMutation(api.sourcing.setState);

  const [stateFilter, setStateFilter] = useState<string>("new");
  const [sic, setSic] = useState<string>("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [hideInBook, setHideInBook] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const sicOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => r.sicCodes ?? []))].sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (stateFilter !== "all" && r.sourcingState !== stateFilter) return false;
    if (sic && !(r.sicCodes ?? []).includes(sic)) return false;
    if (outstandingOnly && !r.hasOutstanding) return false;
    if (hideInBook && r.alreadyInBook) return false;
    return true;
  });

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function doPromote(r: Row) {
    setBusyId(r._id);
    try {
      await promote({ id: r._id });
      toast.success(`Added ${r.companyName ?? r.companyNumber} to the pipeline`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doDismiss(r: Row) {
    setBusyId(r._id);
    try {
      await setState({ id: r._id, state: "dismissed" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusyId(null);
    }
  }

  async function dismissSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => setState({ id: id as any, state: "dismissed" })));
      toast.success(`Dismissed ${ids.length} companies`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk dismiss failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function promoteSelected() {
    // Only promote rows not already in the pipeline (skip promoted + already-in-book)
    // so a re-click or a mixed selection doesn't double-create prospects.
    const eligible = [...selected].filter((id) => {
      const r = rows.find((x) => x._id === id);
      return r && r.sourcingState !== "promoted" && !r.alreadyInBook;
    });
    if (eligible.length === 0) {
      toast.error("Nothing to add — selected rows are already promoted or in the book");
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(eligible.map((id) => promote({ id: id as any })));
      toast.success(`Added ${eligible.length} ${eligible.length === 1 ? "company" : "companies"} to the pipeline`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk add to pipeline failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={btnStyle(colors.bg.cardAlt, false, colors.text.secondary)}>
          <ArrowLeft size={12} /> Batches
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{batch?.lender}</div>
        <div style={{ fontSize: 11, color: colors.text.muted }}>{filtered.length} shown · {rows.length} in batch</div>
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={inputStyle(colors, 130)}>
          <option value="new">new</option>
          <option value="reviewed">reviewed</option>
          <option value="promoted">promoted</option>
          <option value="dismissed">dismissed</option>
          <option value="all">all states</option>
        </select>
        <select value={sic} onChange={(e) => setSic(e.target.value)} style={inputStyle(colors, 150)}>
          <option value="">any SIC</option>
          {sicOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label style={checkLabel(colors)}>
          <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} /> outstanding only
        </label>
        <label style={checkLabel(colors)}>
          <input type="checkbox" checked={hideInBook} onChange={(e) => setHideInBook(e.target.checked)} /> hide in-book
        </label>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <button onClick={promoteSelected} disabled={bulkBusy} style={btnStyle(colors.accent.green, bulkBusy)}>
              <UserPlus size={12} /> {bulkBusy ? "Adding…" : `Add to pipeline (${selected.size})`}
            </button>
            <button onClick={dismissSelected} disabled={bulkBusy} style={btnStyle(colors.accent.red, bulkBusy)}>
              <X size={12} /> {bulkBusy ? "Dismissing…" : `Dismiss selected (${selected.size})`}
            </button>
          </>
        )}
      </div>

      {/* table */}
      <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle(colors)} />
              <th style={thStyle(colors)}>Company</th>
              <th style={thStyle(colors)}>CH #</th>
              <th style={thStyle(colors)}>SIC</th>
              <th style={thStyle(colors)}>Charges</th>
              <th style={thStyle(colors)}>Latest</th>
              <th style={thStyle(colors)} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle(colors), color: colors.text.muted, textAlign: "center" }}>
                  Nothing to review with these filters.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const busy = busyId === r._id;
              const triaged = r.sourcingState === "promoted" || r.sourcingState === "dismissed";
              return (
                <tr key={r._id} style={{ opacity: busy ? 0.5 : 1 }}>
                  <td style={tdStyle(colors)}>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={() => toggle(r._id)}
                      style={{ accentColor: colors.entityTypes.prospect }}
                    />
                  </td>
                  <td style={tdStyle(colors)}>
                    <div style={{ color: colors.text.primary, fontWeight: 500 }}>
                      {r.companyName ?? r.companyNumber}
                      {r.alreadyInBook && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: colors.accent.blue }}>● in book</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>
                      {r.town ?? ""}{r.recentProperty ? ` · ${String(r.recentProperty).slice(0, 60)}` : ""}
                    </div>
                  </td>
                  <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                    {r.companyNumber}
                  </td>
                  <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace" }}>
                    {(r.sicCodes ?? []).join(", ") || "—"}
                  </td>
                  <td style={tdStyle(colors)}>
                    {r.chargeCount}{r.outstandingCount > 0 ? ` (${r.outstandingCount} out)` : ""}
                  </td>
                  <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                    {r.latestChargeDate ?? "—"}
                  </td>
                  <td style={{ ...tdStyle(colors), whiteSpace: "nowrap", textAlign: "right" }}>
                    {triaged ? (
                      r.sourcingState === "promoted" ? (
                        <button
                          onClick={() => r.promotedToClientId && router.push(`/prospects/${r.promotedToClientId}`)}
                          style={btnStyle(colors.accent.green, false)}
                        >
                          ✓ prospect
                        </button>
                      ) : (
                        <button onClick={() => doDismiss(r)} disabled={busy} style={btnStyle(colors.bg.cardAlt, busy, colors.text.muted)}>
                          dismissed — undo
                        </button>
                      )
                    ) : (
                      <>
                        <button onClick={() => doPromote(r)} disabled={busy} style={{ ...btnStyle(colors.accent.green, busy), marginRight: 6 }}>
                          <UserPlus size={11} /> Add to pipeline
                        </button>
                        <button onClick={() => doDismiss(r)} disabled={busy} style={btnStyle(colors.bg.cardAlt, busy, colors.text.muted)}>
                          <X size={11} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── shared inline styles (match NewTab / prospects tabs) ──────────────────
function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}
function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
function labelStyle(colors: any) {
  return {
    fontFamily: "ui-monospace, monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
  };
}
function inputStyle(colors: any, width?: number) {
  return {
    padding: "6px 10px",
    fontSize: 11,
    borderRadius: 3,
    border: `1px solid ${colors.border.default}`,
    background: colors.bg.base,
    color: colors.text.primary,
    width: width ?? undefined,
    flex: width ? undefined : 1,
  };
}
function btnStyle(bg: string, busy: boolean, color = "#ffffff") {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 12px",
    background: bg,
    color,
    border: "none",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
}
function checkLabel(colors: any) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    color: colors.text.secondary,
    cursor: "pointer",
  };
}
