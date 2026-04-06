'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { X, Download, ExternalLink, PanelTop } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';
import PreviewTab from './DocumentViewerTabs/PreviewTab';
import DetailsTab from './DocumentViewerTabs/DetailsTab';
import SummaryTab from './DocumentViewerTabs/SummaryTab';
import ClassificationTab from './DocumentViewerTabs/ClassificationTab';
import IntelligenceTab from './DocumentViewerTabs/IntelligenceTab';
import NotesTab from './DocumentViewerTabs/NotesTab';

type ViewerTab = 'preview' | 'summary' | 'details' | 'intelligence' | 'notes';

const TABS: { key: ViewerTab; label: string }[] = [
  { key: 'preview', label: 'Preview' },
  { key: 'summary', label: 'Summary' },
  { key: 'details', label: 'Details' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'notes', label: 'Notes' },
];

interface DocumentViewerProps {
  documentId: string;
  onClose: () => void;
}

export default function DocumentViewer({ documentId, onClose }: DocumentViewerProps) {
  const [activeTab, setActiveTab] = useState<ViewerTab>('preview');
  const { openTab } = useTabs();
  const [toastVisible, setToastVisible] = useState(false);

  const doc = useQuery(api.documents.get, { id: documentId as Id<'documents'> });
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    doc?.fileStorageId ? { storageId: doc.fileStorageId as Id<'_storage'> } : 'skip'
  );
  const markAsOpened = useMutation(api.documents.markAsOpened);

  // Fire-and-forget markAsOpened when doc loads
  const markedRef = useState<string | null>(null);
  if (doc && markedRef[0] !== documentId) {
    markedRef[1](documentId);
    markAsOpened({ documentId: documentId as Id<'documents'> }).catch(() => {});
  }

  const handleAddToTabs = useCallback(() => {
    if (!doc) return;
    const tabTitle = doc.documentCode || doc.displayName || doc.fileName;
    openTab({
      type: 'docs',
      title: tabTitle,
      route: '/m-docs',
      params: { documentId },
    });
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, [doc, documentId, openTab]);

  const title = doc?.documentCode || doc?.displayName || doc?.fileName || 'Document';
  const subtitleParts = [doc?.category, doc?.clientName, doc?.projectName].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  return (
    <>
      {/* Toast */}
      {toastVisible && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-black/80 text-white text-[12px] font-medium rounded-full shadow-lg">
          Added to tabs
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 px-[var(--m-page-px)] pt-3 pb-2.5 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold text-[var(--m-text-primary)] leading-tight truncate">
            {doc === undefined ? 'Loading…' : title}
          </h1>
          {subtitle ? (
            <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{subtitle}</p>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 -mr-1 text-[var(--m-text-tertiary)] active:text-[var(--m-text-primary)]"
          aria-label="Close viewer"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto scrollbar-none border-b border-[var(--m-border)] bg-[var(--m-bg-subtle)]">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'px-4 py-2.5 text-[13px] font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors',
              activeTab === key
                ? 'text-[var(--m-text-primary)] border-[var(--m-accent-indicator)]'
                : 'text-[var(--m-text-tertiary)] border-transparent',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content — extra bottom padding for the two fixed bars below */}
      <div style={{ paddingBottom: 'calc(3.5rem + var(--m-footer-h) + env(safe-area-inset-bottom, 0px))' }}>
        {doc === undefined ? (
          <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
            Loading document…
          </div>
        ) : doc === null ? (
          <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
            Document not found.
          </div>
        ) : (
          <>
            {activeTab === 'preview' && (
              <PreviewTab fileUrl={fileUrl} fileType={doc.fileType} fileName={doc.fileName} fileSize={doc.fileSize} />
            )}
            {activeTab === 'summary' && <SummaryTab doc={doc} />}
            {activeTab === 'details' && (
              <div>
                <ClassificationTab doc={doc} />
                <div className="border-t border-[var(--m-border)] mt-1">
                  <DetailsTab doc={doc} />
                </div>
              </div>
            )}
            {activeTab === 'intelligence' && <IntelligenceTab documentId={documentId} />}
            {activeTab === 'notes' && <NotesTab documentId={documentId} />}
          </>
        )}
      </div>

      {/* Fixed action footer — always visible above bottom nav */}
      {doc && (
        <div
          className="fixed left-0 right-0 z-[35] border-t border-[var(--m-border)] bg-[var(--m-bg)] px-[var(--m-page-px)] py-2.5"
          style={{ bottom: 'calc(var(--m-footer-h) + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                download={doc.fileName}
                className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-md bg-black text-white text-[12px] font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-md bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[12px] font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </a>
            )}
            <button
              onClick={handleAddToTabs}
              className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-md bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[12px] font-medium"
            >
              <PanelTop className="w-3.5 h-3.5" />
              Add to tabs
            </button>
          </div>
        </div>
      )}
    </>
  );
}
