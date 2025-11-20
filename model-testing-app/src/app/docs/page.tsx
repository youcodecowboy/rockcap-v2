'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  useDocuments, 
  useInternalDocuments as useInternalDocumentsHook, 
  useUnclassifiedDocuments,
  useDeleteDocument,
  useDeleteInternalDocument,
  useUpdateDocumentCode,
  useUpdateInternalDocumentCode,
} from '@/lib/documentStorage';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CompactMetricCard from '@/components/CompactMetricCard';
import RecentUploadCard from '@/components/RecentUploadCard';
import DocumentsTable from '@/components/DocumentsTable';
import InternalDocumentsTable from '@/components/InternalDocumentsTable';
import UnclassifiedDocumentsTable from '@/components/UnclassifiedDocumentsTable';
import { FileText, Building2, Clock, Search, AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

type TabType = 'client' | 'internal' | 'unclassified';

export default function DocsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('client');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Convex hooks
  const allDocuments = useDocuments() || [];
  const internalDocuments = useInternalDocumentsHook() || [];
  const unclassifiedDocuments = useUnclassifiedDocuments() || [];
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
        {/* Breadcrumbs */}
        <div className="mb-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/docs" className="hover:text-gray-900 transition-colors">
              Docs
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">Document Library</span>
          </nav>
        </div>

        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Document Library</h1>
              <p className="mt-2 text-gray-600">
                Browse and manage all documents with advanced filtering and organization
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

        {/* Compact Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <RecentUploadCard />
          <CompactMetricCard
            label="Client Docs"
            value={metrics.clientDocuments}
            icon={Building2}
            iconColor="green"
          />
          <CompactMetricCard
            label="Internal"
            value={metrics.internalDocuments}
            icon={FileText}
            iconColor="purple"
          />
          <CompactMetricCard
            label="Unclassified"
            value={metrics.unclassifiedDocuments}
            icon={AlertCircle}
            iconColor="orange"
          />
          <CompactMetricCard
            label="Total"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="blue"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex items-center justify-between">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('client')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
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
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
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
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
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
              {activeTab === 'client' && (
                <div className="pr-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </Button>
                </div>
              )}
              {activeTab === 'internal' && (
                <div className="pr-4 flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      // Trigger create folder dialog in InternalDocumentsTable
                      const event = new CustomEvent('createFolder');
                      window.dispatchEvent(event);
                    }}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Folder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </Button>
                </div>
              )}
              {activeTab === 'unclassified' && (
                <div className="pr-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search documents by name, code, category, client, or project..."
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
                {filteredClientDocs.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No client documents</p>
                    <p className="text-sm text-gray-500">
                      {searchQuery 
                        ? 'No documents match your search. Try adjusting your filters.' 
                        : 'Client documents will appear here once uploaded and classified.'}
                    </p>
                  </div>
                ) : (
                  <DocumentsTable 
                    documents={filteredClientDocs} 
                    showFilters={showFilters}
                    onFiltersChange={setShowFilters}
                  />
                )}
              </div>
            )}

            {activeTab === 'internal' && (
              <div>
                {filteredInternalDocs.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No internal documents</p>
                    <p className="text-sm text-gray-500">
                      {searchQuery ? 'No documents match your search.' : 'Internal documents will appear here once uploaded.'}
                    </p>
                  </div>
                ) : (
                  <InternalDocumentsTable 
                    documents={filteredInternalDocs} 
                    showFilters={showFilters}
                    onFiltersChange={setShowFilters}
                  />
                )}
              </div>
            )}

            {activeTab === 'unclassified' && (
              <div>
                {filteredUnclassifiedDocs.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No unclassified documents</p>
                    <p className="text-sm text-gray-500">
                      {searchQuery ? 'No documents match your search.' : 'All documents are properly classified.'}
                    </p>
                  </div>
                ) : (
                  <UnclassifiedDocumentsTable 
                    documents={filteredUnclassifiedDocs} 
                    showFilters={showFilters}
                    onFiltersChange={setShowFilters}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
