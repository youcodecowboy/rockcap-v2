"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";

/**
 * Knowledge tab — the curated knowledge lane on a prospect.
 *
 * Two sections:
 *  1. Operator knowledge / context — the running `contextMarkdown` reference
 *     (clientIntelligence.contextMarkdown), editable via `addClientUpdate`. This
 *     is the operator's own custom knowledge, and it is ALREADY surfaced by
 *     prospect.getDeepContext, so anything added here is used as context
 *     downstream (deep-context tools, skills).
 *  2. Extracted facts — read-only view of the structured `knowledgeItems` the AI
 *     skills (prospect-intel) and operator have captured (lender DNA,
 *     classification, related entities). Now also returned by getDeepContext.
 *
 * The editable lane is intentionally a plain text box (operator knowledge is
 * free-form). Structured facts are added by skills, not hand-typed here.
 */
export function KnowledgeTab({ prospect }: { prospect: any }) {
  const colors = useColors();
  const clientId = prospect?._id as Id<"clients">;

  const intel = useQuery(api.intelligence.getClientIntelligence, clientId ? { clientId } : "skip");
  const facts = useQuery(api.knowledgeLibrary.getKnowledgeItemsByClient, clientId ? { clientId } : "skip");
  const addUpdate = useMutation(api.intelligence.addClientUpdate);

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const contextMarkdown: string | undefined = (intel as any)?.contextMarkdown;
  const updatedAt: string | undefined = (intel as any)?.contextMarkdownUpdatedAt;

  const handleSave = async () => {
    const update = draft.trim();
    if (!update || saving) return;
    setSaving(true);
    try {
      await addUpdate({ clientId, update });
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  // Group extracted facts by category for display.
  const byCategory = new Map<string, any[]>();
  for (const f of (facts as any[]) ?? []) {
    const cat = f.category || "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(f);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Section 1: Operator knowledge / context ── */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: colors.text.primary }}>Operator knowledge</h2>
        <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2, marginBottom: 12 }}>
          What you know about this prospect. Added here, it feeds the AI&apos;s context everywhere (deep context, drafting, skills).
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="e.g. Spoke to Garry — wants to keep Investec for senior but open to mezz on Keith Grove. Prefers email over calls."
            style={{
              width: "100%", padding: "10px 12px", fontSize: 13, lineHeight: 1.5, borderRadius: 6, resize: "vertical",
              border: `1px solid ${colors.border.default}`, background: colors.bg.light, color: colors.text.primary, outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleSave}
              disabled={!draft.trim() || saving}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none",
                background: draft.trim() && !saving ? colors.entityTypes.prospect : colors.border.default,
                color: draft.trim() && !saving ? "#fff" : colors.text.dim,
                cursor: draft.trim() && !saving ? "pointer" : "default",
              }}
            >
              {saving ? "Saving…" : "Add knowledge"}
            </button>
          </div>
        </div>

        {intel === undefined && (
          <div style={{ fontSize: 13, color: colors.text.muted }}>Loading…</div>
        )}

        {intel !== undefined && !contextMarkdown && (
          <div style={{
            border: `1px dashed ${colors.border.default}`, borderRadius: 8,
            padding: "24px", textAlign: "center", color: colors.text.muted, fontSize: 13,
          }}>
            No operator knowledge captured yet. Add what you know above — it becomes part of the prospect&apos;s context.
          </div>
        )}

        {contextMarkdown && (
          <div style={{
            background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 6,
            padding: 18, color: colors.text.primary, fontSize: 13, lineHeight: 1.6,
          }}>
            {updatedAt && (
              <div style={{ fontSize: 10, color: colors.text.dim, marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>
                Updated {new Date(updatedAt).toLocaleString("en-GB")}
              </div>
            )}
            <Prose colors={colors}>{contextMarkdown}</Prose>
          </div>
        )}
      </section>

      {/* ── Section 2: Extracted facts (read-only) ── */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: colors.text.primary }}>Extracted facts</h2>
        <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2, marginBottom: 12 }}>
          Structured facts captured by the intel skills and saved against this prospect.
        </div>

        {facts === undefined && <div style={{ fontSize: 13, color: colors.text.muted }}>Loading…</div>}

        {facts && facts.length === 0 && (
          <div style={{
            border: `1px dashed ${colors.border.default}`, borderRadius: 8,
            padding: "24px", textAlign: "center", color: colors.text.muted, fontSize: 13,
          }}>
            No structured facts yet. Run prospect-intel, or capture facts via the assistant.
          </div>
        )}

        {byCategory.size > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[...byCategory.entries()].map(([cat, items]) => (
              <div key={cat}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: colors.text.muted, marginBottom: 6, fontFamily: "ui-monospace, monospace",
                }}>{cat}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, background: colors.border.default, borderRadius: 6, overflow: "hidden" }}>
                  {items.map((f: any) => (
                    <div key={f._id} style={{ background: colors.bg.card, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{f.label}</span>
                        <span style={{
                          fontSize: 9, color: colors.text.dim, fontFamily: "ui-monospace, monospace",
                          whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em",
                        }}>{sourceLabel(f.sourceType)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: colors.text.secondary, marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(f.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function sourceLabel(sourceType?: string): string {
  switch (sourceType) {
    case "ai_extraction": return "AI";
    case "manual": return "operator";
    case "document": return "document";
    case "data_library": return "data library";
    case "checklist": return "checklist";
    default: return sourceType || "";
  }
}

function renderValue(value: any): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

// Compact markdown renderer for the operator-context log. A trimmed cousin of
// IntelTab's renderer — same inline-styled, data-dense CRM voice, fewer element
// types (operator notes are prose + bullets, not tables/charts).
function Prose({ children, colors }: { children: string; colors: any }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 500, margin: "12px 0 8px", color: colors.text.primary }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: 13, fontWeight: 600, margin: "16px 0 6px", color: colors.text.primary, fontFamily: "ui-monospace, monospace" }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: 12, fontWeight: 600, margin: "12px 0 4px", color: colors.text.primary }}>{children}</h3>,
        p: ({ children }) => <p style={{ margin: "6px 0", color: colors.text.primary }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: "6px 0 6px 4px", paddingLeft: 18 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "6px 0 6px 4px", paddingLeft: 22 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: "italic", color: colors.text.secondary }}>{children}</em>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: colors.accent.blue, textDecoration: "underline", textUnderlineOffset: 2 }}>{children}</a>
        ),
        hr: () => <hr style={{ border: "none", borderTop: `1px solid ${colors.border.light}`, margin: "14px 0" }} />,
        code: ({ children }) => (
          <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, background: colors.bg.cardAlt, padding: "1px 5px", borderRadius: 3 }}>{children}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
