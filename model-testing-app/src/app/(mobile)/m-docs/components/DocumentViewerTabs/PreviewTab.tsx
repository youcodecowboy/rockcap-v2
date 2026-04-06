'use client';

import { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
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

// ─── Zoomable wrapper ───────────────────────────────────────────────
// Uses real width/height scaling (not CSS transform) so overflow scroll
// works naturally for panning in all directions.
function ZoomablePreview({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const lastDistance = useRef<number | null>(null);
  const pinchCenter = useRef<{ x: number; y: number } | null>(null);

  const getDistance = (touches: TouchList) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  };

  const getMidpoint = (touches: TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDistance.current = getDistance(e.touches);
      pinchCenter.current = getMidpoint(e.touches);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistance.current !== null) {
      e.preventDefault(); // prevent browser zoom
      const dist = getDistance(e.touches);
      const delta = dist / lastDistance.current;
      setScale(prev => {
        const next = Math.min(6, Math.max(1, prev * delta));

        // Adjust scroll to keep pinch center stable
        const container = containerRef.current;
        const mid = getMidpoint(e.touches);
        if (container && pinchCenter.current) {
          const rect = container.getBoundingClientRect();
          const relX = (mid.x - rect.left + container.scrollLeft) / prev;
          const relY = (mid.y - rect.top + container.scrollTop) / prev;
          requestAnimationFrame(() => {
            container.scrollLeft = relX * next - (mid.x - rect.left);
            container.scrollTop = relY * next - (mid.y - rect.top);
          });
        }

        return next;
      });
      lastDistance.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastDistance.current = null;
    pinchCenter.current = null;
  }, []);

  // Double-tap detection
  const lastTap = useRef(0);
  const handleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setScale(prev => {
        if (prev > 1) return 1;
        // Zoom to tap point
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const tapX = e.touches[0].clientX - rect.left;
          const tapY = e.touches[0].clientY - rect.top;
          requestAnimationFrame(() => {
            container.scrollLeft = tapX * 3 - rect.width / 2;
            container.scrollTop = tapY * 3 - rect.height / 2;
          });
        }
        return 3;
      });
    }
    lastTap.current = now;
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
        style={{
          height: '70vh',
          touchAction: scale > 1 ? 'none' : 'pan-y',
        }}
        onTouchStart={(e) => { handleTap(e); handleTouchStart(e); }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ width: `${100 * scale}%` }}>
          {children}
        </div>
      </div>
      {scale > 1 && (
        <button
          onClick={() => setScale(1)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 text-white text-[11px] rounded-full z-10"
        >
          Reset zoom
        </button>
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
        <div className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-hidden flex items-center justify-center" style={{ height: '70vh' }}>
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <FileTypeBadge fileType={fileType} />
            <p className="text-[13px] text-[var(--m-text-tertiary)]">Preview not available</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)]">{formatFileSize(fileSize)}</p>
          </div>
        </div>
      )}

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
