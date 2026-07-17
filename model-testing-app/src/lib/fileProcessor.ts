// Lazy imports — pdf-parse v2 crashes on Vercel serverless (requires @napi-rs/canvas + DOMMatrix).
// pdf-parse v1.1.1 is serverless-safe. Keep imports lazy to avoid cold-start failures.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');
import mammoth from 'mammoth';

// A parse that produced no usable text but whose bytes CAN be read by a
// vision model (image, or a scanned/image-only PDF). The extract-text route
// switches on this to run the multimodal fallback instead of failing. `pages`
// is carried through for the PDF page-count cap when known.
//
// `no_text` (kind 'media') is terminal: video/audio bytes have no text layer
// AND must not be fed to vision — the extract-text route 422s with a clear
// "media file" message instead. Added after a 2026-07 live-wave .mp4 fell
// through to the read-as-text default and came back as ~900K chars of raw
// container bytes.
export type TextExtractionResult =
  | { status: 'text'; text: string }
  | { status: 'needs_vision'; kind: 'image' | 'pdf'; reason: string; pages?: number }
  | { status: 'no_text'; kind: 'media'; reason: string };

// ── Spreadsheet extraction budgets (2026-07 Wave A fix) ──
// Multi-sheet workbooks (RockCap appraisal models: 30+ tabs, ~12MB) used to
// render only their first 10 sheets under one shared 50K cap that sheet 1
// could exhaust alone — most of the workbook was silently unread. Every
// sheet now gets its own slice of a much larger total, and high-signal
// sheets render first so the 120K-per-page agent window sees them.
const SPREADSHEET_SHEET_ROWS = 400; // rows parsed per sheet (decompression bound)
const SPREADSHEET_TOTAL_BUDGET = 400_000; // target chars across all sheets
const SPREADSHEET_HARD_MAX = 600_000; // absolute output ceiling (documents row budget is 900K)

/** Sheets whose names suggest deal facts — rendered before the rest. */
export const SHEET_PRIORITY_RE =
  /control|summary|input|assumption|lender|terms|funding|finance|appraisal|cash ?flow|cost|dashboard|output|scenario|sensitivit/i;

/** Priority sheets first (original order within each group preserved). */
export function orderSheetsByPriority(names: string[]): string[] {
  const prioritized: string[] = [];
  const rest: string[] = [];
  for (const n of names) (SHEET_PRIORITY_RE.test(n) ? prioritized : rest).push(n);
  return [...prioritized, ...rest];
}

/** Per-sheet char budget: fair share of the total, clamped so a 3-sheet
 * workbook still gets depth (≤40K each) and a 100-sheet one still gets a
 * readable floor (≥3K each). */
export function perSheetBudget(
  sheetCount: number,
  total: number = SPREADSHEET_TOTAL_BUDGET,
): number {
  if (sheetCount <= 0) return total;
  return Math.max(3_000, Math.min(40_000, Math.floor(total / sheetCount)));
}

/**
 * Extract text with a typed signal for the images / textless-PDF cases.
 *
 * Returns `{ status: 'text' }` for anything the server-side parsers can read,
 * and `{ status: 'needs_vision' }` — instead of returning empty (images) or
 * throwing (scanned PDFs) — when the bytes have no text layer but a vision
 * model could transcribe them. A genuinely broken/encrypted PDF still throws.
 *
 * `extractTextFromFile` wraps this to preserve its historical string contract
 * for the many existing callers; only the extract-text route consumes the
 * typed result directly.
 */
export async function extractTextFromFileEx(file: File): Promise<TextExtractionResult> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Handle text files
  if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return { status: 'text', text: await file.text() };
  }

  // Handle EML (email) files — extract body only for classification (no headers)
  if (fileType === 'message/rfc822' || fileName.endsWith('.eml')) {
    const raw = await file.text();
    return { status: 'text', text: extractEmailBody(raw) };
  }

  // Handle PDF files
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    // Convert ArrayBuffer to Buffer for pdf-parse (primary parser)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure data is valid and not empty
    if (!buffer || buffer.length === 0) {
      throw new Error('PDF file appears to be empty or invalid');
    }

    // Verify it's a valid PDF by checking for %PDF within the first 1024 bytes
    // (PDF spec allows leading whitespace, BOM, or other bytes before the header)
    const headerSearchRange = buffer.slice(0, Math.min(1024, buffer.length)).toString('ascii');
    if (!headerSearchRange.includes('%PDF')) {
      throw new Error('File does not appear to be a valid PDF');
    }

    // pdf-parse v1.1.1 — serverless-safe, no canvas/DOM dependencies
    let pdfData: any;
    try {
      console.log('Attempting PDF parsing with pdf-parse v1...');
      pdfData = await pdfParse(buffer);
    } catch (pdfParseError) {
      const pdfParseErrorMessage = pdfParseError instanceof Error ? pdfParseError.message : String(pdfParseError);
      console.error('pdf-parse failed:', pdfParseError);
      throw new Error(`PDF parsing failed: ${pdfParseErrorMessage}. The file may be corrupted, password-protected, or in an unsupported format.`);
    }
    const extractedText = (pdfData?.text || '').trim();
    if (extractedText.length > 0) {
      console.log('Successfully parsed PDF using pdf-parse');
      return { status: 'text', text: extractedText };
    }
    // Parsed cleanly but the PDF has no text layer (scanned / image-only) —
    // signal a vision fallback rather than throwing. numpages lets the route
    // enforce the API's page-count cap before sending it to the model.
    console.warn('pdf-parse returned empty text — flagging PDF for vision fallback');
    return {
      status: 'needs_vision',
      kind: 'pdf',
      reason: 'PDF parsed but no text content found',
      ...(typeof pdfData?.numpages === 'number' ? { pages: pdfData.numpages } : {}),
    };
  }

  // Handle DOCX files
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await mammoth.extractRawText({ buffer });
    return { status: 'text', text: result.value };
  }

  // Handle DOC files (legacy format - limited support)
  if (
    fileType === 'application/msword' ||
    fileName.endsWith('.doc')
  ) {
    // DOC files are binary and require specialized parsing not available in serverless.
    // Return a descriptive placeholder instead of throwing, so the file can still be filed
    // with limited metadata rather than blocking the entire upload.
    return {
      status: 'text',
      text: `[Legacy .doc format — limited text extraction]\n\nThis document "${file.name}" is in the legacy Microsoft Word .doc format. Full text extraction is not available for this format in the current pipeline. Please convert to .docx or PDF for complete analysis.\n\nThe document has been accepted for filing with limited metadata.`,
    };
  }

  // Handle CSV files
  if (
    fileType === 'text/csv' ||
    fileName.endsWith('.csv')
  ) {
    try {
      const csvText = await file.text();
      // Parse CSV and format it nicely for analysis
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return { status: 'text', text: 'Empty CSV file' };
      }

      // Format CSV as readable text with headers
      const formattedLines = lines.map((line, index) => {
        const cells = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
        return `Row ${index + 1}: ${cells.join(' | ')}`;
      });

      return { status: 'text', text: formattedLines.join('\n') };
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle Excel files (.xlsx, .xls)
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.ms-excel.sheet.macroEnabled.12' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.xlsm')
  ) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Row cap bounds decompression of massive XLSM files (30+ tabs ×
      // 1000s of rows); 400 rows covers real appraisal/sensitivity tables.
      const workbook = XLSX.read(arrayBuffer, { type: 'array', sheetRows: SPREADSHEET_SHEET_ROWS });

      // 2026-07 Wave A fix: the previous walk (first 10 sheets, one global
      // 50K cap that sheet 1 could exhaust alone) left 30-sheet RockCap
      // models 90% unread on every client. Now EVERY sheet renders under a
      // per-sheet budget (early sheets can't starve later ones), ordered so
      // fact-bearing sheets (control/summary/lender/terms/…) come FIRST —
      // the downstream extractText return pages 120K chars at a time, so
      // output order decides what an agent sees on page one. A manifest
      // header lists every sheet with its rendered size, so truncation is
      // visible instead of silent.
      const allSheetNames: string[] = workbook.SheetNames;
      const ordered = orderSheetsByPriority(allSheetNames);
      const budget = perSheetBudget(ordered.length);

      const rendered: Array<{ name: string; text: string; note: string }> = [];
      for (const sheetName of ordered) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = worksheet
          ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
          : [];
        let sheetText = '';
        let renderedRows = 0;
        let nonEmptyRows = 0;
        let capped = false;
        for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
          const row = jsonData[rowIndex] as any[];
          if (!Array.isArray(row) || !row.some(cell => cell !== '')) continue;
          nonEmptyRows++;
          if (capped) continue; // keep counting rows for the manifest
          const rowText = row
            .map(cell => (cell === null || cell === undefined ? '' : String(cell).trim()))
            .filter(cell => cell !== '')
            .join(' | ');
          if (!rowText) continue;
          const line = `Row ${rowIndex + 1}: ${rowText}\n`;
          if (sheetText.length + line.length > budget) {
            capped = true;
            continue;
          }
          sheetText += line;
          renderedRows++;
        }
        const note = capped
          ? `${renderedRows}/${nonEmptyRows} rows (sheet capped at ${budget} chars)`
          : nonEmptyRows === 0
            ? 'empty'
            : `${renderedRows} rows`;
        rendered.push({ name: sheetName, text: sheetText, note });
      }

      const manifest =
        `[Workbook: ${allSheetNames.length} sheets, ALL rendered below in priority order ` +
        `(per-sheet cap ${budget} chars). Sheets: ` +
        rendered.map(s => `${s.name} (${s.note})`).join('; ') +
        `]\n`;

      let fullText = manifest;
      for (const s of rendered) {
        if (fullText.length >= SPREADSHEET_HARD_MAX) {
          fullText += `\n[Output hard cap ${SPREADSHEET_HARD_MAX} chars reached — remaining sheets listed in the manifest were rendered but dropped]\n`;
          break;
        }
        fullText += `\n=== Sheet: ${s.name} ===\n`;
        fullText += s.text.length > 0 ? s.text : '(no non-empty rows)\n';
        if (s.note.includes('capped')) {
          fullText += `[Sheet "${s.name}" truncated: ${s.note}]\n`;
        }
      }

      return { status: 'text', text: fullText.trim() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse Excel file: ${errorMessage}`);
    }
  }

  // Images: no text layer — signal a vision fallback (the extract-text route
  // transcribes them). Callers via extractTextFromFile still receive '' for
  // backward compatibility.
  if (fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(fileName)) {
    return { status: 'needs_vision', kind: 'image', reason: 'image file has no text layer' };
  }

  // Video / audio: no text layer AND no vision path — return a terminal
  // no_text signal so the extract-text route 422s with a clear "media file"
  // message. Without this guard a .mp4 falls through to the read-as-text
  // default below and returns ~900K chars of raw container bytes (2026-07
  // live wave). Matched by MIME prefix or by a known media extension.
  if (
    fileType.startsWith('video/') ||
    fileType.startsWith('audio/') ||
    /\.(mp4|m4v|mov|avi|mkv|webm|wmv|flv|mpe?g|3gp|mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?)$/i.test(fileName)
  ) {
    return {
      status: 'no_text',
      kind: 'media',
      reason: `media file (${fileType || fileName}) has no text layer and cannot be transcribed by vision`,
    };
  }

  // Default: try to read as text
  try {
    return { status: 'text', text: await file.text() };
  } catch (error) {
    throw new Error(`Unsupported file type: ${fileType}. Supported types: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls`);
  }
}

/**
 * Legacy string-returning wrapper around {@link extractTextFromFileEx}. Kept so
 * the many existing callers (drive/ingest, v4-analyze, meeting/intelligence
 * queues, …) are unchanged: images resolve to '' (their prior behavior), and a
 * textless PDF throws the same "no text content" error the v4 pipeline already
 * catches to trigger its own raw-file multimodal fallback.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractTextFromFileEx(file);
  if (result.status === 'text') return result.text;
  if (result.status === 'needs_vision' && result.kind === 'image') return '';
  throw new Error(result.reason);
}

export async function convertSpreadsheetToMarkdown(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Handle CSV files
  if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
    try {
      const csvText = await file.text();
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('Empty CSV file');
      }

      // Parse CSV rows
      const rows: string[][] = lines.map(line => {
        // Handle quoted values and commas within quotes
        const cells: string[] = [];
        let currentCell = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cells.push(currentCell.trim());
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
        cells.push(currentCell.trim());
        return cells;
      });

      if (rows.length === 0) {
        throw new Error('No data rows found in CSV');
      }

      // First row is header
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Build markdown table
      let markdown = '## CSV Data\n\n';
      
      // Header row
      markdown += '| ' + headers.join(' | ') + ' |\n';
      
      // Separator row
      markdown += '|' + headers.map(() => '---').join('|') + '|\n';
      
      // Data rows
      dataRows.forEach(row => {
        // Pad row to match header length
        const paddedRow = [...row];
        while (paddedRow.length < headers.length) {
          paddedRow.push('');
        }
        markdown += '| ' + paddedRow.slice(0, headers.length).join(' | ') + ' |\n';
      });

      return markdown.trim();
    } catch (error) {
      throw new Error(`Failed to convert CSV to Markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle Excel files (.xlsx, .xls)
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.ms-excel.sheet.macroEnabled.12' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.xlsm')
  ) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      let markdown = '';
      const sheetNames = workbook.SheetNames;
      
      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to array of arrays (preserving empty cells)
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const maxCol = range.e.c;
        const maxRow = range.e.r;
        
        // Build 2D array
        const sheetData: string[][] = [];
        for (let row = 0; row <= maxRow; row++) {
          const rowData: string[] = [];
          for (let col = 0; col <= maxCol; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = worksheet[cellAddress];
            rowData.push(cell ? String(cell.v || '') : '');
          }
          sheetData.push(rowData);
        }
        
        if (sheetData.length === 0) {
          continue; // Skip empty sheets
        }

        // Add sheet header
        markdown += `## Sheet: ${sheetName}\n\n`;
        
        // Determine number of columns (use first row as reference)
        const numCols = sheetData[0]?.length || 0;
        if (numCols === 0) {
          continue; // Skip sheets with no columns
        }
        
        // Header row (first row)
        const headers = sheetData[0].slice(0, numCols);
        markdown += '| ' + headers.join(' | ') + ' |\n';
        
        // Separator row
        markdown += '|' + headers.map(() => '---').join('|') + '|\n';
        
        // Data rows (remaining rows)
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          // Pad row to match header length
          const paddedRow = [...row];
          while (paddedRow.length < numCols) {
            paddedRow.push('');
          }
          markdown += '| ' + paddedRow.slice(0, numCols).join(' | ') + ' |\n';
        }
        
        markdown += '\n';
      }
      
      if (!markdown.trim()) {
        throw new Error('No data found in Excel file');
      }
      
      return markdown.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert Excel file to Markdown: ${errorMessage}`);
    }
  }

  throw new Error('File is not a spreadsheet (CSV, XLSX, or XLS)');
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 100 * 1024 * 1024; // 100MB
  const allowedTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'message/rfc822',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/msword',
    // Image types - handled separately by vision analysis
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  const allowedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv', '.xlsx', '.xls', '.xlsm', '.eml', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  if (!allowedTypes.includes(file.type) && !hasValidExtension) {
    return { valid: false, error: 'Unsupported file type. Supported: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls, .xlsm, .eml, .png, .jpg, .gif, .webp' };
  }

  return { valid: true };
}

/**
 * Extract the body content from a raw .eml file, stripping all email headers.
 * This ensures classification is based on document content, not email format.
 */
export function extractEmailBody(raw: string): string {
  const blankLineIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  if (blankLineIndex === -1) return raw;
  let body = raw.slice(blankLineIndex).trim();

  // Strip quoted headers from forwarded messages (lines starting with "> From:", etc.)
  body = body.replace(/^>?\s*(From|To|Cc|Bcc|Date|Subject|Sent|Reply-To):.*$/gm, '');
  // Strip common forward/reply markers
  body = body.replace(/^-{3,}\s*(Forwarded|Original)\s+[Mm]essage\s*-{3,}$/gm, '');

  return body.trim();
}

/**
 * Extract structured email metadata from a raw .eml file for provenance storage.
 */
export function extractEmailMetadata(raw: string): {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
} {
  const blankLineIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  if (blankLineIndex === -1) return {};
  const headerSection = raw.slice(0, blankLineIndex);
  const getHeader = (name: string) => {
    const match = headerSection.match(new RegExp(`^${name}:\\s*(.+)`, 'im'));
    return match ? match[1].trim() : undefined;
  };
  return {
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
  };
}
