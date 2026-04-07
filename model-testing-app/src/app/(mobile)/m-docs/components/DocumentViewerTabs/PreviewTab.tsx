'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import FileTypeBadge from '../shared/FileTypeBadge';

const PdfPreview = dynamic(() => import('./PdfPreview'), { ssr: false });
const XlsxPreview = dynamic(() => import('./XlsxPreview'), { ssr: false });

interface PreviewTabProps {
  fileUrl: string | null | undefined;
  fileType: string;
  fileName: string;
  fileSize: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType: string): boolean {
  const t = fileType.toLowerCase();
  return t.includes('jpeg') || t.includes('jpg') || t.includes('png') || t.includes('gif') || t.includes('webp');
}

function isPdf(fileType: string): boolean {
  return fileType.toLowerCase().includes('pdf');
}

function isXlsx(fileType: string, fileName: string): boolean {
  const t = fileType.toLowerCase();
  if (t.includes('spreadsheetml') || t.includes('ms-excel')) return true;
  return /\.(xlsx|xls|xlsm)$/i.test(fileName);
}

// ─── Zoom toolbar ───────────────────────────────────────────────────
function ZoomToolbar({ zoom, onZoomIn, onZoomOut, onReset }: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 mb-2">
      <button onClick={onZoomOut} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)]" aria-label="Zoom out">
        <ZoomOut className="w-4 h-4 text-[var(--m-text-secondary)]" />
      </button>
      <span className="text-[11px] text-[var(--m-text-tertiary)] w-10 text-center font-medium">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)]" aria-label="Zoom in">
        <ZoomIn className="w-4 h-4 text-[var(--m-text-secondary)]" />
      </button>
      {zoom !== 1 && (
        <button onClick={onReset} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)] ml-1" aria-label="Reset zoom">
          <RotateCcw className="w-3.5 h-3.5 text-[var(--m-text-secondary)]" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
export default function PreviewTab({ fileUrl, fileType, fileName, fileSize }: PreviewTabProps) {
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => setZoom(prev => Math.min(4, +(prev + 0.5).toFixed(1)));
  const zoomOut = () => setZoom(prev => Math.max(0.5, +(prev - 0.5).toFixed(1)));
  const resetZoom = () => setZoom(1);

  if (!fileUrl) {
    return (
      <div className="px-[var(--m-page-px)] py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] py-4 flex flex-col gap-3">
      {(isPdf(fileType) || isImage(fileType) || isXlsx(fileType, fileName)) && (
        <ZoomToolbar zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
      )}

      {isPdf(fileType) ? (
        /* PDF: zoom prop triggers canvas re-render at new scale */
        <div
          className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
          style={{ height: '60vh' }}
        >
          <PdfPreview fileUrl={fileUrl} zoom={zoom} />
        </div>
      ) : isXlsx(fileType, fileName) ? (
        /* XLSX: SheetJS sheet_to_html into scaled DOM wrapper */
        <XlsxPreview fileUrl={fileUrl} zoom={zoom} />
      ) : isImage(fileType) ? (
        /* Image: CSS width scaling + native scroll for pan */
        <div
          className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
          style={{ height: '60vh' }}
        >
          <img
            src={fileUrl}
            alt={fileName}
            draggable={false}
            style={{ width: `${100 * zoom}%`, height: 'auto' }}
          />
        </div>
      ) : (
        <div className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-hidden flex items-center justify-center" style={{ height: '60vh' }}>
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <FileTypeBadge fileType={fileType} />
            <p className="text-[13px] text-[var(--m-text-tertiary)]">Preview not available</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)]">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}

      {/* Download/Open buttons moved to DocumentViewer sticky footer */}
    </div>
  );
}
