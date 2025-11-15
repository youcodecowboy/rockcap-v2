'use client';

import { useState, useEffect } from 'react';
import { EmailTemplate, EmailFunnel } from '@/types';
import {
  getAllTemplates,
  getTemplateById,
} from '@/lib/templateStorage';
import {
  getFunnels,
  getFunnelById,
} from '@/lib/funnelStorage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  ArrowRight,
  Clock,
  FileText,
  Sparkles,
  Plus,
  Edit2,
} from 'lucide-react';

interface TemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFunnel?: (funnelId: string) => void;
  onSelectTemplate?: (templateId: string) => void;
  prospectType?: 'new-prospect' | 'existing-prospect' | 'reactivation';
}

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

export default function TemplateLibraryModal({
  isOpen,
  onClose,
  onSelectFunnel,
  onSelectTemplate,
  prospectType,
}: TemplateLibraryModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [funnels, setFunnels] = useState<EmailFunnel[]>([]);
  const [activeTab, setActiveTab] = useState<'funnels' | 'templates'>('funnels');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = () => {
    const allTemplates = getAllTemplates();
    setTemplates(allTemplates);
    
    const allFunnels = getFunnels();
    setFunnels(allFunnels);
  };

  const handleSelectFunnel = (funnelId: string) => {
    if (onSelectFunnel) {
      onSelectFunnel(funnelId);
    }
    onClose();
  };

  const handleSelectTemplate = (templateId: string) => {
    if (onSelectTemplate) {
      onSelectTemplate(templateId);
    }
    onClose();
  };

  const filteredFunnels = prospectType
    ? funnels.filter(f => f.prospectType === prospectType)
    : funnels;

  const filteredTemplates = prospectType
    ? templates.filter(t => !t.prospectType || t.prospectType === prospectType)
    : templates;

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Template Library</DialogTitle>
          <DialogDescription>
            Browse templates and funnels for different prospect types
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'funnels' | 'templates')} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="funnels">
              <Sparkles className="w-4 h-4 mr-2" />
              Funnels & Sequences
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="w-4 h-4 mr-2" />
              Individual Templates
            </TabsTrigger>
          </TabsList>

          {/* Funnels Tab */}
          <TabsContent value="funnels" className="space-y-4 mt-4">
            {!prospectType && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('funnels')}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className={prospectTypeColors['new-prospect']}>New Prospect</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {funnels.filter(f => f.prospectType === 'new-prospect').length} funnels
                    </p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className={prospectTypeColors['existing-prospect']}>Existing Prospect</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {funnels.filter(f => f.prospectType === 'existing-prospect').length} funnels
                    </p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className={prospectTypeColors['reactivation']}>Reactivation</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {funnels.filter(f => f.prospectType === 'reactivation').length} funnels
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {filteredFunnels.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No funnels found. {prospectType && `Create a funnel for ${prospectTypeLabels[prospectType]}.`}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFunnels.map((funnel) => {
                  const funnelTemplates = getFunnelTemplates(funnel);
                  return (
                    <Card key={funnel.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-lg">{funnel.name}</CardTitle>
                              <Badge className={prospectTypeColors[funnel.prospectType]}>
                                {prospectTypeLabels[funnel.prospectType]}
                              </Badge>
                            </div>
                            {funnel.description && (
                              <CardDescription>{funnel.description}</CardDescription>
                            )}
                          </div>
                          {onSelectFunnel && (
                            <Button
                              size="sm"
                              onClick={() => handleSelectFunnel(funnel.id)}
                            >
                              Use Funnel
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-gray-700 mb-2">
                            Sequence ({funnelTemplates.length} emails):
                          </div>
                          {funnelTemplates.map((item, idx) => (
                            <div
                              key={item.templateId}
                              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">
                                {item.order}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-gray-900">
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
                                  <p className="text-xs text-gray-600 line-clamp-1">
                                    {item.template.description}
                                  </p>
                                )}
                              </div>
                              {idx < funnelTemplates.length - 1 && (
                                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2" />
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No templates found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-2">
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
                        {onSelectTemplate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectTemplate(template.id)}
                          >
                            Use
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {template.description && (
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                      )}
                      <div className="text-xs text-gray-500">
                        <div className="font-medium mb-1">Subject:</div>
                        <div className="bg-gray-50 p-2 rounded font-mono text-xs">
                          {template.subject.substring(0, 60)}
                          {template.subject.length > 60 && '...'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

