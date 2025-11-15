'use client';

import { useState } from 'react';
import { Globe, Building, FolderKanban } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface ContextSelectorProps {
  currentType: 'global' | 'client' | 'project';
  currentClientId?: Id<"clients">;
  currentProjectId?: Id<"projects">;
  onChange: (
    type: 'global' | 'client' | 'project',
    clientId?: Id<"clients">,
    projectId?: Id<"projects">
  ) => void;
}

export default function ContextSelector({
  currentType,
  currentClientId,
  currentProjectId,
  onChange,
}: ContextSelectorProps) {
  const [selectedType, setSelectedType] = useState<'global' | 'client' | 'project'>(currentType);
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | undefined>(currentClientId);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | undefined>(currentProjectId);

  // Get clients and projects
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  const handleApply = () => {
    onChange(selectedType, selectedClientId, selectedProjectId);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Chat Context
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setSelectedType('global');
              setSelectedClientId(undefined);
              setSelectedProjectId(undefined);
            }}
            className={`flex flex-col items-center gap-2 p-3 border rounded-lg transition-colors ${
              selectedType === 'global'
                ? 'border-black bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Globe className="w-5 h-5" />
            <span className="text-xs font-medium">Global</span>
          </button>

          <button
            onClick={() => {
              setSelectedType('client');
              setSelectedProjectId(undefined);
            }}
            className={`flex flex-col items-center gap-2 p-3 border rounded-lg transition-colors ${
              selectedType === 'client'
                ? 'border-black bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Building className="w-5 h-5" />
            <span className="text-xs font-medium">Client</span>
          </button>

          <button
            onClick={() => {
              setSelectedType('project');
              setSelectedClientId(undefined);
            }}
            className={`flex flex-col items-center gap-2 p-3 border rounded-lg transition-colors ${
              selectedType === 'project'
                ? 'border-black bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <FolderKanban className="w-5 h-5" />
            <span className="text-xs font-medium">Project</span>
          </button>
        </div>
      </div>

      {/* Client Selector */}
      {selectedType === 'client' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Client
          </label>
          <select
            value={selectedClientId || ''}
            onChange={(e) => setSelectedClientId(e.target.value as Id<"clients">)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Choose a client...</option>
            {clients?.map((client) => (
              <option key={client._id} value={client._id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Project Selector */}
      {selectedType === 'project' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Project
          </label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value as Id<"projects">)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Choose a project...</option>
            {projects?.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleApply}
        className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
      >
        Apply Context
      </button>
    </div>
  );
}

