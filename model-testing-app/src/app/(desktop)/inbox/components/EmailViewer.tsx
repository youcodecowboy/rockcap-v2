'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useColors } from '@/lib/useColors';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Email body viewer.
//
// Emails arrive as either real HTML (rich formatting, the common case) or
// plain text (older rows / text-only senders). Two problems to solve:
//   1. Render HTML safely + with proper formatting, not as a wall of text.
//   2. Fold the quoted reply-history trail so each message shows just its
//      new content — that trail is what makes long chains unreadable.
//
// HTML is rendered inside a sandboxed iframe (sandbox WITHOUT allow-scripts
// → no JS in the email can ever run). We render on a white surface (emails
// assume light backgrounds) regardless of app theme, like Gmail's dark mode.
// Quote separation is done in the trusted parent via DOMParser (which never
// executes scripts or loads resources) before the cleaned HTML is handed to
// the iframe.

interface EmailViewerProps {
  html?: string | null;
  text?: string | null;
}

// ── Plain-text helpers ───────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linkify(escaped: string): string {
  return escaped.replace(
    /\b(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
}

// Split plain text into the new content vs the quoted reply history. The
// quoted block starts at the first attribution line ("On … wrote:",
// "-----Original Message-----", "From: …") or the first run of ">"-prefixed
// lines.
function splitPlainQuote(text: string): { main: string; quoted: string } {
  const lines = text.split('\n');
  const markers = [
    /^\s*On .*wrote:\s*$/,
    /^\s*-----\s*Original Message\s*-----/i,
    /^\s*_{5,}\s*$/,
    /^\s*From:\s.+/,
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (markers.some((re) => re.test(line))) {
      return { main: lines.slice(0, i).join('\n').trim(), quoted: lines.slice(i).join('\n').trim() };
    }
    // A block of consecutive ">" quotes (and we're past some real content).
    if (/^\s*>/.test(line) && i > 0) {
      return { main: lines.slice(0, i).join('\n').trim(), quoted: lines.slice(i).join('\n').trim() };
    }
  }
  return { main: text.trim(), quoted: '' };
}

function plainToHtml(text: string): string {
  return linkify(escapeHtml(text))
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

// ── HTML helpers (run in the trusted parent; DOMParser does not execute) ──
const QUOTE_SELECTORS = [
  '.gmail_quote',
  'blockquote.gmail_quote',
  'blockquote[type="cite"]',
  'div.gmail_extra',
  '#appendonsend',
  '.moz-cite-prefix',
];

function splitHtmlQuote(html: string): { mainHtml: string; hasQuote: boolean } {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { mainHtml: html, hasQuote: false };
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let removed = false;
    for (const sel of QUOTE_SELECTORS) {
      doc.querySelectorAll(sel).forEach((node) => {
        node.remove();
        removed = true;
      });
    }
    const mainHtml = doc.body?.innerHTML?.trim() || html;
    return { mainHtml, hasQuote: removed };
  } catch {
    return { mainHtml: html, hasQuote: false };
  }
}

function buildSrcDoc(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank">
<style>
  html,body{margin:0;padding:0;background:#ffffff;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;word-wrap:break-word;overflow-wrap:break-word;-webkit-text-size-adjust:100%;}
  img{max-width:100%!important;height:auto;}
  a{color:#2563eb;}
  blockquote{margin:0 0 0 4px;padding-left:12px;border-left:2px solid #e0e0e0;color:#6b6b6b;}
  table{max-width:100%!important;}
  pre{white-space:pre-wrap;word-wrap:break-word;}
  *{max-width:100%;box-sizing:border-box;}
</style></head><body>${bodyHtml}</body></html>`;
}

// ── Sandboxed iframe with auto-height ────────────────────────
function HtmlFrame({ srcDoc }: { srcDoc: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
          if (h > 0) setHeight(h + 8);
        }
      } catch {
        /* cross-origin guard — shouldn't happen with allow-same-origin */
      }
    };
    const onLoad = () => {
      measure();
      // Re-measure as images load and reflow the body.
      try {
        const imgs = iframe.contentDocument?.images;
        if (imgs) for (const img of Array.from(imgs)) img.addEventListener('load', measure);
      } catch { /* noop */ }
      // Safety re-measure for late layout.
      setTimeout(measure, 400);
      setTimeout(measure, 1200);
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      // No allow-scripts → email JS can never run. allow-same-origin lets the
      // parent measure height; allow-popups lets links open in a new tab.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{
        width: '100%',
        height,
        border: 'none',
        borderRadius: 8,
        background: '#ffffff',
        display: 'block',
      }}
      title="Email content"
    />
  );
}

export default function EmailViewer({ html, text }: EmailViewerProps) {
  const colors = useColors();
  const [showQuoted, setShowQuoted] = useState(false);

  const model = useMemo(() => {
    if (html && html.trim()) {
      const { mainHtml, hasQuote } = splitHtmlQuote(html);
      return {
        kind: 'html' as const,
        mainSrc: buildSrcDoc(mainHtml),
        fullSrc: buildSrcDoc(html),
        hasQuote,
      };
    }
    const plain = (text ?? '').trim();
    if (!plain) return { kind: 'empty' as const };
    const { main, quoted } = splitPlainQuote(plain);
    return {
      kind: 'text' as const,
      mainHtml: plainToHtml(main || plain),
      quotedHtml: quoted ? plainToHtml(quoted) : '',
      hasQuote: !!quoted,
    };
  }, [html, text]);

  if (model.kind === 'empty') {
    return (
      <p className="text-sm italic" style={{ color: colors.text.muted }}>
        (no message body)
      </p>
    );
  }

  const ToggleButton = ({ hasQuote }: { hasQuote: boolean }) =>
    hasQuote ? (
      <button
        onClick={() => setShowQuoted((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
        style={{
          color: colors.text.secondary,
          background: colors.bg.light,
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {showQuoted ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
      </button>
    ) : null;

  if (model.kind === 'html') {
    return (
      <div>
        <HtmlFrame srcDoc={showQuoted ? model.fullSrc : model.mainSrc} />
        <ToggleButton hasQuote={model.hasQuote} />
      </div>
    );
  }

  // Plain text
  return (
    <div>
      <div
        className="text-sm leading-relaxed email-plain"
        style={{ color: colors.text.primary }}
        dangerouslySetInnerHTML={{ __html: model.mainHtml }}
      />
      {showQuoted && model.quotedHtml && (
        <div
          className="text-sm leading-relaxed mt-3 pl-3"
          style={{ color: colors.text.muted, borderLeft: `2px solid ${colors.border.default}` }}
          dangerouslySetInnerHTML={{ __html: model.quotedHtml }}
        />
      )}
      <ToggleButton hasQuote={model.hasQuote} />
    </div>
  );
}
