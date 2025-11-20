'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronRight, ChevronDown, ChevronUp, Search, Plus, Edit2, FileText, Calendar, Clock, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AddKnowledgeEntryModal from '@/components/AddKnowledgeEntryModal';

type SortOption = 'date-desc' | 'date-asc' | 'type' | 'title';
type FilterType = 'all' | 'deal_update' | 'call_transcript' | 'email' | 'document_summary' | 'project_status' | 'general';

export default function KnowledgeBankPage() {
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedExtractedData, setExpandedExtractedData] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [editingEntryId, setEditingEntryId] = useState<Id<"knowledgeBankEntries"> | null>(null);
  const [editingContent, setEditingContent] = useState<{ title: string; content: string; keyPoints: string[] } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  
  // Get all entries - we'll filter client-side for hierarchical view
  const allEntriesQuery = useQuery(api.knowledgeBank.search, {});
  const selectedClient = useQuery(api.clients.get, selectedClientId ? { id: selectedClientId } : "skip");
  const selectedProject = useQuery(api.projects.get, selectedProjectId ? { id: selectedProjectId } : "skip");
  const clientEntries = useQuery(api.knowledgeBank.getByClient, selectedClientId ? { clientId: selectedClientId } : "skip");
  const projectEntries = useQuery(api.knowledgeBank.getByProject, selectedProjectId ? { projectId: selectedProjectId } : "skip");
  
  // Get all documents for the client/project to match with entries
  const clientDocuments = useQuery(api.documents.list, selectedClientId ? { clientId: selectedClientId } : "skip");
  const projectDocuments = useQuery(api.documents.list, selectedProjectId ? { projectId: selectedProjectId } : "skip");
  
  // Create a map of document ID to document for quick lookup
  const documentsMap = useMemo(() => {
    const docs = selectedProjectId ? projectDocuments : clientDocuments;
    if (!docs) return new Map<Id<"documents">, any>();
    const map = new Map<Id<"documents">, any>();
    docs.forEach(doc => {
      map.set(doc._id, doc);
    });
    return map;
  }, [clientDocuments, projectDocuments, selectedProjectId]);

  const updateEntry = useMutation(api.knowledgeBank.update);
  const syncKnowledgeEntries = useMutation(api.knowledgeBank.syncKnowledgeEntries);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sort and filter entries function
  const sortEntries = useCallback((entries: any[]) => {
    let sorted = [...entries];

    // Filter by type
    if (filterType !== 'all') {
      sorted = sorted.filter(e => e.entryType === filterType);
    }

    // Sort
    switch (sortBy) {
      case 'date-desc':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'date-asc':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'type':
        sorted.sort((a, b) => a.entryType.localeCompare(b.entryType));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    return sorted;
  }, [sortBy, filterType]);

  // Filter entries by search query
  const allEntries = useMemo(() => {
    if (!allEntriesQuery) return null;
    if (!searchQuery) return allEntriesQuery;
    return allEntriesQuery.filter(entry => {
      const queryLower = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(queryLower) ||
        entry.content.toLowerCase().includes(queryLower) ||
        entry.keyPoints.some(kp => kp.toLowerCase().includes(queryLower)) ||
        entry.tags.some(tag => tag.toLowerCase().includes(queryLower))
      );
    });
  }, [allEntriesQuery, searchQuery]);

  // Get entry counts per client
  const clientEntryCounts = useMemo(() => {
    if (!allEntries) return {};
    const counts: Record<string, number> = {};
    allEntries.forEach(entry => {
      counts[entry.clientId] = (counts[entry.clientId] || 0) + 1;
    });
    return counts;
  }, [allEntries]);

  const toggleClient = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  // Get organized entries for selected client or project
  const organizedEntries = useMemo(() => {
    const entries = selectedProjectId ? projectEntries : clientEntries;
    if (!entries || !projects) return { clientLevel: [], byProject: new Map() };
    
    // If project is selected, only show project entries
    if (selectedProjectId) {
      return { 
        clientLevel: [], 
        byProject: new Map([[selectedProjectId, sortEntries(entries)]])
      };
    }
    
    // Otherwise, organize by client and projects
    const clientLevel = entries.filter(e => !e.projectId);
    const byProject = new Map<string, any[]>();
    
    entries.forEach(entry => {
      if (entry.projectId) {
        if (!byProject.has(entry.projectId)) {
          byProject.set(entry.projectId, []);
        }
        byProject.get(entry.projectId)!.push(entry);
      }
    });
    
    return { clientLevel: sortEntries(clientLevel), byProject };
  }, [clientEntries, projectEntries, projects, sortEntries, selectedProjectId]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const entries = selectedProjectId ? projectEntries : clientEntries;
    if (!entries) return null;
    
    const sorted = [...entries].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    const lastEntry = sorted[0];
    const allTags = new Set<string>();
    entries.forEach(entry => entry.tags.forEach(tag => allTags.add(tag)));
    
    return {
      totalEntries: entries.length,
      lastEntryDate: lastEntry ? new Date(lastEntry.updatedAt).toLocaleDateString() : 'N/A',
      uniqueTags: allTags.size,
      lastEntryTitle: lastEntry?.title || 'N/A',
    };
  }, [clientEntries, projectEntries, selectedProjectId]);
  
  // Toggle extracted data expansion
  const toggleExtractedData = (entryId: string) => {
    const newExpanded = new Set(expandedExtractedData);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedExtractedData(newExpanded);
  };
  
  // Navigate to project view
  const handleProjectClick = (projectId: Id<"projects">) => {
    setSelectedProjectId(projectId);
  };
  
  // Navigate back to client view
  const handleBackToClient = () => {
    setSelectedProjectId(null);
  };
  
  // Helper function to render extracted data
  const renderExtractedData = (extractedData: any) => {
    if (!extractedData) return null;
    
    const sections: React.ReactElement[] = [];
    
    // Costs breakdown
    if (extractedData.costsTotal) {
      sections.push(
        <div key="costs" className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Total Costs</h4>
          <div className="text-lg font-medium text-gray-700">
            {extractedData.costsTotal.currency || '$'}{extractedData.costsTotal.amount?.toLocaleString()}
          </div>
        </div>
      );
    }
    
    // Cost categories
    if (extractedData.costCategories) {
      Object.entries(extractedData.costCategories).forEach(([category, data]: [string, any]) => {
        if (data && data.items && data.items.length > 0) {
          sections.push(
            <div key={category} className="mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">{category.replace(/([A-Z])/g, ' $1').trim()}</h4>
              <ul className="space-y-1">
                {data.items.map((item: any, idx: number) => (
                  <li key={idx} className="text-sm text-gray-700 flex justify-between">
                    <span>{item.type}</span>
                    <span className="font-medium">{item.currency || '$'}{item.amount?.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {data.subtotal && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-sm font-semibold text-gray-900 flex justify-between">
                  <span>Subtotal</span>
                  <span>{data.currency || '$'}{data.subtotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        }
      });
    }
    
    // Loan/Financing info
    if (extractedData.financing) {
      sections.push(
        <div key="financing" className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Financing</h4>
          <div className="space-y-1 text-sm text-gray-700">
            {extractedData.financing.loanAmount && (
              <div className="flex justify-between">
                <span>Loan Amount</span>
                <span className="font-medium">{extractedData.financing.currency || '$'}{extractedData.financing.loanAmount.toLocaleString()}</span>
              </div>
            )}
            {extractedData.financing.interestRate && (
              <div className="flex justify-between">
                <span>Interest Rate</span>
                <span className="font-medium">{(extractedData.financing.interestRate * 100).toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // Plots
    if (extractedData.plots && extractedData.plots.length > 0) {
      sections.push(
        <div key="plots" className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Plots</h4>
          <ul className="space-y-1">
            {extractedData.plots.map((plot: any, idx: number) => (
              <li key={idx} className="text-sm text-gray-700 flex justify-between">
                <span>{plot.name}</span>
                <span className="font-medium">{plot.currency || '$'}{plot.cost?.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    
    // Units
    if (extractedData.units) {
      sections.push(
        <div key="units" className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Units</h4>
          <div className="text-sm text-gray-700">
            <div className="flex justify-between">
              <span>{extractedData.units.type}</span>
              <span className="font-medium">{extractedData.units.count}</span>
            </div>
            {extractedData.units.costPerUnit && (
              <div className="flex justify-between mt-1">
                <span>Cost per Unit</span>
                <span className="font-medium">{extractedData.units.currency || '$'}{extractedData.units.costPerUnit.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return sections.length > 0 ? <div className="mt-4 space-y-4">{sections}</div> : null;
  };

  const handleSaveEdit = async () => {
    if (!editingEntryId || !editingContent) return;
    
    await updateEntry({
      id: editingEntryId,
      title: editingContent.title,
      content: editingContent.content,
      keyPoints: editingContent.keyPoints,
    });
    
    setEditingEntryId(null);
    setEditingContent(null);
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
    setEditingContent(null);
  };

  const startEditing = (entry: any) => {
    setEditingEntryId(entry._id);
    setEditingContent({
      title: entry.title,
      content: entry.content,
      keyPoints: [...entry.keyPoints],
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Left Sidebar - Client List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Knowledge Bank</h2>
            <button
              onClick={async () => {
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
              }}
              disabled={isSyncing}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              title="Sync knowledge entries for all clients, projects, and documents"
            >
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="space-y-2 mb-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="all">All Types</option>
              <option value="deal_update">Deal Updates</option>
              <option value="call_transcript">Call Transcripts</option>
              <option value="email">Emails</option>
              <option value="document_summary">Document Summaries</option>
              <option value="project_status">Project Status</option>
              <option value="general">General</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="type">By Type</option>
              <option value="title">By Title</option>
            </select>
          </div>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-2">
          {clients === undefined ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : clients.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No clients found.</div>
          ) : (
            <div className="space-y-1">
              {clients.map((client: any) => {
                const entryCount = clientEntryCounts[client._id] || 0;
                const isExpanded = expandedClients.has(client._id);
                const isSelected = selectedClientId === client._id;
                
                if (entryCount === 0 && !searchQuery) return null;

                return (
                  <div key={client._id} className="select-none">
                    <button
                      onClick={() => {
                        setSelectedClientId(client._id);
                        if (!isExpanded) {
                          toggleClient(client._id);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors flex items-center ${
                        isSelected ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleClient(client._id);
                        }}
                        className="mr-2"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      <span className="font-medium text-sm flex-1 truncate">{client.name}</span>
                      <span className="ml-2 text-xs text-gray-500">{entryCount}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center - Wikipedia-style Knowledge View */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">
        {selectedClientId && selectedClient ? (
          <div className="max-w-4xl mx-auto w-full px-8 py-8">
            {/* Client/Project Header - Wikipedia style */}
            <div className="mb-8">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {/* Breadcrumb navigation */}
                  {selectedProjectId && selectedProject ? (
                    <div className="mb-2">
                      <button
                        onClick={handleBackToClient}
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {selectedClient.name}
                      </button>
                      <span className="text-sm text-gray-400 mx-2">›</span>
                      <span className="text-sm text-gray-900 font-medium">{selectedProject.name}</span>
                    </div>
                  ) : null}
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">
                    {selectedProjectId && selectedProject ? selectedProject.name : selectedClient.name}
                  </h1>
                  <p className="text-sm text-gray-500 italic">
                    From RockCap Knowledge Bank
                  </p>
                </div>
                <Button
                  onClick={() => setShowAddModal(true)}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </Button>
              </div>

              {/* Summary Box - Wikipedia info box style */}
              {summaryStats && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-1 text-gray-500 mb-1">
                        <FileText className="w-3 h-3" />
                        <span className="font-medium">Total Entries</span>
                      </div>
                      <div className="text-gray-900">{summaryStats.totalEntries}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-gray-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        <span className="font-medium">Last Updated</span>
                      </div>
                      <div className="text-gray-900">{summaryStats.lastEntryDate}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-gray-500 mb-1">
                        <Tag className="w-3 h-3" />
                        <span className="font-medium">Topics</span>
                      </div>
                      <div className="text-gray-900">{summaryStats.uniqueTags}</div>
                    </div>
                  </div>
                  {summaryStats.lastEntryTitle !== 'N/A' && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Latest Entry:</div>
                      <div className="text-sm text-gray-700 font-medium">{summaryStats.lastEntryTitle}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Knowledge Entries - Wikipedia article sections style */}
            {organizedEntries.clientLevel.length === 0 && organizedEntries.byProject.size === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No knowledge entries yet.</p>
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Entry
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Client-level entries */}
                {organizedEntries.clientLevel.map((entry: any, index: number) => {
                  const isEditing = editingEntryId === entry._id;
                  const document = entry.sourceId && entry.sourceType === 'document' 
                    ? documentsMap.get(entry.sourceId as Id<"documents">) 
                    : null;
                  const isExcel = document?.fileType?.toLowerCase().includes('spreadsheet') || 
                                  document?.fileType?.toLowerCase().includes('excel') ||
                                  document?.fileType?.toLowerCase().includes('xlsx') ||
                                  document?.fileType?.toLowerCase().includes('xls');
                  const extractedData = document?.extractedData;
                  const isExtractedDataExpanded = expandedExtractedData.has(entry._id);
                  
                  return (
                    <article key={entry._id} className="border-b border-gray-200 pb-8 last:border-b-0">
                      {/* Entry header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingContent?.title || ''}
                              onChange={(e) => setEditingContent(prev => prev ? { ...prev, title: e.target.value } : null)}
                              className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-500 focus:outline-none bg-transparent"
                            />
                          ) : (
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                              {entry.title}
                            </h2>
                          )}
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(entry.updatedAt).toLocaleDateString()}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {entry.entryType.replace('_', ' ')}
                            </Badge>
                            {/* Document type badges */}
                            {document?.fileTypeDetected && (
                              <Badge variant="secondary" className="text-xs">
                                {document.fileTypeDetected}
                              </Badge>
                            )}
                            {document?.category && (
                              <Badge variant="secondary" className="text-xs">
                                {document.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {entry.sourceId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.location.href = `/docs/${entry.sourceId}`}
                              className="text-xs"
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              View File
                            </Button>
                          )}
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(entry)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Entry content */}
                      <div className="prose prose-sm max-w-none">
                        {isEditing ? (
                          <textarea
                            value={editingContent?.content || ''}
                            onChange={(e) => setEditingContent(prev => prev ? { ...prev, content: e.target.value } : null)}
                            className="w-full min-h-[100px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {entry.content}
                          </p>
                        )}
                      </div>

                      {/* Key points */}
                      {entry.keyPoints.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Key Points</h3>
                          <ul className="space-y-1">
                            {entry.keyPoints.map((point: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Extracted Data Section for Excel files */}
                      {isExcel && extractedData && (
                        <div className="mt-4 border border-gray-200 rounded-md">
                          <button
                            onClick={() => toggleExtractedData(entry._id)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-sm font-medium text-gray-900">View Extracted Data</span>
                            {isExtractedDataExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          {isExtractedDataExpanded && (
                            <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50">
                              {renderExtractedData(extractedData)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tags */}
                      {entry.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.tags.map((tag: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}

                {/* Project-based entries */}
                {Array.from(organizedEntries.byProject.entries()).map(([projectId, entries]: [string, any[]]) => {
                  const project = projects?.find(p => p._id === projectId);
                  if (!project) return null;
                  
                  // If we're in project view, don't show project header - just show entries directly
                  const isProjectView = selectedProjectId === projectId;

                  return (
                    <section key={projectId} className={isProjectView ? "" : "mt-12"}>
                      {!isProjectView && (
                        <div 
                          className="bg-blue-50 border-l-4 border-blue-600 px-4 py-3 mb-6 cursor-pointer hover:bg-blue-100 transition-colors"
                          onClick={() => handleProjectClick(projectId as Id<"projects">)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h2 className="text-xl font-bold text-gray-900">
                                {project.name}
                              </h2>
                              <p className="text-sm text-gray-600 mt-1">Project Entries • Click to view project</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </div>
                      )}

                      <div className="space-y-8">
                        {entries.map((entry: any) => {
                          const isEditing = editingEntryId === entry._id;
                          const document = entry.sourceId && entry.sourceType === 'document' 
                            ? documentsMap.get(entry.sourceId as Id<"documents">) 
                            : null;
                          const isExcel = document?.fileType?.toLowerCase().includes('spreadsheet') || 
                                          document?.fileType?.toLowerCase().includes('excel') ||
                                          document?.fileType?.toLowerCase().includes('xlsx') ||
                                          document?.fileType?.toLowerCase().includes('xls');
                          const extractedData = document?.extractedData;
                          const isExtractedDataExpanded = expandedExtractedData.has(entry._id);
                          
                          return (
                            <article key={entry._id} className="border-b border-gray-200 pb-8 last:border-b-0">
                              {/* Same structure as client-level entries */}
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editingContent?.title || ''}
                                      onChange={(e) => setEditingContent(prev => prev ? { ...prev, title: e.target.value } : null)}
                                      className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-500 focus:outline-none bg-transparent"
                                    />
                                  ) : (
                                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                      {entry.title}
                                    </h3>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-2 flex-wrap">
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {new Date(entry.updatedAt).toLocaleDateString()}
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {entry.entryType.replace('_', ' ')}
                                    </Badge>
                                    {/* Document type badges */}
                                    {document?.fileTypeDetected && (
                                      <Badge variant="secondary" className="text-xs">
                                        {document.fileTypeDetected}
                                      </Badge>
                                    )}
                                    {document?.category && (
                                      <Badge variant="secondary" className="text-xs">
                                        {document.category}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  {entry.sourceId && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.location.href = `/docs/${entry.sourceId}`}
                                      className="text-xs"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      View File
                                    </Button>
                                  )}
                                  {isEditing ? (
                                    <>
                                      <Button size="sm" onClick={handleSaveEdit}>
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => startEditing(entry)}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="prose prose-sm max-w-none">
                                {isEditing ? (
                                  <textarea
                                    value={editingContent?.content || ''}
                                    onChange={(e) => setEditingContent(prev => prev ? { ...prev, content: e.target.value } : null)}
                                    className="w-full min-h-[100px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                ) : (
                                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {entry.content}
                                  </p>
                                )}
                              </div>

                              {entry.keyPoints.length > 0 && (
                                <div className="mt-4">
                                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Points</h4>
                                  <ul className="space-y-1">
                                    {entry.keyPoints.map((point: string, idx: number) => (
                                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-blue-600 mt-1">•</span>
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Extracted Data Section for Excel files */}
                              {isExcel && extractedData && (
                                <div className="mt-4 border border-gray-200 rounded-md">
                                  <button
                                    onClick={() => toggleExtractedData(entry._id)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                  >
                                    <span className="text-sm font-medium text-gray-900">View Extracted Data</span>
                                    {isExtractedDataExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-gray-500" />
                                    )}
                                  </button>
                                  {isExtractedDataExpanded && (
                                    <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50">
                                      {renderExtractedData(extractedData)}
                                    </div>
                                  )}
                                </div>
                              )}

                              {entry.tags.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {entry.tags.map((tag: string, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-lg mb-2">Select a client to view their knowledge wiki</p>
              <p className="text-sm">Browse the client list on the left to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAddModal && selectedClientId && (
        <AddKnowledgeEntryModal
          clientId={selectedClientId}
          projectId={selectedProjectId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

