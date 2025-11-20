import mammoth from 'mammoth';
// Use pdfjs-dist legacy build (version 3.x) which doesn't require workers - perfect for serverless
// The legacy build runs everything in the main thread, making it ideal for serverless environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');

// CRITICAL: Legacy build doesn't use workers - it runs everything in the main thread
// This is perfect for serverless environments where worker files can't be loaded
// No need to configure GlobalWorkerOptions with legacy build

export async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Handle text files
  if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return await file.text();
  }

  // Handle PDF files
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Convert ArrayBuffer to Uint8Array (pdfjs-dist requires Uint8Array, not Buffer)
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Ensure data is valid and not empty
      if (!uint8Array || uint8Array.length === 0) {
        throw new Error('PDF file appears to be empty or invalid');
      }
      
      // Verify it's a valid PDF by checking the header
      const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4));
      if (pdfHeader !== '%PDF') {
        throw new Error('File does not appear to be a valid PDF');
      }
      
      // Load PDF document - configure to run without workers
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        verbosity: 0, // Suppress warnings
        // Explicitly disable worker
        disableAutoFetch: true,
        disableStream: true,
      });
      
      const pdf = await loadingTask.promise;
      
      // Extract text from all pages
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine all text items
        const pageText = textContent.items
          .map((item: any) => {
            if ('str' in item) {
              return item.str || '';
            }
            return '';
          })
          .join(' ');
        
        fullText += pageText + '\n';
      }
      
      // Cleanup
      await pdf.destroy();
      
      return fullText.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Log the full error for debugging
      console.error('PDF parsing error details:', error);
      console.error('Error message:', errorMessage);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      if (errorMessage.includes('worker') || errorMessage.includes('pdf.worker')) {
        throw new Error(`PDF parsing worker error: ${errorMessage}. Please try converting the PDF to text format or use a different file type.`);
      }
      throw new Error(`Failed to parse PDF: ${errorMessage}`);
    }
  }

  // Handle DOCX files
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Handle DOC files (legacy format - basic text extraction)
  if (
    fileType === 'application/msword' ||
    fileName.endsWith('.doc')
  ) {
    // DOC files are binary and harder to parse without additional libraries
    // For now, return a message indicating the limitation
    throw new Error('Legacy .doc files are not fully supported. Please convert to .docx or PDF.');
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
        return 'Empty CSV file';
      }
      
      // Format CSV as readable text with headers
      const formattedLines = lines.map((line, index) => {
        const cells = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
        return `Row ${index + 1}: ${cells.join(' | ')}`;
      });
      
      return formattedLines.join('\n');
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle Excel files (.xlsx, .xls)
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  ) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Extract text from all sheets
      let fullText = '';
      const sheetNames = workbook.SheetNames;
      
      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        // Convert sheet to JSON for easier text extraction
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        fullText += `\n=== Sheet: ${sheetName} ===\n`;
        
        // Format each row
        jsonData.forEach((row: any[], rowIndex: number) => {
          if (Array.isArray(row) && row.some(cell => cell !== '')) {
            const rowText = row
              .map(cell => {
                if (cell === null || cell === undefined) return '';
                return String(cell).trim();
              })
              .filter(cell => cell !== '')
              .join(' | ');
            
            if (rowText) {
              fullText += `Row ${rowIndex + 1}: ${rowText}\n`;
            }
          }
        });
      }
      
      return fullText.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse Excel file: ${errorMessage}`);
    }
  }

  // Default: try to read as text
  try {
    return await file.text();
  } catch (error) {
    throw new Error(`Unsupported file type: ${fileType}. Supported types: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls`);
  }
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
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
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
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/msword',
  ];
  
  const allowedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv', '.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  if (!allowedTypes.includes(file.type) && !hasValidExtension) {
    return { valid: false, error: 'Unsupported file type. Supported: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls' };
  }

  return { valid: true };
}

