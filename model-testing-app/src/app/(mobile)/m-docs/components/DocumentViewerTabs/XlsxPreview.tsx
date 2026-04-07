'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// Module-level caches: parsed workbook + rendered HTML dimensions
// Kept as `unknown` since two different engines may produce different workbook shapes.
// Bump CACHE_VERSION whenever the renderer output changes so old cached HTML is dropped.
const CACHE_VERSION = 'v5';
const workbookCache = new Map<string, { engine: Engine; workbook: unknown }>();
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

    const cached = workbookCache.get(fileUrl);
    if (cached) {
      workbookRef.current = cached.workbook;
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
          workbookCache.set(fileUrl, { engine: 'exceljs', workbook: wb });
          workbookRef.current = wb;
          setEngine('exceljs');
          const names = wb.worksheets.map(ws => ws.name);
          setSheetNames(names);
          setActiveSheet(names[0] ?? null);
          setStatus('rendered');
          return;
        } catch (excelJsErr) {
          console.warn('[XlsxPreview] ExcelJS failed, falling back to SheetJS:', excelJsErr);
        }

        // Fallback: SheetJS
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
        result = renderExcelJSSheet(workbookRef.current as ExcelJSWorkbook, activeSheet);
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
    const table = contentRef.current.querySelector('table');
    const el = (table as HTMLElement) ?? contentRef.current;
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
        .mxlsx-scope :global(.mxlsx-content table) {
          border-collapse: collapse;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          color: #0f172a;
          background: #ffffff;
        }
        .mxlsx-scope :global(.mxlsx-content td),
        .mxlsx-scope :global(.mxlsx-content th) {
          border: 1px solid #e2e8f0;
          padding: 4px 8px;
          white-space: nowrap;
          vertical-align: top;
          text-align: left;
        }
        .mxlsx-scope :global(.mxlsx-content td[data-t="n"]) {
          text-align: right;
          font-variant-numeric: tabular-nums;
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
};
type ExcelJSColumn = {
  width?: number;
  hidden?: boolean;
  collapsed?: boolean;
  alignment?: ExcelJSAlignment;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderExcelJSSheet(wb: ExcelJSWorkbook, sheetName: string) {
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
  const colMeta: Array<{ widthPx: number; alignment?: ExcelJSAlignment }> = [];
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
    });
  }

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

  let body = '<tbody>';
  let renderedRowCount = 0;
  for (let r = 1; r <= totalRows; r++) {
    if (renderedRowCount >= ROW_CAP) break;
    const row = ws.getRow(r);
    if (row?.hidden) continue; // Skip rows the author hid
    renderedRowCount++;

    const rowHeightPx = row.height ? Math.round(row.height * 1.333) : '';
    const rowStyle = rowHeightPx ? ` style="height:${rowHeightPx}px"` : '';
    body += `<tr${rowStyle}>`;

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
      if (f?.name) styles.push(`font-family:"${f.name}",sans-serif`);
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

      const text = cell.text ? escapeHtml(String(cell.text)) : '';
      body += `<td ${attrs.join(' ')}>${text}</td>`;
    }
    body += '</tr>';
  }
  body += '</tbody>';

  const html = `<table>${colgroup}${body}</table>`;
  const capped = totalRows > ROW_CAP ? { shown: renderedRowCount, total: totalRows } : null;

  // Comprehensive diagnostic — emitted once per render so we can see exactly what
  // ExcelJS parsed AND what HTML we're producing in response.
  if (typeof window !== 'undefined') {
    const hiddenInDataRange: number[] = [];
    for (let c = 1; c <= totalCols; c++) {
      if (hiddenCols.has(c)) hiddenInDataRange.push(c);
    }
    const relevantModelCols = (ws.model.cols ?? []).filter(c => c.min <= totalCols);

    // Dump row heights + hidden flags for the first 12 rows
    const earlyRows: Array<{ row: number; hidden: boolean; height?: number }> = [];
    for (let r = 1; r <= Math.min(12, totalRows); r++) {
      const row = ws.getRow(r);
      earlyRows.push({ row: r, hidden: !!row?.hidden, height: row?.height });
    }

    // Sample cells across the dark-header band the user described
    const sampleCells: Record<string, unknown> = {};
    for (const [label, r, c] of [
      ['A1', 1, 1], ['B2', 2, 2], ['C3', 3, 3], ['B5', 5, 2],
      ['A8', 8, 1], ['B8', 8, 2], ['C8', 8, 3], ['E8', 8, 5],
    ] as const) {
      const cell = ws.getCell(r, c);
      sampleCells[label] = { text: cell?.text, fill: cell?.fill, font: cell?.font };
    }

    // Slice of generated HTML — first 2000 chars so we can see the actual output
    const htmlSlice = html.slice(0, 2000);

    // List the first 8 merges (if any)
    const mergeList = (ws.model.merges ?? []).slice(0, 8);

    console.log('[XlsxPreview] diagnostic v5:\n' + JSON.stringify({
      sheet: sheetName,
      totalRows,
      totalCols,
      hiddenColsInDataRange: hiddenInDataRange,
      hiddenRowCount,
      rawDefaultColWidth: rawDefault,
      defaultColChars,
      renderedRowCount,
      mergesTotal: ws.model.merges?.length ?? 0,
      mergeList,
      earlyRows,
      relevantModelCols,
      colWidthsRendered: colMeta.map((m, i) => ({ col: i + 1, hidden: hiddenCols.has(i + 1), widthPx: m.widthPx })),
      sampleCells,
      htmlBytes: html.length,
      htmlSlice,
    }, null, 2));
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
