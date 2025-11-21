'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const ITEMS_PER_PAGE = 10;
const BASE_VERSION = '2.1'; // Starting version

// Change type definitions
type ChangeType = 'new-feature' | 'bug-fix' | 'ui-improvement' | 'security' | 'performance' | 'general-update';

interface ChangeTypeInfo {
  label: string;
  icon: typeof Sparkles;
  color: string;
  bgColor: string;
  borderColor: string;
}

const changeTypes: Record<ChangeType, ChangeTypeInfo> = {
  'new-feature': {
    label: 'New Feature',
    icon: Sparkles,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  'bug-fix': {
    label: 'Bug Fix',
    icon: Zap,
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  'ui-improvement': {
    label: 'UI Improvement',
    icon: Layout,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  'security': {
    label: 'Security',
    icon: Shield,
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  'performance': {
    label: 'Performance',
    icon: Zap,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  'general-update': {
    label: 'General Update',
    icon: FileText,
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
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
  const [currentPage, setCurrentPage] = useState(1);
  const entries = useQuery(api.changelog.getAll);

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
  const entriesWithVersions = useMemo(() => {
    if (!entries) return [];
    
    return entries.map((entry, index) => {
      const versionNumber = index + 1;
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
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
            Changelog
          </h1>
          <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
            Track all application changes and updates
          </p>
        </div>

        {/* Changelog Entries */}
        {entries === undefined ? (
          <Card className="rounded-xl overflow-hidden">
            <CardContent className="py-12">
              <div className="text-center text-gray-500">Loading changelog...</div>
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="rounded-xl overflow-hidden">
            <CardContent className="py-12">
              <div className="text-center text-gray-500">No changelog entries yet.</div>
            </CardContent>
          </Card>
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
                const BannerIcon = getChangeIcon(title, description, changeType);
                const pagesAffected = (entry as any).pagesAffected || [];
                const featuresAffected = (entry as any).featuresAffected || [];

                return (
                  <Card 
                    key={entry._id} 
                    className={`hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-2 ${typeInfo.borderColor}`}
                  >
                    {/* Blue Banner Header */}
                    <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BannerIcon className="w-5 h-5 text-white" />
                        <span className="text-sm font-bold">
                          Version {entry.version}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-white opacity-90" />
                        <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                          {formatDate(entry.createdAt)} • {formatTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <CardContent className="p-6">
                      {/* Change Type Badge */}
                      <div className="mb-4">
                        <Badge 
                          className={`${typeInfo.bgColor} ${typeInfo.color} ${typeInfo.borderColor} border flex items-center gap-1.5 w-fit`}
                        >
                          <TypeIcon className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold">{typeInfo.label}</span>
                        </Badge>
                      </div>

                      {/* Title */}
                      {(entry as any).title && (
                        <div className="mb-3">
                          <h3 className="text-xl font-bold text-gray-900">
                            {(entry as any).title}
                          </h3>
                        </div>
                      )}
                      
                      {/* Description */}
                      <div className="mb-6">
                        <p className="text-base text-gray-700 leading-relaxed">
                          {description}
                        </p>
                      </div>

                      {/* Features and Pages Affected - Visual Grid */}
                      {(pagesAffected.length > 0 || featuresAffected.length > 0) && (
                        <div className="space-y-4 pt-4 border-t border-gray-200">
                          {pagesAffected.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <FileText className="w-4 h-4 text-gray-600" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                  Pages Affected
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {pagesAffected.map((page: string, idx: number) => {
                                  const PageIcon = featureIcons[page] || FileText;
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200"
                                    >
                                      <PageIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                      <span className="text-sm font-medium text-blue-900">{page}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {featuresAffected.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-4 h-4 text-gray-600" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                  Features Affected
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {featuresAffected.map((feature: string, idx: number) => {
                                  const FeatureIcon = featureIcons[feature] || Sparkles;
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200"
                                    >
                                      <FeatureIcon className="w-4 h-4 text-purple-600 flex-shrink-0" />
                                      <span className="text-sm font-medium text-purple-900">{feature}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1}-{Math.min(endIndex, entriesWithVersions.length)} of {entriesWithVersions.length} entries
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <div className="text-sm text-gray-600 px-3">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
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
