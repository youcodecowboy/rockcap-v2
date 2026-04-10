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
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--m-bg-inset)',
    }}>
      {/* Header bar */}
      <div style={{
        height: 'var(--m-header-h, 56px)',
        display: 'flex', alignItems: 'center',
        padding: '0 var(--m-page-px, 16px)',
        borderBottom: '1px solid var(--m-border)',
        color: 'var(--m-text-primary)',
        fontWeight: 600, fontSize: 17,
      }}>
        Complete
      </div>

      {/* Success header */}
      <div style={{
        padding: '24px var(--m-page-px, 16px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}>
        {allSucceeded
          ? <CheckCircle size={32} style={{ color: '#4ade80' }} />
          : <AlertCircle size={32} style={{ color: '#f59e0b' }} />
        }
        <div style={{ color: 'var(--m-text-primary)', fontSize: 18, fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ color: 'var(--m-text-tertiary)', fontSize: 14 }}>
          {subtitle}
        </div>
      </div>

      {/* Document list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '0 var(--m-page-px, 16px)',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
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
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--m-border)',
                cursor: isSaved ? 'pointer' : 'default',
              }}
            >
              {/* Status icon */}
              {isSaved ? (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#1a3d1a', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Check size={16} style={{ color: '#4ade80' }} />
                </div>
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#3d1a1a', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertCircle size={16} style={{ color: '#f87171' }} />
                </div>
              )}

              {/* Doc info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {(() => { const Icon = iconMap[getFileIconName(doc.fileName)]; return <Icon size={14} style={{ color: 'var(--m-text-tertiary)', flexShrink: 0 }} />; })()}
                  <span style={{
                    color: 'var(--m-text-primary)', fontSize: 14, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {displayName}
                  </span>
                </div>

                {/* Second line: category badge + filing path, or error */}
                {isSaved && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 4,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(107,163,214,0.15)',
                      color: '#6ba3d6',
                      whiteSpace: 'nowrap',
                    }}>
                      {doc.category}
                    </span>
                    {filingPath && (
                      <span style={{
                        fontSize: 12,
                        color: 'var(--m-text-tertiary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {'\u2192'} {filingPath}
                      </span>
                    )}
                  </div>
                )}

                {isFailed && (
                  <div style={{
                    fontSize: 12, marginTop: 2,
                    color: '#f87171',
                  }}>
                    {doc.saveError}
                  </div>
                )}
              </div>

              {/* Chevron for saved docs */}
              {isSaved && (
                <span style={{
                  color: 'var(--m-text-tertiary)', fontSize: 18,
                  flexShrink: 0,
                }}>
                  {'\u203A'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '16px var(--m-page-px, 16px)',
        display: 'flex', gap: 12,
        borderTop: '1px solid var(--m-border)',
      }}>
        <button
          onClick={() => reset(true)}
          style={{
            flex: 1, padding: '14px',
            borderRadius: 10,
            border: '1px solid var(--m-border)',
            background: 'transparent',
            color: 'var(--m-text-primary)',
            fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Upload More
        </button>
        <button
          onClick={() => router.push('/m-docs')}
          style={{
            flex: 1, padding: '14px',
            borderRadius: 10, border: 'none',
            background: 'var(--m-accent, #6ba3d6)',
            color: '#fff',
            fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
