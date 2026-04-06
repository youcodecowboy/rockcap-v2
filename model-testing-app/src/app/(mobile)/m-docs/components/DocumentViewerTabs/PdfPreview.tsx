'use client';

import { useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  fileUrl: string;
}

export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setContainerWidth(node.getBoundingClientRect().width);
      containerRef.current = node;
    }
  }, []);

  if (error) {
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
    <div ref={measureRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoad}
        onLoadError={() => setError(true)}
        loading={
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-[var(--m-text-tertiary)]">Rendering PDF…</span>
          </div>
        }
      >
        <Page
          pageNumber={1}
          width={containerWidth || undefined}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
      {numPages && numPages > 1 && (
        <div className="text-center py-2 text-[10px] text-[var(--m-text-placeholder)]">
          Page 1 of {numPages}
        </div>
      )}
    </div>
  );
}
