'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// Module-level caches: parsed workbook + rendered HTML dimensions.
// Bump CACHE_VERSION whenever the renderer output changes so old cached HTML is dropped.
const CACHE_VERSION = 'v15';
// We now parse with BOTH engines for the ExcelJS path: ExcelJS for styling
// (fonts, fills, borders, themes, images), SheetJS as a value-recovery
// fallback for cells where ExcelJS loses the cached <v> tag during parse.
type CacheEntry =
  | { engine: 'exceljs'; workbook: ExcelJSWorkbook; sheetJs?: XLSX.WorkBook }
  | { engine: 'sheetjs'; workbook: XLSX.WorkBook; sheetJs?: undefined };
const workbookCache = new Map<string, CacheEntry>();
const htmlCache = new Map<string, { html: string; capped: { shown: number; total: number } | null }>();
const sizeCache = new Map<string, { width: number; height: number }>();

const ROW_CAP = 500;

type Engine = 'exceljs' | 'sheetjs';
type Status = 'loading' | 'rendered' | 'error';

interface XlsxPreviewProps {
  fileUrl: string;
  zoom?: number;
}

export default function XlsxPreview({ fileUrl, zoom = 1 }: XlsxPreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [engine, setEngine] = useState<Engine | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [cappedInfo, setCappedInfo] = useState<{ shown: number; total: number } | null>(null);
  const workbookRef = useRef<unknown>(null);
  // SheetJS workbook held alongside the primary ExcelJS workbook for value
  // recovery (cells where ExcelJS loses the cached value during parse).
  const sheetJsWbRef = useRef<XLSX.WorkBook | null>(null);

  // ─── Load + parse workbook (ExcelJS primary, SheetJS fallback) ───────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setEngine(null);
    setSheetNames([]);
    setActiveSheet(null);
    setDims(null);
    setCappedInfo(null);
    workbookRef.current = null;
    sheetJsWbRef.current = null;

    const cached = workbookCache.get(fileUrl);
    if (cached) {
      workbookRef.current = cached.workbook;
      sheetJsWbRef.current = cached.sheetJs ?? null;
      setEngine(cached.engine);
      const names =
        cached.engine === 'exceljs'
          ? (cached.workbook as ExcelJSWorkbook).worksheets.map(ws => ws.name)
          : (cached.workbook as XLSX.WorkBook).SheetNames;
      setSheetNames(names);
      setActiveSheet(names[0] ?? null);
      setStatus('rendered');
      return;
    }

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        // Attempt ExcelJS first
        try {
          const ExcelJSMod = await import('exceljs');
          if (cancelled) return;
          const wb = new ExcelJSMod.Workbook();
          await wb.xlsx.load(buf);
          if (cancelled) return;

          // Also parse with SheetJS for value recovery on cells where ExcelJS
          // loses the cached <v> tag (some formula cell sub-types). cellFormula:
          // false skips formula text parsing — we only want the cached values.
          let sheetJsWb: XLSX.WorkBook | undefined;
          try {
            sheetJsWb = XLSX.read(buf, { type: 'array', cellFormula: false, cellHTML: false });
          } catch (sjsErr) {
            console.warn('[XlsxPreview] SheetJS parallel parse failed (non-fatal):', sjsErr);
          }
          if (cancelled) return;

          workbookCache.set(fileUrl, { engine: 'exceljs', workbook: wb, sheetJs: sheetJsWb });
          workbookRef.current = wb;
          sheetJsWbRef.current = sheetJsWb ?? null;
          setEngine('exceljs');
          const names = wb.worksheets.map(ws => ws.name);
          setSheetNames(names);
          setActiveSheet(names[0] ?? null);
          setStatus('rendered');
          return;
        } catch (excelJsErr) {
          console.warn('[XlsxPreview] ExcelJS failed, falling back to SheetJS:', excelJsErr);
        }

        // Fallback: SheetJS only
        const wb = XLSX.read(buf, { type: 'array' });
        if (cancelled) return;
        workbookCache.set(fileUrl, { engine: 'sheetjs', workbook: wb });
        workbookRef.current = wb;
        setEngine('sheetjs');
        setSheetNames(wb.SheetNames);
        setActiveSheet(wb.SheetNames[0] ?? null);
        setStatus('rendered');
      } catch (err) {
        if (cancelled) return;
        console.error('[XlsxPreview] load failed:', err);
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl]);

  // ─── Render active sheet into DOM ────────────────────────────────────
  useEffect(() => {
    if (!engine || !activeSheet || !workbookRef.current || !contentRef.current) return;
    const cacheKey = `${CACHE_VERSION}::${fileUrl}::${engine}::${activeSheet}`;
    const cached = htmlCache.get(cacheKey);
    if (cached) {
      contentRef.current.innerHTML = cached.html;
      setCappedInfo(cached.capped);
      return;
    }

    let result: { html: string; capped: { shown: number; total: number } | null };
    try {
      if (engine === 'exceljs') {
        const sjsSheet = sheetJsWbRef.current?.Sheets?.[activeSheet];
        result = renderExcelJSSheet(workbookRef.current as ExcelJSWorkbook, activeSheet, sjsSheet);
      } else {
        result = renderSheetJSSheet(workbookRef.current as XLSX.WorkBook, activeSheet);
      }
    } catch (err) {
      console.error('[XlsxPreview] render failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Render failed');
      setStatus('error');
      return;
    }

    htmlCache.set(cacheKey, result);
    contentRef.current.innerHTML = result.html;
    setCappedInfo(result.capped);
  }, [engine, activeSheet, fileUrl]);

  // ─── Measure rendered content so the zoom wrapper can size itself ────
  useLayoutEffect(() => {
    if (status !== 'rendered' || !contentRef.current || !activeSheet || !engine) return;
    const key = `${CACHE_VERSION}::${fileUrl}::${engine}::${activeSheet}`;
    const cached = sizeCache.get(key);
    if (cached) {
      setDims(cached);
      return;
    }
    // Prefer measuring the .mxlsx-canvas wrapper because it has explicit
    // dimensions that include any absolutely-positioned images. Fall back to
    // the table itself, then the content div.
    const canvas = contentRef.current.querySelector('.mxlsx-canvas') as HTMLElement | null;
    const table = contentRef.current.querySelector('table') as HTMLElement | null;
    const el = canvas ?? table ?? contentRef.current;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, contentRef.current.scrollWidth);
    const height = Math.max(rect.height, contentRef.current.scrollHeight);
    const next = { width, height };
    sizeCache.set(key, next);
    setDims(next);
  }, [status, activeSheet, engine, fileUrl]);

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <div className="w-8 h-8 rounded-md bg-[#f0fdf4] flex items-center justify-center">
          <span className="text-[9px] font-bold text-[#166534]">XLS</span>
        </div>
        <p className="text-[13px] text-[var(--m-text-tertiary)]">Could not render spreadsheet</p>
        <p className="text-[10px] text-[var(--m-text-placeholder)] max-w-[220px] text-center">{errorMsg}</p>
      </div>
    );
  }

  const showSheetPicker = sheetNames.length > 1;

  return (
    <div className="flex flex-col">
      {status === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <span className="text-[13px] text-[var(--m-text-tertiary)]">Rendering spreadsheet…</span>
        </div>
      )}

      {status === 'rendered' && showSheetPicker && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-0.5 px-0.5 scrollbar-none">
          {sheetNames.map(name => {
            const active = name === activeSheet;
            return (
              <button
                key={name}
                onClick={() => setActiveSheet(name)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap border ${
                  active
                    ? 'bg-black text-white border-black'
                    : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] border-[var(--m-border)]'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {status === 'rendered' && cappedInfo && (
        <div className="mb-1.5 px-2.5 py-1.5 rounded-md bg-[#fefce8] border border-[#fde68a] text-[10px] text-[#854d0e]">
          Showing first {cappedInfo.shown.toLocaleString()} of {cappedInfo.total.toLocaleString()} rows — download for full file
        </div>
      )}

      <div
        className="w-full bg-white border border-[var(--m-border)] rounded-md overflow-auto mxlsx-scope"
        style={{ height: '55vh' }}
      >
        <div
          style={{
            width: dims ? dims.width * zoom : undefined,
            height: dims ? dims.height * zoom : undefined,
          }}
        >
          <div
            ref={contentRef}
            className="mxlsx-content"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              display: 'inline-block',
            }}
          />
        </div>
      </div>

      {/* Base scoped styles — ExcelJS renderer emits inline styles that override these */}
      <style jsx>{`
        .mxlsx-scope :global(.mxlsx-canvas) {
          position: relative;
          display: inline-block;
        }
        .mxlsx-scope :global(.mxlsx-content table) {
          /* table-layout: fixed makes <col width> authoritative.
             Without this, the browser auto-sizes columns based on content
             and ignores our specified widths. */
          table-layout: fixed;
          border-collapse: collapse;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          color: #0f172a;
          background: #ffffff;
        }
        .mxlsx-scope :global(.mxlsx-content td),
        .mxlsx-scope :global(.mxlsx-content th) {
          border: 1px solid #e2e8f0;
          padding: 3px 6px;
          white-space: nowrap;
          vertical-align: top;
          text-align: left;
          /* Allow text to spill into adjacent empty cells, the way Excel does.
             For wrapped text we explicitly set white-space: normal inline. */
          overflow: visible;
        }
        .mxlsx-scope :global(.mxlsx-content td[data-t="n"]) {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .mxlsx-scope :global(.mxlsx-content img.mxlsx-img) {
          position: absolute;
          pointer-events: none;
          user-select: none;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ExcelJS renderer — preserves cell fonts, fills, borders, alignment
// ═══════════════════════════════════════════════════════════════════════

// Minimal structural types we use from ExcelJS (avoids importing types at module level)
type ExcelJSWorkbook = {
  worksheets: ExcelJSWorksheet[];
  getWorksheet: (name: string) => ExcelJSWorksheet | undefined;
  // Returns the binary image referenced by ID. Buffer is a Uint8Array (or
  // Node Buffer in non-browser contexts). Extension is "png" / "jpeg" / etc.
  getImage?: (imageId: number | string) => { buffer: Uint8Array | ArrayBuffer; extension?: string } | undefined;
  model?: { media?: Array<{ name?: string; type?: string; extension?: string; buffer?: Uint8Array }> };
};
type ExcelJSImageAnchor = {
  col: number;
  row: number;
  nativeCol?: number;
  nativeRow?: number;
  nativeColOff?: number;
  nativeRowOff?: number;
};
type ExcelJSImage = {
  imageId: number;
  range: { tl: ExcelJSImageAnchor; br?: ExcelJSImageAnchor; ext?: { width: number; height: number } };
};
type ExcelJSWorksheet = {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: Array<ExcelJSColumn>;
  properties?: { defaultColWidth?: number; defaultRowHeight?: number };
  model: {
    merges?: string[];
    // Raw OOXML column metadata, more reliable than getColumn().hidden
    cols?: Array<{
      min: number;
      max: number;
      width?: number;
      hidden?: boolean;
      collapsed?: boolean;
      customWidth?: boolean;
    }>;
  };
  getRow: (rowNum: number) => ExcelJSRow;
  getColumn: (col: number) => ExcelJSColumn;
  getCell: (row: number, col: number) => ExcelJSCell;
  getImages?: () => ExcelJSImage[];
};
type ExcelJSColumn = {
  width?: number;
  hidden?: boolean;
  collapsed?: boolean;
  alignment?: ExcelJSAlignment;
  numFmt?: string;
  style?: { numFmt?: string };
};
type ExcelJSRow = {
  height?: number;
  hidden?: boolean;
  getCell: (col: number) => ExcelJSCell;
};
type ExcelJSColor = { argb?: string; theme?: number; tint?: number };
type ExcelJSAlignment = { horizontal?: string; vertical?: string; wrapText?: boolean };
type ExcelJSCell = {
  text: string;
  value: unknown;
  numFmt?: string;
  type?: number;
  // Cached result accessor for formula cells. Some ExcelJS versions surface
  // shared-formula results here even when cell.value omits them.
  result?: unknown;
  formula?: string;
  // Internal value object — used as a last-resort fallback for shared-formula
  // results that don't bubble up through the public accessors.
  _value?: { result?: unknown; model?: { result?: unknown } };
  style?: { numFmt?: string };
  font?: { bold?: boolean; italic?: boolean; size?: number; name?: string; color?: ExcelJSColor };
  fill?: { type?: string; pattern?: string; fgColor?: ExcelJSColor; bgColor?: ExcelJSColor };
  border?: {
    top?: { style?: string; color?: ExcelJSColor };
    right?: { style?: string; color?: ExcelJSColor };
    bottom?: { style?: string; color?: ExcelJSColor };
    left?: { style?: string; color?: ExcelJSColor };
  };
  alignment?: ExcelJSAlignment;
};

function argbToCss(argb?: string): string | null {
  if (!argb) return null;
  // Excel stores ARGB (8 hex chars). Drop alpha for CSS.
  if (argb.length === 8) return `#${argb.slice(2)}`;
  if (argb.length === 6) return `#${argb}`;
  return null;
}

// Default Office theme palette (indices 0-11). Theme indices 0/1 are bg/text 1
// (white/black by default), 2/3 are bg/text 2, 4-9 are accents 1-6.
const OFFICE_THEME: string[] = [
  '#FFFFFF', // 0  lt1 / bg1
  '#000000', // 1  dk1 / tx1
  '#E7E6E6', // 2  lt2 / bg2
  '#44546A', // 3  dk2 / tx2
  '#5B9BD5', // 4  accent1
  '#ED7D31', // 5  accent2
  '#A5A5A5', // 6  accent3
  '#FFC000', // 7  accent4
  '#4472C4', // 8  accent5
  '#70AD47', // 9  accent6
  '#0563C1', // 10 hyperlink
  '#954F72', // 11 followedHyperlink
];

function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Linear RGB approximation of OOXML's HLS-based tint formula.
  // Negative tint → darken toward black, positive → lighten toward white.
  const t = Math.max(-1, Math.min(1, tint));
  const mix = (chan: number) =>
    t < 0
      ? Math.round(chan * (1 + t))
      : Math.round(chan + (255 - chan) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function resolveColor(color?: ExcelJSColor): string | null {
  if (!color) return null;
  // Prefer explicit ARGB when present and not the empty placeholder
  if (color.argb && color.argb !== '00000000') {
    return argbToCss(color.argb);
  }
  if (typeof color.theme === 'number') {
    const base = OFFICE_THEME[color.theme] ?? OFFICE_THEME[1];
    return applyTint(base, color.tint ?? 0);
  }
  return null;
}

function borderWidth(style?: string): string {
  switch (style) {
    case undefined:
    case 'none':
      return '';
    case 'thick':
      return '3px';
    case 'medium':
    case 'mediumDashed':
    case 'mediumDashDot':
    case 'mediumDashDotDot':
      return '2px';
    default:
      return '1px';
  }
}

function borderStyle(style?: string): string {
  if (!style || style === 'none') return '';
  if (style.toLowerCase().includes('dash')) return 'dashed';
  if (style.toLowerCase().includes('dot')) return 'dotted';
  if (style === 'double') return 'double';
  return 'solid';
}

function borderCss(side?: { style?: string; color?: ExcelJSColor }): string {
  if (!side) return '';
  const w = borderWidth(side.style);
  const s = borderStyle(side.style);
  if (!w || !s) return '';
  const c = resolveColor(side.color) ?? '#94a3b8';
  return `${w} ${s} ${c}`;
}

function parseRange(ref: string): { sr: number; sc: number; er: number; ec: number } {
  // e.g. "A1:B2" → {sr:1, sc:1, er:2, ec:2}
  const [start, end] = ref.split(':');
  return { ...parseAddr(start, 's'), ...parseAddr(end, 'e') } as any;
}
function parseAddr(addr: string, prefix: 's' | 'e'): { [k: string]: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!match) return {};
  const letters = match[1];
  const row = parseInt(match[2], 10);
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { [`${prefix}r`]: row, [`${prefix}c`]: col };
}

// Excel epoch is Dec 30, 1899 (compensates for the 1900 leap-year bug).
// For any date after March 1, 1900 the conversion is exact:
//   serial = (jsTime - EXCEL_EPOCH_MS) / 86400000
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function tryFormat(num: number, fmt: string | undefined): string | null {
  if (!fmt || fmt === 'General' || fmt === '@') return null;
  try {
    const out = XLSX.SSF.format(fmt, num);
    return out && !out.includes('NaN') ? out : null;
  } catch {
    return null;
  }
}

function formatDate(d: Date, ...fmts: (string | undefined)[]): string {
  const serial = (d.getTime() - EXCEL_EPOCH_MS) / 86400000;
  for (const fmt of fmts) {
    const out = tryFormat(serial, fmt);
    if (out) return out;
  }
  // Locale fallback — short, fits in a typical column
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// Aggressive formula-result extractor.
//
// ExcelJS quirk #3: shared-formula cells (the dependent ones — `{ sharedFormula: 'H8' }`)
// and even some shared-formula anchors expose their cached value via
// alternative accessors instead of cell.value.result. We try every known
// path to find the cached numeric/date/string result.
function getFormulaResult(cell: ExcelJSCell): unknown {
  const v = cell.value;

  // Path 1: cell.value.result (the documented form for normal formulas)
  if (v && typeof v === 'object' && 'result' in v) {
    const r = (v as { result?: unknown }).result;
    if (r !== undefined) return r;
  }

  // Path 2: cell.result (top-level accessor — works for some shared formulas)
  if (cell.result !== undefined) return cell.result;

  // Path 3: cell._value.result (internal — works in versions where cell.value
  // strips the result for shared-formula dependents)
  const internal = cell._value;
  if (internal && typeof internal === 'object' && 'result' in internal) {
    const r = internal.result;
    if (r !== undefined) return r;
  }

  // Path 4: cell._value.model.result (deepest internal — last resort)
  if (internal?.model && 'result' in internal.model) {
    const r = internal.model.result;
    if (r !== undefined) return r;
  }

  return undefined;
}

function localeNumber(num: number): string {
  if (Number.isInteger(num)) return num.toLocaleString('en-GB');
  const abs = Math.abs(num);
  if (abs >= 1) {
    return num.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return num.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

// SheetJS cell shape (the bits we care about):
//   v = raw value (number, string, Date, boolean)
//   w = formatted text (already-formatted display string)
type SheetJSCell = { v?: unknown; w?: string; t?: string };

// Render a SheetJS-only value through the same format pipeline.
function sheetJsValueToText(sjs: SheetJSCell, fmt?: string): string {
  const v = sjs.v;
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const formatted = tryFormat(v, fmt);
    if (formatted) return formatted;
    return localeNumber(v);
  }
  if (v instanceof Date) {
    return formatDate(v, fmt);
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  // Last resort: use SheetJS's pre-formatted display string
  return sjs.w ?? String(v);
}

// Robust cell display extractor. Handles:
//   - Direct numbers (with optional numFmt)
//   - Formula cells where cell.value = { formula, result } or { sharedFormula, result }
//   - Formula cells with NO inline result — uses sheetJsCell as value recovery
//     (ExcelJS loses the cached <v> tag for some formula sub-types and silently
//     returns 0 from cell.result. SheetJS reads the <v> via a different code
//     path and surfaces the right value.)
//   - Date cells (direct or as formula results) — converts to Excel serial + SSF
//   - String / rich text / hyperlink cells
//
// For numeric & date values, tries numFmt sources in this order:
//   cell.numFmt → cell.style.numFmt → columnNumFmt
// then falls back to a locale-formatted display so we never show raw
// 15-decimal floats or JS Date.toString() output (both of which destroy
// the visual layout via overflow into adjacent cells).
function getCellText(cell: ExcelJSCell, columnNumFmt?: string, sheetJsCell?: SheetJSCell): string {
  const v = cell.value;
  if (v == null || v === '') {
    // Even if ExcelJS sees nothing, SheetJS might have a value here.
    // (Rare but possible — happens when ExcelJS skips a cell entirely.)
    if (sheetJsCell?.v != null) {
      return sheetJsValueToText(sheetJsCell, cell.numFmt || cell.style?.numFmt || columnNumFmt);
    }
    return '';
  }

  // Direct Date value
  if (v instanceof Date) {
    return formatDate(v, cell.numFmt, cell.style?.numFmt, columnNumFmt);
  }

  // Numeric extraction (direct, formula result, shared-formula result, etc.)
  let num: number | null = null;
  let formulaResultDate: Date | null = null;
  if (typeof v === 'number') {
    num = v;
  } else if (typeof v === 'object' && v !== null && 'richText' in v) {
    // Rich text cell — flatten to plain string
    const parts = (v as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(parts)) return parts.map(p => p?.text ?? '').join('');
  } else if (typeof v === 'object' && v !== null && 'hyperlink' in v && 'text' in v) {
    // Hyperlink cell { text, hyperlink }
    return String((v as { text?: unknown }).text ?? '');
  } else if (
    typeof v === 'object' && v !== null &&
    ('formula' in v || 'sharedFormula' in v || 'result' in v)
  ) {
    // Any kind of formula cell — try every accessor we know about to dig out
    // the cached result. Critical for shared-formula dependents which omit
    // result from cell.value entirely in some ExcelJS versions.
    const r = getFormulaResult(cell);

    // The ExcelJS bug we hunt: when v has shape `{ formula }` (no inline
    // result key), cell.result returns the *default* 0 — even though the
    // cached value in the file is something else. Detect that case and
    // prefer the SheetJS value if available.
    const valueIsResultLess = !('result' in v);
    if (valueIsResultLess && r === 0 && sheetJsCell?.v != null) {
      const sjsV = sheetJsCell.v;
      if (typeof sjsV === 'number' && Number.isFinite(sjsV)) {
        num = sjsV;
      } else if (sjsV instanceof Date) {
        formulaResultDate = sjsV;
      } else if (typeof sjsV === 'string') {
        return sjsV;
      } else if (typeof sjsV === 'boolean') {
        return sjsV ? 'TRUE' : 'FALSE';
      }
    } else if (typeof r === 'number') {
      num = r;
    } else if (r instanceof Date) {
      formulaResultDate = r;
    } else if (typeof r === 'string') {
      return r;
    } else if (typeof r === 'boolean') {
      return r ? 'TRUE' : 'FALSE';
    } else if (r == null) {
      // ExcelJS has no cached result. Last-ditch: try SheetJS.
      if (sheetJsCell?.v != null) {
        return sheetJsValueToText(sheetJsCell, cell.numFmt || cell.style?.numFmt || columnNumFmt);
      }
      return cell.text || '';
    }
  }

  if (formulaResultDate) {
    return formatDate(formulaResultDate, cell.numFmt, cell.style?.numFmt, columnNumFmt);
  }

  if (num !== null && Number.isFinite(num)) {
    // Try every numFmt source we know about
    const formatted =
      tryFormat(num, cell.numFmt) ??
      tryFormat(num, cell.style?.numFmt) ??
      tryFormat(num, columnNumFmt);
    if (formatted) return formatted;
    return localeNumber(num);
  }

  if (typeof v === 'string') return v;
  return cell.text || '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert an image binary buffer (Uint8Array or ArrayBuffer) to a data URL.
// Chunked encoding avoids "argument too long" errors on String.fromCharCode
// for buffers larger than ~64KB.
function bufferToDataUrl(buf: Uint8Array | ArrayBuffer, ext = 'png'): string | null {
  try {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000; // 32KB
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const base64 = btoa(binary);
    const mime =
      ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'gif' ? 'image/gif' :
      ext === 'svg' ? 'image/svg+xml' :
      'image/png';
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.warn('[XlsxPreview] image encode failed:', err);
    return null;
  }
}

function renderExcelJSSheet(wb: ExcelJSWorkbook, sheetName: string, sjsSheet?: XLSX.WorkSheet) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const totalRows = ws.rowCount || 0;
  const totalCols = ws.columnCount || 0;
  // Excel's true default is 8.43 chars. Some files set defaultColWidth=0
  // (meaning "no default, every visible column has explicit width"), but
  // if any column slips through without an explicit width we still need a
  // sensible fallback or it renders as a 5px sliver.
  const rawDefault = ws.properties?.defaultColWidth;
  const defaultColChars = rawDefault && rawDefault > 0 ? rawDefault : 8.43;

  // Build hidden-column set using ALL three signals Excel can use:
  //   1. ws.model.cols entries with hidden=true (raw OOXML, most reliable)
  //   2. ws.model.cols entries with width===0 (very common "hidden" pattern)
  //   3. getColumn(c).hidden as a final fallback
  const hiddenCols = new Set<number>();
  for (const col of ws.model.cols ?? []) {
    const isHidden = col.hidden === true || (typeof col.width === 'number' && col.width === 0);
    if (!isHidden) continue;
    for (let c = col.min; c <= col.max; c++) hiddenCols.add(c);
  }
  for (let c = 1; c <= totalCols; c++) {
    const col = ws.getColumn(c);
    if (col?.hidden === true) hiddenCols.add(c);
    if (typeof col?.width === 'number' && col.width === 0) hiddenCols.add(c);
  }

  // Per-column rendered metadata (skipping hidden ones)
  const colMeta: Array<{ widthPx: number; alignment?: ExcelJSAlignment; numFmt?: string }> = [];
  for (let c = 1; c <= totalCols; c++) {
    if (hiddenCols.has(c)) {
      colMeta.push({ widthPx: 0 });
      continue;
    }
    const col = ws.getColumn(c);
    const widthChars = col?.width && col.width > 0 ? col.width : defaultColChars;
    colMeta.push({
      widthPx: Math.round(widthChars * 7 + 5),
      alignment: col?.alignment,
      numFmt: col?.numFmt || col?.style?.numFmt,
    });
  }

  // Cumulative pixel positions in the RENDERED grid (post-hide).
  // renderedColX[c] = pixel offset of left edge of column c (1-indexed).
  // renderedColX[totalCols+1] = total width.
  const renderedColX: number[] = [0, 0];
  let xCum = 0;
  for (let c = 1; c <= totalCols; c++) {
    if (!hiddenCols.has(c)) xCum += colMeta[c - 1].widthPx;
    renderedColX[c + 1] = xCum;
  }
  const totalTableWidth = xCum;

  // Also count hidden rows for the diagnostic
  let hiddenRowCount = 0;
  for (let r = 1; r <= totalRows; r++) {
    if (ws.getRow(r)?.hidden) hiddenRowCount++;
  }

  // (diagnostic moved to bottom of function so it can include the rendered HTML)

  // Build merge lookup. When a merge spans hidden columns, we count only the
  // visible ones for colspan so the rendered grid stays consistent.
  const mergeMap = new Map<string, { colspan: number; rowspan: number }>();
  const skip = new Set<string>();
  for (const ref of ws.model.merges ?? []) {
    const { sr, sc, er, ec } = parseRange(ref);
    let visibleColspan = 0;
    for (let c = sc; c <= ec; c++) {
      if (!hiddenCols.has(c)) visibleColspan++;
    }
    mergeMap.set(`${sr}:${sc}`, {
      colspan: Math.max(1, visibleColspan),
      rowspan: er - sr + 1,
    });
    for (let r = sr; r <= er; r++) {
      for (let c = sc; c <= ec; c++) {
        if (r === sr && c === sc) continue;
        skip.add(`${r}:${c}`);
      }
    }
  }

  // Colgroup — emit only visible columns
  let colgroup = '<colgroup>';
  for (let c = 1; c <= totalCols; c++) {
    if (hiddenCols.has(c)) continue;
    colgroup += `<col style="width:${colMeta[c - 1].widthPx}px">`;
  }
  colgroup += '</colgroup>';

  // renderedRowY[r] = pixel offset of top of row r (1-indexed).
  // Built incrementally during the row loop so we can use it for image positioning.
  const renderedRowY: number[] = [0, 0];
  let yCum = 0;

  let body = '<tbody>';
  let renderedRowCount = 0;
  for (let r = 1; r <= totalRows; r++) {
    if (renderedRowCount >= ROW_CAP) break;
    const row = ws.getRow(r);
    if (row?.hidden) {
      renderedRowY[r + 1] = yCum; // hidden row has 0 height
      continue;
    }
    renderedRowCount++;

    const rowHeightPx = row.height ? Math.round(row.height * 1.333) : 20;
    yCum += rowHeightPx;
    renderedRowY[r + 1] = yCum;
    body += `<tr style="height:${rowHeightPx}px">`;

    for (let c = 1; c <= totalCols; c++) {
      if (hiddenCols.has(c)) continue;
      if (skip.has(`${r}:${c}`)) continue;
      const cell = row.getCell(c);
      const merge = mergeMap.get(`${r}:${c}`);

      const styles: string[] = [];
      const f = cell.font;
      if (f?.bold) styles.push('font-weight:700');
      if (f?.italic) styles.push('font-style:italic');
      if (f?.size) styles.push(`font-size:${f.size}pt`);
      if (f?.name) {
        // Single quotes inside the style attribute (which is double-quoted in the
        // emitted HTML). Using double quotes here would close the style attribute
        // early and silently drop every subsequent CSS declaration on the cell.
        const safeName = f.name.replace(/'/g, '');
        styles.push(`font-family:'${safeName}',sans-serif`);
      }
      const fontColor = resolveColor(f?.color);
      if (fontColor) styles.push(`color:${fontColor}`);

      if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') {
        const bg = resolveColor(cell.fill.fgColor) ?? resolveColor(cell.fill.bgColor);
        if (bg) styles.push(`background-color:${bg}`);
      }

      const bt = borderCss(cell.border?.top);
      const br = borderCss(cell.border?.right);
      const bb = borderCss(cell.border?.bottom);
      const bl = borderCss(cell.border?.left);
      if (bt) styles.push(`border-top:${bt}`);
      if (br) styles.push(`border-right:${br}`);
      if (bb) styles.push(`border-bottom:${bb}`);
      if (bl) styles.push(`border-left:${bl}`);

      // Cell-level alignment wins; otherwise fall back to column-level alignment
      const a = cell.alignment ?? colMeta[c - 1]?.alignment;
      if (a?.horizontal && ['left', 'center', 'right', 'justify'].includes(a.horizontal)) {
        styles.push(`text-align:${a.horizontal}`);
      }
      if (a?.vertical) {
        const v = a.vertical === 'middle' ? 'middle' : a.vertical === 'bottom' ? 'bottom' : 'top';
        styles.push(`vertical-align:${v}`);
      }
      if (a?.wrapText) styles.push('white-space:normal');

      // Default right-align for numeric values without explicit alignment
      const isNumeric = typeof cell.value === 'number';
      if (!a?.horizontal && isNumeric) styles.push('text-align:right');

      const attrs: string[] = [];
      if (styles.length) attrs.push(`style="${styles.join(';')}"`);
      if (merge?.colspan && merge.colspan > 1) attrs.push(`colspan="${merge.colspan}"`);
      if (merge?.rowspan && merge.rowspan > 1) attrs.push(`rowspan="${merge.rowspan}"`);
      if (isNumeric) attrs.push('data-t="n"');

      // SheetJS uses A1 notation; ExcelJS uses 1-based row/col.
      // Convert (r, c) → "H10" via XLSX.utils.encode_cell with 0-based indices.
      const sjsKey = sjsSheet ? XLSX.utils.encode_cell({ r: r - 1, c: c - 1 }) : null;
      const sjsCell = sjsKey ? (sjsSheet as Record<string, SheetJSCell> | undefined)?.[sjsKey] : undefined;
      const display = getCellText(cell, colMeta[c - 1]?.numFmt, sjsCell);
      const text = display ? escapeHtml(display) : '';
      body += `<td ${attrs.join(' ')}>${text}</td>`;
    }
    body += '</tr>';
  }
  body += '</tbody>';

  const totalTableHeight = yCum;

  // ─── Image extraction ──────────────────────────────────────────────
  // Excel embeds images via xl/media/imageN.png with anchors pointing at
  // fractional cell coordinates. We extract them via ExcelJS and render
  // each as an absolutely-positioned <img> over the table.
  const imageElements: string[] = [];
  try {
    const images = typeof ws.getImages === 'function' ? (ws.getImages() ?? []) : [];
    for (const img of images) {
      const imgData = wb.getImage?.(img.imageId);
      if (!imgData?.buffer) continue;
      const dataUrl = bufferToDataUrl(imgData.buffer, imgData.extension);
      if (!dataUrl) continue;

      // ExcelJS uses 0-based col/row in image anchors.
      // tl.col=1, tl.row=2 means top-left at column B, row 3.
      const tl = img.range.tl;
      const br = img.range.br;
      const tlCol = Math.floor(tl.col) + 1; // → 1-based for renderedColX lookup
      const tlRow = Math.floor(tl.row) + 1;
      const left = renderedColX[tlCol] ?? 0;
      const top = renderedRowY[tlRow] ?? 0;

      let width = 0;
      let height = 0;
      if (br) {
        const brCol = Math.ceil(br.col) + 1;
        const brRow = Math.ceil(br.row) + 1;
        const right = renderedColX[brCol] ?? renderedColX[renderedColX.length - 1];
        const bottom = renderedRowY[brRow] ?? renderedRowY[renderedRowY.length - 1];
        width = Math.max(0, right - left);
        height = Math.max(0, bottom - top);
      } else if (img.range.ext) {
        // OneCell anchor with explicit pixel size (rare but possible)
        width = img.range.ext.width;
        height = img.range.ext.height;
      }
      if (width <= 0 || height <= 0) continue;

      imageElements.push(
        `<img class="mxlsx-img" src="${dataUrl}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px" alt="">`
      );
    }
  } catch (err) {
    console.warn('[XlsxPreview] image extraction failed:', err);
  }

  // Wrap the table in a positioned canvas so images can layer over it.
  // The wrapper has explicit dimensions because table-layout:fixed needs an
  // explicit table width to honor <col> widths exactly.
  const tableHtml = `<table style="width:${totalTableWidth}px">${colgroup}${body}</table>`;
  const html = `<div class="mxlsx-canvas" style="width:${totalTableWidth}px;height:${Math.max(totalTableHeight, 1)}px">${tableHtml}${imageElements.join('')}</div>`;

  const capped = totalRows > ROW_CAP ? { shown: renderedRowCount, total: totalRows } : null;

  // Compact one-line render summary. Useful for verifying the renderer is
  // healthy on new files; not noisy enough to clutter the console.
  if (typeof window !== 'undefined') {
    console.debug(
      `[XlsxPreview] ${sheetName}: ${renderedRowCount}/${totalRows} rows, ` +
      `${totalCols - hiddenCols.size}/${totalCols} cols, ` +
      `${imageElements.length} images, ${totalTableWidth}×${totalTableHeight}px`
    );
  }

  return { html, capped };
}

// ═══════════════════════════════════════════════════════════════════════
// SheetJS fallback renderer (unchanged from Phase A)
// ═══════════════════════════════════════════════════════════════════════

function renderSheetJSSheet(wb: XLSX.WorkBook, sheetName: string) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const originalRef = sheet['!ref'];
  let shownRows = 0;
  let totalRows = 0;
  try {
    if (originalRef) {
      const range = XLSX.utils.decode_range(originalRef);
      totalRows = range.e.r - range.s.r + 1;
      shownRows = Math.min(totalRows, ROW_CAP);
      if (totalRows > ROW_CAP) {
        sheet['!ref'] = XLSX.utils.encode_range({
          s: range.s,
          e: { r: range.s.r + ROW_CAP - 1, c: range.e.c },
        });
      }
    }
    const html = XLSX.utils.sheet_to_html(sheet, { editable: false, header: '', footer: '' });
    const capped = totalRows > ROW_CAP ? { shown: shownRows, total: totalRows } : null;
    return { html, capped };
  } finally {
    if (originalRef !== undefined) sheet['!ref'] = originalRef;
  }
}
