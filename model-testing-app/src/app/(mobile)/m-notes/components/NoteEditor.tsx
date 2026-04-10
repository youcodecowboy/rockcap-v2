'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Mention from '@tiptap/extension-mention';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft, Loader2 } from 'lucide-react';
import EditorToolbar from './EditorToolbar';
import MetadataChips from './MetadataChips';
import { getMentionSuggestion } from '@/components/mentionSuggestion';
import type { MentionItem } from '@/components/NoteMentionList';

// ---------- constants ----------
const DEBOUNCE_DELAY = 1500;
const MIN_SAVE_INTERVAL = 2000;
const MAX_RETRIES = 3;

const EMOJI_PRESETS = ['📝', '📋', '📊', '💡', '🏗️', '🏠', '💰', '📞', '✅', '⚠️', '🔑', '📎',
  '🎯', '📌', '🗓️', '💼', '📁', '🔍', '⭐', '🚀', '💬', '📈', '🛠️', '❓'];

// ---------- helpers ----------
function hasContentText(content: any): boolean {
  if (!content) return false;
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
  }
  walk(content);
  return texts.join('').trim().length > 0;
}

function extractMentionedUserIds(content: any): string[] {
  const userIds: string[] = [];
  function walk(node: any) {
    if (node.type === 'mention' && node.attrs?.type === 'user' && node.attrs?.id) {
      userIds.push(node.attrs.id);
    }
    if (node.content) node.content.forEach(walk);
  }
  if (content?.content) content.content.forEach(walk);
  return [...new Set(userIds)];
}

// ---------- component ----------
interface NoteEditorProps {
  noteId: string;
  onBack: (noteId: string, isEmpty: boolean) => void;
}

export default function NoteEditor({ noteId, onBack }: NoteEditorProps) {
  // --- data ---
  const note = useQuery(api.notes.get, { id: noteId as Id<'notes'> });
  const updateNote = useMutation(api.notes.update);

  // Data for @mention suggestions
  const users = useQuery(api.users.getAll);
  const allClients = useQuery(api.clients.list, {});
  const allProjects = useQuery(api.projects.list, {});

  const mentionItemsRef = useRef<MentionItem[]>([]);
  useMemo(() => {
    const items: MentionItem[] = [];
    if (users) items.push(...users.map((u: any) => ({ id: u._id, label: u.name || u.email, type: 'user' as const })));
    if (allClients) items.push(...allClients.map((c: any) => ({ id: c._id, label: c.name, type: 'client' as const })));
    if (allProjects) items.push(...allProjects.map((p: any) => ({ id: p._id, label: p.name, type: 'project' as const })));
    mentionItemsRef.current = items;
  }, [users, allClients, allProjects]);

  // --- state ---
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'unsaved' | 'error'>('saved');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isSavingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingContentRef = useRef<any>(null);
  const titleInitRef = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;
  const contentInitRef = useRef(false);

  // --- normalized content ---
  const normalizedContent = useMemo(() => {
    if (!note?.content) return { type: 'doc', content: [{ type: 'paragraph' }] };
    if (typeof note.content === 'object' && note.content !== null) return note.content;
    try {
      return JSON.parse(note.content as string);
    } catch {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: String(note.content) }] }],
      };
    }
  }, [note?.content]);

  // --- editor ---
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        strike: false,
      }),
      Underline,
      Strike,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: getMentionSuggestion(() => mentionItemsRef.current),
        renderHTML({ node }) {
          const mentionType = node.attrs.type || 'user';
          const label = node.attrs.label || node.attrs.id;
          if (mentionType === 'client') {
            return ['a', { class: 'mention mention-client', 'data-type': 'client', 'data-id': node.attrs.id }, `@${label}`];
          }
          if (mentionType === 'project') {
            return ['a', { class: 'mention mention-project', 'data-type': 'project', 'data-id': node.attrs.id }, `@${label}`];
          }
          return ['span', { class: 'mention mention-user', 'data-type': 'user', 'data-id': node.attrs.id }, `@${label}`];
        },
      }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content: normalizedContent,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      setSaveStatus('unsaved');
      scheduleSave(e.getJSON());
    },
  });

  // --- save logic ---
  const handleSave = useCallback(
    async (content?: any, retryAttempt = 0) => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setSaveStatus('saving');

      const contentToSave = content ?? editor?.getJSON();

      const currentTitle = titleRef.current;
      const hasText = hasContentText(contentToSave);
      const shouldPromote = note?.isDraft && (currentTitle !== 'Untitled' || hasText);

      try {
        const mentionedUserIds = extractMentionedUserIds(contentToSave);
        await updateNote({
          id: noteId as Id<'notes'>,
          title: currentTitle,
          content: contentToSave,
          ...(shouldPromote ? { isDraft: false } : {}),
          ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
        });
        lastSaveTimeRef.current = Date.now();
        setSaveStatus('saved');
      } catch (err) {
        if (retryAttempt < MAX_RETRIES) {
          isSavingRef.current = false;
          const delay = Math.pow(2, retryAttempt) * 1000;
          setTimeout(() => handleSave(contentToSave, retryAttempt + 1), delay);
          return;
        }
        setSaveStatus('error');
      } finally {
        isSavingRef.current = false;
      }
    },
    [noteId, editor, note?.isDraft, updateNote],
  );

  const scheduleSave = useCallback(
    (content?: any) => {
      if (content) pendingContentRef.current = content;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        const now = Date.now();
        const timeSince = now - lastSaveTimeRef.current;
        if (timeSince >= MIN_SAVE_INTERVAL && !isSavingRef.current) {
          handleSave(pendingContentRef.current);
        } else if (timeSince < MIN_SAVE_INTERVAL) {
          saveTimeoutRef.current = setTimeout(() => {
            if (!isSavingRef.current) handleSave(pendingContentRef.current);
          }, MIN_SAVE_INTERVAL - timeSince);
        }
      }, DEBOUNCE_DELAY);
    },
    [handleSave],
  );

  // --- initialize title from loaded note ---
  useEffect(() => {
    if (note && !titleInitRef.current) {
      setTitle(note.title ?? 'Untitled');
      titleInitRef.current = true;
    }
  }, [note]);

  // --- set editor content when note loads ---
  useEffect(() => {
    if (note && editor && !contentInitRef.current) {
      editor.commands.setContent(normalizedContent);
      contentInitRef.current = true;
    }
  }, [note, editor, normalizedContent]);

  // --- save on visibility change ---
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'hidden' && saveStatus === 'unsaved') {
        handleSave(editor?.getJSON());
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [saveStatus, editor, handleSave]);

  // --- cleanup timeout on unmount ---
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // --- back navigation safety ---
  const handleBack = useCallback(async () => {
    if (saveStatus === 'unsaved' || saveStatus === 'error') {
      try {
        isSavingRef.current = false;
        await handleSave(editor?.getJSON());
      } catch {
        const discard = confirm('You have unsaved changes. Discard?');
        if (!discard) return;
      }
    }
    const isEmpty = title === 'Untitled' && !hasContentText(editor?.getJSON());
    onBack(noteId, isEmpty);
  }, [saveStatus, handleSave, title, editor, noteId, onBack]);

  // --- render ---
  return (
    <div className="flex flex-col h-[calc(100vh-var(--m-header-h))]">
      {/* ProseMirror styles */}
      <style jsx global>{`
        .ProseMirror {
          outline: none;
          min-height: 200px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--m-text-primary);
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--m-text-placeholder);
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; }
        .ProseMirror h2 { font-size: 20px; font-weight: 600; margin: 14px 0 6px; }
        .ProseMirror h3 { font-size: 17px; font-weight: 600; margin: 12px 0 4px; }
        .ProseMirror ul { padding-left: 20px; list-style-type: disc; }
        .ProseMirror ol { padding-left: 20px; list-style-type: decimal; }
        .ProseMirror li { margin: 2px 0; }
        .ProseMirror blockquote { border-left: 3px solid var(--m-border); padding-left: 12px; color: var(--m-text-secondary); margin: 8px 0; }
        .ProseMirror hr { border: none; border-top: 1px solid var(--m-border); margin: 16px 0; }
        .ProseMirror code { background: var(--m-bg-inset); padding: 2px 4px; border-radius: 3px; font-size: 13px; }
        .ProseMirror pre { background: var(--m-bg-inset); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
        .ProseMirror a { color: var(--m-accent-indicator); text-decoration: underline; }
        .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .ProseMirror ul[data-type="taskList"] li label { margin-top: 3px; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 8px 0; overflow-x: auto; display: block; }
        .ProseMirror th, .ProseMirror td { border: 1px solid var(--m-border); padding: 6px 10px; text-align: left; font-size: 13px; min-width: 80px; }
        .ProseMirror th { background: var(--m-bg-subtle); font-weight: 600; font-size: 12px; }
        .ProseMirror td { color: var(--m-text-primary); }
      `}</style>

      {/* Nav bar */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)] flex-shrink-0">
        <button onClick={handleBack} className="flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">Notes</span>
        </button>
        {/* Save status */}
        <div className="flex items-center gap-1.5 text-[11px]">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-[var(--m-text-tertiary)]" />
              <span className="text-[var(--m-text-tertiary)]">Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[var(--m-text-tertiary)]">Saved</span>
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[var(--m-text-tertiary)]">Unsaved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <button
              onClick={() => handleSave(editor?.getJSON())}
              className="flex items-center gap-1 text-[var(--m-error)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--m-error)]" />
              Save failed — tap to retry
            </button>
          )}
        </div>
      </div>

      {/* MetadataChips — client/project/tag pickers */}
      <MetadataChips noteId={noteId} note={note} onSave={() => handleSave(editor?.getJSON())} />

      {/* Title input with emoji picker */}
      <div className="flex items-center px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] flex-shrink-0 relative">
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="text-[22px] mr-2 flex-shrink-0 active:opacity-70"
        >
          {note?.emoji || '📄'}
        </button>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); setSaveStatus('unsaved'); scheduleSave(); }}
          placeholder="Untitled"
          style={{ fontSize: '18px' }}
          className="flex-1 text-[18px] font-semibold text-[var(--m-text-primary)] outline-none bg-transparent"
        />
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute left-[var(--m-page-px)] top-full mt-1 z-[61] bg-[var(--m-bg)] border border-[var(--m-border)] rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1">
              {EMOJI_PRESETS.map(emoji => (
                <button
                  key={emoji}
                  onClick={async () => {
                    await updateNote({ id: noteId as Id<'notes'>, emoji });
                    setShowEmojiPicker(false);
                  }}
                  className="w-[40px] h-[40px] flex items-center justify-center text-[20px] rounded-md active:bg-[var(--m-bg-subtle)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Editor content — scrollable */}
      {/* Bottom padding clears both the toolbar (44px) and the sticky footer */}
      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--m-page-px)] py-3" style={{ paddingBottom: 'calc(44px + var(--m-footer-h) + env(safe-area-inset-bottom) + 1rem)' }}>
        {note === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--m-text-tertiary)]" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Formatting toolbar */}
      <EditorToolbar editor={editor} />
    </div>
  );
}
