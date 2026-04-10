'use client';

import { useRef, useState } from 'react';
import { Upload, X, Building, ChevronRight, FileText, Table, FileType, Image, Mail, File } from 'lucide-react';
import { useUpload, getFileIconName } from '@/contexts/UploadContext';
import FilingSheet from './FilingSheet';

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
  const [showFilingSheet, setShowFilingSheet] = useState(false);

  const hasClient = !!filingContext?.clientId;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const newFiles = Array.from(selected);
    const totalAfter = files.length + newFiles.length;

    if (totalAfter > MAX_FILES) {
      alert(`You can upload up to ${MAX_FILES} files at a time. You already have ${files.length} selected.`);
    }
    addFiles(newFiles);
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

      {/* Client / Project selector — required before uploading */}
      <div>
        <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mb-1.5">
          UPLOAD TO
        </label>
        <button
          onClick={() => setShowFilingSheet(true)}
          className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] px-3.5 py-3 flex items-center justify-between cursor-pointer text-left"
        >
          {hasClient ? (
            <div className="flex items-center gap-2 min-w-0">
              <Building size={16} className="text-[var(--m-text-tertiary)] flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--m-text-primary)] truncate">
                  {filingContext!.clientName}
                  {filingContext!.projectName ? ` \u2192 ${filingContext!.projectName}` : ''}
                </div>
                {filingContext!.folderName && (
                  <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
                    Folder: {filingContext!.folderName}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-[var(--m-text-tertiary)]">
              Select client and project...
            </span>
          )}
          <ChevronRight size={16} className="text-[var(--m-text-tertiary)] flex-shrink-0" />
        </button>
        {!hasClient && files.length > 0 && (
          <div className="text-[11px] text-[var(--m-error)] mt-1">
            Client is required before uploading
          </div>
        )}
      </div>

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

      {/* Upload button — disabled until client selected AND files added */}
      <button
        onClick={startProcessing}
        disabled={files.length === 0 || !hasClient}
        className={`mt-auto w-full py-3.5 rounded-[10px] border-none text-[15px] font-semibold ${
          files.length > 0 && hasClient
            ? 'bg-[var(--m-accent)] text-white cursor-pointer'
            : 'bg-[var(--m-bg-subtle)] text-[var(--m-text-tertiary)] opacity-50 cursor-not-allowed'
        }`}
      >
        Upload &amp; Analyze
      </button>

      {/* Filing sheet */}
      {showFilingSheet && (
        <FilingSheet
          currentClientId={filingContext?.clientId}
          currentProjectId={filingContext?.projectId}
          currentFolderTypeKey={filingContext?.folderTypeKey}
          currentFolderLevel={filingContext?.folderLevel}
          onSelect={(filing) => {
            setFilingContext({
              clientId: filing.clientId,
              clientName: filing.clientName,
              projectId: filing.projectId,
              projectName: filing.projectName,
              folderTypeKey: filing.folderTypeKey,
              folderLevel: filing.folderLevel,
              folderName: filing.folderName,
            });
            setShowFilingSheet(false);
          }}
          onClose={() => setShowFilingSheet(false)}
        />
      )}
    </div>
  );
}
