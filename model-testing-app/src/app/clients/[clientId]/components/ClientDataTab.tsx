'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Database,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search,
  DollarSign,
  Hash,
  Calendar,
  FileText,
  TrendingUp,
  Building2,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ClientDataTabProps {
  clientId: Id<"clients">;
  clientName: string;
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

export default function ClientDataTab({
  clientId,
  clientName,
}: ClientDataTabProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Query client data library
  const dataLibrary = useQuery(api.projectDataLibrary.getClientDataLibrary, { clientId });
  const stats = useQuery(api.projectDataLibrary.getClientLibraryStats, { clientId });

  // Get projects list
  const projects = useMemo(() => {
    if (!dataLibrary?.projectBreakdown) return [];
    return dataLibrary.projectBreakdown;
  }, [dataLibrary?.projectBreakdown]);

  // Auto-select first project if none selected
  useMemo(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].projectId);
    }
  }, [projects, selectedProjectId]);

  // Get items for selected project
  const filteredItems = useMemo(() => {
    if (!dataLibrary?.items) return [];
    
    return dataLibrary.items.filter((item: any) => {
      // Project filter - must match selected project
      if (selectedProjectId && item.projectId !== selectedProjectId) {
        return false;
      }
      
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
      
      return true;
    });
  }, [dataLibrary?.items, selectedProjectId, searchQuery]);

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

  // Get unique categories
  const categories = useMemo(() => {
    return Object.keys(itemsByCategory).sort();
  }, [itemsByCategory]);

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
    setExpandedCategories(new Set(categories));
  };

  // Collapse all categories
  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // Get selected project info
  const selectedProject = projects.find((p: any) => p.projectId === selectedProjectId);

  // Loading state
  if (!dataLibrary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Empty state - no projects with data
  if (projects.length === 0) {
    return (
      <div className="bg-white p-12 text-center">
        <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Data Library</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Financial data extracted from project documents will appear here. 
          Upload spreadsheets to projects to see extracted data points.
        </p>
        <div className="mt-6 p-4 bg-gray-50 rounded-lg inline-block">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <span>Upload documents to a project to extract data</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-200px)] bg-white overflow-hidden">
      {/* Project Sidebar */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Projects
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Select a project to view its data
          </p>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-2">
          {projects.map((project: any) => {
            const isSelected = project.projectId === selectedProjectId;
            return (
              <button
                key={project.projectId}
                onClick={() => setSelectedProjectId(project.projectId)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-1",
                  isSelected
                    ? "bg-blue-100 text-blue-900 border border-blue-200"
                    : "hover:bg-gray-100 text-gray-700"
                )}
              >
                <Building2 className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isSelected ? "text-blue-600" : "text-gray-400"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {project.projectName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {project.itemCount} data point{project.itemCount !== 1 ? 's' : ''}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer - Summary */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Total Projects:</span>
              <span className="font-medium text-gray-700">{projects.length}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Total Data Points:</span>
              <span className="font-medium text-gray-700">{stats?.totalItems || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Content Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedProject?.projectName || 'Data Library'}
                </h2>
                <p className="text-sm text-gray-500">
                  {filteredItems.length} data point{filteredItems.length !== 1 ? 's' : ''} • {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
                </p>
              </div>
            </div>
            
            {/* View Project Link */}
            {selectedProjectId && (
              <Link
                href={`/clients/${clientId}/projects/${selectedProjectId}`}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View Project
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {/* Search and Actions */}
          <div className="flex items-center gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search data items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
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

        {/* Data Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Search className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-gray-500">
                {searchQuery 
                  ? 'No data items match your search' 
                  : 'No data items in this project yet'}
              </p>
              {searchQuery && (
                <Button
                  variant="link"
                  onClick={() => setSearchQuery('')}
                  className="mt-2"
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(itemsByCategory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, items]) => {
                  const isExpanded = expandedCategories.has(category);
                  // Calculate total excluding subtotals
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
                          <FolderOpen className={`w-5 h-5 ${isExpanded ? 'text-blue-600' : 'text-gray-400'}`} />
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
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {items.map((item: any) => (
                                <tr 
                                  key={item._id} 
                                  className={cn(
                                    "hover:bg-gray-50",
                                    item.isSubtotal && "bg-gray-50/50"
                                  )}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-400">
                                        {getDataTypeIcon(item.currentDataType)}
                                      </span>
                                      <span className={cn(
                                        "text-sm",
                                        item.isSubtotal ? "text-gray-500 italic" : "text-gray-900"
                                      )}>
                                        {item.originalName}
                                      </span>
                                      {item.isSubtotal && (
                                        <Badge variant="outline" className="text-[10px] h-4 text-gray-500">
                                          subtotal
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
                                    <span className={cn(
                                      "text-sm font-medium",
                                      item.isSubtotal ? "text-gray-500" : "text-gray-900"
                                    )}>
                                      {formatValue(item.currentValue, item.currentDataType)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-gray-500 truncate max-w-[150px] block">
                                      {item.currentSourceDocumentName}
                                    </span>
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
          )}
        </div>
      </div>
    </div>
  );
}
