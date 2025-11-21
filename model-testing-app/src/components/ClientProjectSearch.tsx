'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Building2, FolderKanban, X, Search } from 'lucide-react';
import { Input } from './ui/input';

interface ClientProjectSearchProps {
  selectedClientId?: Id<'clients'>;
  selectedProjectId?: Id<'projects'>;
  suggestedClientId?: Id<'clients'>;
  suggestedProjectId?: Id<'projects'>;
  onClientSelect: (clientId: Id<'clients'> | undefined) => void;
  onProjectSelect: (projectId: Id<'projects'> | undefined) => void;
  onClientSuggestionAccept?: () => void;
  onProjectSuggestionAccept?: () => void;
}

export default function ClientProjectSearch({
  selectedClientId,
  selectedProjectId,
  suggestedClientId,
  suggestedProjectId,
  onClientSelect,
  onProjectSelect,
  onClientSuggestionAccept,
  onProjectSuggestionAccept,
}: ClientProjectSearchProps) {
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showClientResults, setShowClientResults] = useState(false);
  const [showProjectResults, setShowProjectResults] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Filter clients based on search
  const filteredClients = clients?.filter(client =>
    client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
    client.companyName?.toLowerCase().includes(clientSearchQuery.toLowerCase())
  ).slice(0, 10) || [];

  // Filter projects based on search and selected client
  const filteredProjects = projects?.filter(project => {
    if (selectedClientId) {
      const hasClient = project.clientRoles?.some((cr: any) => cr.clientId === selectedClientId);
      if (!hasClient) return false;
    }
    return project.name.toLowerCase().includes(projectSearchQuery.toLowerCase());
  }).slice(0, 10) || [];

  const selectedClient = clients?.find(c => c._id === selectedClientId);
  const selectedProject = projects?.find(p => p._id === selectedProjectId);
  const suggestedClient = suggestedClientId ? clients?.find(c => c._id === suggestedClientId) : undefined;
  const suggestedProject = suggestedProjectId ? projects?.find(p => p._id === suggestedProjectId) : undefined;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(event.target as Node)) {
        setShowClientResults(false);
      }
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
        setShowProjectResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Client Search */}
      <div className="relative flex-1 min-w-[200px]" ref={clientRef}>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              value={selectedClient ? selectedClient.name : clientSearchQuery}
              onChange={(e) => {
                setClientSearchQuery(e.target.value);
                setShowClientResults(true);
                if (!e.target.value) {
                  onClientSelect(undefined);
                }
              }}
              onFocus={() => {
                if (!selectedClient) {
                  setShowClientResults(true);
                }
              }}
              placeholder="Search client..."
              className="pl-8 pr-8"
            />
            {selectedClient && (
              <button
                onClick={() => {
                  onClientSelect(undefined);
                  setClientSearchQuery('');
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Suggestion Badge */}
        {suggestedClient && !selectedClientId && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Suggested: {suggestedClient.name}
            </span>
            <button
              onClick={() => {
                onClientSelect(suggestedClientId);
                onClientSuggestionAccept?.();
              }}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Accept
            </button>
          </div>
        )}

        {/* Dropdown Results */}
        {showClientResults && filteredClients.length > 0 && (
          <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filteredClients.map((client) => (
              <button
                key={client._id}
                type="button"
                onClick={() => {
                  onClientSelect(client._id);
                  setClientSearchQuery('');
                  setShowClientResults(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
              >
                <Building2 className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="font-medium text-sm">{client.name}</div>
                  {client.companyName && (
                    <div className="text-xs text-gray-500">{client.companyName}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Project Search */}
      <div className="relative flex-1 min-w-[200px]" ref={projectRef}>
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-gray-400" />
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              value={selectedProject ? selectedProject.name : projectSearchQuery}
              onChange={(e) => {
                setProjectSearchQuery(e.target.value);
                setShowProjectResults(true);
                if (!e.target.value) {
                  onProjectSelect(undefined);
                }
              }}
              onFocus={() => {
                if (!selectedProject) {
                  setShowProjectResults(true);
                }
              }}
              placeholder="Search project..."
              disabled={!selectedClientId}
              className="pl-8 pr-8"
            />
            {selectedProject && (
              <button
                onClick={() => {
                  onProjectSelect(undefined);
                  setProjectSearchQuery('');
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Suggestion Badge */}
        {suggestedProject && !selectedProjectId && selectedClientId && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Suggested: {suggestedProject.name}
            </span>
            <button
              onClick={() => {
                onProjectSelect(suggestedProjectId);
                onProjectSuggestionAccept?.();
              }}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Accept
            </button>
          </div>
        )}

        {/* Dropdown Results */}
        {showProjectResults && filteredProjects.length > 0 && selectedClientId && (
          <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filteredProjects.map((project) => (
              <button
                key={project._id}
                type="button"
                onClick={() => {
                  onProjectSelect(project._id);
                  setProjectSearchQuery('');
                  setShowProjectResults(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
              >
                <FolderKanban className="w-4 h-4 text-gray-400" />
                <div className="font-medium text-sm">{project.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

