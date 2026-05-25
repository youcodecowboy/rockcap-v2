"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useColors } from "@/lib/useColors";

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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
