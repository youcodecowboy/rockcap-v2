'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { EmailTemplate, EmailFunnel } from '@/types';
import {
  getAllTemplates,
  getTemplateById,
} from '@/lib/templateStorage';
import {
  getFunnels,
} from '@/lib/funnelStorage';
import {
  Panel,
  StatTile,
  StatusPill,
  EmptyState,
  Button,
  Field,
  Input,
  TabStrip,
  SkeletonText,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  ArrowRight,
  Clock,
  FileText,
  Sparkles,
  Plus,
  Search,
  ArrowLeft,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const prospectTypeLabels = {
  'new-prospect': 'New Prospect',
  'existing-prospect': 'Existing Prospect',
  'reactivation': 'Reactivation',
};

// Maps the prospect-type taxonomy onto canon accent tokens.
function prospectTypeTone(
  type: 'new-prospect' | 'existing-prospect' | 'reactivation',
  colors: ReturnType<typeof useColors>,
): string {
  switch (type) {
    case 'new-prospect':
      return colors.accent.blue;
    case 'existing-prospect':
      return colors.accent.green;
    case 'reactivation':
      return colors.accent.orange;
  }
}

function TemplateLibraryContent() {
  const router = useRouter();
  const colors = useColors();
  const searchParams = useSearchParams();
  const prospectTypeParam = searchParams.get('prospectType') as 'new-prospect' | 'existing-prospect' | 'reactivation' | null;
  const returnUrl = searchParams.get('returnUrl') || '/prospects';

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [funnels, setFunnels] = useState<EmailFunnel[]>([]);
  const [activeTab, setActiveTab] = useState<'funnels' | 'templates'>('funnels');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProspectType, setSelectedProspectType] = useState<'new-prospect' | 'existing-prospect' | 'reactivation' | 'all'>(prospectTypeParam || 'all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allTemplates = getAllTemplates();
    setTemplates(allTemplates);

    const allFunnels = getFunnels();
    setFunnels(allFunnels);
  };

  const handleSelectFunnel = (funnelId: string) => {
    // Navigate back with funnel ID
    router.push(`${returnUrl}?funnelId=${funnelId}`);
  };

  const handleSelectTemplate = (templateId: string) => {
    // Navigate back with template ID
    router.push(`${returnUrl}?templateId=${templateId}`);
  };

  const filteredFunnels = selectedProspectType !== 'all'
    ? funnels.filter(f => f.prospectType === selectedProspectType)
    : funnels;

  const filteredTemplates = selectedProspectType !== 'all'
    ? templates.filter(t => !t.prospectType || t.prospectType === selectedProspectType)
    : templates;

  const searchedFunnels = searchQuery.trim()
    ? filteredFunnels.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredFunnels;

  const searchedTemplates = searchQuery.trim()
    ? filteredTemplates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredTemplates;

  const getFunnelTemplates = (funnel: EmailFunnel) => {
    return funnel.templates
      .sort((a, b) => a.order - b.order)
      .map(item => {
        const template = getTemplateById(item.templateId);
        return { ...item, template };
      })
      .filter(item => item.template);
  };

  const typeFilters: { key: 'all' | 'new-prospect' | 'existing-prospect' | 'reactivation'; label: string }[] = [
    { key: 'all', label: 'All Types' },
    { key: 'new-prospect', label: 'New Prospect' },
    { key: 'existing-prospect', label: 'Existing Prospect' },
    { key: 'reactivation', label: 'Reactivation' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: colors.bg.light }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={returnUrl}
            className="mb-4 inline-flex items-center gap-2"
            style={{ fontSize: 12, color: colors.accent.blue }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary }}>
                Email Template Library
              </h1>
              <p style={{ marginTop: 6, fontSize: 13, color: colors.text.muted }}>
                Browse and manage email templates and funnels for different prospect types
              </p>
            </div>
            <Button variant="primary" accent={colors.entityTypes.prospect}>
              <Plus className="w-4 h-4" />
              Create Template
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ marginBottom: 24 }}>
          <Panel padded>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: colors.text.dim }}
                  />
                  <div style={{ paddingLeft: 26 }}>
                    <Input
                      placeholder="Search templates and funnels..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Prospect Type Filter */}
              <div className="flex gap-2">
                {typeFilters.map((tf) => {
                  const active = selectedProspectType === tf.key;
                  return (
                    <Button
                      key={tf.key}
                      variant={active ? 'primary' : 'secondary'}
                      size="sm"
                      accent={tf.key === 'all' ? colors.accent.blue : prospectTypeTone(tf.key, colors)}
                      onClick={() => setSelectedProspectType(tf.key)}
                    >
                      {tf.key !== 'all' && (
                        <StatusPill label={tf.label.split(' ')[0]} tone={prospectTypeTone(tf.key, colors)} />
                      )}
                      {tf.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>

        {/* Main Content */}
        <TabStrip
          entityType="prospect"
          tabs={[
            { id: 'funnels', label: 'Funnels & Sequences', count: filteredFunnels.length },
            { id: 'templates', label: 'Individual Templates', count: filteredTemplates.length },
          ]}
          activeTab={activeTab}
          onChange={(k) => setActiveTab(k as 'funnels' | 'templates')}
        />

        <div style={{ marginTop: 24 }}>
          {activeTab === 'funnels' ? (
            <div className="space-y-6">
              {selectedProspectType === 'all' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 1,
                    background: colors.border.default,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                    marginBottom: 24,
                  }}
                >
                  {(['new-prospect', 'existing-prospect', 'reactivation'] as const).map((pt) => (
                    <StatTile
                      key={pt}
                      label={prospectTypeLabels[pt]}
                      value={funnels.filter(f => f.prospectType === pt).length}
                      meta="funnels available"
                      accent={prospectTypeTone(pt, colors)}
                      onClick={() => setSelectedProspectType(pt)}
                    />
                  ))}
                </div>
              )}

              {searchedFunnels.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="w-10 h-10" />}
                  title="No funnels found"
                  body={
                    searchQuery.trim()
                      ? 'Try adjusting your search query.'
                      : selectedProspectType !== 'all'
                      ? `Create a funnel for ${prospectTypeLabels[selectedProspectType]}.`
                      : 'Create your first email funnel.'
                  }
                  action={
                    <Button variant="primary" accent={colors.entityTypes.prospect}>
                      <Plus className="w-4 h-4" />
                      Create Funnel
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {searchedFunnels.map((funnel) => {
                    const funnelTemplates = getFunnelTemplates(funnel);
                    return (
                      <Panel
                        key={funnel.id}
                        title={funnel.name}
                        accent={prospectTypeTone(funnel.prospectType, colors)}
                        actions={
                          <StatusPill
                            label={prospectTypeLabels[funnel.prospectType]}
                            tone={prospectTypeTone(funnel.prospectType, colors)}
                          />
                        }
                      >
                        {funnel.description && (
                          <p style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 14 }}>
                            {funnel.description}
                          </p>
                        )}
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 9,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: colors.text.muted,
                            marginBottom: 10,
                          }}
                        >
                          Email Sequence · {funnelTemplates.length} emails
                        </div>
                        <div className="space-y-3">
                          {funnelTemplates.map((item, idx) => (
                            <div
                              key={item.templateId}
                              className="flex items-start gap-4"
                              style={{
                                padding: 14,
                                background: colors.bg.cardAlt,
                                border: `1px solid ${colors.border.default}`,
                                borderRadius: 4,
                              }}
                            >
                              <div
                                className="flex-shrink-0 flex items-center justify-center"
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 4,
                                  background: `${colors.accent.blue}20`,
                                  color: colors.accent.blue,
                                  fontFamily: MONO,
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {item.order}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                                    {item.template?.name || 'Unknown Template'}
                                  </span>
                                  {item.delayDays !== undefined && item.delayDays > 0 && (
                                    <span
                                      className="inline-flex items-center gap-1"
                                      style={{
                                        fontFamily: MONO,
                                        fontSize: 9,
                                        padding: '2px 6px',
                                        borderRadius: 2,
                                        border: `1px solid ${colors.border.default}`,
                                        color: colors.text.muted,
                                      }}
                                    >
                                      <Clock className="w-3 h-3" />
                                      {item.delayDays} day{item.delayDays !== 1 ? 's' : ''} delay
                                    </span>
                                  )}
                                </div>
                                {item.template?.description && (
                                  <p
                                    className="line-clamp-2"
                                    style={{ fontSize: 12, color: colors.text.secondary }}
                                  >
                                    {item.template.description}
                                  </p>
                                )}
                                {item.template?.subject && (
                                  <p
                                    style={{
                                      fontFamily: MONO,
                                      fontSize: 10,
                                      color: colors.text.muted,
                                      marginTop: 8,
                                      background: colors.bg.card,
                                      padding: 8,
                                      borderRadius: 2,
                                      border: `1px solid ${colors.border.default}`,
                                    }}
                                  >
                                    {item.template.subject.substring(0, 80)}
                                    {item.template.subject.length > 80 && '...'}
                                  </p>
                                )}
                              </div>
                              {idx < funnelTemplates.length - 1 && (
                                <ArrowRight
                                  className="w-5 h-5 flex-shrink-0 mt-2"
                                  style={{ color: colors.text.dim }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ paddingTop: 16, marginTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
                          <Button
                            variant="primary"
                            accent={colors.entityTypes.prospect}
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => handleSelectFunnel(funnel.id)}
                          >
                            Use This Funnel
                          </Button>
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {searchedTemplates.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-10 h-10" />}
                  title="No templates found"
                  body={
                    searchQuery.trim()
                      ? 'Try adjusting your search query.'
                      : 'Create your first email template.'
                  }
                  action={
                    <Button variant="primary" accent={colors.entityTypes.prospect}>
                      <Plus className="w-4 h-4" />
                      Create Template
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {searchedTemplates.map((template) => (
                    <Panel
                      key={template.id}
                      title={template.name}
                      accent={
                        template.prospectType
                          ? prospectTypeTone(template.prospectType, colors)
                          : colors.border.mid
                      }
                      actions={
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill label={template.category} tone={colors.text.muted} />
                          {template.prospectType && (
                            <StatusPill
                              label={prospectTypeLabels[template.prospectType]}
                              tone={prospectTypeTone(template.prospectType, colors)}
                            />
                          )}
                        </div>
                      }
                    >
                      {template.description && (
                        <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 14 }}>
                          {template.description}
                        </p>
                      )}
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          marginBottom: 6,
                        }}
                      >
                        Subject
                      </div>
                      <div
                        style={{
                          background: colors.bg.cardAlt,
                          padding: 10,
                          borderRadius: 2,
                          border: `1px solid ${colors.border.default}`,
                          fontFamily: MONO,
                          fontSize: 11,
                          color: colors.text.primary,
                          marginBottom: 14,
                        }}
                      >
                        {template.subject}
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          marginBottom: 6,
                        }}
                      >
                        Preview
                      </div>
                      <div
                        className="line-clamp-4"
                        style={{
                          background: colors.bg.cardAlt,
                          padding: 10,
                          borderRadius: 2,
                          border: `1px solid ${colors.border.default}`,
                          fontSize: 11,
                          color: colors.text.secondary,
                        }}
                      >
                        {template.body.substring(0, 200)}
                        {template.body.length > 200 && '...'}
                      </div>
                      <div style={{ paddingTop: 16, marginTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
                        <Button
                          variant="secondary"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => handleSelectTemplate(template.id)}
                        >
                          Use This Template
                        </Button>
                      </div>
                    </Panel>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TemplateLibraryPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <SkeletonText />
        <SkeletonText />
        <SkeletonText />
      </div>
    }>
      <TemplateLibraryContent />
    </Suspense>
  );
}
