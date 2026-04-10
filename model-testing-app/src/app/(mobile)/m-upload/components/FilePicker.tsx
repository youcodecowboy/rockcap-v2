'use client';

import { useRef } from 'react';
import { Upload, X, FileText, Table, FileType, Image, Mail, File } from 'lucide-react';
import { useUpload, getFileIconName } from '@/contexts/UploadContext';

const iconMap = { 'file-text': FileText, 'table': Table, 'file-type': FileType, 'image': Image, 'mail': Mail, 'file': File } as const;

const ACCEPTED_TYPES =
  '.pdf,.docx,.doc,.xls,.xlsx,.xlsm,.csv,.txt,.md,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif';
const MAX_FILES = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePicker() {
  const { files, filingContext, addFiles, removeFile, startProcessing, setFilingContext } =
    useUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const newFiles = Array.from(selected);
    const totalAfter = files.length + newFiles.length;

    if (totalAfter > MAX_FILES) {
      alert(`You can upload up to ${MAX_FILES} files at a time. You already have ${files.length} selected.`);
      // Still add what we can
      addFiles(newFiles);
    } else {
      addFiles(newFiles);
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleDropZoneClick = () => {
    inputRef.current?.click();
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--m-bg)',
        color: 'var(--m-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--m-page-px, 16px)',
        paddingTop: 'calc(var(--m-header-h, 56px) + 16px)',
        paddingBottom: 'calc(var(--m-footer-h, 64px) + 16px)',
        gap: '16px',
      }}
    >
      {/* Header */}
      <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
        Upload Documents
      </h1>

      {/* Context banner */}
      {filingContext && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--m-text-secondary)', lineHeight: 1.4 }}>
            <span style={{ color: 'rgba(59, 130, 246, 0.8)', fontWeight: 500 }}>Filing to: </span>
            {[filingContext.clientName, filingContext.projectName, filingContext.folderName]
              .filter(Boolean)
              .join(' \u2192 ')}
          </div>
          <button
            onClick={() => setFilingContext(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--m-text-tertiary)',
              padding: '4px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            aria-label="Clear filing context"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Drop zone */}
      <button
        onClick={handleDropZoneClick}
        style={{
          background: 'var(--m-bg-inset)',
          border: '2px dashed var(--m-border)',
          borderRadius: '12px',
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          width: '100%',
          color: 'inherit',
          textAlign: 'center',
        }}
      >
        <File size={36} style={{ color: 'var(--m-text-tertiary)' }} />
        <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--m-text-primary)' }}>
          Select files to upload
        </span>
        <span style={{ fontSize: '13px', color: 'var(--m-text-tertiary)' }}>
          PDF, DOCX, XLSX, images — up to 5 files
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '4px',
            padding: '8px 20px',
            borderRadius: '8px',
            background: 'var(--m-accent-indicator, #3b82f6)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <Upload size={16} />
          Choose Files
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Selected files list */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--m-text-secondary)', fontWeight: 500 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </span>
          {files.map((uf) => (
            <div
              key={uf.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: 'var(--m-bg-subtle)',
                borderRadius: '10px',
                border: '1px solid var(--m-border-subtle)',
              }}
            >
              {(() => { const Icon = iconMap[getFileIconName(uf.file.name)]; return <Icon size={18} style={{ flexShrink: 0, color: 'var(--m-text-tertiary)' }} />; })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '14px',
                    color: 'var(--m-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {uf.file.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--m-text-tertiary)', marginTop: '2px' }}>
                  {formatFileSize(uf.file.size)}
                </div>
              </div>
              <button
                onClick={() => removeFile(uf.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--m-text-tertiary)',
                  padding: '4px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label={`Remove ${uf.file.name}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={startProcessing}
        disabled={files.length === 0}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '14px',
          borderRadius: '10px',
          border: 'none',
          fontSize: '15px',
          fontWeight: 600,
          cursor: files.length === 0 ? 'not-allowed' : 'pointer',
          background: files.length === 0 ? 'var(--m-bg-subtle)' : 'var(--m-accent-indicator, #3b82f6)',
          color: files.length === 0 ? 'var(--m-text-tertiary)' : '#fff',
          opacity: files.length === 0 ? 0.5 : 1,
        }}
      >
        Upload & Analyze
      </button>
    </div>
  );
}
