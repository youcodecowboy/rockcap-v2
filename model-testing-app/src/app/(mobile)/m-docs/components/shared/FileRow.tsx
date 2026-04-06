import FileTypeBadge from './FileTypeBadge';

interface FileRowProps {
  fileName: string;
  displayName?: string;
  documentCode?: string;
  fileType: string;
  category?: string;
  fileSize: number;
  uploadedAt: string;
  onTap: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function FileRow({ fileName, displayName, documentCode, fileType, category, fileSize, uploadedAt, onTap }: FileRowProps) {
  const name = documentCode || displayName || fileName;
  const parts = [category, formatFileSize(fileSize), formatDate(uploadedAt)].filter(Boolean);

  return (
    <button
      onClick={onTap}
      className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
    >
      <FileTypeBadge fileType={fileType} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{parts.join(' · ')}</div>
      </div>
    </button>
  );
}
