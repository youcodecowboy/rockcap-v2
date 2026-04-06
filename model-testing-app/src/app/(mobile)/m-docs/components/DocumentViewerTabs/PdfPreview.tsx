'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155';

interface PdfPreviewProps {
  fileUrl: string;
}

// Load pdfjs-dist from CDN (avoids all bundler compatibility issues)
function loadPdfJs(): Promise<any> {
  if ((window as any).__pdfjs) return Promise.resolve((window as any).__pdfjs);

  return new Promise((resolve, reject) => {
    // Load worker
    const workerScript = document.createElement('script');
    workerScript.src = `${PDFJS_CDN}/pdf.worker.min.mjs`;
    workerScript.type = 'module';

    // Load main library
    const mainScript = document.createElement('script');
    mainScript.src = `${PDFJS_CDN}/pdf.min.mjs`;
    mainScript.type = 'module';

    // Use dynamic import instead of script tags for ESM
    import(/* webpackIgnore: true */ `${PDFJS_CDN}/pdf.min.mjs`)
      .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
        (window as any).__pdfjs = pdfjsLib;
        resolve(pdfjsLib);
      })
      .catch(reject);
  });
}

export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');

  const render = useCallback(async () => {
    try {
      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);

      const page = await pdf.getPage(1);
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      // Render at container width with 2x DPR for sharpness
      const containerWidth = container.getBoundingClientRect().width;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaledViewport.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${containerWidth}px`;
      canvas.style.height = `${(containerWidth * unscaledViewport.height) / unscaledViewport.width}px`;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      setStatus('rendered');
    } catch {
      setStatus('error');
    }
  }, [fileUrl]);

  useEffect(() => {
    render();
  }, [render]);

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <div className="w-8 h-8 rounded-md bg-[#fef2f2] flex items-center justify-center">
          <span className="text-[9px] font-bold text-[#991b1b]">PDF</span>
        </div>
        <p className="text-[13px] text-[var(--m-text-tertiary)]">Could not render PDF</p>
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
