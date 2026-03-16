'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import EmojiPickerButton from './EmojiPicker';
import TagInput from './TagInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useClients, useProjectsByClient } from '@/lib/clientStorage';
import { Calendar, Save, AlertCircle, FileText, X } from 'lucide-react';

interface NoteHeaderProps {
  title: string;
  emoji?: string;
  tags: string[];
  clientId?: Id<"clients"> | null;
  projectId?: Id<"projects"> | null;
  linkedDocumentIds?: Id<"documents">[];
  createdAt: string;
  updatedAt: string;
  saveStatus: 'saving' | 'saved' | 'unsaved' | 'error';
  lastSavedAt?: string;
  onTitleChange: (title: string) => void;
  onEmojiChange: (emoji: string) => void;
  onTagsChange: (tags: string[]) => void;
  onClientChange: (clientId: Id<"clients"> | null) => void;
  onProjectChange: (projectId: Id<"projects"> | null) => void;
  onLinkedDocumentsChange?: (docIds: Id<"documents">[]) => void;
}

/** Small chip that resolves a document's name and links to the reader */
function LinkedDocumentChip({
  documentId,
  onRemove,
}: {
  documentId: Id<"documents">;
  onRemove: () => void;
}) {
  const doc = useQuery(api.documents.get, { id: documentId });
  const name = doc?.fileName || 'Loading...';

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 transition-colors">
      <a
        href={`/docs/reader/${documentId}`}
        className="flex items-center gap-1 hover:text-blue-600"
        onClick={(e) => e.stopPropagation()}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[180px]">{name}</span>
      </a>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 p-0.5 rounded hover:bg-gray-300 transition-colors"
        title="Remove linked document"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function NoteHeader({
  title,
  emoji,
  tags,
  clientId,
  projectId,
  createdAt,
  updatedAt,
  saveStatus,
  lastSavedAt,
  onTitleChange,
  onEmojiChange,
  onTagsChange,
  onClientChange,
  onProjectChange,
  linkedDocumentIds,
  onLinkedDocumentsChange,
}: NoteHeaderProps) {
  const clients = useClients() || [];
  const projects = useProjectsByClient(clientId || undefined) || [];
  const [isMinimized, setIsMinimized] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [showDocSearch, setShowDocSearch] = useState(false);

  // Fetch documents for linking (scoped to client if set)
  const documents = useQuery(
    api.documents.getByClient,
    clientId ? { clientId: clientId as Id<"clients"> } : "skip"
  );
  // Filter documents by search query
  const filteredDocs = (documents || [])
    .filter((d: any) => d.fileName?.toLowerCase().includes(docSearchQuery.toLowerCase()))
    .filter((d: any) => !(linkedDocumentIds || []).includes(d._id))
    .slice(0, 8);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const created = formatDateTime(createdAt);
  const updated = formatDateTime(updatedAt);
  const lastSaved = lastSavedAt ? formatDateTime(lastSavedAt) : null;

  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return { text: 'Saving...', color: 'text-blue-600', icon: Save };
      case 'saved':
        return { text: lastSaved ? `Saved ${lastSaved.time}` : 'Saved', color: 'text-green-600', icon: Save };
      case 'unsaved':
        return { text: 'Unsaved changes', color: 'text-orange-600', icon: AlertCircle };
      case 'error':
        return { text: 'Save failed', color: 'text-red-600', icon: AlertCircle };
      default:
        return { text: '', color: '', icon: Save };
    }
  };

  const saveStatusDisplay = getSaveStatusDisplay();
  const StatusIcon = saveStatusDisplay.icon;

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* Top Row: Emoji + Title + Save Status + Minimize */}
      <div className="px-6 py-4">
        <div className="flex items-start gap-3">
          <EmojiPickerButton
            onEmojiSelect={onEmojiChange}
            currentEmoji={emoji}
          />
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="text-3xl font-bold text-gray-900 bg-transparent border-none outline-none w-full placeholder-gray-400"
              placeholder="Untitled Note"
            />
            {!isMinimized && (
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Created {created.date} at {created.time}</span>
                </div>
                <span>•</span>
                <span>Last modified {updated.date} at {updated.time}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 ${saveStatusDisplay.color}`}>
              <StatusIcon className="w-4 h-4" />
              <span className="text-sm font-medium">{saveStatusDisplay.text}</span>
            </div>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title={isMinimized ? "Show details" : "Hide details"}
            >
              {isMinimized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Metadata Row: Tags, Client, Project, Mentions - Only show if not minimized */}
        {!isMinimized && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
            <TagInput
              tags={tags}
              onChange={onTagsChange}
              suggestions={[]} // Could be populated from existing tags
              placeholder="Add tags..."
            />
          </div>

          {/* Client Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Client</label>
            <Select
              value={clientId || 'none'}
              onValueChange={(value) => {
                if (value === 'none') {
                  onClientChange(null);
                  onProjectChange(null);
                } else {
                  onClientChange(value as Id<"clients">);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client (Internal)</SelectItem>
                {clients.map((client) => {
                  const id = (client as any)._id || (client as any).id;
                  return (
                    <SelectItem key={id} value={id}>
                      {client.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Project Selector (only if client selected) */}
          {clientId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
              <Select
                value={projectId || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    onProjectChange(null);
                  } else {
                    onProjectChange(value as Id<"projects">);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => {
                    const id = (project as any)._id || (project as any).id;
                    return (
                      <SelectItem key={id} value={id}>
                        {project.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Documents */}
          {onLinkedDocumentsChange && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Linked Documents</label>
              {/* Linked document chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {(linkedDocumentIds || []).map((docId) => (
                  <LinkedDocumentChip
                    key={docId}
                    documentId={docId}
                    onRemove={() => {
                      onLinkedDocumentsChange(
                        (linkedDocumentIds || []).filter((id) => id !== docId)
                      );
                    }}
                  />
                ))}
              </div>
              {/* Document search */}
              {clientId ? (
                <div className="relative">
                  <div className="flex items-center gap-2 p-2 border border-gray-300 rounded-md">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search documents to link..."
                      className="flex-1 border-none outline-none text-sm bg-transparent"
                      value={docSearchQuery}
                      onChange={(e) => {
                        setDocSearchQuery(e.target.value);
                        setShowDocSearch(true);
                      }}
                      onFocus={() => setShowDocSearch(true)}
                      onBlur={() => setTimeout(() => setShowDocSearch(false), 200)}
                    />
                  </div>
                  {showDocSearch && docSearchQuery && filteredDocs.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredDocs.map((doc: any) => (
                        <button
                          key={doc._id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onLinkedDocumentsChange([
                              ...(linkedDocumentIds || []),
                              doc._id as Id<"documents">,
                            ]);
                            setDocSearchQuery('');
                            setShowDocSearch(false);
                          }}
                        >
                          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{doc.fileName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Select a client to link documents</p>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

