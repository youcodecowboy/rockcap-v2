"use client";

import { useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";

// Render a relative age like "3 days ago" / "today" from an ISO timestamp.
function ageLabel(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms)) return "unknown";
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Intel-freshness banner: last full intel age, last re-validate verdict, and a
// re-check / dismiss affordance when the client carries an intel-attention flag
// (Trigger A meeting+stale, or a materially_changed re-validation). Reads the
// client doc via intelRun.linkedClientId (the page only passes the run); renders
// nothing if the run isn't linked to a client.
function IntelFreshnessBanner({ clientId }: { clientId: Id<"clients"> }) {
  const colors = useColors();
  const client = useQuery(api.prospects.getById, { clientId });
  const requestRevalidate = useMutation(api.intelRevalidate.requestRevalidate);
  const clearAttention = useMutation(api.intelRevalidate.clearIntelAttention);
  const [busy, setBusy] = useState(false);

  if (!client) return null;
  const c = client as any;

  const lastFullIntelAt: string | undefined = c.lastFullIntelAt;
  const lastIntelRevalidateAt: string | undefined = c.lastIntelRevalidateAt;
  const lastIntelResult: string | undefined = c.lastIntelResult;
  const attentionActive = !!c.intelAttentionAt && !c.intelAttentionClearedAt;
  const attentionReason: string | undefined = c.intelAttentionReason;

  const reasonLabel =
    attentionReason === "meeting_booked_stale"
      ? "Meeting booked and intel is over a week old — refresh before the meeting."
      : attentionReason === "revalidate_materially_changed"
        ? "Re-validation found a material change — review before the next touch."
        : "Intel needs a refresh.";

  return (
    <div
      style={{
        background: attentionActive ? colors.bg.light : colors.bg.cardAlt,
        border: `1px solid ${attentionActive ? colors.accent.yellow : colors.border.default}`,
        borderRadius: 4,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 220 }}>
        <span style={{ color: colors.text.secondary }}>
          Full intel:{" "}
          <strong style={{ color: colors.text.primary }}>{ageLabel(lastFullIntelAt)}</strong>
        </span>
        {lastIntelRevalidateAt && (
          <span style={{ color: colors.text.muted }}>
            Last re-check: {ageLabel(lastIntelRevalidateAt)}
            {lastIntelResult ? ` — ${lastIntelResult === "materially_changed" ? "materially changed" : "still valid"}` : ""}
          </span>
        )}
        {attentionActive && (
          <span style={{ color: colors.text.primary, fontWeight: 500 }}>⚠ {reasonLabel}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await requestRevalidate({ clientId });
            } finally {
              setBusy(false);
            }
          }}
          style={{
            background: colors.accent.blue,
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "6px 12px",
            fontSize: 12,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Starting…" : attentionActive ? "Re-validate" : "Run quick re-check"}
        </button>
        {attentionActive && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await clearAttention({ clientId });
              } finally {
                setBusy(false);
              }
            }}
            style={{
              background: "transparent",
              color: colors.text.secondary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              padding: "6px 12px",
              fontSize: 12,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

// Generated structure charts are embedded as data:image/svg+xml by the
// corporate-structure skill. That content is system-generated (no scripts),
// so allow it through; everything else uses react-markdown's safe default.
function allowSvgDataUri(url: string): string {
  if (url.startsWith("data:image/svg+xml,") || url.startsWith("data:image/svg+xml;")) return url;
  return defaultUrlTransform(url);
}

// Intel tab renders the skillRun.intelMarkdown field — a long-form markdown
// artefact produced by hardened skills (prospect-intel v2, qualify-and-draft,
// lender-intel). The renderer hand-styles each element type with inline
// styles to match the rest of the prospects CRM (no Tailwind prose plugin
// in scope; we want the styling to read alongside the data-dense tables and
// monospace metadata, not as standalone editorial content). GFM extension
// gives us table support — Identity/Lender DNA sections rely on it.

export function IntelTab({ intelRun }: { intelRun?: any }) {
  const colors = useColors();
  const content =
    intelRun?.intelMarkdown ??
    intelRun?.brief ??
    "No intel report yet. The skill may not have run, or may not have produced an intelMarkdown field.";

  // The page passes only the run; derive the client for the freshness banner
  // from the run's back-reference. Renders nothing if the run isn't linked.
  const linkedClientId = intelRun?.linkedClientId as Id<"clients"> | undefined;

  return (
    <div
      style={{
        background: colors.bg.card,
        padding: 24,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        color: colors.text.primary,
        fontSize: 13,
        lineHeight: 1.65,
      }}
    >
      {linkedClientId && <IntelFreshnessBanner clientId={linkedClientId} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={allowSvgDataUri}
        components={{
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: 22,
                fontWeight: 300,
                marginTop: 0,
                marginBottom: 16,
                color: colors.text.primary,
                borderBottom: `1px solid ${colors.border.default}`,
                paddingBottom: 12,
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: 14,
                fontWeight: 500,
                marginTop: 28,
                marginBottom: 10,
                color: colors.text.primary,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                paddingBottom: 6,
                borderBottom: `1px solid ${colors.border.light}`,
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 13,
                fontWeight: 500,
                marginTop: 18,
                marginBottom: 8,
                color: colors.text.primary,
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p style={{ margin: "8px 0", color: colors.text.primary }}>
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                margin: "8px 0 8px 4px",
                paddingLeft: 18,
                color: colors.text.primary,
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                margin: "8px 0 8px 4px",
                paddingLeft: 22,
                color: colors.text.primary,
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ margin: "3px 0" }}>{children}</li>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: colors.text.primary }}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: "italic", color: colors.text.secondary }}>
              {children}
            </em>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: colors.accent.blue,
                textDecoration: "underline",
                textDecorationThickness: 1,
                textUnderlineOffset: 2,
              }}
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: `3px solid ${colors.accent.yellow}`,
                background: colors.bg.light,
                margin: "12px 0",
                padding: "10px 14px",
                fontSize: 11,
                color: colors.text.secondary,
                borderRadius: "0 4px 4px 0",
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 11,
                    background: colors.bg.cardAlt,
                    padding: "1px 5px",
                    borderRadius: 3,
                    border: `1px solid ${colors.border.light}`,
                    color: colors.text.primary,
                  }}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  color: colors.text.primary,
                }}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              style={{
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
                padding: 12,
                borderRadius: 4,
                overflow: "auto",
                margin: "10px 0",
                fontSize: 11,
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "10px 0" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  border: `1px solid ${colors.border.default}`,
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: "left",
                padding: "6px 10px",
                background: colors.bg.cardAlt,
                borderBottom: `1px solid ${colors.border.default}`,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontWeight: 500,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: colors.text.muted,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "6px 10px",
                borderBottom: `1px solid ${colors.border.light}`,
                color: colors.text.primary,
                verticalAlign: "top",
              }}
            >
              {children}
            </td>
          ),
          hr: () => (
            <hr
              style={{
                border: "none",
                borderTop: `1px solid ${colors.border.default}`,
                margin: "20px 0",
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
