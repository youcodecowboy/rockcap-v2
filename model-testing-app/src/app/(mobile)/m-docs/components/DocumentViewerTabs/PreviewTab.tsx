'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import FileTypeBadge from '../shared/FileTypeBadge';

const PdfPreview = dynamic(() => import('./PdfPreview'), { ssr: false });

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

// ─── Zoom controls + scrollable container ───────────────────────────
// No custom touch handlers. Zoom via buttons, pan via native scroll.
function ZoomablePreview({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => setZoom(prev => Math.min(4, prev + 0.5));
  const zoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.5));
  const resetZoom = () => setZoom(1);

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className="relative">
      {/* Zoom toolbar */}
      <div className="flex items-center justify-center gap-1 mb-2">
        <button onClick={zoomOut} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)]" aria-label="Zoom out">
          <ZoomOut className="w-4 h-4 text-[var(--m-text-secondary)]" />
        </button>
        <span className="text-[11px] text-[var(--m-text-tertiary)] w-10 text-center font-medium">{zoomLabel}</span>
        <button onClick={zoomIn} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)]" aria-label="Zoom in">
          <ZoomIn className="w-4 h-4 text-[var(--m-text-secondary)]" />
        </button>
        {zoom !== 1 && (
          <button onClick={resetZoom} className="p-2 rounded-md bg-[var(--m-bg-inset)] active:bg-[var(--m-border)] ml-1" aria-label="Reset zoom">
            <RotateCcw className="w-3.5 h-3.5 text-[var(--m-text-secondary)]" />
          </button>
        )}
      </div>

      {/* Scrollable container — native scroll for panning */}
      <div
        className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
        style={{ height: '65vh' }}
      >
        <div style={{ width: `${100 * zoom}%` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
export default function PreviewTab({ fileUrl, fileType, fileName, fileSize }: PreviewTabProps) {
  if (!fileUrl) {
    return (
      <div className="px-[var(--m-page-px)] py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] py-4 flex flex-col gap-3">
      {isPdf(fileType) ? (
        <ZoomablePreview>
          <PdfPreview fileUrl={fileUrl} />
        </ZoomablePreview>
      ) : isImage(fileType) ? (
        <ZoomablePreview>
          <img src={fileUrl} alt={fileName} className="w-full h-auto" draggable={false} />
        </ZoomablePreview>
      ) : (
        <div className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-hidden flex items-center justify-center" style={{ height: '65vh' }}>
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <FileTypeBadge fileType={fileType} />
            <p className="text-[13px] text-[var(--m-text-tertiary)]">Preview not available</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)]">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <a href={fileUrl} download={fileName} className="flex-1 py-2.5 rounded-lg bg-black text-white text-[13px] font-medium text-center">
          Download
        </a>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-lg bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[13px] font-medium text-center">
          Open in browser
        </a>
      </div>
    </div>
  );
}
