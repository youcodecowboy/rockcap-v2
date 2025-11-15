'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import Link from 'next/link';
import { ChevronRight, Home, Plus, Upload, FileText, Edit2 } from 'lucide-react';
import EditableKnowledgeBankEntry from '@/components/EditableKnowledgeBankEntry';
import AddKnowledgeEntryModal from '@/components/AddKnowledgeEntryModal';

export default function ClientKnowledgeWikiPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as Id<"clients">;
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<Id<"knowledgeBankEntries"> | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  const client = useQuery(api.clients.get, { id: clientId });
  const projects = useQuery(api.projects.getByClient, { clientId });
  const clientEntries = useQuery(api.knowledgeBank.getByClient, { clientId });
  const selectedProject = useQuery(
    api.projects.get,
    selectedProjectId ? { id: selectedProjectId } : "skip"
  );
  const projectEntries = useQuery(
    api.knowledgeBank.getByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );
  const selectedEntry = useQuery(
    api.knowledgeBank.get,
    selectedEntryId ? { id: selectedEntryId } : "skip"
  );

  const syncKnowledgeEntries = useMutation(api.knowledgeBank.syncKnowledgeEntries);
  const updateEntry = useMutation(api.knowledgeBank.update);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const results = await syncKnowledgeEntries();
      alert(`Sync complete!\nClients: ${results.clientsCreated}\nProjects: ${results.projectsCreated}\nDocuments: ${results.documentsCreated}`);
      if (results.errors.length > 0) {
        console.error('Sync errors:', results.errors);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setSelectedEntryId(null);
      }
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const handleProjectClick = (projectId: Id<"projects">) => {
    setSelectedProjectId(projectId);
    setSelectedEntryId(null);
    if (!expandedProjects.has(projectId)) {
      setExpandedProjects(new Set([...expandedProjects, projectId]));
    }
  };

  // Organize entries: client-level vs project-level
  const clientLevelEntries = clientEntries?.filter(e => !e.projectId) || [];
  const entriesByProject = new Map<string, typeof clientEntries>();
  
  if (clientEntries) {
    clientEntries.forEach(entry => {
      if (entry.projectId) {
        if (!entriesByProject.has(entry.projectId)) {
          entriesByProject.set(entry.projectId, []);
        }
        entriesByProject.get(entry.projectId)!.push(entry);
      }
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb Navigation */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <nav className="flex items-center space-x-2 text-sm">
          <Link href="/knowledge-bank" className="text-gray-500 hover:text-gray-700 flex items-center">
            <Home className="w-4 h-4 mr-1" />
            Knowledge Bank
          </Link>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900 font-medium">{client?.name || 'Loading...'}</span>
          {selectedProject && (
            <>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900 font-medium">{selectedProject.name}</span>
            </>
          )}
        </nav>
      </div>

      {/* Control Panel */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client?.name || 'Loading...'}</h1>
            <p className="text-sm text-gray-500 mt-1">Knowledge Wiki</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              {isSyncing ? 'Syncing...' : 'Sync Entries'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Client Overview Section */}
        {clientLevelEntries.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Client Overview</h2>
            <div className="space-y-4">
              {clientLevelEntries.map(entry => (
                <div
                  key={entry._id}
                  className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedEntryId(entry._id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{entry.title}</h3>
                      <p className="text-gray-700 mb-3">{entry.content}</p>
                      {entry.keyPoints.length > 0 && (
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                          {entry.keyPoints.slice(0, 3).map((point, idx) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntryId(entry._id);
                      }}
                      className="ml-4 p-2 text-gray-400 hover:text-gray-600"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {entry.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        {tag}
                      </span>
                    ))}
                    <span className="ml-auto text-xs text-gray-500">
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects Section */}
        {projects && projects.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Projects</h2>
            <div className="space-y-4">
              {projects.map(project => {
                const projectEntriesList = entriesByProject.get(project._id) || [];
                const isExpanded = expandedProjects.has(project._id);
                const isSelected = selectedProjectId === project._id;

                return (
                  <div
                    key={project._id}
                    className={`bg-white rounded-lg border-2 transition-all ${
                      isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Project Header */}
                    <button
                      onClick={() => handleProjectClick(project._id)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            isExpanded ? 'transform rotate-90' : ''
                          }`}
                        />
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                          <p className="text-sm text-gray-500">
                            {projectEntriesList.length} {projectEntriesList.length === 1 ? 'entry' : 'entries'}
                          </p>
                        </div>
                      </div>
                      {project.status && (
                        <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                          {project.status}
                        </span>
                      )}
                    </button>

                    {/* Project Entries */}
                    {isExpanded && projectEntriesList.length > 0 && (
                      <div className="px-6 pb-4 border-t border-gray-200">
                        <div className="pt-4 space-y-3">
                          {projectEntriesList.map(entry => (
                            <div
                              key={entry._id}
                              className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
                              onClick={() => setSelectedEntryId(entry._id)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-900 mb-1">{entry.title}</h4>
                                  <p className="text-sm text-gray-600 line-clamp-2">{entry.content}</p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEntryId(entry._id);
                                  }}
                                  className="ml-4 p-1 text-gray-400 hover:text-gray-600"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                {entry.tags.slice(0, 2).map((tag, idx) => (
                                  <span key={idx} className="px-2 py-0.5 text-xs bg-white text-gray-600 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty State */}
        {clientLevelEntries.length === 0 && (!projects || projects.length === 0) && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No knowledge entries yet.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add First Entry
            </button>
          </div>
        )}
      </div>

      {/* Entry Detail/Edit Modal */}
      {selectedEntryId && selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Entry</h2>
              <button
                onClick={() => setSelectedEntryId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <EditableKnowledgeBankEntry
                entry={selectedEntry}
                onUpdate={async (updates) => {
                  await updateEntry({
                    id: selectedEntryId,
                    ...updates,
                  });
                  setSelectedEntryId(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddModal && (
        <AddKnowledgeEntryModal
          clientId={clientId}
          projectId={selectedProjectId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            // Refresh will happen automatically via Convex reactivity
          }}
        />
      )}
    </div>
  );
}

