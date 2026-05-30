// src/lib/docgen/houseStyle.ts
// Wraps a document body in RockCap's house style. The SAME wrapped HTML feeds
// every renderer (PDF, DOCX), so all formats share one look.

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// RockCap house style. Kept intentionally conservative: system serif body,
// monospace labels echoing the app, A4-friendly spacing. v2 templates may
// override this; for v1 it is the single source of document styling.
export const HOUSE_STYLE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main.doc {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11pt; line-height: 1.5;
    max-width: 720px; margin: 0 auto; padding: 8px 0;
  }
  main.doc h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -0.01em; }
  main.doc h2 { font-size: 13pt; margin: 20px 0 6px; border-bottom: 1px solid #d9d9d9; padding-bottom: 3px; }
  main.doc h3 { font-size: 11pt; margin: 14px 0 4px; }
  main.doc p { margin: 0 0 8px; }
  main.doc .label {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b;
  }
  main.doc table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
  main.doc th, main.doc td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
  main.doc th { font-family: ui-monospace, monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6b6b; }
`;

export function wrapInHouseStyle(bodyHtml: string, opts: { title: string }): string {
  return (
    "<!doctype html>" +
    `<html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(opts.title)}</title>` +
    `<style>${HOUSE_STYLE_CSS}</style>` +
    `</head><body><main class="doc">${bodyHtml}</main></body></html>`
  );
}
