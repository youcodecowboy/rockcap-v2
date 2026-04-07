'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// Module-level caches: parsed workbook + rendered HTML dimensions
// Kept as `unknown` since two different engines may produce different workbook shapes.
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
    const cacheKey = `${fileUrl}::${engine}::${activeSheet}`;
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
    const key = `${fileUrl}::${engine}::${activeSheet}`;
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
  columns: Array<{ width?: number }>;
  model: { merges?: string[] };
  getRow: (rowNum: number) => ExcelJSRow;
  getCell: (row: number, col: number) => ExcelJSCell;
};
type ExcelJSRow = { height?: number; getCell: (col: number) => ExcelJSCell };
type ExcelJSCell = {
  text: string;
  value: unknown;
  font?: { bold?: boolean; italic?: boolean; size?: number; name?: string; color?: { argb?: string } };
  fill?: { type?: string; pattern?: string; fgColor?: { argb?: string } };
  border?: {
    top?: { style?: string; color?: { argb?: string } };
    right?: { style?: string; color?: { argb?: string } };
    bottom?: { style?: string; color?: { argb?: string } };
    left?: { style?: string; color?: { argb?: string } };
  };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
};

function argbToCss(argb?: string): string | null {
  if (!argb) return null;
  // Excel stores ARGB (8 hex chars). Drop alpha for CSS.
  if (argb.length === 8) return `#${argb.slice(2)}`;
  if (argb.length === 6) return `#${argb}`;
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

function borderCss(side?: { style?: string; color?: { argb?: string } }): string {
  if (!side) return '';
  const w = borderWidth(side.style);
  const s = borderStyle(side.style);
  if (!w || !s) return '';
  const c = argbToCss(side.color?.argb) ?? '#94a3b8';
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
  const renderedRows = Math.min(totalRows, ROW_CAP);

  // Build merge lookup: top-left addresses → rowspan/colspan, plus set of skipped addresses
  const mergeMap = new Map<string, { colspan: number; rowspan: number }>();
  const skip = new Set<string>();
  for (const ref of ws.model.merges ?? []) {
    const { sr, sc, er, ec } = parseRange(ref);
    mergeMap.set(`${sr}:${sc}`, { colspan: ec - sc + 1, rowspan: er - sr + 1 });
    for (let r = sr; r <= er; r++) {
      for (let c = sc; c <= ec; c++) {
        if (r === sr && c === sc) continue;
        skip.add(`${r}:${c}`);
      }
    }
  }

  // Colgroup for column widths (Excel width unit ≈ character count × ~7px)
  let colgroup = '<colgroup>';
  for (let c = 1; c <= totalCols; c++) {
    const width = ws.columns?.[c - 1]?.width;
    const px = width ? Math.round(width * 7 + 5) : 72;
    colgroup += `<col style="width:${px}px">`;
  }
  colgroup += '</colgroup>';

  let body = '<tbody>';
  for (let r = 1; r <= renderedRows; r++) {
    const row = ws.getRow(r);
    const rowHeightPx = row.height ? Math.round(row.height * 1.333) : '';
    const rowStyle = rowHeightPx ? ` style="height:${rowHeightPx}px"` : '';
    body += `<tr${rowStyle}>`;
    for (let c = 1; c <= totalCols; c++) {
      if (skip.has(`${r}:${c}`)) continue;
      const cell = row.getCell(c);
      const merge = mergeMap.get(`${r}:${c}`);

      const styles: string[] = [];
      const f = cell.font;
      if (f?.bold) styles.push('font-weight:700');
      if (f?.italic) styles.push('font-style:italic');
      if (f?.size) styles.push(`font-size:${f.size}pt`);
      if (f?.name) styles.push(`font-family:"${f.name}",sans-serif`);
      const fontColor = argbToCss(f?.color?.argb);
      if (fontColor) styles.push(`color:${fontColor}`);

      if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') {
        const bg = argbToCss(cell.fill.fgColor?.argb);
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

      const a = cell.alignment;
      if (a?.horizontal && ['left', 'center', 'right', 'justify'].includes(a.horizontal)) {
        styles.push(`text-align:${a.horizontal}`);
      }
      if (a?.vertical) {
        const v = a.vertical === 'middle' ? 'middle' : a.vertical === 'bottom' ? 'bottom' : 'top';
        styles.push(`vertical-align:${v}`);
      }
      if (a?.wrapText) styles.push('white-space:normal');

      // If no explicit alignment and value looks numeric, right-align
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
  const capped = totalRows > ROW_CAP ? { shown: renderedRows, total: totalRows } : null;
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
