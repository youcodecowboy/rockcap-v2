'use client';

import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';

interface MessageBubbleProps {
  content: string;
  senderName: string;
  isMine: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  createdAt: string;
  references?: EntityReference[];
  variant?: 'mobile' | 'desktop';
  onReferencePress?: (ref: EntityReference) => void;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({
  content,
  senderName,
  isMine,
  isDeleted,
  isEdited,
  createdAt,
  references,
  variant = 'mobile',
  onReferencePress,
}: MessageBubbleProps) {
  const isMobile = variant === 'mobile';

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[11px] text-gray-500'} ml-1 mb-0.5 block`}>
            {senderName}
          </span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl ${
            isMine
              ? (isMobile ? 'bg-[var(--m-accent)] text-white rounded-br-sm' : 'bg-gray-900 text-white rounded-br-sm')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-bl-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm')
          }`}
        >
          {isDeleted ? (
            <p className="text-[13px] italic opacity-60">This message was deleted</p>
          ) : (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{content}</p>
          )}
        </div>

        {references && references.length > 0 && !isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {references.map((ref, i) => (
              <ReferenceChip key={`${ref.type}-${ref.id}-${i}`} reference={ref} onPress={onReferencePress} />
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[10px] text-gray-400'}`}>
            {formatTime(createdAt)}
          </span>
          {isEdited && !isDeleted && (
            <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[10px] text-gray-400'}`}>
              edited
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
