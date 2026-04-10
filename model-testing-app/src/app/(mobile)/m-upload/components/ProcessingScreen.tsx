'use client';

import { Loader2, Check, AlertCircle, ArrowUp, FileText, Table, FileType, Image, Mail, File } from 'lucide-react';
import { useUpload, getFileIconName } from '@/contexts/UploadContext';
import type { FileStatus } from '@/contexts/UploadContext';

const iconMap = { 'file-text': FileText, 'table': Table, 'file-type': FileType, 'image': Image, 'mail': Mail, 'file': File } as const;

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case 'waiting':
      return (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--m-bg-inset)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowUp size={16} style={{ color: 'var(--m-text-tertiary)' }} />
        </div>
      );
    case 'uploading':
      return (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--m-bg-inset)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowUp size={16} style={{ color: 'var(--m-text-primary)' }} />
        </div>
      );
    case 'analyzing':
      return (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#1a1a2e', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Loader2 size={16} style={{ color: '#6ba3d6', animation: 'spin 1s linear infinite' }} />
        </div>
      );
    case 'done':
      return (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#1a3d1a', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={16} style={{ color: '#4ade80' }} />
        </div>
      );
    case 'error':
      return (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#3d1a1a', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertCircle size={16} style={{ color: '#f87171' }} />
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

function statusColor(status: FileStatus): string {
  switch (status) {
    case 'waiting': return 'var(--m-text-tertiary)';
    case 'uploading': return 'var(--m-text-tertiary)';
    case 'analyzing': return '#6ba3d6';
    case 'done': return '#4ade80';
    case 'error': return '#f87171';
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
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--m-bg-inset)',
    }}>
      {/* Spin keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }
@keyframes indeterminate { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }`}</style>

      {/* Header bar */}
      <div style={{
        height: 'var(--m-header-h, 56px)',
        display: 'flex', alignItems: 'center',
        padding: '0 var(--m-page-px, 16px)',
        borderBottom: '1px solid var(--m-border)',
        color: 'var(--m-text-primary)',
        fontWeight: 600, fontSize: 17,
      }}>
        Processing...
      </div>

      {/* Progress header */}
      <div style={{
        padding: '24px var(--m-page-px, 16px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}>
        {/* Status icon */}
        {isProcessing ? (
          <Loader2 size={32} style={{ color: '#6ba3d6', animation: 'spin 1s linear infinite' }} />
        ) : allErrored ? (
          <AlertCircle size={32} style={{ color: '#f87171' }} />
        ) : (
          <Check size={32} style={{ color: '#4ade80' }} />
        )}

        <div style={{ color: 'var(--m-text-primary)', fontSize: 18, fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ color: 'var(--m-text-tertiary)', fontSize: 14 }}>
          {subtitle}
        </div>
      </div>

      {/* File list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '0 var(--m-page-px, 16px)',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {files.map(f => {
          const isTappable = f.status === 'error';
          const showBar = f.status === 'uploading' || f.status === 'analyzing';

          return (
            <div
              key={f.id}
              onClick={isTappable ? () => retryFile(f.id) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--m-border)',
                cursor: isTappable ? 'pointer' : 'default',
                opacity: f.status === 'waiting' ? 0.6 : 1,
              }}
            >
              <StatusIcon status={f.status} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {(() => { const Icon = iconMap[getFileIconName(f.file.name)]; return <Icon size={14} style={{ color: 'var(--m-text-tertiary)', flexShrink: 0 }} />; })()}
                  <span style={{
                    color: 'var(--m-text-primary)', fontSize: 14, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {f.file.name}
                  </span>
                </div>

                <div style={{
                  fontSize: 12, marginTop: 2,
                  color: statusColor(f.status),
                }}>
                  {statusText(f.status, f.error)}
                </div>

                {/* Indeterminate progress bar */}
                {showBar && (
                  <div style={{
                    marginTop: 6, height: 3, borderRadius: 2,
                    background: f.status === 'uploading' ? 'rgba(255,255,255,0.1)' : 'rgba(107,163,214,0.15)',
                    overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '50%', height: '100%', borderRadius: 2,
                      background: f.status === 'uploading' ? 'rgba(255,255,255,0.3)' : '#6ba3d6',
                      animation: 'indeterminate 1.2s ease-in-out infinite',
                    }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom area */}
      <div style={{ padding: '16px var(--m-page-px, 16px)', textAlign: 'center' }}>
        {isProcessing && (
          <div style={{ color: 'var(--m-text-tertiary)', fontSize: 13 }}>
            You can close this screen — processing continues in the background
          </div>
        )}

        {allErrored && (
          <button
            onClick={handleRetryAll}
            style={{
              width: '100%', padding: '14px',
              borderRadius: 10, border: 'none',
              background: '#3d1a1a', color: '#f87171',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Retry All
          </button>
        )}
      </div>
    </div>
  );
}
