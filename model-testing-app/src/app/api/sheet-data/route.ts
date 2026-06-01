import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// POST /api/sheet-data
//
// Returns a stored spreadsheet as STRUCTURED CELLS (per-sheet 2D arrays) so an
// MCP-side agent can do the figure extraction itself. The server's only job here
// is to turn the binary xlsx/csv into readable cells — it does NOT interpret or
// extract anything. Mirrors the xlsx parsing in src/lib/fileProcessor.ts.
//
// Body: { fileUrl: string (Convex storage URL), fileName?: string, maxRows?: number, maxSheets?: number }
// Returns: { ok, format, sheetCount, sheets: [{ name, rows: any[][], rowCount, truncated }] }
//
// Called by the `document.getSheetData` MCP tool (Convex → NEXT_APP_URL), the
// same pattern as document.analyze → /api/v4-analyze.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileUrl: string | undefined = body.fileUrl;
    const fileName: string = body.fileName || '';
    const maxRows: number = Math.min(Math.max(body.maxRows ?? 250, 1), 2000);
    const maxSheets: number = Math.min(Math.max(body.maxSheets ?? 12, 1), 50);

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl required' }, { status: 400 });
    }

    const res = await fetch(fileUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `failed to fetch file: ${res.status}` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();

    // sheetRows caps decompression cost on huge models (same guard as fileProcessor).
    const wb = XLSX.read(buf, { type: 'array', sheetRows: maxRows, cellDates: true });
    const names = wb.SheetNames.slice(0, maxSheets);

    const sheets = names.map((name) => {
      const ws = wb.Sheets[name];
      const rows = (XLSX.utils.sheet_to_json(ws, {
        header: 1,        // 2D array form — preserves layout for cell-level reasoning
        raw: true,        // keep numbers as numbers (don't stringify)
        defval: null,
        blankrows: false,
      }) as unknown[][]) ?? [];
      return { name, rows, rowCount: rows.length, truncated: rows.length >= maxRows };
    });

    return NextResponse.json({
      ok: true,
      format: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
      sheetCount: wb.SheetNames.length,
      sheetsReturned: sheets.length,
      sheets,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'parse_failed', detail: (e as Error).message },
      { status: 500 },
    );
  }
}
