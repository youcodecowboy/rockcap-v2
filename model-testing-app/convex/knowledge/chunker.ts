// Prose chunking — pure, deterministic helpers (no Convex, no I/O).
//
// The narrative dual index (spec §3.4) stores atoms (short fact statements)
// AND chunks (the surrounding prose) so retrieval can quote nuance the atoms
// flatten away. Atoms come from the atomizer; chunks come from HERE. Both are
// disposable derivatives of ONE document revision — see documentChunks in
// schema.ts and upsertChunks in atomsCore.ts (delete-and-recreate).
//
// This module answers two questions and nothing else, so it stays unit-pure
// and reusable by the harness pass, the re-atomization lane, and the backfill:
//   1. isProseDocument — is this classification a NARRATIVE document whose
//      nuance is worth chunking (vs a spreadsheet / fact-dense tabular type)?
//   2. chunkProseText — split extracted text into heading/paragraph-aware
//      chunks with locators, ready to hand to upsertChunks.

// ── Policy constants ──

/** Below this, extracted text is a stub (title page, "[Legacy .doc …]"
 * placeholder, a caption) — not enough narrative to be worth a chunk. */
export const MIN_PROSE_CHARS = 400;

/** Target chunk size — the spec's ~250-400 words. Retrieval quality wants
 * chunks big enough to carry an argument, small enough to stay specific. */
export const TARGET_WORDS = 320;

/** A trailing fragment smaller than this is merged back into the prior chunk
 * rather than emitted alone (a lone 20-word tail embeds poorly). */
export const MIN_CHUNK_WORDS = 110;

/** Overlap carried from the end of the previous chunk into the next — "a
 * sentence or two" so a fact split across a boundary stays retrievable from
 * either side. Presentation only: it does NOT count against the word budget,
 * so it can never inflate the chunk COUNT. */
export const OVERLAP_WORDS = 45;

/** Mirrors atomsCore MAX_CHUNKS (300) — upsertChunks throws above it. We size
 * chunks adaptively so a very long document still lands at or under the cap
 * instead of losing its tail. */
export const CHUNK_HARD_CAP = 300;

export type ChunkLocator = { page?: number; section?: string };
export type ProseChunk = {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  locator?: ChunkLocator;
};

// ── isProseDocument ──
//
// Prose is defined by EXCLUSION plus a length floor: everything narrative
// qualifies unless it is a known spreadsheet / fact-dense tabular type. An
// exclusion policy (rather than a whitelist of prose types) means a new
// narrative fileType chunks automatically the day it is added to the taxonomy,
// while the handful of genuinely tabular types stay out. Keys off the REAL
// Dark Mills taxonomy values (src/v4/lib/placement-rules.ts) and the parser's
// mime types (src/lib/fileProcessor.ts).

/** Categories whose members are tabular/numeric/image — never prose.
 * NOTE: "Appraisals" is deliberately NOT here — the category mixes spreadsheet
 * models (excluded by fileType/mime below) with narrative RedBook Valuation
 * PDFs, whose assumptions/caveats are exactly what chunking exists for. */
const NON_PROSE_CATEGORIES = new Set<string>([
  "Financial Documents", // bank statements / accounts — tabular
  "Plans", // drawings
  "Photographs", // images
]);

/** Specific fileTypes that are tabular/numeric/image even though their
 * category is otherwise prose-ish (e.g. a comparison TABLE under Loan Terms). */
const NON_PROSE_FILE_TYPES = new Set<string>([
  // Appraisal-genre workbooks
  "Client Land Appraisal",
  "RockCap Appraisal Model",
  "Appraisal",
  "Cashflow",
  // Comparison / schedule grids
  "Lender Comparison Sheet",
  "Lender Comparison Table",
  "Accommodation Schedule",
  "Comparable Schedule",
  "Comparables",
  // Numeric statements
  "Bank Statement",
  "Tax Return",
  "Loan Statement",
  "Redemption Statement",
  "Completion Statement",
  // Drawings / imagery
  "Architect Drawing Pack",
]);

/** Mime substrings that mark a spreadsheet / csv payload. */
const SPREADSHEET_MIME_HINTS = [
  "spreadsheet", // openxml + google-apps spreadsheet
  "csv",
  "ms-excel",
];

function normType(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * True when a classified document is narrative prose worth chunking.
 * Excludes spreadsheets / csv / fact-dense tabular types and anything without
 * substantive extracted text.
 */
export function isProseDocument(args: {
  category?: string | null;
  fileType?: string | null; // classification fileTypeDetected
  mimeType?: string | null; // driveFiles.mimeType ?? documents.fileType
  textLength: number;
}): boolean {
  if (args.textLength < MIN_PROSE_CHARS) return false;

  const mime = normType(args.mimeType).toLowerCase();
  if (SPREADSHEET_MIME_HINTS.some((h) => mime.includes(h))) return false;

  if (NON_PROSE_FILE_TYPES.has(normType(args.fileType))) return false;
  if (NON_PROSE_CATEGORIES.has(normType(args.category))) return false;

  return true;
}

// ── textFallbackChecksum ──
//
// Documents ingested outside the Drive hydration lane never get a byte-level
// contentChecksum stamped (driveHydration is the only writer), yet many carry
// perfectly good textContent. Chunks only need the checksum as a REVISION
// stamp, so for those docs we derive one from the text itself. The "text-"
// prefix keeps it distinguishable from Drive byte checksums; when hydration
// later stamps the real one, upsertChunks' delete-and-recreate refreshes the
// chunks under the new stamp automatically.

/** Stable FNV-1a (32-bit) hex checksum over extracted text. */
export function textFallbackChecksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `text-fnv1a:${(h >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

// ── chunkProseText ──

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Split a run of prose into sentences (best-effort; keeps the delimiter). */
function splitSentences(s: string): string[] {
  const parts = s.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return parts ? parts.map((p) => p.trim()).filter(Boolean) : [];
}

/** Last ~n words' worth of trailing sentences, for cross-boundary overlap. */
function trailingOverlap(text: string, maxWords: number): string {
  const sentences = splitSentences(text);
  const picked: string[] = [];
  let words = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const w = countWords(sentences[i]);
    if (picked.length > 0 && words + w > maxWords) break;
    picked.unshift(sentences[i]);
    words += w;
    if (words >= maxWords) break;
  }
  return picked.join(" ");
}

/** A heading is a short, non-terminated line — a numbered clause ("4.2"),
 * an ALL-CAPS banner, or a compact Title-Case label. Best-effort: a false
 * positive only mislabels a chunk's section locator, never drops text. */
function asHeading(line: string): string | undefined {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t || t.length > 90) return undefined;
  if (/[.!?,;:]$/.test(t)) return undefined;
  const words = t.split(" ");
  if (words.length > 12) return undefined;
  // Numbered / lettered clause headings: "4", "4.2", "4.2.1", "A.", "(a)".
  if (/^(?:\d+(?:\.\d+)*\.?|[A-Z]\.|\([a-z0-9]+\))\s*\S/.test(t)) return t;
  if (/^(?:\d+(?:\.\d+)*)$/.test(t)) return undefined; // a bare number is a page/figure ref, not a heading
  // ALL CAPS banner (allow digits & common punctuation).
  if (/^[A-Z0-9][A-Z0-9 '&\-\/,()]+$/.test(t) && /[A-Z]/.test(t)) return t;
  // Compact Title Case with no trailing punctuation.
  if (words.length <= 8 && /^[A-Z]/.test(t) && !/[a-z]{1,2}\b\s[a-z]/.test(t)) {
    const capish = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
    if (capish >= Math.ceil(words.length * 0.6)) return t;
  }
  return undefined;
}

type PageBody = { page?: number; body: string };

/** Segment extracted text into pages when the parser left page markers:
 * form-feed characters (\f) first, else repeated "Page N" lines. Absent any
 * marker the whole document is one page-less body (locator.page omitted). */
function splitPages(text: string): PageBody[] {
  if (text.includes("\f")) {
    return text.split("\f").map((body, i) => ({ page: i + 1, body }));
  }
  const re =
    /(?:^|\n)[ \t]*(?:[-–—=]{0,4}\s*)?[Pp]age\s+(\d+)(?:\s+of\s+\d+)?[ \t]*(?:[-–—=]{0,4})?[ \t]*(?=\n|$)/g;
  const marks: Array<{ pos: number; end: number; page: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    marks.push({ pos: m.index, end: re.lastIndex, page: parseInt(m[1], 10) });
  }
  if (marks.length < 2) return [{ page: undefined, body: text }];
  const out: PageBody[] = [];
  if (marks[0].pos > 0) {
    out.push({ page: undefined, body: text.slice(0, marks[0].pos) });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].end;
    const stop = i + 1 < marks.length ? marks[i + 1].pos : text.length;
    out.push({ page: marks[i].page, body: text.slice(start, stop) });
  }
  return out;
}

type Para = { text: string; page?: number; section?: string; words: number };

/**
 * Deterministic heading/paragraph-aware chunker. Returns chunks of roughly
 * TARGET_WORDS words each, with a sentence-or-two overlap between neighbours,
 * a token estimate (~words × 1.3), and a locator carrying the nearest heading
 * (section) and page when derivable. Total chunks never exceed CHUNK_HARD_CAP.
 */
export function chunkProseText(raw: string): ProseChunk[] {
  const norm = raw.replace(/\r\n?/g, "\n");
  const pages = splitPages(norm);

  // Flatten to an ordered paragraph stream, tagging each with its page and the
  // section heading in force at that point (headings carry across pages).
  const paras: Para[] = [];
  let section: string | undefined;
  let totalWords = 0;
  for (const pg of pages) {
    for (const block of pg.body.split(/\n\s*\n/)) {
      const cleaned = block.replace(/\f/g, "").replace(/[ \t]+\n/g, "\n").trim();
      if (!cleaned) continue;
      const heading = asHeading(cleaned);
      if (heading) {
        section = heading;
        // Keep the heading line in the body too, so the chunk reads naturally.
      }
      const words = countWords(cleaned);
      totalWords += words;
      paras.push({ text: cleaned, page: pg.page, section, words });
    }
  }
  if (paras.length === 0) return [];

  // Adaptive target: grow chunk size so a very long document still fits under
  // the cap. Overlap is presentation-only and never counts here, so bounding
  // consumed source words per chunk bounds the chunk count.
  const targetWords = Math.max(
    TARGET_WORDS,
    Math.ceil(totalWords / (CHUNK_HARD_CAP - 1)),
  );

  type Draft = { bodies: string[]; page?: number; section?: string; words: number };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  for (const p of paras) {
    if (cur === null) {
      cur = { bodies: [p.text], page: p.page, section: p.section, words: p.words };
      continue;
    }
    cur.bodies.push(p.text);
    cur.words += p.words;
    if (cur.words >= targetWords) {
      drafts.push(cur);
      cur = null;
    }
  }
  if (cur !== null) drafts.push(cur);

  // Merge a runt tail into its predecessor (a lone fragment embeds poorly).
  if (
    drafts.length > 1 &&
    drafts[drafts.length - 1].words < MIN_CHUNK_WORDS
  ) {
    const tail = drafts.pop()!;
    const prev = drafts[drafts.length - 1];
    prev.bodies.push(...tail.bodies);
    prev.words += tail.words;
  }

  // Materialize: prepend cross-boundary overlap, estimate tokens, attach locator.
  const chunks: ProseChunk[] = [];
  let prevBody = "";
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const body = d.bodies.join("\n\n");
    const overlap = i > 0 ? trailingOverlap(prevBody, OVERLAP_WORDS) : "";
    const text = overlap ? `${overlap}\n\n${body}` : body;
    const locator: ChunkLocator = {};
    if (typeof d.page === "number") locator.page = d.page;
    if (d.section) locator.section = d.section.slice(0, 200);
    chunks.push({
      chunkIndex: i,
      text,
      tokenCount: Math.round(countWords(text) * 1.3),
      ...(locator.page !== undefined || locator.section !== undefined
        ? { locator }
        : {}),
    });
    prevBody = body;
  }
  return chunks;
}
