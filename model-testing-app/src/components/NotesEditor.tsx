'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Note } from '@/types';
import { useEditor, EditorContent } from '@tiptap/react';
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
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import NoteHeader from './NoteHeader';
import BlockMenu from './BlockMenu';
import LinkInputModal from './LinkInputModal';
import { AIAssistantBlock } from './AIAssistantBlock';
import getSuggestion from './suggestion';
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

export default function NotesEditor({ noteId, note }: NotesEditorProps) {
  const updateNote = useMutation(api.notes.update);
  const [title, setTitle] = useState(note.title);
  const [emoji, setEmoji] = useState(note.emoji || '');
  const [tags, setTags] = useState(note.tags || []);
  const [currentClientId, setCurrentClientId] = useState<Id<"clients"> | null>(note.clientId ? (note.clientId as Id<"clients">) : null);
  const [currentProjectId, setCurrentProjectId] = useState<Id<"projects"> | null>(note.projectId ? (note.projectId as Id<"projects">) : null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'unsaved' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(note.lastSavedAt);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pendingLinkCommand, setPendingLinkCommand] = useState<(() => void) | null>(null);
  const [pendingImageCommand, setPendingImageCommand] = useState<(() => void) | null>(null);
  
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
      
      await updateNote({
        id: noteId,
        title: title !== note.title ? title : undefined,
        content: editorContent,
        emoji: emoji !== note.emoji ? emoji : undefined,
        tags: JSON.stringify(tags) !== JSON.stringify(note.tags) ? tags : undefined,
        clientId: currentClientId !== (note.clientId || null) ? currentClientId : undefined,
        projectId: currentProjectId !== (note.projectId || null) ? currentProjectId : undefined,
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
  }, [editor, noteId, title, note.title, emoji, note.emoji, tags, note.tags, currentClientId, note.clientId, currentProjectId, note.projectId, updateNote, calculateWordCount]);

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
                          currentProjectId === (note.projectId || null);
    
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
  }, [title, emoji, tags, currentClientId, currentProjectId, editor, note.title, note.emoji, note.tags, note.clientId, note.projectId]);

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
          createdAt={note.createdAt}
          updatedAt={note.updatedAt}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onTitleChange={setTitle}
          onEmojiChange={setEmoji}
          onTagsChange={setTags}
          onClientChange={setCurrentClientId}
          onProjectChange={setCurrentProjectId}
        />

        <div className="flex-1 overflow-y-auto relative">
          {editor && <BlockMenu editor={editor} />}
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
