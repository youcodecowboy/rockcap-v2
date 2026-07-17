'use client';

import { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import { FileText, Download } from 'lucide-react';

// Attachment chips for an inbound email (replyEvents row), shared by the
// /inbox detail pane and the prospect Replies tab. Bytes come live from
// Gmail via gmailAttachments.download (nothing is stored in the app);
// files over the download cap fall back to the Gmail thread link.
// inline=true parts are signature images / embedded logos — never shown.

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  partId?: string;
  inline?: boolean;
};

export function realAttachments(attachments?: EmailAttachment[]): EmailAttachment[] {
  return (attachments ?? []).filter((a) => !a.inline);
}

export function formatBytes(n?: number): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmailAttachmentStrip({
  replyEventId,
  attachments,
  gmailFallbackUrl,
}: {
  replyEventId: string;
  attachments?: EmailAttachment[];
  gmailFallbackUrl?: string;
}) {
  const colors = useColors();
  const download = useAction(api.gmailAttachments.download);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const files = realAttachments(attachments);
  if (files.length === 0) return null;

  const handleDownload = async (a: EmailAttachment) => {
    const key = a.partId ?? a.filename;
    setBusyKey(key);
    setError(null);
    try {
      const res = await download({
        replyEventId: replyEventId as any,
        filename: a.filename,
        partId: a.partId,
      });
      if (res.tooLarge) {
        setError(
          `"${res.filename}" is too large to download here (${formatBytes(res.sizeBytes)}) — open it in Gmail instead.`,
        );
        return;
      }
      const bin = atob(res.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
      // Previewable types (PDF, images) open in a new tab so the operator
      // can SEE the attachment; everything else downloads.
      const previewable =
        res.mimeType === 'application/pdf' || res.mimeType.startsWith('image/');
      if (previewable) {
        window.open(url, '_blank', 'noopener');
        // Delay revocation so the new tab can load the blob.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = res.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Download failed');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((a) => {
          const key = a.partId ?? a.filename;
          const busy = busyKey === key;
          return (
            <button
              key={key}
              onClick={() => handleDownload(a)}
              disabled={busy}
              title={`Download ${a.filename}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
              style={{
                background: colors.bg.light,
                border: `1px solid ${colors.border.default}`,
                color: colors.text.primary,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              <FileText size={13} style={{ color: colors.text.muted, flexShrink: 0 }} />
              <span className="max-w-[260px] truncate">{a.filename}</span>
              {a.sizeBytes !== undefined && (
                <span style={{ color: colors.text.muted }}>{formatBytes(a.sizeBytes)}</span>
              )}
              <Download size={12} style={{ color: colors.text.muted, flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 text-xs" style={{ color: colors.accent.red }}>
          {error}
          {gmailFallbackUrl && (
            <>
              {' '}
              <a
                href={gmailFallbackUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: colors.accent.blue, textDecoration: 'underline' }}
              >
                Open in Gmail
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
