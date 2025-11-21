'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  FileText,
  Eye,
  ArrowUpDown,
  Trash2,
} from 'lucide-react';
import { Id } from '../../convex/_generated/dataModel';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { 
  useUpdateDocumentCode, 
  useDeleteDocument,
} from '@/lib/documentStorage';

// Types
interface UnclassifiedDocument {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  uploadedAt: string;
}

interface UnclassifiedDocumentsTableProps {
  documents: UnclassifiedDocument[];
  showFilters?: boolean;
  onFiltersChange?: (show: boolean) => void;
}

type SortColumn = 'code' | 'fileName' | 'category' | 'date';
type SortDirection = 'asc' | 'desc';

export default function UnclassifiedDocumentsTable({ 
  documents, 
  showFilters: externalShowFilters, 
  onFiltersChange 
}: UnclassifiedDocumentsTableProps) {
  const router = useRouter();
  const updateDocumentCode = useUpdateDocumentCode();
  const deleteDocument = useDeleteDocument();
  
  // State
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState({
    code: '',
    fileName: '',
    category: '',
  });
  const [internalShowFilters, setInternalShowFilters] = useState(false);
  
  // Use external showFilters if provided, otherwise use internal state
  const showFilters = externalShowFilters !== undefined ? externalShowFilters : internalShowFilters;
  const setShowFilters = onFiltersChange || setInternalShowFilters;
  
  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  // Filter and sort documents
  const filteredAndSorted = useMemo(() => {
    let filtered = documents.filter(doc => {
      // Apply column filters
      if (filters.code && !doc.documentCode?.toLowerCase().includes(filters.code.toLowerCase())) {
        return false;
      }
      if (filters.fileName && !doc.fileName.toLowerCase().includes(filters.fileName.toLowerCase())) {
        return false;
      }
      if (filters.category && !doc.category.toLowerCase().includes(filters.category.toLowerCase())) {
        return false;
      }
      return true;
    });
    
    // Sort documents
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'code':
          comparison = (a.documentCode || '').localeCompare(b.documentCode || '');
          break;
        case 'fileName':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'date':
          comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [documents, filters, sortColumn, sortDirection]);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  const handleDeleteDocument = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument({ id });
    }
  };
  
  const handleUpdateDocumentCode = async (id: Id<"documents">, newCode: string) => {
    await updateDocumentCode({ id, documentCode: newCode });
  };
  
  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 sticky top-0 z-10">
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('code')}
                >
                  <div className="flex items-center gap-2">
                    Document Code
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('fileName')}
                >
                  <div className="flex items-center gap-2">
                    File Name
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center gap-2">
                    Category
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-2">
                    Date
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
              
              {/* Filter Row */}
              {showFilters && (
                <TableRow className="bg-gray-50 border-t">
                  <TableCell>
                    <Input
                      placeholder="Filter..."
                      value={filters.code}
                      onChange={(e) => setFilters({...filters, code: e.target.value})}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Filter..."
                      value={filters.fileName}
                      onChange={(e) => setFilters({...filters, fileName: e.target.value})}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Filter..."
                      value={filters.category}
                      onChange={(e) => setFilters({...filters, category: e.target.value})}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableHeader>
            
            <TableBody>
              {filteredAndSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">No documents found</p>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSorted.map((doc) => (
                  <TableRow 
                    key={doc._id}
                    className="hover:bg-gray-50"
                  >
                    <TableCell>
                      <DocumentCodeEditor
                        documentCode={doc.documentCode}
                        fileName={doc.fileName}
                        onSave={(newCode) => handleUpdateDocumentCode(doc._id, newCode)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500 truncate max-w-[300px] block" title={doc.fileName}>
                        {doc.fileName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{doc.category}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{formatDate(doc.uploadedAt)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/docs/${doc._id}`)}
                          className="gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc._id)}
                          className="gap-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
      </div>
    </div>
  );
}

