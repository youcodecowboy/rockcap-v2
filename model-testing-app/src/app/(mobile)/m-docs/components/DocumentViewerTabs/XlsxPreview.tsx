'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// Module-level caches so tab switches / re-mounts don't re-fetch or re-parse.
const workbookCache = new Map<string, XLSX.WorkBook>();
const sizeCache = new Map<string, { width: number; height: number }>();

const ROW_CAP = 500;

interface XlsxPreviewProps {
  fileUrl: string;
  zoom?: number;
}

type Status = 'loading' | 'rendered' | 'error';

export default function XlsxPreview({ fileUrl, zoom = 1 }: XlsxPreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [cappedInfo, setCappedInfo] = useState<{ shown: number; total: number } | null>(null);

  // Load + parse the workbook once per fileUrl
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setWorkbook(null);
    setActiveSheet(null);
    setDims(null);
    setCappedInfo(null);

    const cached = workbookCache.get(fileUrl);
    if (cached) {
      setWorkbook(cached);
      setActiveSheet(cached.SheetNames[0] ?? null);
      setStatus('rendered');
      return;
    }

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const wb = XLSX.read(buf, { type: 'array' });
        if (cancelled) return;
        workbookCache.set(fileUrl, wb);
        setWorkbook(wb);
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

  // Render the active sheet whenever workbook or active sheet changes
  useEffect(() => {
    if (!workbook || !activeSheet || !contentRef.current) return;
    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) return;

    // Apply 500-row cap by temporarily overriding !ref
    const originalRef = sheet['!ref'];
    let shownRows = 0;
    let totalRows = 0;
    try {
      if (originalRef) {
        const range = XLSX.utils.decode_range(originalRef);
        totalRows = range.e.r - range.s.r + 1;
        shownRows = Math.min(totalRows, ROW_CAP);
        if (totalRows > ROW_CAP) {
          const capped = {
            s: range.s,
            e: { r: range.s.r + ROW_CAP - 1, c: range.e.c },
          };
          sheet['!ref'] = XLSX.utils.encode_range(capped);
        }
      }

      const html = XLSX.utils.sheet_to_html(sheet, {
        editable: false,
        header: '',
        footer: '',
      });
      contentRef.current.innerHTML = html;
      setCappedInfo(totalRows > ROW_CAP ? { shown: shownRows, total: totalRows } : null);
    } finally {
      // Always restore original !ref so the cached workbook isn't mutated permanently
      if (originalRef !== undefined) sheet['!ref'] = originalRef;
    }
  }, [workbook, activeSheet]);

  // Measure the rendered content so the zoom wrapper can size itself
  useLayoutEffect(() => {
    if (status !== 'rendered' || !contentRef.current || !activeSheet) return;
    const key = `${fileUrl}::${activeSheet}`;
    const cached = sizeCache.get(key);
    if (cached) {
      setDims(cached);
      return;
    }
    // Measure the inner table (sheet_to_html wraps its output in a <table>)
    const table = contentRef.current.querySelector('table');
    const el = (table as HTMLElement) ?? contentRef.current;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, contentRef.current.scrollWidth);
    const height = Math.max(rect.height, contentRef.current.scrollHeight);
    const next = { width, height };
    sizeCache.set(key, next);
    setDims(next);
  }, [status, activeSheet, fileUrl]);

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

  const sheetNames = workbook?.SheetNames ?? [];
  const showSheetPicker = sheetNames.length > 1;

  return (
    <div className="flex flex-col">
      {status === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <span className="text-[13px] text-[var(--m-text-tertiary)]">Rendering spreadsheet…</span>
        </div>
      )}

      {/* Sheet tab pills (horizontally scrollable) */}
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

      {/* Row cap notice */}
      {status === 'rendered' && cappedInfo && (
        <div className="mb-1.5 px-2.5 py-1.5 rounded-md bg-[#fefce8] border border-[#fde68a] text-[10px] text-[#854d0e]">
          Showing first {cappedInfo.shown.toLocaleString()} of {cappedInfo.total.toLocaleString()} rows — download for full file
        </div>
      )}

      {/* Scaled content area */}
      <div
        className="w-full bg-white border border-[var(--m-border)] rounded-md overflow-auto mxlsx-scope"
        style={{ height: '55vh' }}
      >
        {/* Outer sizer grows to scaled dimensions so the scroll container knows about overflow */}
        <div
          style={{
            width: dims ? dims.width * zoom : undefined,
            height: dims ? dims.height * zoom : undefined,
          }}
        >
          {/* Inner transform wrapper */}
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

      {/* Scoped styles for sheet_to_html output */}
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
        .mxlsx-scope :global(.mxlsx-content tr:first-child td),
        .mxlsx-scope :global(.mxlsx-content th) {
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
          position: sticky;
          top: 0;
        }
        .mxlsx-scope :global(.mxlsx-content td[data-t="n"]) {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
