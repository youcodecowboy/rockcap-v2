'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';

interface MetadataChipsProps {
  noteId: string;
  note: any;
  onSave: () => void;
}

export default function MetadataChips({ noteId, note, onSave }: MetadataChipsProps) {
  const updateNote = useMutation(api.notes.update);
  const clients = useQuery(api.clients.list, {});
  const allProjects = useQuery(api.projects.list, {});

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Resolve names
  const clientName = useMemo(() => {
    if (!note?.clientId || !clients) return null;
    return clients.find((c: any) => c._id === note.clientId)?.name ?? 'Unknown';
  }, [note?.clientId, clients]);

  const projectName = useMemo(() => {
    if (!note?.projectId || !allProjects) return null;
    return allProjects.find((p: any) => p._id === note.projectId)?.name ?? 'Unknown';
  }, [note?.projectId, allProjects]);

  // Focus tag input when shown
  useEffect(() => {
    if (showTagInput && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [showTagInput]);

  // --- Handlers ---
  const handleSelectClient = async (clientId: string) => {
    await updateNote({ id: noteId as Id<'notes'>, clientId: clientId as Id<'clients'> });
    setShowClientPicker(false);
    setSearchQuery('');
    onSave();
  };

  const handleRemoveClient = async () => {
    await updateNote({ id: noteId as Id<'notes'>, clientId: null, projectId: null });
    onSave();
  };

  const handleSelectProject = async (projectId: string) => {
    // Auto-fill client from the project's clientRoles if no client is set
    const project = allProjects?.find((p: any) => p._id === projectId);
    const projectClientId = project?.clientRoles?.[0]?.clientId;
    const updates: any = { id: noteId as Id<'notes'>, projectId: projectId as Id<'projects'> };
    if (!note?.clientId && projectClientId) {
      updates.clientId = projectClientId as Id<'clients'>;
    }
    await updateNote(updates);
    setShowProjectPicker(false);
    setSearchQuery('');
    onSave();
  };

  const handleRemoveProject = async () => {
    await updateNote({ id: noteId as Id<'notes'>, projectId: null });
    onSave();
  };

  const handleAddTag = async (tag: string) => {
    const currentTags = note?.tags ?? [];
    if (!currentTags.includes(tag) && tag.trim()) {
      await updateNote({ id: noteId as Id<'notes'>, tags: [...currentTags, tag.trim()] });
      onSave();
    }
    setNewTag('');
    setShowTagInput(false);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const currentTags = note?.tags ?? [];
    await updateNote({ id: noteId as Id<'notes'>, tags: currentTags.filter((t: string) => t !== tagToRemove) });
    onSave();
  };

  // --- Filtered lists for pickers ---
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter((c: any) => c.name?.toLowerCase().includes(q));
  }, [clients, searchQuery]);

  const filteredProjects = useMemo(() => {
    if (!allProjects) return [];
    // If a client is set, filter to that client's projects; otherwise show all
    let pool = allProjects;
    if (note?.clientId) {
      pool = allProjects.filter((p: any) =>
        p.clientRoles?.some((cr: any) => cr.clientId === note.clientId)
      );
    }
    if (!searchQuery.trim()) return pool;
    const q = searchQuery.toLowerCase();
    return pool.filter((p: any) => p.name?.toLowerCase().includes(q));
  }, [allProjects, note?.clientId, searchQuery]);

  const tags: string[] = note?.tags ?? [];

  return (
    <>
      {/* Chips row */}
      <div className="flex gap-1.5 overflow-x-auto px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] scrollbar-none flex-shrink-0">
        {/* Client chip */}
        {note?.clientId && clientName ? (
          <button
            onClick={() => { setSearchQuery(''); setShowClientPicker(true); }}
            className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded-full px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0"
          >
            {clientName}
            <span
              onClick={(e) => { e.stopPropagation(); handleRemoveClient(); }}
              className="text-[var(--m-text-placeholder)] active:text-[var(--m-text-primary)]"
            >
              &times;
            </span>
          </button>
        ) : (
          <button
            onClick={() => { setSearchQuery(''); setShowClientPicker(true); }}
            className="border border-dashed border-[var(--m-border)] text-[var(--m-text-tertiary)] rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap flex-shrink-0"
          >
            + Client
          </button>
        )}

        {/* Project chip — always visible */}
        {note?.projectId && projectName ? (
          <button
            onClick={() => { setSearchQuery(''); setShowProjectPicker(true); }}
            className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded-full px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0"
          >
            {projectName}
            <span
              onClick={(e) => { e.stopPropagation(); handleRemoveProject(); }}
              className="text-[var(--m-text-placeholder)] active:text-[var(--m-text-primary)]"
            >
              &times;
            </span>
          </button>
        ) : (
          <button
            onClick={() => { setSearchQuery(''); setShowProjectPicker(true); }}
            className="border border-dashed border-[var(--m-border)] text-[var(--m-text-tertiary)] rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap flex-shrink-0"
          >
            + Project
          </button>
        )}

        {/* Tag chips */}
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded-full px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0"
          >
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="text-[var(--m-text-placeholder)] active:text-[var(--m-text-primary)]"
            >
              &times;
            </button>
          </span>
        ))}

        {/* Add tag — inline input or dashed button */}
        {showTagInput ? (
          <input
            ref={tagInputRef}
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag(newTag);
              if (e.key === 'Escape') { setNewTag(''); setShowTagInput(false); }
            }}
            onBlur={() => {
              if (newTag.trim()) handleAddTag(newTag);
              else { setNewTag(''); setShowTagInput(false); }
            }}
            placeholder="tag name"
            style={{ fontSize: '16px' }}
            className="w-20 bg-[var(--m-bg-inset)] border border-[var(--m-border-subtle)] rounded-full px-2.5 py-0.5 text-[11px] outline-none text-[var(--m-text-primary)] flex-shrink-0"
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="border border-dashed border-[var(--m-border)] text-[var(--m-text-tertiary)] rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap flex-shrink-0"
          >
            + Tag
          </button>
        )}
      </div>

      {/* Client picker bottom sheet */}
      {showClientPicker && (
        <div className="fixed inset-0 z-[70]" onClick={() => setShowClientPicker(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[60vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
            </div>
            <div className="px-4 pt-1 pb-3 border-b border-[var(--m-border)]">
              <div className="text-[15px] font-semibold">Select Client</div>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-full mt-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[13px]"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredClients.map((item: any) => (
                <button
                  key={item._id}
                  onClick={() => handleSelectClient(item._id)}
                  className="w-full text-left px-4 py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
                >
                  <span className="text-[13px]">{item.name}</span>
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                  No clients found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project picker bottom sheet */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-[70]" onClick={() => setShowProjectPicker(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[60vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
            </div>
            <div className="px-4 pt-1 pb-3 border-b border-[var(--m-border)]">
              <div className="text-[15px] font-semibold">Select Project</div>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-full mt-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[13px]"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredProjects.map((item: any) => {
                const projClientId = item.clientRoles?.[0]?.clientId;
                const projClientName = projClientId && clients
                  ? clients.find((c: any) => c._id === projClientId)?.name
                  : null;
                return (
                  <button
                    key={item._id}
                    onClick={() => handleSelectProject(item._id)}
                    className="w-full text-left px-4 py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
                  >
                    <span className="text-[13px]">{item.name}</span>
                    {!note?.clientId && projClientName && (
                      <span className="text-[11px] text-[var(--m-text-tertiary)] ml-1.5">{projClientName}</span>
                    )}
                  </button>
                );
              })}
              {filteredProjects.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                  No projects found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
