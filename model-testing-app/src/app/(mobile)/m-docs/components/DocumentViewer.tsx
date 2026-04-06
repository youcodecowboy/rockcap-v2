'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { X } from 'lucide-react';
import PreviewTab from './DocumentViewerTabs/PreviewTab';
import DetailsTab from './DocumentViewerTabs/DetailsTab';
import SummaryTab from './DocumentViewerTabs/SummaryTab';
import ClassificationTab from './DocumentViewerTabs/ClassificationTab';

type ViewerTab = 'preview' | 'summary' | 'classification' | 'details' | 'intelligence' | 'notes';

const TABS: { key: ViewerTab; label: string }[] = [
  { key: 'preview', label: 'Preview' },
  { key: 'summary', label: 'Summary' },
  { key: 'classification', label: 'Classification' },
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

  const doc = useQuery(api.documents.get, { id: documentId as Id<'documents'> });
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    doc?.fileStorageId ? { storageId: doc.fileStorageId as Id<'_storage'> } : 'skip'
  );
  const markAsOpened = useMutation(api.documents.markAsOpened);

  // Lock body scroll on mount, restore on unmount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fire-and-forget markAsOpened when doc loads
  useEffect(() => {
    if (doc) {
      markAsOpened({ documentId: documentId as Id<'documents'> }).catch(() => {});
    }
  }, [doc, documentId, markAsOpened]);

  const title = doc?.displayName || doc?.fileName || 'Document';
  const subtitleParts = [
    doc?.category,
    doc?.clientName,
    doc?.projectName,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  return (
    <div className="fixed inset-0 z-50 bg-[var(--m-bg)] flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-[var(--m-page-px)] pt-4 pb-3 border-b border-[var(--m-border)] shrink-0">
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

      {/* Tab bar — horizontal scroll */}
      <div className="flex overflow-x-auto scrollbar-none border-b border-[var(--m-border)] bg-[var(--m-bg-subtle)] shrink-0">
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

      {/* Tab content area */}
      <div className="flex-1 overflow-y-auto">
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
              <PreviewTab
                fileUrl={fileUrl}
                fileType={doc.fileType}
                fileName={doc.fileName}
                fileSize={doc.fileSize}
              />
            )}
            {activeTab === 'summary' && <SummaryTab doc={doc} />}
            {activeTab === 'classification' && <ClassificationTab doc={doc} />}
            {activeTab === 'details' && (
              <DetailsTab doc={doc} />
            )}
            {activeTab === 'intelligence' && (
              <div className="px-[var(--m-page-px)] py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                Intelligence — coming in Task 9
              </div>
            )}
            {activeTab === 'notes' && (
              <div className="px-[var(--m-page-px)] py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                Notes — coming in Task 9
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
