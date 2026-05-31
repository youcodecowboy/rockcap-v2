/**
 * @deprecated This component is deprecated and will be removed in a future version.
 * The document library has been redesigned to use a 3-pane layout.
 * Unfiled/unclassified documents are now shown in the "Inbox" section
 * of the new document library at src/app/docs/page.tsx
 * 
 * See: src/app/docs/components/ for the new implementation.
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton, Input, DataTable, EmptyState, type Column } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
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
  
  const HeaderSort = ({ label, col }: { label: string; col: SortColumn }) => (
    <button
      onClick={() => handleSort(col)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        padding: 0,
      }}
    >
      {label}
      <ArrowUpDown size={11} style={{ opacity: sortColumn === col ? 1 : 0.4 }} />
    </button>
  );

  const columns: Column<UnclassifiedDocument>[] = [
    {
      key: 'code',
      header: 'Document Code',
      render: (doc) => (
        <DocumentCodeEditor
          documentCode={doc.documentCode}
          fileName={doc.fileName}
          onSave={(newCode) => handleUpdateDocumentCode(doc._id, newCode)}
        />
      ),
    },
    {
      key: 'fileName',
      header: 'File Name',
      render: (doc) => (
        <span title={doc.fileName} style={{ color: colors.text.muted, fontSize: 11 }}>
          {doc.fileName}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (doc) => <span style={{ color: colors.text.secondary }}>{doc.category}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      mono: true,
      render: (doc) => <span style={{ color: colors.text.secondary }}>{formatDate(doc.uploadedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (doc) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/docs/${doc._id}`)}>
            <Eye size={12} />
            View
          </Button>
          <IconButton label="Delete" onClick={() => handleDeleteDocument(doc._id)}>
            <Trash2 size={12} style={{ color: colors.accent.red }} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sort controls (canon DataTable headers are plain text) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
        <span style={{ marginRight: 4 }}>Sort:</span>
        <HeaderSort label="Code" col="code" />
        <HeaderSort label="File Name" col="fileName" />
        <HeaderSort label="Category" col="category" />
        <HeaderSort label="Date" col="date" />
      </div>

      {showFilters && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Input placeholder="Filter code..." value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })} />
          <Input placeholder="Filter file name..." value={filters.fileName} onChange={(e) => setFilters({ ...filters, fileName: e.target.value })} />
          <Input placeholder="Filter category..." value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} />
        </div>
      )}

      <DataTable
        rows={filteredAndSorted}
        getRowKey={(doc) => doc._id}
        columns={columns}
        empty={
          <EmptyState
            icon={<FileText size={32} />}
            title="No documents found"
            body="Try adjusting your filters"
          />
        }
      />

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
      </div>
    </div>
  );
}

