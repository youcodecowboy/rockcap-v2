'use client';

import { useState, useEffect } from 'react';
import { Client, Project } from '@/types';
import { 
  getClients, 
  addClient, 
  deleteClient, 
  clientExists,
  getProjectsByClient,
  addProject,
  deleteProject,
  projectExists,
} from '@/lib/clientStorage';

export default function ClientManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [newClientName, setNewClientName] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = () => {
    const loadedClients = getClients();
    // Additional deduplication by ID as a safety measure
    const uniqueClients = loadedClients.filter((client, index, self) => 
      index === self.findIndex(c => c.id === client.id)
    );
    setClients(uniqueClients);
    
    // Load projects for each client
    const projectsMap: Record<string, Project[]> = {};
    uniqueClients.forEach(client => {
      projectsMap[client.id] = getProjectsByClient(client.id);
    });
    setProjects(projectsMap);
  };

  const handleAddClient = () => {
    const trimmedName = newClientName.trim();
    
    if (!trimmedName) {
      setError('Client name cannot be empty');
      return;
    }

    if (clientExists(trimmedName)) {
      setError('A client with this name already exists');
      return;
    }

    setError(null);
    setIsAdding(true);

    try {
      addClient(trimmedName);
      setNewClientName('');
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteClient = (id: string) => {
    if (confirm('Are you sure you want to delete this client? This will also delete all associated projects.')) {
      deleteClient(id);
      loadClients();
    }
  };

  const handleAddProject = (clientId: string, projectName: string) => {
    const trimmedName = projectName.trim();
    if (!trimmedName) return;

    if (projectExists(clientId, trimmedName)) {
      alert('A project with this name already exists for this client');
      return;
    }

    try {
      addProject(clientId, trimmedName);
      loadClients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add project');
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      deleteProject(projectId);
      loadClients();
    }
  };

  const toggleClientExpansion = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddClient();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Clients & Projects</h2>
        <span className="text-sm text-gray-500">{clients.length} clients</span>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newClientName}
            onChange={(e) => {
              setNewClientName(e.target.value);
              setError(null);
            }}
            onKeyPress={handleKeyPress}
            placeholder="Enter client name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
          />
          <button
            onClick={handleAddClient}
            disabled={isAdding || !newClientName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {clients.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No clients yet. Add one above.
          </p>
        ) : (
          clients.map((client) => {
            const clientProjects = projects[client.id] || [];
            const isExpanded = expandedClients.has(client.id);
            
            return (
              <div
                key={client.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleClientExpansion(client.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {client.name}
                      </p>
                      <span className="text-xs text-gray-500">
                        ({clientProjects.length} projects)
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteClient(client.id)}
                    className="ml-2 p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Delete client"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-2">
                    <ProjectList
                      clientId={client.id}
                      projects={clientProjects}
                      onAddProject={handleAddProject}
                      onDeleteProject={handleDeleteProject}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ProjectList({
  clientId,
  projects,
  onAddProject,
  onDeleteProject,
}: {
  clientId: string;
  projects: Project[];
  onAddProject: (clientId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  const [newProjectName, setNewProjectName] = useState('');

  const handleAdd = () => {
    if (newProjectName.trim()) {
      onAddProject(clientId, newProjectName);
      setNewProjectName('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add project (e.g., property address)"
          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
        />
        <button
          onClick={handleAdd}
          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
        >
          Add
        </button>
      </div>
      {projects.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No projects yet</p>
      ) : (
        projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded text-xs"
          >
            <span className="text-gray-700">{project.name}</span>
            <button
              onClick={() => onDeleteProject(project.id)}
              className="text-red-600 hover:text-red-700"
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}
