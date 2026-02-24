import mammoth from 'mammoth';
// Use pdf-parse for PDF parsing - it's simpler, more reliable, and works well in serverless environments
// pdf-parse uses pdfjs-dist internally but handles worker setup automatically
// Note: pdf-parse exports PDFParse as a named export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');

export async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Handle text files
  if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return await file.text();
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
    
    // Verify it's a valid PDF by checking the header
    const pdfHeader = buffer.slice(0, 4).toString('ascii');
    if (pdfHeader !== '%PDF') {
      throw new Error('File does not appear to be a valid PDF');
    }
    
    // PRIMARY: Use pdf-parse first - it's more reliable in serverless environments
    // pdfjs-dist has worker issues in Vercel/serverless, so we use pdf-parse as primary
    try {
      console.log('Attempting PDF parsing with pdf-parse (primary parser)...');
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const extractedText = pdfData.text || '';
      if (extractedText.trim().length > 0) {
        console.log('Successfully parsed PDF using pdf-parse');
        return extractedText.trim();
      } else {
        console.warn('pdf-parse returned empty text...');
        throw new Error('PDF parsed but no text content found');
      }
    } catch (pdfParseError) {
      const pdfParseErrorMessage = pdfParseError instanceof Error ? pdfParseError.message : String(pdfParseError);
      console.error('pdf-parse failed:', pdfParseError);
      
      // If pdf-parse fails, the PDF might be corrupted or in an unsupported format
      // pdfjs-dist has persistent worker issues in serverless, so we don't use it as fallback
      throw new Error(`PDF parsing failed: ${pdfParseErrorMessage}. The file may be corrupted, password-protected, or in an unsupported format. Please try converting the PDF to text format or use a different file type.`);
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
  const maxSize = 100 * 1024 * 1024; // 100MB
  const allowedTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
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

  const allowedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  if (!allowedTypes.includes(file.type) && !hasValidExtension) {
    return { valid: false, error: 'Unsupported file type. Supported: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls, .png, .jpg, .gif, .webp' };
  }

  return { valid: true };
}

