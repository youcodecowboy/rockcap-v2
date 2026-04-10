'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Plus, ChevronLeft, Building2, FolderKanban, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MetadataChipsProps {
  noteId: string;
  note: any;
  onSave: () => void;
}

type PickerMode = 'list' | 'create';

function formatRelativeDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Consistent color palette for tags
const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function MetadataChips({ noteId, note, onSave }: MetadataChipsProps) {
  const router = useRouter();
  const updateNote = useMutation(api.notes.update);
  const createClient = useMutation(api.clients.create);
  const createProject = useMutation(api.projects.create);
  const clients = useQuery(api.clients.list, {});
  const allProjects = useQuery(api.projects.list, {});

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Create-mode state
  const [pickerMode, setPickerMode] = useState<PickerMode>('list');
  const [newName, setNewName] = useState('');
  const [newProjectClientId, setNewProjectClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

  const resetPickerState = () => {
    setPickerMode('list');
    setSearchQuery('');
    setNewName('');
    setNewProjectClientId(null);
    setNewClientName('');
    setIsCreating(false);
  };

  // --- Handlers ---
  const handleSelectClient = async (clientId: string) => {
    await updateNote({ id: noteId as Id<'notes'>, clientId: clientId as Id<'clients'> });
    setShowClientPicker(false);
    resetPickerState();
    onSave();
  };

  const handleRemoveClient = async () => {
    await updateNote({ id: noteId as Id<'notes'>, clientId: null, projectId: null });
    onSave();
  };

  const handleCreateClient = async () => {
    if (!newName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const clientId = await createClient({ name: newName.trim() });
      await updateNote({ id: noteId as Id<'notes'>, clientId: clientId as Id<'clients'> });
      setShowClientPicker(false);
      resetPickerState();
      onSave();
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectProject = async (projectId: string) => {
    const project = allProjects?.find((p: any) => p._id === projectId);
    const projectClientId = project?.clientRoles?.[0]?.clientId;
    const updates: any = { id: noteId as Id<'notes'>, projectId: projectId as Id<'projects'> };
    if (!note?.clientId && projectClientId) {
      updates.clientId = projectClientId as Id<'clients'>;
    }
    await updateNote(updates);
    setShowProjectPicker(false);
    resetPickerState();
    onSave();
  };

  const handleRemoveProject = async () => {
    await updateNote({ id: noteId as Id<'notes'>, projectId: null });
    onSave();
  };

  const handleCreateProject = async () => {
    if (!newName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      let clientId = newProjectClientId;

      // Create a new client inline if needed
      if (!clientId && newClientName.trim()) {
        clientId = await createClient({ name: newClientName.trim() }) as string;
      }

      if (!clientId) {
        setIsCreating(false);
        return;
      }

      const projectId = await createProject({
        name: newName.trim(),
        clientRoles: [{ clientId: clientId as Id<'clients'>, role: 'borrower' }],
      });

      const updates: any = { id: noteId as Id<'notes'>, projectId: projectId as Id<'projects'> };
      if (!note?.clientId) {
        updates.clientId = clientId as Id<'clients'>;
      }
      await updateNote(updates);
      setShowProjectPicker(false);
      resetPickerState();
      onSave();
    } finally {
      setIsCreating(false);
    }
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
    const active = clients.filter((c: any) => !c.isDeleted);
    if (!searchQuery.trim()) return active;
    const q = searchQuery.toLowerCase();
    return active.filter((c: any) => c.name?.toLowerCase().includes(q));
  }, [clients, searchQuery]);

  const filteredProjects = useMemo(() => {
    if (!allProjects) return [];
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

  // Filtered clients for project creation client picker
  const filteredCreateClients = useMemo(() => {
    if (!clients) return [];
    const active = clients.filter((c: any) => !c.isDeleted);
    if (!newClientName.trim()) return active;
    const q = newClientName.toLowerCase();
    return active.filter((c: any) => c.name?.toLowerCase().includes(q));
  }, [clients, newClientName]);

  const tags: string[] = note?.tags ?? [];

  return (
    <>
      {/* Metadata bar */}
      <div className="border-b border-[var(--m-border-subtle)] flex-shrink-0">
        {/* Row 1: Client & Project */}
        <div className="flex items-center gap-1.5 px-[var(--m-page-px)] pt-2 pb-1">
          {note?.clientId && clientName ? (
            <button
              onClick={() => router.push(`/m-clients?clientId=${note.clientId}`)}
              className="bg-amber-50 text-amber-700 rounded-full px-2.5 py-1 text-[12px] font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0"
            >
              <Building2 className="w-3 h-3" />
              {clientName}
              <span
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveClient(); }}
                className="text-amber-400 hover:text-amber-700 ml-0.5"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ) : (
            <button
              onClick={() => { resetPickerState(); setShowClientPicker(true); }}
              className="border border-dashed border-[var(--m-border)] text-[var(--m-text-tertiary)] rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap flex-shrink-0"
            >
              + Client
            </button>
          )}

          {note?.projectId && projectName ? (
            <button
              onClick={() => router.push(`/m-clients?projectId=${note.projectId}`)}
              className="bg-violet-50 text-violet-700 rounded-full px-2.5 py-1 text-[12px] font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0"
            >
              <FolderKanban className="w-3 h-3" />
              {projectName}
              <span
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveProject(); }}
                className="text-violet-400 hover:text-violet-700 ml-0.5"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ) : (
            <button
              onClick={() => { resetPickerState(); setShowProjectPicker(true); }}
              className="border border-dashed border-[var(--m-border)] text-[var(--m-text-tertiary)] rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap flex-shrink-0"
            >
              + Project
            </button>
          )}

          {/* Updated date — right-aligned */}
          {note?.updatedAt && (
            <span className="ml-auto text-[10px] text-[var(--m-text-tertiary)] whitespace-nowrap flex-shrink-0">
              {formatRelativeDate(note.updatedAt)}
            </span>
          )}
        </div>

        {/* Row 2: Tags */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-[var(--m-page-px)] pb-2 scrollbar-none">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`${tagColor(tag)} rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap flex-shrink-0`}
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="opacity-50 hover:opacity-100"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

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
      </div>

      {/* Client picker bottom sheet */}
      {showClientPicker && (
        <div className="fixed inset-0 z-[70]" onClick={() => { setShowClientPicker(false); resetPickerState(); }}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[80vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
            </div>

            {pickerMode === 'list' ? (
              <>
                <div className="px-4 pt-1 pb-3 border-b border-[var(--m-border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold">Select Client</span>
                    <button
                      onClick={() => { setPickerMode('create'); setNewName(''); }}
                      className="flex items-center gap-0.5 text-[12px] font-medium text-[var(--m-accent-indicator)]"
                    >
                      <Plus className="w-3.5 h-3.5" /> New
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ fontSize: '16px' }}
                    className="w-full mt-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[13px]"
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-[200px]">
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
              </>
            ) : (
              <div className="px-4 pt-1 pb-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setPickerMode('list')} className="text-[var(--m-accent-indicator)]">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[15px] font-semibold">New Client</span>
                </div>
                <label className="text-[11px] font-medium text-[var(--m-text-tertiary)] uppercase tracking-wide">Client Name</label>
                <input
                  type="text"
                  placeholder="e.g. Bayfield Homes"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClient(); }}
                  autoFocus
                  style={{ fontSize: '16px' }}
                  className="w-full mt-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2.5 border border-[var(--m-border-subtle)] outline-none text-[14px]"
                />
                <button
                  onClick={handleCreateClient}
                  disabled={!newName.trim() || isCreating}
                  className="w-full mt-4 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--m-accent)] disabled:opacity-40"
                >
                  {isCreating ? 'Creating...' : 'Create Client'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project picker bottom sheet */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-[70]" onClick={() => { setShowProjectPicker(false); resetPickerState(); }}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[80vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
            </div>

            {pickerMode === 'list' ? (
              <>
                <div className="px-4 pt-1 pb-3 border-b border-[var(--m-border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold">Select Project</span>
                    <button
                      onClick={() => { setPickerMode('create'); setNewName(''); setNewProjectClientId(note?.clientId || null); setNewClientName(''); }}
                      className="flex items-center gap-0.5 text-[12px] font-medium text-[var(--m-accent-indicator)]"
                    >
                      <Plus className="w-3.5 h-3.5" /> New
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ fontSize: '16px' }}
                    className="w-full mt-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[13px]"
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-[200px]">
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
              </>
            ) : (
              <div className="px-4 pt-1 pb-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setPickerMode('list')} className="text-[var(--m-accent-indicator)]">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[15px] font-semibold">New Project</span>
                </div>

                <label className="text-[11px] font-medium text-[var(--m-text-tertiary)] uppercase tracking-wide">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Comberton"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  style={{ fontSize: '16px' }}
                  className="w-full mt-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2.5 border border-[var(--m-border-subtle)] outline-none text-[14px]"
                />

                <label className="text-[11px] font-medium text-[var(--m-text-tertiary)] uppercase tracking-wide mt-4 block">Client</label>
                {newProjectClientId ? (
                  <div className="flex items-center gap-2 mt-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2.5 border border-[var(--m-border-subtle)]">
                    <span className="flex-1 text-[14px] text-[var(--m-text-primary)]">
                      {clients?.find((c: any) => c._id === newProjectClientId)?.name || 'Selected'}
                    </span>
                    <button
                      onClick={() => setNewProjectClientId(null)}
                      className="text-[var(--m-text-placeholder)] text-[16px]"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search or type new client name..."
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      style={{ fontSize: '16px' }}
                      className="w-full mt-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2.5 border border-[var(--m-border-subtle)] outline-none text-[14px]"
                    />
                    {newClientName.trim() && (
                      <div className="mt-1 max-h-[120px] overflow-y-auto border border-[var(--m-border-subtle)] rounded-lg">
                        {filteredCreateClients.slice(0, 5).map((c: any) => (
                          <button
                            key={c._id}
                            onClick={() => { setNewProjectClientId(c._id); setNewClientName(''); }}
                            className="w-full text-left px-3 py-2 text-[13px] border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
                          >
                            {c.name}
                          </button>
                        ))}
                        {filteredCreateClients.length === 0 && (
                          <div className="px-3 py-2 text-[12px] text-[var(--m-text-tertiary)]">
                            &quot;{newClientName.trim()}&quot; will be created as a new client
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={handleCreateProject}
                  disabled={!newName.trim() || (!newProjectClientId && !newClientName.trim()) || isCreating}
                  className="w-full mt-4 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--m-accent)] disabled:opacity-40"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
