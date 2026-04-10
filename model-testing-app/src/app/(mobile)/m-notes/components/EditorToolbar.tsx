'use client';

import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { List, ListChecks, Quote, Minus, Link2, AtSign } from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  if (!editor) return null;

  const isOnLink = editor.isActive('link');

  const handleLinkToggle = () => {
    if (showLinkPopover) {
      setShowLinkPopover(false);
      setLinkUrl('');
      return;
    }
    if (isOnLink) {
      const href = editor.getAttributes('link').href || '';
      setLinkUrl(href);
    } else {
      setLinkUrl('');
    }
    setShowLinkPopover(true);
  };

  const handleSetLink = () => {
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
    }
    setShowLinkPopover(false);
    setLinkUrl('');
  };

  const handleRemoveLink = () => {
    editor.chain().focus().unsetLink().run();
    setShowLinkPopover(false);
    setLinkUrl('');
  };

  const btnClass = (active: boolean) =>
    `flex-shrink-0 w-[36px] h-[36px] flex items-center justify-center text-[12px] font-semibold rounded-md ${
      active ? 'bg-[var(--m-text-primary)] text-[var(--m-bg)]' : 'text-[var(--m-text-secondary)] active:bg-[var(--m-bg-inset)]'
    }`;

  return (
    <div className="flex-shrink-0 border-b border-[var(--m-border-subtle)] bg-[var(--m-bg)]">
      {/* Link popover */}
      {showLinkPopover && (
        <div className="px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] flex items-center gap-2">
          <input
            type="url"
            placeholder="Enter URL..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSetLink();
            }}
            className="flex-1 bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] border border-[var(--m-border-subtle)] rounded-lg px-2.5 py-1.5 outline-none"
            style={{ fontSize: '16px' }}
            autoFocus
          />
          <button
            onClick={handleSetLink}
            className="px-3 py-1.5 bg-[var(--m-accent)] text-white rounded-lg text-[12px] font-medium"
          >
            Set
          </button>
          {isOnLink && (
            <button
              onClick={handleRemoveLink}
              className="px-3 py-1.5 bg-[var(--m-error)] text-white rounded-lg text-[12px] font-medium"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {/* Button row */}
      <div className="flex overflow-x-auto scrollbar-none px-[var(--m-page-px)] py-1 gap-0.5">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive('bold'))}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive('italic'))}
        >
          <span className="italic">I</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btnClass(editor.isActive('underline'))}
        >
          <span className="underline">U</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={btnClass(editor.isActive('strike'))}
        >
          <span className="line-through">S</span>
        </button>

        <div className="w-px bg-[var(--m-border-subtle)] mx-1 self-stretch" />

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={btnClass(editor.isActive('heading', { level: 1 }))}
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}
        >
          H2
        </button>

        <div className="w-px bg-[var(--m-border-subtle)] mx-1 self-stretch" />

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}
        >
          1.
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={btnClass(editor.isActive('taskList'))}
        >
          <ListChecks size={16} />
        </button>

        <div className="w-px bg-[var(--m-border-subtle)] mx-1 self-stretch" />

        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive('blockquote'))}
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btnClass(false)}
        >
          <Minus size={16} />
        </button>
        <button
          onClick={handleLinkToggle}
          className={btnClass(isOnLink)}
        >
          <Link2 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().insertContent('@').run()}
          className={btnClass(false)}
        >
          <AtSign size={16} />
        </button>
      </div>
    </div>
  );
}
