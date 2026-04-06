'use client';

import { useRef, useState, useCallback } from 'react';
import FileTypeBadge from '../shared/FileTypeBadge';

interface PreviewTabProps {
  fileUrl: string | null | undefined;
  fileType: string;
  fileName: string;
  fileSize: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType: string): boolean {
  const t = fileType.toLowerCase();
  return t.includes('jpeg') || t.includes('jpg') || t.includes('png') || t.includes('gif') || t.includes('webp');
}

function isPdf(fileType: string): boolean {
  return fileType.toLowerCase().includes('pdf');
}

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
    setScale(prev => prev > 1 ? 1 : 2.5);
  }, []);

  // Simple double-tap detection
  const lastTap = useRef(0);
  const handleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleDoubleTap();
    }
    lastTap.current = now;
  }, [handleDoubleTap]);

  return (
    <div
      ref={containerRef}
      className="w-full aspect-[0.707] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-auto"
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
          height: scale > 1 ? `${100 * scale}%` : '100%',
          transition: lastDistance.current ? 'none' : 'transform 0.2s ease-out',
        }}
        className="flex items-center justify-center min-h-full"
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          onClick={() => setScale(1)}
          className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white text-[10px] rounded-md"
        >
          Reset
        </button>
      )}
    </div>
  );
}

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
        <div className="relative">
          <ZoomablePreview>
            <iframe
              src={`${fileUrl}#view=FitH&toolbar=0`}
              title={fileName}
              className="w-full border-none pointer-events-none"
              style={{ height: '141.4vw', maxHeight: '80vh' }}
            />
          </ZoomablePreview>
          <p className="text-[10px] text-[var(--m-text-placeholder)] text-center mt-1">Pinch to zoom · Double-tap to toggle</p>
        </div>
      ) : isImage(fileType) ? (
        <div className="relative">
          <ZoomablePreview>
            <img
              src={fileUrl}
              alt={fileName}
              className="w-full h-auto object-contain"
              draggable={false}
            />
          </ZoomablePreview>
          <p className="text-[10px] text-[var(--m-text-placeholder)] text-center mt-1">Pinch to zoom · Double-tap to toggle</p>
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
