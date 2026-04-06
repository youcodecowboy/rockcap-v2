'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface PdfPreviewProps {
  fileUrl: string;
}

export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      try {
        // Cancel any previous render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const containerWidth = container.getBoundingClientRect().width;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / unscaledViewport.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${(containerWidth * unscaledViewport.height) / unscaledViewport.width}px`;

        const ctx = canvas.getContext('2d')!;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled) setStatus('rendered');
      } catch (err: any) {
        if (cancelled || err?.name === 'RenderingCancelledException') return;
        console.error('[PdfPreview] render failed:', err);
        setErrorMsg(err?.message || 'Unknown error');
        setStatus('error');
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [fileUrl]);

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <div className="w-8 h-8 rounded-md bg-[#fef2f2] flex items-center justify-center">
          <span className="text-[9px] font-bold text-[#991b1b]">PDF</span>
        </div>
        <p className="text-[13px] text-[var(--m-text-tertiary)]">Could not render PDF</p>
        <p className="text-[10px] text-[var(--m-text-placeholder)] max-w-[200px] text-center">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {status === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <span className="text-[13px] text-[var(--m-text-tertiary)]">Rendering PDF…</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={status === 'loading' ? 'hidden' : 'block w-full'}
      />
      {numPages && numPages > 1 && status === 'rendered' && (
        <div className="text-center py-2 text-[10px] text-[var(--m-text-placeholder)]">
          Page 1 of {numPages}
        </div>
      )}
    </div>
  );
}
