import { describe, it, expect } from 'vitest';
import { orderSheetsByPriority, perSheetBudget, SHEET_PRIORITY_RE } from '@/lib/fileProcessor';

// Pure-helper coverage for the 2026-07 multi-sheet extraction fix: every
// sheet renders (per-sheet budget), and fact-bearing sheets render first so
// the 120K-per-page agent window sees them on page one.

describe('orderSheetsByPriority', () => {
  it('puts fact-bearing sheets first, preserving original order within groups', () => {
    // Real RockCapBFS tab shapes from the Wave A corpus.
    const names = [
      'Cover',
      'Instructions',
      'Control',
      'Unit Schedule',
      'Cashflow',
      'Lender 1',
      'Notes',
      'Summary Outputs',
    ];
    expect(orderSheetsByPriority(names)).toEqual([
      'Control',
      'Cashflow',
      'Lender 1',
      'Summary Outputs',
      'Cover',
      'Instructions',
      'Unit Schedule',
      'Notes',
    ]);
  });

  it('matches the priority patterns case-insensitively', () => {
    for (const n of ['SENSITIVITY', 'Cash Flow', 'assumptions', 'Funding Terms', 'Appraisal']) {
      expect(SHEET_PRIORITY_RE.test(n)).toBe(true);
    }
    for (const n of ['Cover', 'Logo', 'Instructions']) {
      expect(SHEET_PRIORITY_RE.test(n)).toBe(false);
    }
  });
});

describe('perSheetBudget', () => {
  it('gives a 33-sheet workbook a fair share instead of starving late sheets', () => {
    // 400K / 33 ≈ 12K each — the old walk gave sheets 11-33 zero chars.
    expect(perSheetBudget(33)).toBe(Math.floor(400_000 / 33));
  });

  it('clamps small workbooks to 40K per sheet and huge ones to a 3K floor', () => {
    expect(perSheetBudget(3)).toBe(40_000);
    expect(perSheetBudget(1)).toBe(40_000);
    expect(perSheetBudget(500)).toBe(3_000);
  });

  it('degenerate zero-sheet input returns the whole budget', () => {
    expect(perSheetBudget(0)).toBe(400_000);
  });
});

// End-to-end parse: a synthetic 33-sheet workbook (the RockCapBFS shape that
// went 90% unread in Wave A) must render EVERY sheet, priority sheets first.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');
import { extractTextFromFileEx } from '@/lib/fileProcessor';

describe('extractTextFromFileEx — multi-sheet workbook', () => {
  it('renders all 33 sheets with the priority ones first and a full manifest', async () => {
    const wb = XLSX.utils.book_new();
    const names: string[] = [];
    for (let i = 1; i <= 33; i++) {
      // Sheet 20 is the buried high-signal one the old walk never reached.
      const name = i === 20 ? 'Lender Comparison' : i === 1 ? 'Cover' : `Site${i}`;
      names.push(name);
      const rows = [[`marker-${name}`, i], ['GDV', 1000 + i]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([bytes], 'model.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await extractTextFromFileEx(file);
    expect(result.status).toBe('text');
    const text = (result as { status: 'text'; text: string }).text;

    // Manifest names every sheet.
    expect(text).toMatch(/^\[Workbook: 33 sheets, ALL rendered/);
    for (const n of names) expect(text).toContain(`=== Sheet: ${n} ===`);
    // The buried priority sheet renders BEFORE the non-priority Cover sheet.
    expect(text.indexOf('=== Sheet: Lender Comparison ===')).toBeLessThan(
      text.indexOf('=== Sheet: Cover ==='),
    );
    // Its content actually made it out (the old walk dropped it entirely).
    expect(text).toContain('marker-Lender Comparison');
  });
});
