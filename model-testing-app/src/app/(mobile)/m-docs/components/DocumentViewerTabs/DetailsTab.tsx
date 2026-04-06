interface DetailsDoc {
  fileName: string;
  displayName?: string;
  documentCode?: string;
  fileSize: number;
  fileType: string;
  version?: string;
  uploaderInitials?: string;
  uploadedAt: string;
  lastOpenedAt?: string;
}

interface DetailsTabProps {
  doc: DetailsDoc;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function simplifyFileType(fileType: string): string {
  const parts = fileType.split('/');
  return parts[parts.length - 1].toUpperCase();
}

interface RowProps {
  label: string;
  value: string | undefined;
}

function Row({ label, value }: RowProps) {
  if (value === undefined) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--m-border)]">
      <span className="text-[12px] text-[var(--m-text-tertiary)] shrink-0">{label}</span>
      <span className="text-[13px] text-[var(--m-text-primary)] text-right break-all">{value}</span>
    </div>
  );
}

export default function DetailsTab({ doc }: DetailsTabProps) {
  const displayNameRow =
    doc.displayName && doc.displayName !== doc.fileName ? doc.displayName : undefined;

  return (
    <div className="px-[var(--m-page-px)] pb-6">
      <Row label="File name" value={doc.fileName} />
      <Row label="Display name" value={displayNameRow} />
      <Row label="Document code" value={doc.documentCode} />
      <Row label="File size" value={formatFileSize(doc.fileSize)} />
      <Row label="File type" value={simplifyFileType(doc.fileType)} />
      <Row label="Version" value={doc.version} />
      <Row label="Uploaded by" value={doc.uploaderInitials} />
      <Row label="Uploaded" value={formatDate(doc.uploadedAt)} />
      <Row
        label="Last opened"
        value={doc.lastOpenedAt !== undefined ? formatDate(doc.lastOpenedAt) : undefined}
      />
    </div>
  );
}
