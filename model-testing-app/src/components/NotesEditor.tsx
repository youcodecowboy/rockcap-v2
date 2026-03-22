'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Note } from '@/types';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Mention from '@tiptap/extension-mention';
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import NoteHeader from './NoteHeader';
import BlockMenu from './BlockMenu';
import LinkInputModal from './LinkInputModal';
import { AIAssistantBlock } from './AIAssistantBlock';
import getSuggestion from './suggestion';
import { getMentionSuggestion } from './mentionSuggestion';
import { type MentionItem } from './NoteMentionList';
import { NoteContext } from '@/contexts/NoteContext';
import 'tippy.js/dist/tippy.css';

interface NotesEditorProps {
  noteId: Id<"notes">;
  note: Note;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

// Create a custom extension for slash commands
const Commands = Extension.create({
  name: 'commands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

/** Extract mentionedUserIds from TipTap JSON content */
function extractMentionedUserIds(content: any): string[] {
  const userIds: string[] = [];
  function walk(node: any) {
    if (node.type === 'mention' && node.attrs?.type === 'user' && node.attrs?.id) {
      userIds.push(node.attrs.id);
    }
    if (node.content) {
      node.content.forEach(walk);
    }
  }
  if (content?.content) {
    content.content.forEach(walk);
  }
  return [...new Set(userIds)];
}

export default function NotesEditor({ noteId, note }: NotesEditorProps) {
  const updateNote = useMutation(api.notes.update);
  const [title, setTitle] = useState(note.title);
  const [emoji, setEmoji] = useState(note.emoji || '');
  const [tags, setTags] = useState(note.tags || []);
  const [currentClientId, setCurrentClientId] = useState<Id<"clients"> | null>(note.clientId ? (note.clientId as Id<"clients">) : null);
  const [currentProjectId, setCurrentProjectId] = useState<Id<"projects"> | null>(note.projectId ? (note.projectId as Id<"projects">) : null);
  const [linkedDocumentIds, setLinkedDocumentIds] = useState<Id<"documents">[]>((note as any).linkedDocumentIds || []);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'unsaved' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(note.lastSavedAt);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pendingLinkCommand, setPendingLinkCommand] = useState<(() => void) | null>(null);
  const [pendingImageCommand, setPendingImageCommand] = useState<(() => void) | null>(null);
  
  // Data for @mention suggestions
  const users = useQuery(api.users.getAll);
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Build mention items from loaded data
  const mentionItemsRef = useRef<MentionItem[]>([]);
  useMemo(() => {
    const items: MentionItem[] = [];
    if (users) {
      items.push(...users.map((u: any) => ({ id: u._id, label: u.name || u.email, type: 'user' as const })));
    }
    if (clients) {
      items.push(...clients.map((c: any) => ({ id: c._id, label: c.name, type: 'client' as const })));
    }
    if (projects) {
      items.push(...projects.map((p: any) => ({ id: p._id, label: p.name, type: 'project' as const })));
    }
    mentionItemsRef.current = items;
  }, [users, clients, projects]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChanges = useRef(false);
  const saveQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isOnlineRef = useRef(navigator.onLine);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isSavingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);
  const minSaveInterval = 2000;
  const debounceDelay = 1500;

  const calculateWordCount = useCallback((content: any): number => {
    if (!content) return 0;
    let text = '';
    
    const extractText = (node: any) => {
      if (node.type === 'text') {
        text += node.text + ' ';
      }
      if (node.content) {
        node.content.forEach(extractText);
      }
    };
    
    if (content.content) {
      content.content.forEach(extractText);
    }
    
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        strike: false, // We'll use the separate Strike extension
      }),
      Placeholder.configure({
        placeholder: 'Type / for commands...',
      }),
      TextStyle,
      Underline,
      Strike,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlock,
      Blockquote,
      HorizontalRule,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Commands.configure({
        suggestion: getSuggestion(),
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: getMentionSuggestion(() => mentionItemsRef.current),
        renderHTML({ options, node }) {
          const mentionType = node.attrs.type || 'user';
          const label = node.attrs.label || node.attrs.id;

          if (mentionType === 'client') {
            return ['a', {
              class: 'mention mention-client',
              href: `/clients/${node.attrs.id}`,
              'data-type': 'client',
              'data-id': node.attrs.id,
            }, `@${label}`];
          }
          if (mentionType === 'project') {
            return ['a', {
              class: 'mention mention-project',
              href: `/clients/${node.attrs.clientId || ''}/projects/${node.attrs.id}`,
              'data-type': 'project',
              'data-id': node.attrs.id,
            }, `@${label}`];
          }
          // Default: user mention
          return ['span', {
            class: 'mention mention-user',
            'data-type': 'user',
            'data-id': node.attrs.id,
          }, `@${label}`];
        },
      }),
      AIAssistantBlock.configure({
        onTitleUpdate: (suggestedTitle: string) => {
          setTitle(suggestedTitle);
          // Trigger save for title update
          if (editor) {
            handleSave(editor.getJSON());
          }
        },
        onTagsUpdate: (suggestedTags: string[]) => {
          // Merge with existing tags, avoiding duplicates
          const mergedTags = [...new Set([...tags, ...suggestedTags])];
          setTags(mergedTags);
          // Trigger save for tags update
          if (editor) {
            handleSave(editor.getJSON());
          }
        },
        onClientUpdate: (suggestedClientId: string | null) => {
          // Only update if not already set
          if (!currentClientId && suggestedClientId) {
            setCurrentClientId(suggestedClientId as Id<"clients">);
            // Trigger save for client update
            if (editor) {
              handleSave(editor.getJSON());
            }
          }
        },
        onProjectUpdate: (suggestedProjectId: string | null) => {
          // Only update if not already set
          if (!currentProjectId && suggestedProjectId) {
            setCurrentProjectId(suggestedProjectId as Id<"projects">);
            // Trigger save for project update
            if (editor) {
              handleSave(editor.getJSON());
            }
          }
        },
      }),
    ],
    content: note.content || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[500px] p-6',
      },
    },
    onUpdate: ({ editor }) => {
      if (isSavingRef.current) return;
      
      hasUnsavedChanges.current = true;
      setSaveStatus('unsaved');
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const now = Date.now();
        const timeSinceLastSave = now - lastSaveTimeRef.current;
        
        if (timeSinceLastSave >= minSaveInterval && !isSavingRef.current) {
          handleSave(editor.getJSON());
        } else if (timeSinceLastSave < minSaveInterval) {
          const remainingTime = minSaveInterval - timeSinceLastSave;
          saveTimeoutRef.current = setTimeout(() => {
            if (!isSavingRef.current) {
              handleSave(editor.getJSON());
            }
          }, remainingTime);
        }
      }, debounceDelay);
    },
  });

  useEffect(() => {
    if (editor && note.content) {
      editor.commands.setContent(note.content);
    }
  }, [note._id, editor]);

  const handleSave = useCallback(async (content?: any, retryAttempt = 0) => {
    if (!editor) return;
    
    if (isSavingRef.current && retryAttempt === 0) {
      return;
    }
    
    if (!navigator.onLine) {
      isOnlineRef.current = false;
      setSaveStatus('error');
      hasUnsavedChanges.current = true;
      saveQueueRef.current.push(() => handleSave(content, 0));
      return;
    }
    
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    
    if (timeSinceLastSave < minSaveInterval && retryAttempt === 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const remainingTime = minSaveInterval - timeSinceLastSave;
      saveTimeoutRef.current = setTimeout(() => {
        handleSave(content, 0);
      }, remainingTime);
      return;
    }
    
    isSavingRef.current = true;
    setSaveStatus('saving');
    hasUnsavedChanges.current = false;
    
    try {
      const editorContent = content || editor.getJSON();
      const wordCount = calculateWordCount(editorContent);
      
      // Extract @mentioned user IDs from editor content
      const mentionedUserIds = extractMentionedUserIds(editorContent);

      await updateNote({
        id: noteId,
        title: title !== note.title ? title : undefined,
        content: editorContent,
        emoji: emoji !== note.emoji ? emoji : undefined,
        tags: JSON.stringify(tags) !== JSON.stringify(note.tags) ? tags : undefined,
        clientId: currentClientId !== (note.clientId || null) ? currentClientId : undefined,
        projectId: currentProjectId !== (note.projectId || null) ? currentProjectId : undefined,
        linkedDocumentIds: linkedDocumentIds.length > 0 ? linkedDocumentIds : undefined,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
        wordCount: wordCount > 0 ? wordCount : undefined,
      });
      
      lastSaveTimeRef.current = Date.now();
      setSaveStatus('saved');
      setLastSavedAt(new Date().toISOString());
      retryCountRef.current = 0;
      isSavingRef.current = false;
    } catch (error) {
      console.error('Failed to save note:', error);
      isSavingRef.current = false;
      
      if (retryAttempt < maxRetries) {
        retryCountRef.current = retryAttempt + 1;
        setTimeout(() => {
          handleSave(content, retryAttempt + 1);
        }, Math.pow(2, retryAttempt) * 1000);
      } else {
        setSaveStatus('error');
        hasUnsavedChanges.current = true;
        retryCountRef.current = 0;
      }
    }
  }, [editor, noteId, title, note.title, emoji, note.emoji, tags, note.tags, currentClientId, note.clientId, currentProjectId, note.projectId, linkedDocumentIds, updateNote, calculateWordCount]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      const queue = [...saveQueueRef.current];
      saveQueueRef.current = [];
      queue.forEach(saveFn => saveFn());
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-save on page leave
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges.current) {
        if (navigator.onLine) {
          handleSave();
        }
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges.current && navigator.onLine) {
        handleSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (hasUnsavedChanges.current && editor && navigator.onLine) {
        handleSave();
      }
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [handleSave, editor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (editor) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, handleSave]);

  // Auto-save when metadata changes
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    if (!editor || isSavingRef.current) return;
    
    const isInitialMount = title === note.title &&
                          emoji === (note.emoji || '') &&
                          JSON.stringify(tags) === JSON.stringify(note.tags || []) &&
                          currentClientId === (note.clientId || null) &&
                          currentProjectId === (note.projectId || null) &&
                          JSON.stringify(linkedDocumentIds) === JSON.stringify((note as any).linkedDocumentIds || []);
    
    if (isInitialMount) return;
    
    hasUnsavedChanges.current = true;
    setSaveStatus('unsaved');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastSave = now - lastSaveTimeRef.current;
      
      if (timeSinceLastSave >= minSaveInterval && !isSavingRef.current) {
        handleSaveRef.current();
      } else if (timeSinceLastSave < minSaveInterval) {
        const remainingTime = minSaveInterval - timeSinceLastSave;
        saveTimeoutRef.current = setTimeout(() => {
          if (!isSavingRef.current) {
            handleSaveRef.current();
          }
        }, remainingTime);
      }
    }, debounceDelay);
  }, [title, emoji, tags, currentClientId, currentProjectId, linkedDocumentIds, editor, note.title, note.emoji, note.tags, note.clientId, note.projectId]);

  // AI note cleanup
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const handleCleanupSelection = useCallback(async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (selectedText.length < 5) return;

    setIsCleaningUp(true);
    try {
      const res = await fetch('/api/note-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText, mode: 'selection' }),
      });
      if (!res.ok) throw new Error('Cleanup failed');
      const { cleaned } = await res.json();

      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, cleaned).run();
    } catch {
      const { toast } = await import('sonner');
      toast.error('Failed to clean up text');
    } finally {
      setIsCleaningUp(false);
    }
  }, [editor]);



  const handleLinkSubmit = useCallback((url: string) => {
    if (editor) {
      editor
        .chain()
        .focus()
        .setLink({ href: url })
        .run();
    }
    setLinkModalOpen(false);
    setPendingLinkCommand(null);
  }, [editor]);

  const handleImageSubmit = useCallback((url: string) => {
    if (editor) {
      editor
        .chain()
        .focus()
        .setImage({ src: url })
        .run();
    }
    setImageModalOpen(false);
    setPendingImageCommand(null);
  }, [editor]);

  return (
    <NoteContext.Provider value={{ 
      noteId, 
      clientId: currentClientId, 
      projectId: currentProjectId 
    }}>
      <div className="flex flex-col h-full">
        <NoteHeader
          title={title}
          emoji={emoji}
          tags={tags}
          clientId={currentClientId}
          projectId={currentProjectId}
          linkedDocumentIds={linkedDocumentIds}
          createdAt={note.createdAt}
          updatedAt={note.updatedAt}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onTitleChange={setTitle}
          onEmojiChange={setEmoji}
          onTagsChange={setTags}
          onClientChange={setCurrentClientId}
          onProjectChange={setCurrentProjectId}
          onLinkedDocumentsChange={setLinkedDocumentIds}
        />

        <div className="flex-1 overflow-y-auto relative">
          {editor && <BlockMenu editor={editor} />}
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 150 }}
              shouldShow={({ editor: e }) => {
                const { from, to } = e.state.selection;
                const text = e.state.doc.textBetween(from, to, ' ');
                return text.trim().length >= 5;
              }}
            >
              <button
                onClick={handleCleanupSelection}
                disabled={isCleaningUp}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg shadow-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isCleaningUp ? (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75"/></svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                )}
                Clean up
              </button>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>

        <LinkInputModal
          isOpen={linkModalOpen}
          onClose={() => {
            setLinkModalOpen(false);
            setPendingLinkCommand(null);
          }}
          onSubmit={handleLinkSubmit}
          title="Add Link"
          placeholder="Enter URL"
        />

        <LinkInputModal
          isOpen={imageModalOpen}
          onClose={() => {
            setImageModalOpen(false);
            setPendingImageCommand(null);
          }}
          onSubmit={handleImageSubmit}
          title="Insert Image"
          placeholder="Enter image URL"
        />
      </div>
    </NoteContext.Provider>
  );
}
