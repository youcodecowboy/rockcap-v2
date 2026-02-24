'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDocument, useGetFileUrl } from '@/lib/documentStorage';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ArrowLeft, ExternalLink, Download, FileText, FileImage, File } from 'lucide-react';
import ReaderSidebar from './components/ReaderSidebar';

export default function DocumentReaderPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;
  const docId = documentId as Id<"documents">;

  // Convex hooks
  const document = useDocument(docId);
  const fileUrl = useGetFileUrl(document?.fileStorageId);
  const markAsOpened = useMutation(api.documents.markAsOpened);

  // Mark document as opened when page loads
  useEffect(() => {
    if (docId) {
      markAsOpened({ documentId: docId }).catch(console.error);
    }
  }, [docId, markAsOpened]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.back();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  if (!document) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }

  const isPDF = document.fileType === 'application/pdf' || document.fileName.toLowerCase().endsWith('.pdf');
  const isImage = document.fileType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(document.fileName);

  const handleDownload = () => {
    if (fileUrl) {
      const link = window.document.createElement('a');
      link.href = fileUrl;
      link.download = document.fileName;
      link.click();
    }
  };

  const handleOpenInNewTab = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  const getFileIcon = () => {
    if (isPDF) return <FileText className="w-16 h-16 text-red-500" />;
    if (isImage) return <FileImage className="w-16 h-16 text-blue-500" />;
    return <File className="w-16 h-16 text-gray-500" />;
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="h-6 w-px bg-gray-200" />
          <h1 className="text-sm font-medium text-gray-900 truncate max-w-md">
            {document.documentCode || document.fileName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInNewTab}
            disabled={!fileUrl}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open in New Tab
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!fileUrl}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>

      {/* Main content - 75/25 split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Preview - 75% */}
        <div className="w-3/4 bg-gray-200 overflow-auto p-4">
          {!fileUrl ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                {getFileIcon()}
                <p className="text-gray-500 mt-4">File content not available.</p>
                <p className="text-sm text-gray-400 mt-1">
                  This document may have been uploaded before file content storage was implemented.
                </p>
              </div>
            </div>
          ) : isPDF ? (
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full bg-white rounded-lg shadow-sm border border-gray-300"
              title={document.fileName}
            />
          ) : isImage ? (
            <div className="h-full flex items-center justify-center">
              <img
                src={fileUrl}
                alt={document.fileName}
                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center bg-white p-8 rounded-lg shadow-sm border border-gray-200">
                {getFileIcon()}
                <p className="text-gray-700 mt-4 font-medium">{document.fileName}</p>
                <p className="text-sm text-gray-500 mt-2">
                  This file type cannot be previewed in the browser.
                </p>
                <Button
                  onClick={handleDownload}
                  className="mt-4"
                >
                  Download to View
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - 25% */}
        <div className="w-1/4 bg-white border-l border-gray-200 overflow-hidden flex flex-col">
          <ReaderSidebar document={document} documentId={docId} />
        </div>
      </div>
    </div>
  );
}
