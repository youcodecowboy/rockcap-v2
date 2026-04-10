'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Send } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';
import EntityPicker from './EntityPicker';

interface MessageComposerProps {
  conversationId: Id<'conversations'>;
  variant?: 'mobile' | 'desktop';
}

export default function MessageComposer({ conversationId, variant = 'mobile' }: MessageComposerProps) {
  const [text, setText] = useState('');
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useMutation(api.directMessages.send);

  const isMobile = variant === 'mobile';

  // Auto-resize textarea as content grows
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && references.length === 0) return;
    if (sending) return;

    setSending(true);
    try {
      await sendMessage({
        conversationId,
        content: trimmed,
        references: references.length > 0 ? references : undefined,
      });
      setText('');
      setReferences([]);
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const addReference = (ref: EntityReference) => {
    if (references.length >= 5) return;
    if (references.some((r) => r.type === ref.type && r.id === ref.id)) return;
    setReferences([...references, ref]);
    setShowPicker(false);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className={`border-t px-3 py-3 ${
        isMobile ? 'border-[var(--m-border)] bg-[var(--m-bg)] pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'border-gray-200'
      }`}>
        {references.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {references.map((ref, i) => (
              <ReferenceChip
                key={`${ref.type}-${ref.id}-${i}`}
                reference={ref}
                removable
                onRemove={() => removeReference(i)}
              />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowPicker(true)}
            className={`p-2 flex-shrink-0 ${
              isMobile ? 'text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]' : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label="Attach reference"
          >
            <Plus className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? 'Message…' : 'Type a message… (Cmd+Enter to send)'}
            rows={1}
            className={`flex-1 resize-none rounded-2xl px-3 py-2.5 outline-none leading-snug overflow-y-auto ${
              isMobile
                ? 'text-[16px] bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'text-[13px] bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-300'
            }`}
            style={{ minHeight: '38px', maxHeight: '140px' }}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && references.length === 0)}
            className={`p-2 flex-shrink-0 ${
              isMobile
                ? 'text-[var(--m-accent)] disabled:text-[var(--m-text-placeholder)] active:opacity-70'
                : 'text-gray-900 disabled:text-gray-300 hover:bg-gray-50 rounded-lg'
            }`}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showPicker && (
        <EntityPicker
          onSelect={addReference}
          onClose={() => setShowPicker(false)}
          variant={variant}
        />
      )}
    </>
  );
}
