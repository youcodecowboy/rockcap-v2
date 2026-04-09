'use client';

import { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { List, ListChecks, Quote, Minus, Link2 } from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const kbHeight = window.innerHeight - vv.height;
      setKeyboardHeight(Math.max(0, kbHeight));
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  if (!editor) return null;

  const isOnLink = editor.isActive('link');

  const handleLinkToggle = () => {
    if (showLinkPopover) {
      setShowLinkPopover(false);
      setLinkUrl('');
      return;
    }
    // Pre-fill URL if cursor is on a link
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
    `flex-shrink-0 w-[44px] h-[44px] flex items-center justify-center text-[13px] font-semibold ${
      active ? 'bg-white text-black rounded-md' : 'text-white'
    }`;

  return (
    <div
      className="fixed left-0 right-0 z-50 bg-black"
      style={{ bottom: keyboardHeight > 0
        ? keyboardHeight
        : 'calc(var(--m-footer-h) + env(safe-area-inset-bottom, 0px))'
      }}
    >
      {/* Link popover */}
      {showLinkPopover && (
        <div className="absolute bottom-full left-0 right-0 bg-[var(--m-bg)] border-t border-[var(--m-border)] px-3 py-2 flex items-center gap-2">
          <input
            type="url"
            placeholder="Enter URL..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSetLink();
            }}
            className="flex-1 bg-black/50 text-white border border-[var(--m-border)] rounded px-2 py-1"
            style={{ fontSize: '16px' }}
            autoFocus
          />
          <button
            onClick={handleSetLink}
            className="px-3 py-1 bg-white text-black rounded text-sm font-medium"
          >
            Set
          </button>
          {isOnLink && (
            <button
              onClick={handleRemoveLink}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {/* Button row */}
      <div className="flex overflow-x-auto scrollbar-none px-1">
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
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}
        >
          <List size={18} />
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
          <ListChecks size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive('blockquote'))}
        >
          <Quote size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btnClass(false)}
        >
          <Minus size={18} />
        </button>
        <button
          onClick={handleLinkToggle}
          className={btnClass(isOnLink)}
        >
          <Link2 size={18} />
        </button>
      </div>
    </div>
  );
}
