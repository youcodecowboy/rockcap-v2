'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import FileTypeBadge from '../shared/FileTypeBadge';

// Dynamically import react-pdf (uses canvas APIs not available in SSR)
const ReactPdfDocument = dynamic(
  () => import('react-pdf').then(mod => {
    mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
    return mod.Document;
  }),
  { ssr: false }
);
const ReactPdfPage = dynamic(
  () => import('react-pdf').then(mod => mod.Page),
  { ssr: false }
);

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

// ─── Zoomable wrapper ───────────────────────────────────────────────
function ZoomablePreview({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const lastDistance = useRef<number | null>(null);

  const getDistance = (touches: TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDistance.current = getDistance(e.touches);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistance.current !== null) {
      const dist = getDistance(e.touches);
      const delta = dist / lastDistance.current;
      setScale(prev => Math.min(5, Math.max(1, prev * delta)));
      lastDistance.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastDistance.current = null;
  }, []);

  const handleDoubleTap = useCallback(() => {
    setScale(prev => (prev > 1 ? 1 : 2.5));
  }, []);

  const lastTap = useRef(0);
  const handleTap = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const now = Date.now();
      if (now - lastTap.current < 300) handleDoubleTap();
      lastTap.current = now;
    },
    [handleDoubleTap],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
      onTouchStart={(e) => { handleTap(e); handleTouchStart(e); }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: scale > 1 ? 'none' : 'pan-y' }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: scale > 1 ? `${100 * scale}%` : '100%',
          transition: lastDistance.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          onClick={() => setScale(1)}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white text-[11px] rounded-full z-10"
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}

// ─── PDF page rendered to canvas ────────────────────────────────────
function PdfPreview({ fileUrl }: { fileUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  // Measure container width for responsive page rendering
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setContainerWidth(node.getBoundingClientRect().width);
      containerRef.current = node;
    }
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <FileTypeBadge fileType="application/pdf" />
        <p className="text-[13px] text-[var(--m-text-tertiary)]">Could not render PDF</p>
      </div>
    );
  }

  return (
    <div ref={measureRef}>
      <ReactPdfDocument
        file={fileUrl}
        onLoadSuccess={onDocumentLoad}
        onLoadError={() => setError(true)}
        loading={
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-[var(--m-text-tertiary)]">Rendering PDF…</span>
          </div>
        }
      >
        <ReactPdfPage
          pageNumber={1}
          width={containerWidth || undefined}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </ReactPdfDocument>
      {numPages && numPages > 1 && (
        <div className="text-center py-2 text-[10px] text-[var(--m-text-placeholder)]">
          Page 1 of {numPages}
        </div>
      )}
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
    <div className="px-[var(--m-page-px)] py-4 flex flex-col gap-4">
      {/* Preview area */}
      {isPdf(fileType) ? (
        <div>
          <ZoomablePreview>
            <PdfPreview fileUrl={fileUrl} />
          </ZoomablePreview>
          <p className="text-[10px] text-[var(--m-text-placeholder)] text-center mt-1">
            Pinch to zoom · Double-tap to toggle
          </p>
        </div>
      ) : isImage(fileType) ? (
        <div>
          <ZoomablePreview>
            <img
              src={fileUrl}
              alt={fileName}
              className="w-full h-auto object-contain"
              draggable={false}
            />
          </ZoomablePreview>
          <p className="text-[10px] text-[var(--m-text-placeholder)] text-center mt-1">
            Pinch to zoom · Double-tap to toggle
          </p>
        </div>
      ) : (
        <div className="w-full aspect-[0.707] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-hidden flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <FileTypeBadge fileType={fileType} />
            <p className="text-[13px] text-[var(--m-text-tertiary)]">Preview not available</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)]">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <a
          href={fileUrl}
          download={fileName}
          className="flex-1 py-2.5 rounded-lg bg-black text-white text-[13px] font-medium text-center"
        >
          Download
        </a>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-lg bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[13px] font-medium text-center"
        >
          Open in browser
        </a>
      </div>
    </div>
  );
}
