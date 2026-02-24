'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import {
  Database,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search,
  Filter,
  DollarSign,
  Hash,
  Calendar,
  FileText,
  TrendingUp,
  Clock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProjectDataTabProps {
  projectId: Id<"projects">;
  projectName: string;
}

// Helper to format currency values
function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `£${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `£${(value / 1000).toFixed(0)}K`;
  }
  return `£${value.toLocaleString()}`;
}

// Helper to format values based on data type
function formatValue(value: any, dataType: string): string {
  if (value === null || value === undefined) return '-';
  
  if (dataType === 'currency') {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(numValue) ? String(value) : formatCurrency(numValue);
  }
  
  if (dataType === 'percentage') {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(numValue) ? String(value) : `${numValue.toFixed(2)}%`;
  }
  
  if (dataType === 'number') {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(numValue) ? String(value) : numValue.toLocaleString();
  }
  
  return String(value);
}

// Get icon for data type
function getDataTypeIcon(dataType: string) {
  switch (dataType) {
    case 'currency':
      return <DollarSign className="w-3 h-3" />;
    case 'number':
      return <Hash className="w-3 h-3" />;
    case 'date':
      return <Calendar className="w-3 h-3" />;
    case 'percentage':
      return <TrendingUp className="w-3 h-3" />;
    default:
      return <FileText className="w-3 h-3" />;
  }
}

export default function ProjectDataTab({
  projectId,
  projectName,
}: ProjectDataTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Query project data library
  const dataLibrary = useQuery(api.projectDataLibrary.getProjectLibrary, { projectId });
  const stats = useQuery(api.projectDataLibrary.getLibraryStats, { projectId });
  const pendingExtractions = useQuery(api.projectDataLibrary.getPendingExtractions, { projectId });

  // Get unique categories for filtering
  const categories = useMemo(() => {
    if (!dataLibrary) return [];
    const cats = new Set<string>();
    dataLibrary.forEach((item: any) => cats.add(item.category));
    return Array.from(cats).sort();
  }, [dataLibrary]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!dataLibrary) return [];
    
    return dataLibrary.filter((item: any) => {
      // Skip computed items from display (they're for template population)
      if (item.isComputed) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.originalName?.toLowerCase().includes(query);
        const matchesCode = item.itemCode?.toLowerCase().includes(query);
        const matchesCategory = item.category?.toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesCategory) {
          return false;
        }
      }
      
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      
      return true;
    });
  }, [dataLibrary, searchQuery, selectedCategory]);

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    filteredItems.forEach((item: any) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    return grouped;
  }, [filteredItems]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Expand all categories
  const expandAll = () => {
    setExpandedCategories(new Set(Object.keys(itemsByCategory)));
  };

  // Collapse all categories
  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // Loading state
  if (!dataLibrary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Pending extractions banner component
  const PendingExtractionsBanner = () => {
    if (!pendingExtractions?.needsAttention) return null;
    
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-amber-800">Extractions Pending Confirmation</h4>
            <p className="text-sm text-amber-700 mt-1">
              {pendingExtractions.pendingJobCount > 0 && (
                <span>
                  <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                  {pendingExtractions.pendingJobCount} extraction(s) processing...
                </span>
              )}
              {pendingExtractions.hasUnconfirmed && (
                <span className="block mt-1">
                  {pendingExtractions.unconfirmedCount} extraction(s) with {pendingExtractions.unconfirmedItemCount} items awaiting confirmation.
                </span>
              )}
              {pendingExtractions.hasPendingMerge && (
                <span className="block mt-1">
                  {pendingExtractions.pendingMergeCount} confirmed extraction(s) pending merge to library.
                </span>
              )}
            </p>
            <Link 
              href="/modeling" 
              className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:text-amber-900 mt-2"
            >
              Go to Modeling to confirm extractions
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  };

  // Empty state
  if (dataLibrary.length === 0 || filteredItems.length === 0 && !searchQuery && selectedCategory === 'all') {
    return (
      <div className="space-y-4">
        <PendingExtractionsBanner />
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Data Library</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Financial data extracted from project documents will appear here. 
            Upload spreadsheets, financial statements, and appraisals to see extracted data points.
          </p>
          <div className="mt-6 p-4 bg-gray-50 rounded-lg inline-block">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              <span>Upload documents in the Documents tab to extract data</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Extractions Banner */}
      <PendingExtractionsBanner />
      
      {/* Header Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Database className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Data Library</h2>
              <p className="text-sm text-gray-500">
                Extracted from {stats?.totalDocuments || 0} document{(stats?.totalDocuments || 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats?.totalItems || 0}</div>
              <div className="text-gray-500">Data Points</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{Object.keys(stats?.byCategory || {}).length}</div>
              <div className="text-gray-500">Categories</div>
            </div>
            {stats?.manualOverrides && stats.manualOverrides > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{stats.manualOverrides}</div>
                <div className="text-gray-500">Overrides</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search data items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-gray-400" />
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

          {/* Expand/Collapse All */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
      </div>

      {/* Data Items by Category */}
      <div className="space-y-3">
        {Object.entries(itemsByCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, items]) => {
            const isExpanded = expandedCategories.has(category);
            // Calculate total excluding subtotals to avoid double-counting
            const categoryTotal = items
              .filter((item: any) => 
                item.currentDataType === 'currency' && 
                !item.isSubtotal // Exclude subtotals from total
              )
              .reduce((sum: number, item: any) => sum + (item.currentValueNormalized || 0), 0);

            return (
              <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <FolderOpen className={`w-5 h-5 ${isExpanded ? 'text-purple-600' : 'text-gray-400'}`} />
                    <span className="font-medium text-gray-900">{category}</span>
                    <Badge variant="secondary" className="text-xs">
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {categoryTotal > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(categoryTotal)}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">total</span>
                    </div>
                  )}
                </button>

                {/* Category Items */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Code
                          </th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((item: any) => (
                          <tr key={item._id} className={`hover:bg-gray-50 ${item.isSubtotal ? 'bg-gray-50/50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">
                                  {getDataTypeIcon(item.currentDataType)}
                                </span>
                                <span className={`text-sm ${item.isSubtotal ? 'text-gray-500 italic' : 'text-gray-900'}`}>{item.originalName}</span>
                                {item.isSubtotal && (
                                  <Badge variant="outline" className="text-[10px] h-4 text-gray-500">
                                    subtotal
                                  </Badge>
                                )}
                                {item.hasMultipleSources && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    <RefreshCw className="w-2.5 h-2.5 mr-0.5" />
                                    Multi
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                {item.itemCode}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-medium text-gray-900">
                                {formatValue(item.currentValue, item.currentDataType)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-gray-500 truncate max-w-[150px] block">
                                {item.currentSourceDocumentName}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                {item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toLocaleDateString() : '-'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* No Results */}
      {filteredItems.length === 0 && (searchQuery || selectedCategory !== 'all') && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No data items match your filters</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
