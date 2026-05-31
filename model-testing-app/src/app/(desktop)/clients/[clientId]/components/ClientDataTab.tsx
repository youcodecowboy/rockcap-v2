'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Database,
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
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  DataTable,
  EmptyState,
  StatusPill,
  FlagChip,
  SkeletonTable,
  type Column,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
      return <DollarSign size={12} />;
    case 'number':
      return <Hash size={12} />;
    case 'date':
      return <Calendar size={12} />;
    case 'percentage':
      return <TrendingUp size={12} />;
    default:
      return <FileText size={12} />;
  }
}

export default function ClientDataTab({
  clientId,
  clientName,
}: ClientDataTabProps) {
  const colors = useColors();
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
    return <SkeletonTable rows={8} cols={4} />;
  }

  // Empty state - no projects with data
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Database size={40} />}
        title="Data library"
        body="Financial data extracted from project documents will appear here. Upload spreadsheets to projects to see extracted data points."
      />
    );
  }

  // Columns for the per-category data table.
  const columns: Column<any>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (item: any) => (
        <span className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <span style={{ color: colors.text.muted, flexShrink: 0, lineHeight: 0 }}>
            {getDataTypeIcon(item.currentDataType)}
          </span>
          <span
            style={{
              color: item.isSubtotal ? colors.text.muted : colors.text.primary,
              fontStyle: item.isSubtotal ? 'italic' : 'normal',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.originalName}
          </span>
          {item.isSubtotal && <FlagChip label="subtotal" severity="info" />}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      mono: true,
      width: 120,
      render: (item: any) => <span style={{ color: colors.text.muted }}>{item.itemCode}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      width: 140,
      render: (item: any) => (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 500,
            color: item.isSubtotal ? colors.text.muted : colors.text.primary,
          }}
        >
          {formatValue(item.currentValue, item.currentDataType)}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '28%',
      render: (item: any) => (
        <span style={{ color: colors.text.muted, fontSize: 11 }}>{item.currentSourceDocumentName}</span>
      ),
    },
  ];

  return (
    <div
      className="flex overflow-hidden"
      style={{
        height: 'calc(100vh - 200px)',
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
      }}
    >
      {/* Project Sidebar */}
      <div
        className="flex flex-col"
        style={{ width: 256, background: colors.bg.light, borderRight: `1px solid ${colors.border.default}` }}
      >
        {/* Sidebar Header */}
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          <h3 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            Projects
          </h3>
          <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
            Select a project to view its data
          </p>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 8 }}>
          {projects.map((project: any) => {
            const isSelected = project.projectId === selectedProjectId;
            return (
              <button
                key={project.projectId}
                onClick={() => setSelectedProjectId(project.projectId)}
                className="w-full flex items-center gap-3 text-left"
                style={{
                  padding: '10px 12px',
                  borderRadius: 4,
                  marginBottom: 4,
                  background: isSelected ? `${colors.entityTypes.client}15` : 'transparent',
                  border: `1px solid ${isSelected ? `${colors.entityTypes.client}40` : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'background 100ms linear',
                }}
              >
                <Building2 size={16} style={{ color: isSelected ? colors.entityTypes.client : colors.text.muted, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }} className="truncate">
                    {project.projectName}
                  </div>
                  <div style={{ fontSize: 10, color: colors.text.muted }}>
                    {project.itemCount} data point{project.itemCount !== 1 ? 's' : ''}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ width: 6, height: 6, background: colors.entityTypes.client, borderRadius: 999, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer - Summary */}
        <div style={{ padding: 16, borderTop: `1px solid ${colors.border.default}`, background: colors.bg.card }}>
          <div style={{ fontSize: 10, color: colors.text.muted }}>
            <div className="flex justify-between">
              <span>Total projects</span>
              <span style={{ fontFamily: MONO, fontWeight: 500, color: colors.text.primary }}>{projects.length}</span>
            </div>
            <div className="flex justify-between" style={{ marginTop: 4 }}>
              <span>Total data points</span>
              <span style={{ fontFamily: MONO, fontWeight: 500, color: colors.text.primary }}>{stats?.totalItems || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Content Header */}
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.card }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{ width: 30, height: 30, borderRadius: 4, background: `${colors.entityTypes.client}15`, border: `1px solid ${colors.entityTypes.client}40` }}
              >
                <Database size={16} style={{ color: colors.entityTypes.client }} />
              </div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary }}>
                  {selectedProject?.projectName || 'Data library'}
                </h2>
                <p style={{ fontSize: 11, color: colors.text.muted }}>
                  {filteredItems.length} data point{filteredItems.length !== 1 ? 's' : ''} · {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
                </p>
              </div>
            </div>

            {/* View Project Link */}
            {selectedProjectId && (
              <Link
                href={`/clients/${clientId}/projects/${selectedProjectId}`}
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: colors.accent.blue, textDecoration: 'none' }}
              >
                View project
                <ExternalLink size={12} />
              </Link>
            )}
          </div>

          {/* Search and Actions */}
          <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
            <div
              className="flex items-center gap-2 flex-1"
              style={{
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                padding: '0 10px',
              }}
            >
              <Search size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search data items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  fontSize: 12,
                  color: colors.text.primary,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                Expand all
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                Collapse all
              </Button>
            </div>
          </div>
        </div>

        {/* Data Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={<Search size={32} />}
              title={searchQuery ? 'No data items match your search' : 'No data items in this project yet'}
              action={searchQuery ? (
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              ) : undefined}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        className="w-full flex items-center justify-between"
                        style={{ padding: 14, cursor: 'pointer', background: 'transparent' }}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown size={16} style={{ color: colors.text.muted }} />
                          ) : (
                            <ChevronRight size={16} style={{ color: colors.text.muted }} />
                          )}
                          <FolderOpen size={16} style={{ color: isExpanded ? colors.entityTypes.client : colors.text.muted }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{category}</span>
                          <StatusPill label={`${items.length} item${items.length !== 1 ? 's' : ''}`} tone={colors.text.muted} />
                        </div>
                        {categoryTotal > 0 && (
                          <div className="text-right">
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                              {formatCurrency(categoryTotal)}
                            </span>
                            <span style={{ fontSize: 10, color: colors.text.muted, marginLeft: 4 }}>total</span>
                          </div>
                        )}
                      </button>

                      {/* Category Items */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: 0 }}>
                          <div style={{ padding: 12 }}>
                            <DataTable
                              columns={columns}
                              rows={items}
                              getRowKey={(item: any) => item._id}
                            />
                          </div>
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
