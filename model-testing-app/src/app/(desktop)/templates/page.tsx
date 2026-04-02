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
  getFunnelById,
} from '@/lib/funnelStorage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  ArrowRight,
  Clock,
  FileText,
  Sparkles,
  Plus,
  Edit2,
  Search,
  ArrowLeft,
  Mail,
} from 'lucide-react';

const prospectTypeLabels = {
  'new-prospect': 'New Prospect',
  'existing-prospect': 'Existing Prospect',
  'reactivation': 'Reactivation',
};

const prospectTypeColors = {
  'new-prospect': 'bg-blue-100 text-blue-800',
  'existing-prospect': 'bg-green-100 text-green-800',
  'reactivation': 'bg-orange-100 text-orange-800',
};

function TemplateLibraryContent() {
  const router = useRouter();
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={returnUrl}
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Email Template Library</h1>
              <p className="mt-2 text-gray-600">
                Browse and manage email templates and funnels for different prospect types
              </p>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search templates and funnels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Prospect Type Filter */}
            <div className="flex gap-2">
              <Button
                variant={selectedProspectType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedProspectType('all')}
              >
                All Types
              </Button>
              <Button
                variant={selectedProspectType === 'new-prospect' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedProspectType('new-prospect')}
              >
                <Badge className={`mr-2 ${prospectTypeColors['new-prospect']}`}>New</Badge>
                New Prospect
              </Button>
              <Button
                variant={selectedProspectType === 'existing-prospect' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedProspectType('existing-prospect')}
              >
                <Badge className={`mr-2 ${prospectTypeColors['existing-prospect']}`}>Existing</Badge>
                Existing Prospect
              </Button>
              <Button
                variant={selectedProspectType === 'reactivation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedProspectType('reactivation')}
              >
                <Badge className={`mr-2 ${prospectTypeColors['reactivation']}`}>Reactivate</Badge>
                Reactivation
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'funnels' | 'templates')} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="funnels" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Funnels & Sequences
              {filteredFunnels.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredFunnels.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Individual Templates
              {filteredTemplates.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredTemplates.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Funnels Tab */}
          <TabsContent value="funnels" className="space-y-6">
            {selectedProspectType === 'all' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card 
                  className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-300"
                  onClick={() => setSelectedProspectType('new-prospect')}
                >
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge className={prospectTypeColors['new-prospect']}>New Prospect</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-gray-900 mb-1">
                      {funnels.filter(f => f.prospectType === 'new-prospect').length}
                    </p>
                    <p className="text-sm text-gray-600">funnels available</p>
                  </CardContent>
                </Card>
                <Card 
                  className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-green-300"
                  onClick={() => setSelectedProspectType('existing-prospect')}
                >
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge className={prospectTypeColors['existing-prospect']}>Existing Prospect</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-gray-900 mb-1">
                      {funnels.filter(f => f.prospectType === 'existing-prospect').length}
                    </p>
                    <p className="text-sm text-gray-600">funnels available</p>
                  </CardContent>
                </Card>
                <Card 
                  className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-orange-300"
                  onClick={() => setSelectedProspectType('reactivation')}
                >
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge className={prospectTypeColors['reactivation']}>Reactivation</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-gray-900 mb-1">
                      {funnels.filter(f => f.prospectType === 'reactivation').length}
                    </p>
                    <p className="text-sm text-gray-600">funnels available</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {searchedFunnels.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
                <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No funnels found</h3>
                <p className="text-gray-600 mb-4">
                  {searchQuery.trim() 
                    ? 'Try adjusting your search query.' 
                    : selectedProspectType !== 'all'
                    ? `Create a funnel for ${prospectTypeLabels[selectedProspectType]}.`
                    : 'Create your first email funnel.'}
                </p>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Funnel
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {searchedFunnels.map((funnel) => {
                  const funnelTemplates = getFunnelTemplates(funnel);
                  return (
                    <Card key={funnel.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-xl">{funnel.name}</CardTitle>
                              <Badge className={prospectTypeColors[funnel.prospectType]}>
                                {prospectTypeLabels[funnel.prospectType]}
                              </Badge>
                            </div>
                            {funnel.description && (
                              <CardDescription className="text-base">{funnel.description}</CardDescription>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-3">
                            Email Sequence ({funnelTemplates.length} emails):
                          </div>
                          <div className="space-y-3">
                            {funnelTemplates.map((item, idx) => (
                              <div
                                key={item.templateId}
                                className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                              >
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                                  {item.order}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-gray-900">
                                      {item.template?.name || 'Unknown Template'}
                                    </span>
                                    {item.delayDays !== undefined && item.delayDays > 0 && (
                                      <Badge variant="outline" className="text-xs">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {item.delayDays} day{item.delayDays !== 1 ? 's' : ''} delay
                                      </Badge>
                                    )}
                                  </div>
                                  {item.template?.description && (
                                    <p className="text-sm text-gray-600 line-clamp-2">
                                      {item.template.description}
                                    </p>
                                  )}
                                  {item.template?.subject && (
                                    <p className="text-xs text-gray-500 mt-2 font-mono bg-white p-2 rounded border">
                                      {item.template.subject.substring(0, 80)}
                                      {item.template.subject.length > 80 && '...'}
                                    </p>
                                  )}
                                </div>
                                {idx < funnelTemplates.length - 1 && (
                                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="pt-4 border-t border-gray-200">
                          <Button
                            className="w-full"
                            onClick={() => handleSelectFunnel(funnel.id)}
                          >
                            Use This Funnel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-6">
            {searchedTemplates.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No templates found</h3>
                <p className="text-gray-600 mb-4">
                  {searchQuery.trim() 
                    ? 'Try adjusting your search query.' 
                    : 'Create your first email template.'}
                </p>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {searchedTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-2">{template.name}</CardTitle>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {template.category}
                            </Badge>
                            {template.prospectType && (
                              <Badge className={`text-xs ${prospectTypeColors[template.prospectType]}`}>
                                {prospectTypeLabels[template.prospectType]}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      {template.description && (
                        <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                      )}
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-700 mb-2">Subject:</div>
                        <div className="bg-gray-50 p-3 rounded border border-gray-200 font-mono text-xs text-gray-900 mb-4">
                          {template.subject}
                        </div>
                        <div className="text-xs font-semibold text-gray-700 mb-2">Preview:</div>
                        <div className="bg-gray-50 p-3 rounded border border-gray-200 text-xs text-gray-700 line-clamp-4">
                          {template.body.substring(0, 200)}
                          {template.body.length > 200 && '...'}
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleSelectTemplate(template.id)}
                        >
                          Use This Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function TemplateLibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    }>
      <TemplateLibraryContent />
    </Suspense>
  );
}

