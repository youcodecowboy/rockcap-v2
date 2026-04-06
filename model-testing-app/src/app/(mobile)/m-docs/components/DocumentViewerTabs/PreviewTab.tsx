import FileTypeBadge from '../shared/FileTypeBadge';

interface PreviewTabProps {
  fileUrl: string | null | undefined;
  fileType: string;
  fileName: string;
  fileSize: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType: string): boolean {
  const t = fileType.toLowerCase();
  return (
    t.includes('jpeg') ||
    t.includes('jpg') ||
    t.includes('png') ||
    t.includes('gif') ||
    t.includes('webp')
  );
}

function isPdf(fileType: string): boolean {
  return fileType.toLowerCase().includes('pdf');
}

export default function PreviewTab({ fileUrl, fileType, fileName, fileSize }: PreviewTabProps) {
  if (!fileUrl) {
    return (
      <div className="px-[var(--m-page-px)] py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] py-4 flex flex-col gap-4">
      {/* Preview area */}
      <div className="w-full aspect-[0.707] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg overflow-hidden flex items-center justify-center">
        {isPdf(fileType) ? (
          <iframe
            src={fileUrl}
            title={fileName}
            className="w-full h-full border-none"
          />
        ) : isImage(fileType) ? (
          <img
            src={fileUrl}
            alt={fileName}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <FileTypeBadge fileType={fileType} />
            <p className="text-[13px] text-[var(--m-text-tertiary)]">Preview not available</p>
            <p className="text-[12px] text-[var(--m-text-tertiary)]">{formatFileSize(fileSize)}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <a
          href={fileUrl}
          download={fileName}
          className="flex-1 py-2.5 rounded-lg bg-black text-white text-[13px] font-medium text-center"
        >
          Download
        </a>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-lg bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[13px] font-medium text-center"
        >
          Open in browser
        </a>
      </div>
    </div>
  );
}
