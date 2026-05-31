'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
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
import { useColors } from '@/lib/useColors';
import {
  Panel,
  StatTile,
  DataTable,
  EmptyState,
  StatusPill,
  FlagChip,
  Button,
  Field,
  Input,
  Select,
  SkeletonTable,
} from '@/components/layouts';

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
  const colors = useColors();
  const accent = colors.entityTypes.project;
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
    return <SkeletonTable rows={6} cols={5} />;
  }

  // Pending extractions banner component
  const PendingExtractionsBanner = () => {
    if (!pendingExtractions?.needsAttention) return null;

    return (
      <div
        style={{
          background: `${colors.accent.orange}12`,
          border: `1px solid ${colors.accent.orange}40`,
          borderLeft: `3px solid ${colors.accent.orange}`,
          borderRadius: 4,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <AlertCircle size={18} color={colors.accent.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.accent.orange }}>
              Extractions Pending Confirmation
            </h4>
            <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4, lineHeight: 1.5 }}>
              {pendingExtractions.pendingJobCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Loader2 size={12} className="animate-spin" />
                  {pendingExtractions.pendingJobCount} extraction(s) processing...
                </span>
              )}
              {pendingExtractions.hasUnconfirmed && (
                <span style={{ display: 'block', marginTop: 4 }}>
                  {pendingExtractions.unconfirmedCount} extraction(s) with {pendingExtractions.unconfirmedItemCount} items awaiting confirmation.
                </span>
              )}
              {pendingExtractions.hasPendingMerge && (
                <span style={{ display: 'block', marginTop: 4 }}>
                  {pendingExtractions.pendingMergeCount} confirmed extraction(s) pending merge to library.
                </span>
              )}
            </div>
            <Link
              href="/modeling"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                color: colors.accent.orange,
                marginTop: 8,
                textDecoration: 'none',
              }}
            >
              Go to Modeling to confirm extractions
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </div>
    );
  };

  // Empty state
  if (dataLibrary.length === 0 || filteredItems.length === 0 && !searchQuery && selectedCategory === 'all') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PendingExtractionsBanner />
        <EmptyState
          icon={<Database size={40} />}
          title="Data Library"
          body="Financial data extracted from project documents will appear here. Upload spreadsheets, financial statements, and appraisals to see extracted data points."
          action={
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: colors.text.muted,
                padding: '10px 14px',
                borderRadius: 4,
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <FileSpreadsheet size={18} color={colors.entityTypes.client} />
              Upload documents in the Documents tab to extract data
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Pending Extractions Banner */}
      <PendingExtractionsBanner />

      {/* Header Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: colors.border.default }}>
        <StatTile
          label="Data Points"
          value={stats?.totalItems || 0}
          meta={`Extracted from ${stats?.totalDocuments || 0} document${(stats?.totalDocuments || 0) !== 1 ? 's' : ''}`}
          accent={accent}
        />
        <StatTile
          label="Categories"
          value={Object.keys(stats?.byCategory || {}).length}
          accent={colors.accent.blue}
        />
        {stats?.manualOverrides && stats.manualOverrides > 0 && (
          <StatTile
            label="Overrides"
            value={stats.manualOverrides}
            accent={colors.accent.orange}
          />
        )}
      </div>

      {/* Filters */}
      <Panel accent={accent}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search
              size={16}
              color={colors.text.muted}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <Input
              type="text"
              placeholder="Search data items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          {/* Category Filter */}
          <div style={{ position: 'relative', width: 200 }}>
            <Filter
              size={14}
              color={colors.text.muted}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}
            />
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ paddingLeft: 30 }}
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>

          {/* Expand/Collapse All */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
      </Panel>

      {/* Data Items by Category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <div
                key={category}
                style={{
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 14,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 100ms linear',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.cardAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isExpanded ? (
                      <ChevronDown size={18} color={colors.text.muted} />
                    ) : (
                      <ChevronRight size={18} color={colors.text.muted} />
                    )}
                    <FolderOpen size={18} color={isExpanded ? accent : colors.text.muted} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{category}</span>
                    <StatusPill label={`${items.length} item${items.length !== 1 ? 's' : ''}`} tone={colors.text.muted} />
                  </div>
                  {categoryTotal > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 12,
                          fontWeight: 500,
                          color: colors.text.primary,
                        }}
                      >
                        {formatCurrency(categoryTotal)}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text.muted, marginLeft: 4 }}>total</span>
                    </div>
                  )}
                </button>

                {/* Category Items */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${colors.border.default}` }}>
                    <DataTable
                      rows={items}
                      getRowKey={(item: any) => item._id}
                      columns={[
                        {
                          key: 'item',
                          header: 'Item',
                          render: (item: any) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{ color: colors.text.muted, display: 'inline-flex', flexShrink: 0 }}>
                                {getDataTypeIcon(item.currentDataType)}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: item.isSubtotal ? colors.text.muted : colors.text.primary,
                                  fontStyle: item.isSubtotal ? 'italic' : 'normal',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.originalName}
                              </span>
                              {item.isSubtotal && <FlagChip label="subtotal" severity="info" />}
                              {item.hasMultipleSources && (
                                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                  <FlagChip label="Multi" severity="info" />
                                </span>
                              )}
                            </div>
                          ),
                        },
                        {
                          key: 'code',
                          header: 'Code',
                          mono: true,
                          width: 140,
                          render: (item: any) => item.itemCode,
                        },
                        {
                          key: 'value',
                          header: 'Value',
                          mono: true,
                          align: 'right',
                          width: 120,
                          render: (item: any) => formatValue(item.currentValue, item.currentDataType),
                        },
                        {
                          key: 'source',
                          header: 'Source',
                          width: 160,
                          render: (item: any) => (
                            <span
                              style={{
                                fontSize: 11,
                                color: colors.text.muted,
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.currentSourceDocumentName}
                            </span>
                          ),
                        },
                        {
                          key: 'updated',
                          header: 'Updated',
                          mono: true,
                          align: 'right',
                          width: 110,
                          render: (item: any) => (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                              <Clock size={12} color={colors.text.muted} />
                              {item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toLocaleDateString() : '-'}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* No Results */}
      {filteredItems.length === 0 && (searchQuery || selectedCategory !== 'all') && (
        <EmptyState
          icon={<Search size={28} />}
          title="No data items match your filters"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}
    </div>
  );
}
