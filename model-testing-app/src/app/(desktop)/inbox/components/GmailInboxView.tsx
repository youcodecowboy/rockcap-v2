'use client';

import { useMemo, useState } from 'react';
import { usePaginatedQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import { Button, EmptyState, SkeletonText, StatusPill } from '@/components/layouts';
import { Mail, Send, ExternalLink, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Relative "time ago" for received mail.
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Intent → pill label + accent key. Mirrors the classifier enum on
// replyEvents. The accent key is resolved against the palette at render
// (StatusPill's `tone` is a hex color, not a name).
type AccentKey = 'green' | 'red' | 'orange' | 'blue' | 'muted';
function intentTone(intent: string | undefined): { label: string; key: AccentKey } | null {
  switch (intent) {
    case 'book_meeting': return { label: 'Wants meeting', key: 'green' };
    case 'not_interested': return { label: 'Not interested', key: 'red' };
    case 'defer_long_term': return { label: 'Defer', key: 'orange' };
    case 'info_question': return { label: 'Question', key: 'blue' };
    case 'out_of_office': return { label: 'Out of office', key: 'muted' };
    default: return null;
  }
}

interface GmailInboxViewProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function GmailInboxView({ selectedId, onSelect }: GmailInboxViewProps) {
  const colors = useColors();
  const router = useRouter();
  const { results: emails, status, loadMore } = usePaginatedQuery(
    api.replyEvents.listInboundPaginated,
    {},
    { initialNumItems: 25 },
  );

  const selected = useMemo(
    () => emails.find((e) => e._id === selectedId) ?? null,
    [emails, selectedId],
  );

  return (
    <div className="flex h-full w-full">
      {/* List pane */}
      <div
        className="w-[380px] flex-shrink-0 flex flex-col h-full overflow-y-auto"
        style={{ background: colors.bg.light, borderRight: `1px solid ${colors.border.default}` }}
      >
        {status === 'LoadingFirstPage' ? (
          <div className="p-4"><SkeletonText lines={8} /></div>
        ) : emails.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Inbox size={28} />}
              title="No emails yet"
              body="Inbound mail appears here within a few minutes of arriving in Gmail."
            />
          </div>
        ) : (
          <>
            {emails.map((email) => {
              const sender = email.fromName || email.contactName || email.fromEmail || 'Unknown sender';
              const isActive = email._id === selectedId;
              return (
                <button
                  key={email._id}
                  onClick={() => onSelect(email._id)}
                  className="flex flex-col gap-1 px-4 py-3 text-left"
                  style={{
                    background: isActive ? colors.bg.base : 'transparent',
                    borderBottom: `1px solid ${colors.border.light}`,
                    borderLeft: `2px solid ${isActive ? colors.accent.blue : 'transparent'}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" style={{ color: colors.text.primary }}>
                      {sender}
                    </span>
                    <span className="flex-shrink-0 text-xs" style={{ color: colors.text.muted }}>
                      {timeAgo(email.receivedAt)}
                    </span>
                  </div>
                  <span className="truncate text-xs" style={{ color: colors.text.secondary }}>
                    {email.replySubject || '(no subject)'}
                  </span>
                  <span className="truncate text-xs" style={{ color: colors.text.muted }}>
                    {email.replyBodyText?.slice(0, 90) || ''}
                  </span>
                </button>
              );
            })}
            {status === 'CanLoadMore' && (
              <div className="p-3">
                <Button variant="secondary" size="sm" onClick={() => loadMore(25)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail pane */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {selected ? (
          <EmailDetail
            key={selected._id}
            email={selected}
            onOpenClient={(clientId) => router.push(`/clients/${clientId}`)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={<Mail size={28} />}
              title="Select an email"
              body="Choose a message to read it and reply."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail + reply composer ──────────────────────────────────
function EmailDetail({
  email,
  onOpenClient,
}: {
  email: any;
  onOpenClient: (clientId: string) => void;
}) {
  const colors = useColors();
  const createApproval = useMutation(api.approvals.create);
  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sender = email.fromName || email.contactName || email.fromEmail || 'Unknown sender';
  const intent = intentTone(email.classifiedIntent);
  const intentColor = intent
    ? (intent.key === 'muted' ? colors.text.muted : colors.accent[intent.key])
    : undefined;
  const recipient: string | undefined = email.fromEmail;

  const handleStageReply = async () => {
    if (!body.trim()) return;
    if (!recipient) {
      setError('No sender email on this message — cannot reply.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const subject = email.replySubject
        ? (email.replySubject.toLowerCase().startsWith('re:') ? email.replySubject : `Re: ${email.replySubject}`)
        : 'Re:';
      await createApproval({
        entityType: 'client_communication',
        summary: `Reply to ${sender}: ${subject.slice(0, 80)}`,
        draftPayload: {
          kind: 'email_reply',
          to: [recipient],
          subject,
          bodyText: body,
          bodyHtml: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          threadId: email.gmailThreadId,
          inReplyTo: email.gmailMessageId,
        },
        requestSource: 'manual',
        requestSourceName: 'web-inbox',
        relatedClientId: email.linkedClientId ?? undefined,
        relatedContactId: email.contactId ?? undefined,
        relatedReplyEventId: email._id,
      });
      setStaged(true);
      setReplyOpen(false);
      setBody('');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to stage reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: colors.text.primary }}>
              {email.replySubject || '(no subject)'}
            </h2>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              <span style={{ color: colors.text.primary }}>{sender}</span>
              {email.fromEmail && email.fromEmail !== sender && (
                <span style={{ color: colors.text.muted }}> · {email.fromEmail}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {intent && intentColor && <StatusPill label={intent.label} tone={intentColor} />}
            <span className="text-xs" style={{ color: colors.text.muted }}>
              {new Date(email.receivedAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        {email.linkedClientId && (
          <button
            onClick={() => onOpenClient(email.linkedClientId)}
            className="mt-2 inline-flex items-center gap-1 text-xs"
            style={{ color: colors.accent.blue }}
          >
            {email.clientName || 'View client'}
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <pre
          className="whitespace-pre-wrap text-sm font-sans"
          style={{ color: colors.text.primary, fontFamily: 'inherit' }}
        >
          {email.replyBodyText || '(no message body)'}
        </pre>
      </div>

      {/* Reply */}
      <div className="px-6 py-4" style={{ borderTop: `1px solid ${colors.border.default}` }}>
        {staged ? (
          <div className="text-sm" style={{ color: colors.accent.green }}>
            ✓ Reply staged — approve it in <a href="/approvals" style={{ textDecoration: 'underline' }}>Approvals</a> to send.
          </div>
        ) : replyOpen ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Reply to ${sender}…`}
              rows={4}
              className="w-full rounded-md p-3 text-sm"
              style={{
                background: colors.bg.light,
                border: `1px solid ${colors.border.default}`,
                color: colors.text.primary,
              }}
            />
            {error && <span className="text-xs" style={{ color: colors.accent.red }}>{error}</span>}
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={handleStageReply} disabled={sending || !body.trim()}>
                <Send className="w-3 h-3" />
                {sending ? 'Staging…' : 'Stage reply'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setReplyOpen(false); setError(null); }}>
                Cancel
              </Button>
              <span className="text-xs" style={{ color: colors.text.muted }}>
                Goes to Approvals before it sends.
              </span>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setReplyOpen(true)} disabled={!recipient}>
            <Mail className="w-3 h-3" />
            Reply
          </Button>
        )}
      </div>
    </div>
  );
}
