'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDocuments, useInternalDocuments, useUniqueFileTypes, useUniqueCategories, useDeleteDocument } from '@/lib/documentStorage';
import { useClients } from '@/lib/clientStorage';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MetricCard from '@/components/MetricCard';
import { FileText, Building2, FolderKanban, Download, Filter, ArrowUpDown, Search, Clock } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function DocsPage() {
  const router = useRouter();
  const deleteDocument = useDeleteDocument();
  
  // Convex hooks
  const allDocuments = useDocuments() || [];
  const internalDocuments = useInternalDocuments() || [];
  const clients = useClients() || [];
  const fileTypes = useUniqueFileTypes() || [];
  const categories = useUniqueCategories() || [];
  
  // Get pending queue count
  const pendingJobs = useQuery(api.fileQueue.getJobs, { 
    status: 'needs_confirmation',
    limit: 100 
  });
  const queueCount = pendingJobs?.length || 0;
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedFileType, setSelectedFileType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [documentType, setDocumentType] = useState<'all' | 'internal' | 'client'>('all');

  const filteredDocuments = useMemo(() => {
    let docs = allDocuments;
    
    // Filter by document type (all/internal/client)
    if (documentType === 'internal') {
      docs = internalDocuments;
    } else if (documentType === 'client') {
      docs = allDocuments.filter(doc => doc.clientId !== null && doc.clientId !== undefined);
    }
    
    // Filter by client
    if (selectedClient !== 'all') {
      docs = docs.filter(doc => {
        const docClientId = (doc.clientId as any)?._id || doc.clientId;
        return docClientId === selectedClient || (docClientId as string) === selectedClient;
      });
    }
    
    // Filter by file type
    if (selectedFileType !== 'all') {
      docs = docs.filter(doc => doc.fileTypeDetected === selectedFileType);
    }
    
    // Filter by category
    if (selectedCategory !== 'all') {
      docs = docs.filter(doc => doc.category === selectedCategory);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      docs = docs.filter(doc => 
        doc.fileName.toLowerCase().includes(query) ||
        doc.summary.toLowerCase().includes(query) ||
        doc.fileTypeDetected.toLowerCase().includes(query) ||
        doc.category.toLowerCase().includes(query) ||
        doc.clientName?.toLowerCase().includes(query) ||
        doc.projectName?.toLowerCase().includes(query)
      );
    }
    
    return docs;
  }, [allDocuments, internalDocuments, documentType, selectedClient, selectedFileType, selectedCategory, searchQuery]);

  const handleDelete = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument({ id });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedClient('all');
    setSelectedFileType('all');
    setSelectedCategory('all');
    setDocumentType('all');
  };

  const hasActiveFilters = selectedClient !== 'all' || 
    selectedFileType !== 'all' || 
    selectedCategory !== 'all' || 
    documentType !== 'all' ||
    searchQuery.trim() !== '';

  // Calculate metrics
  const metrics = useMemo(() => {
    const clientDocuments = allDocuments.filter(doc => doc.clientId !== null && doc.clientId !== undefined);
    const uniqueFileTypesCount = fileTypes.length;
    const uniqueCategoriesCount = categories.length;
    
    return {
      totalDocuments: allDocuments.length,
      internalDocuments: internalDocuments.length,
      clientDocuments: clientDocuments.length,
      uniqueFileTypes: uniqueFileTypesCount,
      uniqueCategories: uniqueCategoriesCount,
    };
  }, [allDocuments, internalDocuments, fileTypes, categories]);

  // Get last updated time
  const lastUpdated = useMemo(() => {
    if (allDocuments.length === 0) return null;
    const dates = allDocuments.map(doc => new Date(doc.uploadedAt).getTime());
    const mostRecent = new Date(Math.max(...dates));
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  }, [allDocuments]);

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Document Library</h1>
              <p className="mt-2 text-gray-600">
                Browse and filter all documents
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
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Sort
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          {lastUpdated && (
            <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
          )}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Client Documents"
            value={metrics.clientDocuments}
            icon={Building2}
            iconColor="green"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Internal Documents"
            value={metrics.internalDocuments}
            icon={FileText}
            iconColor="purple"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="File Types"
            value={metrics.uniqueFileTypes}
            icon={FolderKanban}
            iconColor="orange"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="space-y-4">
            {/* Search and Document Type */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={documentType === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDocumentType('all')}
                >
                  All Documents
                </Button>
                <Button
                  variant={documentType === 'internal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDocumentType('internal')}
                >
                  Internal Only
                </Button>
                <Button
                  variant={documentType === 'client' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDocumentType('client')}
                >
                  Client Documents
                </Button>
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client
                </label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map((client) => {
                      const clientId = client._id as string;
                      return (
                        <SelectItem key={clientId} value={clientId}>
                          {client.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File Type
                </label>
                <Select value={selectedFileType} onValueChange={setSelectedFileType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {fileTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Document Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredDocuments.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No documents found</p>
              <p className="text-sm text-gray-500 mb-4">
                {hasActiveFilters ? 'Try adjusting your filters.' : 'Documents will appear here once uploaded.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Showing {filteredDocuments.length} of {allDocuments.length} documents
                  </h2>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3" />
                  Scroll horizontally for more
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[200px]">File Name</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[100px]">File Type</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[180px]">Document Type</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[140px]">Category</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[220px]">Summary</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[120px]">Client</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[120px]">Project</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[140px]">Upload Date</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const docId = (doc._id || doc.id) as Id<"documents">;
                    const clientId = doc.clientId ? ((doc.clientId as any)?._id || doc.clientId) as string : null;
                    const projectId = doc.projectId ? ((doc.projectId as any)?._id || doc.projectId) as string : null;
                    
                    // Extract and format file type
                    const fileTypeRaw = doc.fileType.split('/').pop()?.toUpperCase().replace('VND.OPENXMLFORMATS-OFFICEDOCUMENT.', '').replace('SPREADSHEETML.SHEET', 'XLSX').replace('WORDPROCESSINGML.DOCUMENT', 'DOCX').replace('PRESENTATIONML.PRESENTATION', 'PPTX') || doc.fileType;
                    
                    // Get color class based on file type
                    const getFileTypeColor = (type: string) => {
                      const typeUpper = type.toUpperCase();
                      if (typeUpper.includes('PDF')) return 'bg-red-100 text-red-700 border-red-200';
                      if (typeUpper.includes('XLSX') || typeUpper.includes('XLS') || typeUpper.includes('SPREADSHEET')) return 'bg-green-100 text-green-700 border-green-200';
                      if (typeUpper.includes('DOCX') || typeUpper.includes('DOC') || typeUpper.includes('WORD')) return 'bg-blue-100 text-blue-700 border-blue-200';
                      if (typeUpper.includes('PPTX') || typeUpper.includes('PPT') || typeUpper.includes('PRESENTATION')) return 'bg-orange-100 text-orange-700 border-orange-200';
                      if (typeUpper.includes('TXT') || typeUpper.includes('TEXT')) return 'bg-gray-100 text-gray-700 border-gray-200';
                      if (typeUpper.includes('CSV')) return 'bg-teal-100 text-teal-700 border-teal-200';
                      return 'bg-purple-100 text-purple-700 border-purple-200';
                    };
                    
                    return (
                      <TableRow key={docId} className="hover:bg-gray-50">
                        <TableCell className="max-w-[200px]">
                          <Button
                            variant="ghost"
                            onClick={() => router.push(`/docs/${docId}`)}
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 h-auto p-0 text-left justify-start truncate max-w-full"
                            title={doc.fileName}
                          >
                            <span className="truncate">{doc.fileName}</span>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs font-semibold border ${getFileTypeColor(fileTypeRaw)}`}>
                            {fileTypeRaw}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="text-xs text-gray-700 truncate" title={doc.fileTypeDetected}>
                            {doc.fileTypeDetected}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {doc.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="text-sm text-gray-900 truncate" title={doc.summary}>
                            {doc.summary}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[120px]">
                          {clientId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/clients/${clientId}`)}
                              className="text-blue-600 hover:text-blue-700 h-auto py-1 text-xs truncate max-w-full"
                              title={doc.clientName || 'Unknown'}
                            >
                              <span className="truncate">{doc.clientName || 'Unknown'}</span>
                            </Button>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[120px]">
                          {projectId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/projects/${projectId}`)}
                              className="text-blue-600 hover:text-blue-700 h-auto py-1 text-xs truncate max-w-full"
                              title={doc.projectName || 'Unknown'}
                            >
                              <span className="truncate">{doc.projectName || 'Unknown'}</span>
                            </Button>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                          {new Date(doc.uploadedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/docs/${docId}`)}
                              className="text-blue-600 hover:text-blue-700 h-auto py-1"
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(docId)}
                              className="text-red-600 hover:text-red-700 h-auto py-1"
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

