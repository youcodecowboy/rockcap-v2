'use client';

import { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface PdfPreviewProps {
  fileUrl: string;
  zoom?: number; // 1 = fit to container width
}

export default function PdfPreview({ fileUrl, zoom = 1 }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const renderTaskRef = useRef<any>(null);
  const pdfPageRef = useRef<any>(null);
  const baseWidthRef = useRef<number>(0);

  // Load PDF once
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        const pdf = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        const page = await pdf.getPage(1);
        if (cancelled) return;
        pdfPageRef.current = page;

        // Capture base container width on first load
        if (containerRef.current) {
          baseWidthRef.current = containerRef.current.getBoundingClientRect().width;
        }

        // Trigger initial render
        renderPage(page, zoom);
      } catch (err: any) {
        if (cancelled) return;
        console.error('[PdfPreview] load failed:', err);
        setErrorMsg(err?.message || 'Unknown error');
        setStatus('error');
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [fileUrl]); // only reload on URL change

  // Re-render when zoom changes
  useEffect(() => {
    if (pdfPageRef.current && baseWidthRef.current > 0) {
      renderPage(pdfPageRef.current, zoom);
    }
  }, [zoom]);

  function renderPage(page: any, zoomLevel: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancel previous render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const baseWidth = baseWidthRef.current;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const fitScale = baseWidth / unscaledViewport.width;

    // Apply zoom on top of fit-to-width scale
    // Use 3x pixel ratio for crisp rendering
    const dpr = 3;
    const displayScale = fitScale * zoomLevel;
    const renderScale = displayScale * dpr;
    const viewport = page.getViewport({ scale: renderScale });

    const displayWidth = baseWidth * zoomLevel;
    const displayHeight = (displayWidth * unscaledViewport.height) / unscaledViewport.width;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext('2d')!;
    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;

    task.promise
      .then(() => setStatus('rendered'))
      .catch((err: any) => {
        if (err?.name === 'RenderingCancelledException') return;
        console.error('[PdfPreview] render failed:', err);
        setErrorMsg(err?.message || 'Unknown error');
        setStatus('error');
      });
  }

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
        className={status === 'loading' ? 'hidden' : 'block'}
      />
      {numPages && numPages > 1 && status === 'rendered' && (
        <div className="text-center py-2 text-[10px] text-[var(--m-text-placeholder)]">
          Page 1 of {numPages}
        </div>
      )}
    </div>
  );
}
