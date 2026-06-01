'use client';

import { useState, useMemo } from 'react';
import { useColors } from '@/lib/useColors';
import { EmptyState } from '@/components/layouts';
import {
  Database, FileSpreadsheet, FileText, ChevronDown, ChevronRight, Search, StickyNote,
} from 'lucide-react';

// One row from the project data library (projectDataItems). Only the fields the
// browser reads are typed; extra fields pass through harmlessly.
export interface DataItem {
  _id: string;
  category: string;
  originalName: string;
  currentValue: unknown;
  currentDataType: string;
  currentSourceDocumentId?: string;
  currentSourceDocumentName?: string;
  manualOverrideNote?: string; // provenance, e.g. "Appraisal!C10"
  projectName?: string;        // present in the client (cross-project) view
}

const MANUAL = 'Manual Entry';

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `£${(value / 1_000).toFixed(0)}K`;
  return `£${value.toLocaleString()}`;
}

function formatValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (dataType === 'currency') {
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? String(value) : formatCurrency(n);
  }
  if (dataType === 'percentage') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(n) ? String(value) : `${n.toFixed(2)}%`;
  }
  if (dataType === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(n) ? String(value) : n.toLocaleString();
  }
  return String(value);
}

function fileKey(item: DataItem): string {
  return item.currentSourceDocumentName || MANUAL;
}

export function DataFileBrowser({
  items,
  accent,
  groupByProject = false,
}: {
  items: DataItem[];
  accent: string;
  groupByProject?: boolean;
}) {
  const colors = useColors();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Build the file → items map (optionally nested under project).
  const { projectGroups, fileMap, firstFile } = useMemo(() => {
    const fileMap = new Map<string, DataItem[]>();
    for (const it of items) {
      const k = fileKey(it);
      if (!fileMap.has(k)) fileMap.set(k, []);
      fileMap.get(k)!.push(it);
    }
    // Project → [fileKey,…] for the nested client view
    const projectGroups = new Map<string, string[]>();
    if (groupByProject) {
      for (const [fk, list] of fileMap) {
        const proj = list[0]?.projectName || 'Unassigned';
        if (!projectGroups.has(proj)) projectGroups.set(proj, []);
        if (!projectGroups.get(proj)!.includes(fk)) projectGroups.get(proj)!.push(fk);
      }
    }
    const firstFile = fileMap.size ? [...fileMap.keys()][0] : null;
    return { projectGroups, fileMap, firstFile };
  }, [items, groupByProject]);

  const activeFile = selectedFile && fileMap.has(selectedFile) ? selectedFile : firstFile;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Database size={40} />}
        title="No data yet"
        body="Figures extracted from documents (appraisals, financial models, term sheets) will appear here, grouped by the file they came from. Run document.analyze + the appraisal extraction to populate it."
      />
    );
  }

  const fileIcon = (name: string) =>
    name === MANUAL ? <StickyNote size={13} /> : /\.(xlsx?|csv)$/i.test(name) ? <FileSpreadsheet size={13} /> : <FileText size={13} />;

  const FileRow = ({ name }: { name: string }) => {
    const isActive = name === activeFile;
    const count = fileMap.get(name)?.length ?? 0;
    return (
      <button
        onClick={() => setSelectedFile(name)}
        className="flex items-center gap-2 w-full text-left"
        style={{
          padding: '8px 10px', borderRadius: 6, marginBottom: 2,
          background: isActive ? colors.bg.cardAlt : 'transparent',
          borderLeft: `2px solid ${isActive ? accent : 'transparent'}`,
          cursor: 'pointer',
        }}
      >
        <span style={{ color: isActive ? accent : colors.text.muted, flexShrink: 0 }}>{fileIcon(name)}</span>
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: isActive ? colors.text.primary : colors.text.secondary }}>
          {name === MANUAL ? 'Operator-entered' : name}
        </span>
        <span style={{ fontSize: 10, color: colors.text.muted, flexShrink: 0 }}>{count}</span>
      </button>
    );
  };

  // Selected file's items, grouped by category, filtered by search.
  const activeItems = (activeFile ? fileMap.get(activeFile) ?? [] : [])
    .filter((it) => !search || it.originalName?.toLowerCase().includes(search.toLowerCase()) || it.category?.toLowerCase().includes(search.toLowerCase()));
  const byCategory = useMemo(() => {
    const m = new Map<string, DataItem[]>();
    for (const it of activeItems) {
      if (!m.has(it.category)) m.set(it.category, []);
      m.get(it.category)!.push(it);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeItems]);

  return (
    <div className="flex" style={{ gap: 16, minHeight: 420 }}>
      {/* Sidebar — files */}
      <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${colors.border.default}`, paddingRight: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.text.muted, padding: '4px 10px 8px' }}>
          Files ({fileMap.size})
        </div>
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {groupByProject
            ? [...projectGroups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([proj, files]) => {
                const collapsed = collapsedProjects.has(proj);
                return (
                  <div key={proj} style={{ marginBottom: 6 }}>
                    <button
                      onClick={() => setCollapsedProjects((s) => { const n = new Set(s); n.has(proj) ? n.delete(proj) : n.add(proj); return n; })}
                      className="flex items-center gap-1 w-full text-left"
                      style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, color: colors.text.primary, cursor: 'pointer' }}
                    >
                      {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      <span className="truncate flex-1">{proj}</span>
                      <span style={{ fontSize: 10, color: colors.text.muted }}>{files.reduce((n, f) => n + (fileMap.get(f)?.length ?? 0), 0)}</span>
                    </button>
                    {!collapsed && <div style={{ paddingLeft: 8 }}>{files.sort().map((f) => <FileRow key={f} name={f} />)}</div>}
                  </div>
                );
              })
            : [...fileMap.keys()].sort((a, b) => (a === MANUAL ? 1 : b === MANUAL ? -1 : a.localeCompare(b))).map((f) => <FileRow key={f} name={f} />)}
        </div>
      </div>

      {/* Main — selected file's data */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 12 }}>
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: accent, flexShrink: 0 }}>{activeFile ? fileIcon(activeFile) : <Database size={14} />}</span>
            <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
              {activeFile === MANUAL ? 'Operator-entered' : activeFile}
            </span>
            <span style={{ fontSize: 11, color: colors.text.muted, flexShrink: 0 }}>· {activeItems.length} fields</span>
          </div>
          <div className="flex items-center gap-1" style={{ background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 6, padding: '4px 8px' }}>
            <Search size={12} color={colors.text.muted} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter fields…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: colors.text.primary, width: 130 }}
            />
          </div>
        </div>

        {byCategory.map(([cat, rows]) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.text.muted, marginBottom: 6 }}>{cat}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 500, color: colors.text.muted, padding: '6px 8px' }}>Label</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 500, color: colors.text.muted, padding: '6px 8px' }}>Value</th>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 500, color: colors.text.muted, padding: '6px 8px', width: '30%' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it._id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                    <td style={{ fontSize: 12, color: colors.text.primary, padding: '7px 8px' }}>{it.originalName}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: colors.text.primary, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatValue(it.currentValue, it.currentDataType)}
                    </td>
                    <td style={{ fontSize: 11, color: colors.text.muted, padding: '7px 8px', fontFamily: 'monospace' }}>{it.manualOverrideNote || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {activeItems.length === 0 && (
          <div style={{ fontSize: 12, color: colors.text.muted, padding: 20, textAlign: 'center' }}>No fields match "{search}".</div>
        )}
      </div>
    </div>
  );
}
