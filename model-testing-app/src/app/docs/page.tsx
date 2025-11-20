'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  useDocuments, 
  useInternalDocuments as useInternalDocumentsHook, 
  useUnclassifiedDocuments,
  useFolderStats,
  useDeleteDocument,
  useDeleteInternalDocument,
  useUpdateDocumentCode,
  useUpdateInternalDocumentCode,
} from '@/lib/documentStorage';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MetricCard from '@/components/MetricCard';
import FolderCard from '@/components/FolderCard';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { FileText, Building2, FolderKanban, Clock, Search, AlertCircle, ChevronRight } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

type TabType = 'client' | 'internal' | 'unclassified';

export default function DocsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('client');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Convex hooks
  const allDocuments = useDocuments() || [];
  const internalDocuments = useInternalDocumentsHook() || [];
  const unclassifiedDocuments = useUnclassifiedDocuments() || [];
  const folderStats = useFolderStats();
  const deleteDocument = useDeleteDocument();
  const deleteInternalDocument = useDeleteInternalDocument();
  const updateDocumentCode = useUpdateDocumentCode();
  const updateInternalDocumentCode = useUpdateInternalDocumentCode();
  
  // Get pending queue count
  const pendingJobs = useQuery(api.fileQueue.getJobs, { 
    status: 'needs_confirmation',
    limit: 100 
  });
  const queueCount = pendingJobs?.length || 0;

  // Filter documents based on search
  const filteredClientDocs = useMemo(() => {
    if (!searchQuery.trim()) return allDocuments.filter(doc => doc.clientId);
    const query = searchQuery.toLowerCase();
    return allDocuments.filter(doc => 
      doc.clientId && (
        doc.fileName.toLowerCase().includes(query) ||
        doc.summary.toLowerCase().includes(query) ||
        doc.documentCode?.toLowerCase().includes(query) ||
        doc.clientName?.toLowerCase().includes(query) ||
        doc.projectName?.toLowerCase().includes(query)
      )
    );
  }, [allDocuments, searchQuery]);

  const filteredInternalDocs = useMemo(() => {
    if (!searchQuery.trim()) return internalDocuments;
    const query = searchQuery.toLowerCase();
    return internalDocuments.filter(doc => 
      doc.fileName.toLowerCase().includes(query) ||
      doc.summary.toLowerCase().includes(query) ||
      doc.documentCode.toLowerCase().includes(query) ||
      doc.clientName?.toLowerCase().includes(query)
    );
  }, [internalDocuments, searchQuery]);

  const filteredUnclassifiedDocs = useMemo(() => {
    if (!searchQuery.trim()) return unclassifiedDocuments;
    const query = searchQuery.toLowerCase();
    return unclassifiedDocuments.filter(doc => 
      doc.fileName.toLowerCase().includes(query) ||
      doc.summary.toLowerCase().includes(query) ||
      doc.documentCode?.toLowerCase().includes(query)
    );
  }, [unclassifiedDocuments, searchQuery]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const clientDocuments = allDocuments.filter(doc => doc.clientId !== null && doc.clientId !== undefined);
    
    return {
      totalDocuments: allDocuments.length,
      internalDocuments: internalDocuments.length,
      clientDocuments: clientDocuments.length,
      unclassifiedDocuments: unclassifiedDocuments.length,
    };
  }, [allDocuments, internalDocuments, unclassifiedDocuments]);

  const handleDeleteDocument = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument({ id });
    }
  };

  const handleDeleteInternalDocument = async (id: Id<"internalDocuments">) => {
    if (confirm('Are you sure you want to delete this internal document?')) {
      await deleteInternalDocument({ id });
    }
  };

  const handleUpdateDocumentCode = async (id: Id<"documents">, newCode: string) => {
    await updateDocumentCode({ id, documentCode: newCode });
  };

  const handleUpdateInternalDocumentCode = async (id: Id<"internalDocuments">, newCode: string) => {
    await updateInternalDocumentCode({ id, documentCode: newCode });
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Document Library</h1>
              <p className="mt-2 text-gray-600">
                Browse documents by client folders, internal documents, or unclassified files
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/docs/queue">
                <Button variant="default" size="sm" className="relative">
                  <Clock className="w-4 h-4 mr-2" />
                  Review Queue
                  {queueCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-white text-blue-600 rounded-full">
                      {queueCount}
                    </span>
                  )}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Client Documents"
            value={metrics.clientDocuments}
            icon={Building2}
            iconColor="green"
          />
          <MetricCard
            label="Internal Documents"
            value={metrics.internalDocuments}
            icon={FileText}
            iconColor="purple"
          />
          <MetricCard
            label="Unclassified"
            value={metrics.unclassifiedDocuments}
            icon={AlertCircle}
            iconColor="orange"
          />
          <MetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FolderKanban}
            iconColor="blue"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('client')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'client'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Client Documents
                  <Badge variant="outline" className="ml-2">
                    {metrics.clientDocuments}
                  </Badge>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('internal')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'internal'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Internal Documents
                  <Badge variant="outline" className="ml-2">
                    {metrics.internalDocuments}
                  </Badge>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('unclassified')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'unclassified'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Unclassified
                  <Badge variant="outline" className="ml-2">
                    {metrics.unclassifiedDocuments}
                  </Badge>
                </div>
              </button>
            </nav>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'client' && (
              <div>
                {folderStats && folderStats.clients && folderStats.clients.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Client Folders</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {folderStats.clients.map((client) => (
                        <FolderCard
                          key={client.clientId}
                          type="client"
                          id={client.clientId}
                          name={client.clientName}
                          documentCount={client.documentCount}
                          lastUpdated={client.lastUpdated}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No client folders</p>
                    <p className="text-sm text-gray-500">
                      Client folders will appear here once documents are filed to clients.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'internal' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Internal Documents</h2>
                {filteredInternalDocs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No internal documents</p>
                    <p className="text-sm text-gray-500">
                      {searchQuery ? 'No documents match your search.' : 'Internal documents will appear here once uploaded.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredInternalDocs.map((doc) => (
                      <div
                        key={doc._id}
                        className="bg-gray-50 rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <DocumentCodeEditor
                                documentCode={doc.documentCode}
                                fileName={doc.fileName}
                                onSave={(newCode) => handleUpdateInternalDocumentCode(doc._id, newCode)}
                                isInternal={true}
                              />
                            </div>
                            <div className="text-sm text-gray-600 mb-1">
                              {doc.summary.substring(0, 150)}...
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{doc.category}</span>
                              {doc.clientName && (
                                <>
                                  <span>•</span>
                                  <span>Client: {doc.clientName}</span>
                                </>
                              )}
                              {doc.linkedProjectIds && doc.linkedProjectIds.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{doc.linkedProjectIds.length} project(s)</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/docs/${doc._id}`)}
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteInternalDocument(doc._id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'unclassified' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Unclassified Documents</h2>
                {filteredUnclassifiedDocs.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No unclassified documents</p>
                    <p className="text-sm text-gray-500">
                      {searchQuery ? 'No documents match your search.' : 'All documents are properly classified.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredUnclassifiedDocs.map((doc) => (
                      <div
                        key={doc._id}
                        className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 hover:border-yellow-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <DocumentCodeEditor
                                documentCode={doc.documentCode}
                                fileName={doc.fileName}
                                onSave={(newCode) => handleUpdateDocumentCode(doc._id, newCode)}
                              />
                            </div>
                            <div className="text-sm text-gray-600 mb-1">
                              {doc.summary.substring(0, 150)}...
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{doc.category}</span>
                              <span>•</span>
                              <span className="text-yellow-700 font-medium">Needs classification</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/docs/${doc._id}`)}
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDocument(doc._id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
