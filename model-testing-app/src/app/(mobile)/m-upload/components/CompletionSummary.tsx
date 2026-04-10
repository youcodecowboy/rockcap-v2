'use client';

import { useRouter } from 'next/navigation';
import { Check, AlertCircle, CheckCircle, FileText, Table, FileType, Image, Mail, File } from 'lucide-react';
import { useUpload, getFileIconName } from '@/contexts/UploadContext';

const iconMap = { 'file-text': FileText, 'table': Table, 'file-type': FileType, 'image': Image, 'mail': Mail, 'file': File } as const;

export default function CompletionSummary() {
  const router = useRouter();
  const { reviewDocs, filingContext, reset } = useUpload();

  const saved = reviewDocs.filter((d) => d.savedDocId && !d.saveError);
  const failed = reviewDocs.filter((d) => d.saveError);
  const allSucceeded = failed.length === 0;

  // no emoji — use lucide icons
  const title = `${reviewDocs.length} document${reviewDocs.length === 1 ? '' : 's'} uploaded`;
  const subtitle = allSucceeded
    ? 'All files analyzed and filed'
    : `${failed.length} failed \u2014 tap to retry`;

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg-inset)]">
      {/* Header bar */}
      <div
        className="flex items-center px-[var(--m-page-px)] border-b border-[var(--m-border)] text-[var(--m-text-primary)] font-semibold text-[17px]"
        style={{ height: 'var(--m-header-h)' }}
      >
        Complete
      </div>

      {/* Success header */}
      <div className="py-6 px-[var(--m-page-px)] flex flex-col items-center gap-2">
        {allSucceeded
          ? <CheckCircle size={32} className="text-[var(--m-success)]" />
          : <AlertCircle size={32} className="text-[var(--m-warning)]" />
        }
        <div className="text-[var(--m-text-primary)] text-lg font-semibold">
          {title}
        </div>
        <div className="text-[var(--m-text-tertiary)] text-sm">
          {subtitle}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] flex flex-col gap-0.5">
        {reviewDocs.map((doc) => {
          const isSaved = !!doc.savedDocId && !doc.saveError;
          const isFailed = !!doc.saveError;
          const displayName = isSaved && doc.savedDocCode
            ? doc.savedDocCode
            : doc.fileName;

          const filingPath = isSaved && (doc.clientName || doc.projectName)
            ? [doc.clientName, doc.projectName].filter(Boolean).join(' / ')
            : null;

          return (
            <div
              key={doc.id}
              onClick={isSaved && doc.savedDocId
                ? () => router.push(`/m-docs?documentId=${doc.savedDocId}`)
                : undefined
              }
              className={`flex items-center gap-3 py-3 border-b border-[var(--m-border)] ${
                isSaved ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              {/* Status icon */}
              {isSaved ? (
                <div className="w-8 h-8 rounded-full bg-[var(--m-accent-subtle)] flex items-center justify-center flex-shrink-0">
                  <Check size={16} className="text-[var(--m-success)]" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--m-bg-inset)] flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={16} className="text-[var(--m-error)]" />
                </div>
              )}

              {/* Doc info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {(() => { const Icon = iconMap[getFileIconName(doc.fileName)]; return <Icon size={14} className="text-[var(--m-text-tertiary)] flex-shrink-0" />; })()}
                  <span className="text-[var(--m-text-primary)] text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {displayName}
                  </span>
                </div>

                {/* Second line: category badge + filing path, or error */}
                {isSaved && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)] whitespace-nowrap">
                      {doc.category}
                    </span>
                    {filingPath && (
                      <span className="text-xs text-[var(--m-text-tertiary)] whitespace-nowrap overflow-hidden text-ellipsis">
                        {'\u2192'} {filingPath}
                      </span>
                    )}
                  </div>
                )}

                {isFailed && (
                  <div className="text-xs mt-0.5 text-[var(--m-error)]">
                    {doc.saveError}
                  </div>
                )}
              </div>

              {/* Chevron for saved docs */}
              {isSaved && (
                <span className="text-[var(--m-text-tertiary)] text-lg flex-shrink-0">
                  {'\u203A'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="py-4 px-[var(--m-page-px)] flex gap-3 border-t border-[var(--m-border)]">
        <button
          onClick={() => reset(true)}
          className="flex-1 py-3.5 rounded-[10px] border border-[var(--m-border)] bg-transparent text-[var(--m-text-primary)] text-[15px] font-semibold cursor-pointer"
        >
          Upload More
        </button>
        <button
          onClick={() => router.push('/m-docs')}
          className="flex-1 py-3.5 rounded-[10px] border-none bg-[var(--m-accent)] text-white text-[15px] font-semibold cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
