'use client';

import { Loader2, Check, AlertCircle, ArrowUp, FileText, Table, FileType, Image, Mail, File } from 'lucide-react';
import { useUpload, getFileIconName } from '@/contexts/UploadContext';
import type { FileStatus } from '@/contexts/UploadContext';

const iconMap = { 'file-text': FileText, 'table': Table, 'file-type': FileType, 'image': Image, 'mail': Mail, 'file': File } as const;

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case 'waiting':
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--m-bg-inset)] flex items-center justify-center">
          <ArrowUp size={16} className="text-[var(--m-text-tertiary)]" />
        </div>
      );
    case 'uploading':
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--m-bg-inset)] flex items-center justify-center">
          <ArrowUp size={16} className="text-[var(--m-text-primary)]" />
        </div>
      );
    case 'analyzing':
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--m-accent-subtle)] flex items-center justify-center">
          <Loader2 size={16} className="text-[var(--m-accent-indicator)] animate-spin" />
        </div>
      );
    case 'done':
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--m-accent-subtle)] flex items-center justify-center">
          <Check size={16} className="text-[var(--m-success)]" />
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--m-bg-inset)] flex items-center justify-center">
          <AlertCircle size={16} className="text-[var(--m-error)]" />
        </div>
      );
  }
}

function statusText(status: FileStatus, error?: string): string {
  switch (status) {
    case 'waiting': return 'Waiting...';
    case 'uploading': return 'Uploading...';
    case 'analyzing': return 'Analyzing...';
    case 'done': return 'Uploaded & analyzed';
    case 'error': return error ?? 'Upload failed';
  }
}

function statusColorClass(status: FileStatus): string {
  switch (status) {
    case 'waiting': return 'text-[var(--m-text-tertiary)]';
    case 'uploading': return 'text-[var(--m-text-tertiary)]';
    case 'analyzing': return 'text-[var(--m-accent-indicator)]';
    case 'done': return 'text-[var(--m-success)]';
    case 'error': return 'text-[var(--m-error)]';
  }
}

export default function ProcessingScreen() {
  const { files, retryFile } = useUpload();

  const isProcessing = files.some(f => f.status === 'waiting' || f.status === 'uploading' || f.status === 'analyzing');
  const allDone = files.length > 0 && files.every(f => f.status === 'done');
  const allErrored = files.length > 0 && files.every(f => f.status === 'error');

  let title = 'Analyzing documents';
  let subtitle = 'This may take a moment...';
  if (allDone) {
    title = 'Analysis complete';
    subtitle = 'Proceeding to review...';
  } else if (allErrored) {
    title = 'All uploads failed';
    subtitle = 'Tap files below to retry';
  } else if (!isProcessing && !allDone) {
    title = 'Analysis complete';
    subtitle = 'Proceeding to review...';
  }

  const handleRetryAll = async () => {
    const errorFiles = files.filter(f => f.status === 'error');
    for (const f of errorFiles) {
      await retryFile(f.id);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg-inset)]">
      {/* Indeterminate bar keyframes */}
      <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }`}</style>

      {/* Header bar */}
      <div
        className="flex items-center px-[var(--m-page-px)] border-b border-[var(--m-border)] text-[var(--m-text-primary)] font-semibold text-[17px]"
        style={{ height: 'var(--m-header-h)' }}
      >
        Processing...
      </div>

      {/* Progress header */}
      <div className="py-6 px-[var(--m-page-px)] flex flex-col items-center gap-2">
        {/* Status icon */}
        {isProcessing ? (
          <Loader2 size={32} className="text-[var(--m-accent-indicator)] animate-spin" />
        ) : allErrored ? (
          <AlertCircle size={32} className="text-[var(--m-error)]" />
        ) : (
          <Check size={32} className="text-[var(--m-success)]" />
        )}

        <div className="text-[var(--m-text-primary)] text-lg font-semibold">
          {title}
        </div>
        <div className="text-[var(--m-text-tertiary)] text-sm">
          {subtitle}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] flex flex-col gap-0.5">
        {files.map(f => {
          const isTappable = f.status === 'error';
          const showBar = f.status === 'uploading' || f.status === 'analyzing';

          return (
            <div
              key={f.id}
              onClick={isTappable ? () => retryFile(f.id) : undefined}
              className={`flex items-center gap-3 py-3 border-b border-[var(--m-border)] ${
                isTappable ? 'cursor-pointer' : 'cursor-default'
              } ${f.status === 'waiting' ? 'opacity-60' : 'opacity-100'}`}
            >
              <StatusIcon status={f.status} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {(() => { const Icon = iconMap[getFileIconName(f.file.name)]; return <Icon size={14} className="text-[var(--m-text-tertiary)] flex-shrink-0" />; })()}
                  <span className="text-[var(--m-text-primary)] text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {f.file.name}
                  </span>
                </div>

                <div className={`text-xs mt-0.5 ${statusColorClass(f.status)}`}>
                  {statusText(f.status, f.error)}
                </div>

                {/* Indeterminate progress bar */}
                {showBar && (
                  <div className={`mt-1.5 h-[3px] rounded-sm overflow-hidden relative ${
                    f.status === 'uploading' ? 'bg-[var(--m-border)]' : 'bg-[var(--m-accent-subtle)]'
                  }`}>
                    <div
                      className={`absolute top-0 left-0 w-1/2 h-full rounded-sm ${
                        f.status === 'uploading' ? 'bg-[var(--m-text-tertiary)]' : 'bg-[var(--m-accent-indicator)]'
                      }`}
                      style={{ animation: 'indeterminate 1.2s ease-in-out infinite' }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom area */}
      <div className="py-4 px-[var(--m-page-px)] text-center">
        {isProcessing && (
          <div className="text-[var(--m-text-tertiary)] text-[13px]">
            You can close this screen — processing continues in the background
          </div>
        )}

        {allErrored && (
          <button
            onClick={handleRetryAll}
            className="w-full py-3.5 rounded-[10px] border-none bg-[var(--m-bg-subtle)] text-[var(--m-error)] text-[15px] font-semibold cursor-pointer border border-[var(--m-border)]"
          >
            Retry All
          </button>
        )}
      </div>
    </div>
  );
}
