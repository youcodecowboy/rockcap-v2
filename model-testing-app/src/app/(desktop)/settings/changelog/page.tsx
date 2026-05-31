'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import {
  Button,
  EmptyState,
  Skeleton,
} from '@/components/layouts';
import {
  Clock,
  FileText,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  History,
  Settings,
  Users,
  Database,
  Layout,
  Zap,
  Shield,
  MessageSquare,
  Archive,
  Building2,
  FolderKanban,
  UserSearch,
  ContactRound,
  Mail,
  CheckSquare,
  Calendar,
  Calculator,
  Bell,
  Link2,
  Tag,
} from 'lucide-react';
import type { ColorPalette } from '@/lib/colors';

const ITEMS_PER_PAGE = 10;
const BASE_VERSION = '2.1'; // Starting version

// Change type definitions
type ChangeType = 'new-feature' | 'bug-fix' | 'ui-improvement' | 'security' | 'performance' | 'general-update';

interface ChangeTypeInfo {
  label: string;
  icon: typeof Sparkles;
  /** Resolver: pick the canon accent for this change type. */
  accent: (c: ColorPalette) => string;
}

const changeTypes: Record<ChangeType, ChangeTypeInfo> = {
  'new-feature': { label: 'New Feature', icon: Sparkles, accent: (c) => c.accent.purple },
  'bug-fix': { label: 'Bug Fix', icon: Zap, accent: (c) => c.accent.orange },
  'ui-improvement': { label: 'UI Improvement', icon: Layout, accent: (c) => c.accent.blue },
  'security': { label: 'Security', icon: Shield, accent: (c) => c.accent.red },
  'performance': { label: 'Performance', icon: Zap, accent: (c) => c.accent.green },
  'general-update': { label: 'General Update', icon: FileText, accent: (c) => c.text.muted },
};

// Feature/page icon mapping
const featureIcons: Record<string, typeof FileText> = {
  'Changelog': History,
  'Settings': Settings,
  'Chat': MessageSquare,
  'Documents': Archive,
  'Clients': Building2,
  'Projects': FolderKanban,
  'Prospects': UserSearch,
  'Rolodex': ContactRound,
  'Inbox': Mail,
  'Tasks': CheckSquare,
  'Calendar': Calendar,
  'Modeling': Calculator,
  'Notifications': Bell,
  'HubSpot Integration': Link2,
  'Category Settings': Tag,
  'File Summary Agent': FileText,
  'Knowledge Bank': Database,
  'User Management': Users,
};

// Icon mapping for different types of changes in banner
const getChangeIcon = (title: string, description: string, changeType?: ChangeType) => {
  if (changeType && changeTypes[changeType]) {
    return changeTypes[changeType].icon;
  }

  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();

  if (lowerTitle.includes('ui') || lowerTitle.includes('design') || lowerTitle.includes('styling')) {
    return Layout;
  }
  if (lowerTitle.includes('feature') || lowerTitle.includes('add') || lowerTitle.includes('new')) {
    return Sparkles;
  }
  if (lowerTitle.includes('fix') || lowerTitle.includes('bug') || lowerTitle.includes('error')) {
    return Zap;
  }
  if (lowerTitle.includes('settings') || lowerDesc.includes('settings')) {
    return Settings;
  }
  if (lowerTitle.includes('user') || lowerDesc.includes('user')) {
    return Users;
  }
  if (lowerTitle.includes('database') || lowerDesc.includes('database') || lowerDesc.includes('schema')) {
    return Database;
  }
  return FileText;
};

// Detect change type from entry
const detectChangeType = (title: string, description: string): ChangeType => {
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();

  if (lowerTitle.includes('new') || lowerTitle.includes('add') || lowerDesc.includes('new feature')) {
    return 'new-feature';
  }
  if (lowerTitle.includes('fix') || lowerTitle.includes('bug') || lowerDesc.includes('fixed') || lowerDesc.includes('error')) {
    return 'bug-fix';
  }
  if (lowerTitle.includes('ui') || lowerTitle.includes('design') || lowerTitle.includes('styling') || lowerTitle.includes('redesign')) {
    return 'ui-improvement';
  }
  if (lowerTitle.includes('security') || lowerDesc.includes('security')) {
    return 'security';
  }
  if (lowerTitle.includes('performance') || lowerDesc.includes('performance') || lowerDesc.includes('faster')) {
    return 'performance';
  }
  return 'general-update';
};

export default function ChangelogPage() {
  const colors = useColors();
  const [currentPage, setCurrentPage] = useState(1);
  const entries = useQuery(api.changelog.getAll);

  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate version numbers (2.1.1, 2.1.2, etc.)
  // Newest entries get the highest version numbers
  const entriesWithVersions = useMemo(() => {
    if (!entries) return [];

    const totalEntries = entries.length;
    return entries.map((entry, index) => {
      // Reverse the numbering so newest entries get highest version
      const versionNumber = totalEntries - index;
      const version = `${BASE_VERSION}.${versionNumber}`;
      const title = (entry as any).title || entry.description.split('.')[0] || 'Update';
      const changeType = detectChangeType(title, entry.description);

      return {
        ...entry,
        version,
        changeType,
      };
    });
  }, [entries]);

  // Pagination calculations
  const totalPages = Math.ceil(entriesWithVersions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedEntries = entriesWithVersions.slice(startIndex, endIndex);

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center gap-3">
          <History style={{ width: 22, height: 22, color: colors.text.muted }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>Changelog</h1>
            <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted }}>
              Track all application changes and updates
            </p>
          </div>
        </div>

        {/* Changelog Entries */}
        {entries === undefined ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState icon={<History size={24} />} title="No changelog entries yet" />
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {paginatedEntries.map((entry) => {
                // Handle backward compatibility - old entries might only have description
                const title = (entry as any).title || entry.description.split('.')[0] || 'Update';
                const description = entry.description;
                const changeType = entry.changeType || 'general-update';
                const typeInfo = changeTypes[changeType];
                const TypeIcon = typeInfo.icon;
                const accent = typeInfo.accent(colors);
                const BannerIcon = getChangeIcon(title, description, changeType);
                const pagesAffected = (entry as any).pagesAffected || [];
                const featuresAffected = (entry as any).featuresAffected || [];

                return (
                  <div
                    key={entry._id}
                    style={{
                      background: colors.bg.card,
                      border: `1px solid ${colors.border.default}`,
                      borderTop: `2px solid ${accent}`,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Banner Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: colors.bg.light,
                        borderBottom: `1px solid ${colors.border.default}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BannerIcon style={{ width: 16, height: 16, color: accent }} />
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: colors.text.primary }}>
                          Version {entry.version}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock style={{ width: 13, height: 13, color: colors.text.muted }} />
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.text.muted }}>
                          {formatDate(entry.createdAt)} • {formatTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div style={{ padding: 18 }}>
                      {/* Change Type Chip */}
                      <div style={{ marginBottom: 14 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 8px',
                            borderRadius: 2,
                            fontFamily: MONO,
                            fontSize: 9,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            background: `${accent}15`,
                            color: accent,
                            border: `1px solid ${accent}40`,
                          }}
                        >
                          <TypeIcon style={{ width: 12, height: 12 }} />
                          {typeInfo.label}
                        </span>
                      </div>

                      {/* Title */}
                      {(entry as any).title && (
                        <div style={{ marginBottom: 10 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 500, color: colors.text.primary }}>
                            {(entry as any).title}
                          </h3>
                        </div>
                      )}

                      {/* Description */}
                      <div style={{ marginBottom: 18 }}>
                        <p style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.6 }}>
                          {description}
                        </p>
                      </div>

                      {/* Features and Pages Affected - Visual Grid */}
                      {(pagesAffected.length > 0 || featuresAffected.length > 0) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, borderTop: `1px solid ${colors.border.light}` }}>
                          {pagesAffected.length > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <FileText style={{ width: 13, height: 13, color: colors.text.muted }} />
                                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
                                  Pages Affected
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {pagesAffected.map((page: string, idx: number) => {
                                  const PageIcon = featureIcons[page] || FileText;
                                  return (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 10px',
                                        background: `${colors.accent.blue}15`,
                                        borderRadius: 4,
                                        border: `1px solid ${colors.accent.blue}40`,
                                      }}
                                    >
                                      <PageIcon style={{ width: 14, height: 14, color: colors.accent.blue, flexShrink: 0 }} />
                                      <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{page}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {featuresAffected.length > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Sparkles style={{ width: 13, height: 13, color: colors.text.muted }} />
                                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
                                  Features Affected
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {featuresAffected.map((feature: string, idx: number) => {
                                  const FeatureIcon = featureIcons[feature] || Sparkles;
                                  return (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 10px',
                                        background: `${colors.accent.purple}15`,
                                        borderRadius: 4,
                                        border: `1px solid ${colors.accent.purple}40`,
                                      }}
                                    >
                                      <FeatureIcon style={{ width: 14, height: 14, color: colors.accent.purple, flexShrink: 0 }} />
                                      <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{feature}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: `1px solid ${colors.border.light}` }}>
                <div style={{ fontSize: 12, color: colors.text.muted }}>
                  Showing {startIndex + 1}-{Math.min(endIndex, entriesWithVersions.length)} of {entriesWithVersions.length} entries
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft style={{ width: 14, height: 14 }} />
                    Previous
                  </Button>
                  <div style={{ fontSize: 12, color: colors.text.muted, padding: '0 12px' }}>
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight style={{ width: 14, height: 14 }} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
