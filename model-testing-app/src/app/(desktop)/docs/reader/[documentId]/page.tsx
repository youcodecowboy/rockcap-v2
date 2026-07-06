'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDocument, useGetFileUrl } from '@/lib/documentStorage';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, IconButton, EmptyState, SkeletonCard } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { ArrowLeft, ExternalLink, Download, FileText, FileImage, File, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import ReaderSidebar from './components/ReaderSidebar';

// Lazy-loaded xlsx renderer (shared with mobile + drawer preview).
const XlsxPreview = dynamic(() => import('@/components/preview/XlsxPreview'), { ssr: false });

export default function DocumentReaderPage() {
  const colors = useColors();
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;
  const docId = documentId as Id<"documents">;

  // Convex hooks
  const document = useDocument(docId);
  const fileUrl = useGetFileUrl(document?.fileStorageId);
  const markAsOpened = useMutation(api.documents.markAsOpened);

  // Zoom state for xlsx preview. Declared up here (before any early returns)
  // so the hook order stays stable across loading and loaded renders.
  const [xlsxZoom, setXlsxZoom] = useState(1);
  const xlsxZoomIn = () => setXlsxZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
  const xlsxZoomOut = () => setXlsxZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const xlsxZoomReset = () => setXlsxZoom(1);

  // Mark document as opened when page loads
  useEffect(() => {
    if (docId) {
      markAsOpened({ documentId: docId }).catch(console.error);
    }
  }, [docId, markAsOpened]);

  // Navigate back to the appropriate document library context
  const handleBack = () => {
    if (document?.projectId && document?.clientId) {
      router.push(`/clients/${document.clientId}/projects/${document.projectId}?tab=documents`);
    } else if (document?.clientId) {
      router.push(`/clients/${document.clientId}?tab=documents`);
    } else {
      router.push('/docs');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [document]);

  if (!document) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: colors.bg.light, padding: 24 }}>
        <div style={{ width: 360 }}>
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  // Drive-sourced rows have no Convex fileStorageId — preview via Google's
  // embedded viewer; "Open in New Tab" goes to the Drive web view link.
  const isDrive = (document as any).source === 'drive' && !!(document as any).driveFileId;
  const driveEmbedUrl = (document as any).driveFileId
    ? `https://drive.google.com/file/d/${(document as any).driveFileId}/preview`
    : null;
  const driveWebViewLink = (document as any).driveWebViewLink as string | undefined;

  const isPDF = document.fileType === 'application/pdf' || document.fileName.toLowerCase().endsWith('.pdf');
  const isImage = document.fileType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(document.fileName);
  const isXlsx = (() => {
    const t = document.fileType.toLowerCase();
    if (t.includes('spreadsheetml') || t.includes('ms-excel')) return true;
    return /\.(xlsx|xls|xlsm)$/i.test(document.fileName);
  })();

  const handleDownload = () => {
    if (!document.fileStorageId) return;
    const params = new URLSearchParams({
      storageId: document.fileStorageId,
      filename: document.displayName || document.documentCode || document.fileName,
    });
    window.open(`/api/convex-file?${params.toString()}`, '_blank');
  };

  const handleOpenInNewTab = () => {
    if (isDrive && driveWebViewLink) {
      window.open(driveWebViewLink, '_blank');
      return;
    }
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  const getFileIcon = (size = 64) => {
    if (isPDF) return <FileText style={{ width: size, height: size, color: colors.accent.red }} />;
    if (isImage) return <FileImage style={{ width: size, height: size, color: colors.accent.blue }} />;
    return <File style={{ width: size, height: size, color: colors.text.muted }} />;
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: colors.bg.light }}>
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, padding: '12px 16px' }}
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div style={{ height: 24, width: 1, background: colors.border.default }} />
          <h1
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, maxWidth: 420 }}
          >
            {document.displayName || document.documentCode || document.fileName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleOpenInNewTab} disabled={isDrive ? !driveWebViewLink : !fileUrl}>
            <ExternalLink className="w-4 h-4" />
            {isDrive ? 'Open in Google Drive' : 'Open in New Tab'}
          </Button>
          {!isDrive && (
            <Button variant="secondary" size="sm" onClick={handleDownload} disabled={!fileUrl}>
              <Download className="w-4 h-4" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* Main content - 75/25 split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Preview - 75% */}
        <div className="w-3/4 overflow-auto" style={{ background: colors.bg.cardAlt, padding: 16 }}>
          {isDrive && driveEmbedUrl ? (
            <iframe
              src={driveEmbedUrl}
              allow="autoplay"
              className="w-full h-full"
              style={{ background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.mid}` }}
              title={document.fileName}
            />
          ) : !fileUrl ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                {getFileIcon()}
                <p style={{ color: colors.text.muted, marginTop: 16 }}>File content not available.</p>
                <p style={{ fontSize: 12, color: colors.text.dim, marginTop: 4 }}>
                  This document may have been uploaded before file content storage was implemented.
                </p>
              </div>
            </div>
          ) : isPDF ? (
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full"
              style={{ background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.mid}` }}
              title={document.fileName}
            />
          ) : isXlsx ? (
            <div className="h-full flex flex-col">
              {/* Zoom toolbar */}
              <div className="flex items-center justify-center gap-1 flex-shrink-0" style={{ marginBottom: 8 }}>
                <IconButton label="Zoom out" onClick={xlsxZoomOut}>
                  <ZoomOut className="w-4 h-4" />
                </IconButton>
                <span
                  className="text-center tabular-nums"
                  style={{ fontSize: 11, color: colors.text.muted, width: 48, fontWeight: 500 }}
                >
                  {Math.round(xlsxZoom * 100)}%
                </span>
                <IconButton label="Zoom in" onClick={xlsxZoomIn}>
                  <ZoomIn className="w-4 h-4" />
                </IconButton>
                {xlsxZoom !== 1 && (
                  <IconButton label="Reset zoom" onClick={xlsxZoomReset} style={{ marginLeft: 4 }}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </IconButton>
                )}
              </div>
              {/* Scrollable canvas — flex flex-col so XlsxPreview's outer
                  flex-1 has a flex parent to grow within. (Using flex-1
                  instead of h-full inside the component avoids the "nested
                  percentage heights inside flex items" CSS edge case.) */}
              <div className="flex-1 min-h-0 flex flex-col">
                <XlsxPreview
                  fileUrl={fileUrl}
                  zoom={xlsxZoom}
                  fillParent
                  forceVisibleScrollbars
                />
              </div>
            </div>
          ) : isImage ? (
            <div className="h-full flex items-center justify-center">
              <img
                src={fileUrl}
                alt={document.fileName}
                className="max-w-full max-h-full object-contain"
                style={{ borderRadius: 4 }}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={getFileIcon(40)}
                title={document.fileName}
                body="This file type cannot be previewed in the browser."
                action={
                  <Button variant="primary" onClick={handleDownload}>
                    Download to View
                  </Button>
                }
              />
            </div>
          )}
        </div>

        {/* Sidebar - 25% */}
        <div
          className="w-1/4 overflow-hidden flex flex-col"
          style={{ background: colors.bg.card, borderLeft: `1px solid ${colors.border.default}` }}
        >
          <ReaderSidebar document={document} documentId={docId} />
        </div>
      </div>
    </div>
  );
}
