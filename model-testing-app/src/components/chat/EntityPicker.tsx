'use client';

import { useState } from 'react';
import { X, File, FolderKanban, Building, Search, ChevronRight, ArrowLeft } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { EntityReference } from '@/components/messages/ReferenceChip';

type PickerMode = 'flat' | 'hierarchical';
type FlatTab = 'clients' | 'projects' | 'documents';
type HierarchicalLevel = 'clients' | 'projects' | 'documents';

interface EntityPickerProps {
  onSelect: (ref: EntityReference) => void;
  onClose: () => void;
  variant?: 'mobile' | 'desktop';
}

export default function EntityPicker({ onSelect, onClose, variant = 'mobile' }: EntityPickerProps) {
  const [mode, setMode] = useState<PickerMode>('hierarchical');
  const [flatTab, setFlatTab] = useState<FlatTab>('documents');
  const [level, setLevel] = useState<HierarchicalLevel>('clients');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allDocuments = useQuery(api.documents.getRecent, { limit: 100 });

  const isMobile = variant === 'mobile';

  const hierarchicalItems = (() => {
    const q = search.toLowerCase();
    if (level === 'clients') {
      return (clients || []).filter((c: any) => !q || c.name?.toLowerCase().includes(q)).slice(0, 50);
    }
    if (level === 'projects' && selectedClient) {
      return (projects || [])
        .filter((p: any) => {
          if (p.clientRoles) return p.clientRoles.some((r: any) => r.clientId === selectedClient.id);
          return p.clientId === selectedClient.id;
        })
        .filter((p: any) => !q || p.name?.toLowerCase().includes(q))
        .slice(0, 50);
    }
    if (level === 'documents' && selectedProject) {
      return (allDocuments || [])
        .filter((d: any) => d.projectId === selectedProject.id)
        .filter((d: any) => !q || d.fileName?.toLowerCase().includes(q))
        .slice(0, 50);
    }
    return [];
  })();

  const flatItems = (() => {
    const q = search.toLowerCase();
    if (flatTab === 'clients') {
      return (clients || []).filter((c: any) => !q || c.name?.toLowerCase().includes(q)).slice(0, 30);
    }
    if (flatTab === 'projects') {
      return (projects || []).filter((p: any) => !q || p.name?.toLowerCase().includes(q)).slice(0, 30);
    }
    return (allDocuments || []).filter((d: any) => !q || d.fileName?.toLowerCase().includes(q)).slice(0, 30);
  })();

  const handleHierarchicalClick = (item: any) => {
    if (level === 'clients') {
      setSelectedClient({ id: item._id, name: item.name });
      setLevel('projects');
      setSearch('');
    } else if (level === 'projects') {
      setSelectedProject({ id: item._id, name: item.name });
      setLevel('documents');
      setSearch('');
    } else if (level === 'documents') {
      onSelect({
        type: 'document',
        id: item._id,
        name: item.fileName || 'Untitled',
        meta: { clientId: selectedClient?.id, projectId: selectedProject?.id },
      });
    }
  };

  const handleFlatClick = (item: any) => {
    if (flatTab === 'clients') {
      onSelect({ type: 'client', id: item._id, name: item.name || 'Unknown' });
    } else if (flatTab === 'projects') {
      onSelect({ type: 'project', id: item._id, name: item.name || 'Untitled', meta: {} });
    } else {
      onSelect({
        type: 'document',
        id: item._id,
        name: item.fileName || 'Untitled',
        meta: { clientId: item.clientId },
      });
    }
  };

  const goBack = () => {
    if (level === 'documents') {
      setLevel('projects');
      setSelectedProject(null);
    } else if (level === 'projects') {
      setLevel('clients');
      setSelectedClient(null);
    }
    setSearch('');
  };

  const content = (
    <>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <span className={`text-[14px] font-semibold ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
          Attach Reference
        </span>
        <button onClick={onClose} className={`p-1 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={`flex gap-1 px-4 py-2 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-100'}`}>
        <button
          onClick={() => { setMode('hierarchical'); setSearch(''); }}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            mode === 'hierarchical'
              ? (isMobile ? 'bg-[var(--m-accent)] text-white' : 'bg-gray-900 text-white')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]' : 'bg-gray-100 text-gray-600')
          }`}
        >
          Browse
        </button>
        <button
          onClick={() => { setMode('flat'); setSearch(''); }}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            mode === 'flat'
              ? (isMobile ? 'bg-[var(--m-accent)] text-white' : 'bg-gray-900 text-white')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]' : 'bg-gray-100 text-gray-600')
          }`}
        >
          Search
        </button>
      </div>

      {mode === 'hierarchical' && (
        <div className={`flex items-center gap-1.5 px-4 py-2 text-[11px] ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-500'}`}>
          {level !== 'clients' && (
            <button onClick={goBack} className={`p-0.5 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <span>Clients</span>
          {selectedClient && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{selectedClient.name}</span>
            </>
          )}
          {selectedProject && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{selectedProject.name}</span>
            </>
          )}
        </div>
      )}

      {mode === 'flat' && (
        <div className={`flex border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-100'}`}>
          {(['clients', 'projects', 'documents'] as FlatTab[]).map((tab) => {
            const Icon = tab === 'clients' ? Building : tab === 'projects' ? FolderKanban : File;
            const active = flatTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setFlatTab(tab); setSearch(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium capitalize border-b-2 ${
                  active
                    ? (isMobile ? 'text-[var(--m-text-primary)] border-[var(--m-accent)]' : 'text-gray-900 border-gray-900')
                    : (isMobile ? 'text-[var(--m-text-tertiary)] border-transparent' : 'text-gray-400 border-transparent')
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-4 py-2">
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-50'}`}>
          <Search className={`w-4 h-4 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className={`flex-1 bg-transparent text-[13px] outline-none ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {mode === 'hierarchical' ? (
          hierarchicalItems.length === 0 ? (
            <p className={`text-center text-[12px] py-6 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>No items found</p>
          ) : (
            hierarchicalItems.map((item: any) => {
              const Icon = level === 'clients' ? Building : level === 'projects' ? FolderKanban : File;
              const displayName = level === 'documents' ? item.fileName : item.name;
              const isLeaf = level === 'documents';
              return (
                <button
                  key={item._id}
                  onClick={() => handleHierarchicalClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left ${isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-50'}`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${level === 'clients' ? 'text-green-500' : level === 'projects' ? 'text-purple-500' : 'text-blue-500'}`} />
                  <span className={`flex-1 text-[13px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>{displayName || 'Untitled'}</span>
                  {!isLeaf && <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />}
                </button>
              );
            })
          )
        ) : (
          flatItems.length === 0 ? (
            <p className={`text-center text-[12px] py-6 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>No results found</p>
          ) : (
            flatItems.map((item: any) => {
              const Icon = flatTab === 'clients' ? Building : flatTab === 'projects' ? FolderKanban : File;
              const displayName = flatTab === 'documents' ? item.fileName : item.name;
              return (
                <button
                  key={item._id}
                  onClick={() => handleFlatClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left ${isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-50'}`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${flatTab === 'clients' ? 'text-green-500' : flatTab === 'projects' ? 'text-purple-500' : 'text-blue-500'}`} />
                  <span className={`flex-1 text-[13px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>{displayName || 'Untitled'}</span>
                </button>
              );
            })
          )
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-[var(--m-bg)] rounded-t-2xl max-h-[75vh] flex flex-col">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[420px] max-h-[520px] flex flex-col">
        {content}
      </div>
    </div>
  );
}
