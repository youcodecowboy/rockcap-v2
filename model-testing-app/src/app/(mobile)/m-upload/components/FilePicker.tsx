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
      className="min-h-[100dvh] bg-[var(--m-bg)] text-[var(--m-text-primary)] flex flex-col px-[var(--m-page-px)] gap-4"
      style={{
        paddingTop: 'calc(var(--m-header-h) + 16px)',
        paddingBottom: 'calc(var(--m-footer-h) + 16px)',
      }}
    >
      {/* Header */}
      <h1 className="text-xl font-semibold m-0">
        Upload Documents
      </h1>

      {/* Context banner */}
      {filingContext && (
        <div className="bg-[var(--m-accent-subtle)] border border-[var(--m-accent-indicator)]/30 rounded-[10px] px-3.5 py-3 flex items-center justify-between gap-2.5">
          <div className="text-[13px] text-[var(--m-text-secondary)] leading-snug">
            <span className="text-[var(--m-accent-indicator)] font-medium">Filing to: </span>
            {[filingContext.clientName, filingContext.projectName, filingContext.folderName]
              .filter(Boolean)
              .join(' \u2192 ')}
          </div>
          <button
            onClick={() => setFilingContext(null)}
            className="bg-transparent border-none text-[var(--m-text-tertiary)] p-1 cursor-pointer flex-shrink-0"
            aria-label="Clear filing context"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Drop zone */}
      <button
        onClick={handleDropZoneClick}
        className="bg-[var(--m-bg-inset)] border-2 border-dashed border-[var(--m-border)] rounded-xl py-8 px-5 flex flex-col items-center gap-3 cursor-pointer w-full text-inherit text-center"
      >
        <File size={36} className="text-[var(--m-text-tertiary)]" />
        <span className="text-[15px] font-medium text-[var(--m-text-primary)]">
          Select files to upload
        </span>
        <span className="text-[13px] text-[var(--m-text-tertiary)]">
          PDF, DOCX, XLSX, images — up to 5 files
        </span>
        <span className="inline-flex items-center gap-1.5 mt-1 px-5 py-2 rounded-lg bg-[var(--m-accent-indicator)] text-white text-sm font-medium">
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
        className="hidden"
      />

      {/* Selected files list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-[var(--m-text-secondary)] font-medium">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </span>
          {files.map((uf) => (
            <div
              key={uf.id}
              className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--m-bg-subtle)] rounded-[10px] border border-[var(--m-border-subtle)]"
            >
              {(() => { const Icon = iconMap[getFileIconName(uf.file.name)]; return <Icon size={18} className="flex-shrink-0 text-[var(--m-text-tertiary)]" />; })()}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--m-text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
                  {uf.file.name}
                </div>
                <div className="text-xs text-[var(--m-text-tertiary)] mt-0.5">
                  {formatFileSize(uf.file.size)}
                </div>
              </div>
              <button
                onClick={() => removeFile(uf.id)}
                className="bg-transparent border-none text-[var(--m-text-tertiary)] p-1 cursor-pointer flex-shrink-0"
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
        className={`mt-auto w-full py-3.5 rounded-[10px] border-none text-[15px] font-semibold ${
          files.length === 0
            ? 'bg-[var(--m-bg-subtle)] text-[var(--m-text-tertiary)] opacity-50 cursor-not-allowed'
            : 'bg-[var(--m-accent-indicator)] text-white cursor-pointer'
        }`}
      >
        Upload &amp; Analyze
      </button>
    </div>
  );
}
