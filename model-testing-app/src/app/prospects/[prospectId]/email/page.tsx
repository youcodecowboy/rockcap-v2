'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Prospect, EmailTemplate, ProspectingEmail } from '@/types';
import {
  getProspectById,
} from '@/lib/prospectStorage';
import {
  getTemplates,
  getTemplateById,
} from '@/lib/templateStorage';
import {
  getFunnelById,
} from '@/lib/funnelStorage';
import {
  createEmailDraft,
  updateEmailDraft,
  getEmailById,
  approveEmailDraft,
  getAllEmails,
} from '@/lib/emailStorage';
import {
  aggregateProspectingDataForClient,
} from '@/lib/enrichmentAggregator';
import { getClientById, getEnrichmentSuggestions, acceptEnrichmentSuggestion, rejectEnrichmentSuggestion } from '@/lib/clientStorage';
import { getDocumentById } from '@/lib/documentStorage';
import { initializeDemoData } from '@/lib/demoData';
import { getMockExternalEnrichment } from '@/lib/externalEnrichment';
import EnrichmentSuggestionCard from '@/components/EnrichmentSuggestionCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Save,
  Send,
  Sparkles,
  X,
  Plus,
  Lightbulb,
  AlertCircle,
  TrendingUp,
  BookOpen,
  Database,
  CheckCircle,
} from 'lucide-react';

interface MergeField {
  key: string;
  label: string;
  value: string;
}

export default function EmailComposerPage() {
  const params = useParams();
  const router = useRouter();
  const prospectId = params.prospectId as string;
  const emailId = params.emailId as string | undefined;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enrichmentData, setEnrichmentData] = useState<any>(null);
  const [enrichmentSuggestions, setEnrichmentSuggestions] = useState<any[]>([]);
  const [externalEnrichment, setExternalEnrichment] = useState<any[]>([]);
  const [isLoadingEnrichment, setIsLoadingEnrichment] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>('');
  const [funnelStep, setFunnelStep] = useState<number>(0);

  useEffect(() => {
    // Initialize demo data on mount
    if (typeof window !== 'undefined') {
      initializeDemoData();
    }
    loadData();
  }, [prospectId, emailId]);

  useEffect(() => {
    // Check for funnel or template selection from URL after functions are defined
    if (typeof window === 'undefined') return;
    
    const funnelId = new URLSearchParams(window.location.search).get('funnelId');
    const templateId = new URLSearchParams(window.location.search).get('templateId');
    
    if (funnelId && prospect) {
      handleSelectFunnel(funnelId);
    } else if (templateId && prospect) {
      handleSelectTemplate(templateId);
    }
  }, [prospect]);

  const loadData = () => {
    if (typeof window === 'undefined') return;

    const loadedProspect = getProspectById(prospectId);
    setProspect(loadedProspect);

    const allTemplates = getTemplates();
    setTemplates(allTemplates);

    if (emailId) {
      const email = getEmailById(emailId);
      if (email) {
        setSubject(email.subject);
        setBody(email.body);
        setSelectedTemplateId(email.templateId || '');
      }
    }

    // Auto-load enrichment data if prospect has a clientId
    if (loadedProspect?.clientId) {
      const aggregated = aggregateProspectingDataForClient(loadedProspect.clientId);
      if (aggregated) {
        setEnrichmentData(aggregated);
        setShowSuggestions(true);
        // Auto-populate merge fields when enrichment loads
        setTimeout(() => {
          populateMergeFields();
        }, 100);
      }
      
      // Load enrichment suggestions
      const suggestions = getEnrichmentSuggestions(loadedProspect.clientId);
      setEnrichmentSuggestions(suggestions.filter((s: any) => s.status === 'pending'));
    } else {
      // For prospects without clientId, try to find matching client by company name
      const { getClients } = require('@/lib/clientStorage');
      const clients = getClients();
      const matchingClient = clients.find((c: any) => 
        c.name.toLowerCase() === loadedProspect?.companyName?.toLowerCase() ||
        c.companyName?.toLowerCase() === loadedProspect?.companyName?.toLowerCase()
      );
      
      if (matchingClient) {
        const aggregated = aggregateProspectingDataForClient(matchingClient.id);
        if (aggregated) {
          setEnrichmentData(aggregated);
          setShowSuggestions(true);
          setTimeout(() => {
            populateMergeFields();
          }, 100);
        }
        
        const suggestions = getEnrichmentSuggestions(matchingClient.id);
        setEnrichmentSuggestions(suggestions.filter((s: any) => s.status === 'pending'));
      }
    }
    
    // Load external database enrichment
    const externalData = getMockExternalEnrichment(prospectId, loadedProspect?.companyName);
    setExternalEnrichment(externalData);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = getTemplateById(templateId);
    if (template) {
      setSelectedTemplateId(templateId);
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const handleSelectFunnel = (funnelId: string) => {
    const funnel = getFunnelById(funnelId);
    if (funnel && funnel.templates.length > 0) {
      setSelectedFunnelId(funnelId);
      setFunnelStep(0);
      // Load first template in funnel
      const firstTemplate = funnel.templates.find(t => t.order === 1);
      if (firstTemplate) {
        handleTemplateSelect(firstTemplate.templateId);
      }
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    handleTemplateSelect(templateId);
    setSelectedFunnelId(''); // Clear funnel selection
  };

  const handleNextFunnelStep = () => {
    if (!selectedFunnelId) return;
    const funnel = getFunnelById(selectedFunnelId);
    if (funnel) {
      const nextStep = funnelStep + 1;
      const nextTemplate = funnel.templates.find(t => t.order === nextStep + 1);
      if (nextTemplate) {
        setFunnelStep(nextStep);
        handleTemplateSelect(nextTemplate.templateId);
      }
    }
  };

  const handlePreviousFunnelStep = () => {
    if (!selectedFunnelId || funnelStep === 0) return;
    const funnel = getFunnelById(selectedFunnelId);
    if (funnel) {
      const prevStep = funnelStep - 1;
      const prevTemplate = funnel.templates.find(t => t.order === prevStep + 1);
      if (prevTemplate) {
        setFunnelStep(prevStep);
        handleTemplateSelect(prevTemplate.templateId);
      }
    }
  };

  const getDocumentName = (documentId: string): string => {
    const doc = getDocumentById(documentId);
    return doc?.file.name || 'Unknown Document';
  };

  const handleLoadEnrichment = () => {
    if (!prospect) return;

    setIsLoadingEnrichment(true);

    // If prospect is converted, get enrichment from client
    if (prospect.clientId) {
      const aggregated = aggregateProspectingDataForClient(prospect.clientId);
      setEnrichmentData(aggregated);
    }

    // Simulate loading delay
    setTimeout(() => {
      setIsLoadingEnrichment(false);
      populateMergeFields();
    }, 500);
  };

  const populateMergeFields = () => {
    if (!prospect || !enrichmentData) return;

    const firstName = prospect.name.split(' ')[0];
    const companyName = prospect.companyName || '';
    const industry = prospect.industry || '';

    // Replace merge fields in subject
    let populatedSubject = subject
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{industry\}\}/g, industry);

    // Replace merge fields in body
    let populatedBody = body
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{industry\}\}/g, industry);

    // Replace enrichment merge fields
    if (enrichmentData.keyPoints && enrichmentData.keyPoints.length > 0) {
      populatedBody = populatedBody.replace(
        /\{\{keyPoint\}\}/g,
        enrichmentData.keyPoints[0]
      );
    }

    if (enrichmentData.painPoints && enrichmentData.painPoints.length > 0) {
      populatedBody = populatedBody.replace(
        /\{\{painPoint\}\}/g,
        enrichmentData.painPoints[0]
      );
    }

    if (enrichmentData.opportunities && enrichmentData.opportunities.length > 0) {
      populatedBody = populatedBody.replace(
        /\{\{opportunity\}\}/g,
        enrichmentData.opportunities[0]
      );
    }

    if (enrichmentData.templateSnippets) {
      if (enrichmentData.templateSnippets.valueProposition) {
        populatedBody = populatedBody.replace(
          /\{\{valueProposition\}\}/g,
          enrichmentData.templateSnippets.valueProposition
        );
      }
      if (enrichmentData.templateSnippets.callToAction) {
        populatedBody = populatedBody.replace(
          /\{\{callToAction\}\}/g,
          enrichmentData.templateSnippets.callToAction
        );
      }
    }

    setSubject(populatedSubject);
    setBody(populatedBody);
  };

  const handleInsertSnippet = (snippet: string) => {
    const textarea = document.querySelector('textarea[name="body"]') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + snippet + after;
      setBody(newText);
      
      // Set cursor position after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + snippet.length, start + snippet.length);
      }, 0);
    } else {
      setBody(body + '\n\n' + snippet);
    }
  };

  const handleAcceptExternalEnrichment = (enrichment: any) => {
    // Insert the snippet into the email body
    handleInsertSnippet(enrichment.snippet);
    
    // Mark as used (could store this in state or localStorage)
    setExternalEnrichment(prev => 
      prev.map(item => 
        item.id === enrichment.id 
          ? { ...item, used: true }
          : item
      )
    );
  };

  const handleSave = () => {
    if (!prospect) return;

    const emailData: Partial<ProspectingEmail> = {
      prospectId: prospect.id,
      clientId: prospect.clientId,
      templateId: selectedTemplateId || undefined,
      subject,
      body,
      status: 'draft',
      enrichmentSummary: enrichmentData ? {
        keyPoints: enrichmentData.keyPoints,
        painPoints: enrichmentData.painPoints,
        opportunities: enrichmentData.opportunities,
      } : undefined,
    };

    if (emailId) {
      updateEmailDraft(emailId, emailData);
    } else {
      const newEmail = createEmailDraft(
        prospect.id,
        prospect.clientId,
        selectedTemplateId || undefined,
        enrichmentData ? {
          keyPoints: enrichmentData.keyPoints,
          painPoints: enrichmentData.painPoints,
          opportunities: enrichmentData.opportunities,
        } : undefined
      );
      // Update with subject and body
      updateEmailDraft(newEmail.id, {
        subject,
        body,
        templateId: selectedTemplateId || undefined,
      });
    }

    router.push(`/prospects/${prospectId}`);
  };

  const handleSend = () => {
    if (!prospect) return;

    const emailData: Partial<ProspectingEmail> = {
      prospectId: prospect.id,
      clientId: prospect.clientId,
      templateId: selectedTemplateId || undefined,
      subject,
      body,
      status: 'sent',
      enrichmentSummary: enrichmentData ? {
        keyPoints: enrichmentData.keyPoints,
        painPoints: enrichmentData.painPoints,
        opportunities: enrichmentData.opportunities,
      } : undefined,
    };

    if (emailId) {
      approveEmailDraft(emailId);
      updateEmailDraft(emailId, emailData);
    } else {
      const newEmail = createEmailDraft(
        prospect.id,
        prospect.clientId,
        selectedTemplateId || undefined,
        enrichmentData ? {
          keyPoints: enrichmentData.keyPoints,
          painPoints: enrichmentData.painPoints,
          opportunities: enrichmentData.opportunities,
        } : undefined
      );
      approveEmailDraft(newEmail.id);
      updateEmailDraft(newEmail.id, emailData);
    }

    // Update prospect last contact date
    const { updateProspect } = require('@/lib/prospectStorage');
    updateProspect(prospectId, {
      status: 'contacted',
      lastContactDate: new Date().toISOString(),
    });

    router.push(`/prospects/${prospectId}`);
  };

  if (!prospect) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Prospect not found.</p>
            <Button onClick={() => router.push('/prospects')} className="mt-4">
              Back to Prospects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push(`/prospects/${prospectId}`)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Prospect
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Compose Email</h1>
          <p className="mt-2 text-gray-600">
            To: {prospect.name} {prospect.email && `<${prospect.email}>`}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Template Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Select Template</CardTitle>
                    <CardDescription>Choose a base template or funnel to start from</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/templates?prospectType=${prospect?.status === 'new' ? 'new-prospect' : prospect?.status === 'contacted' || prospect?.status === 'responded' ? 'existing-prospect' : 'all'}&returnUrl=/prospects/${prospectId}/email`)}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Template Library
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedFunnelId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-blue-900 text-sm">
                          Using Funnel: {getFunnelById(selectedFunnelId)?.name}
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          Step {funnelStep + 1} of {getFunnelById(selectedFunnelId)?.templates.length}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handlePreviousFunnelStep}
                          disabled={funnelStep === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleNextFunnelStep}
                          disabled={funnelStep >= (getFunnelById(selectedFunnelId)?.templates.length || 1) - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Enrichment Loader */}
            {prospect.clientId && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Enrichment Data
                  </CardTitle>
                  <CardDescription>
                    Load intelligence from uploaded documents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!enrichmentData ? (
                    <Button onClick={handleLoadEnrichment} disabled={isLoadingEnrichment}>
                      {isLoadingEnrichment ? 'Loading...' : 'Load Enrichment'}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Sparkles className="w-3 h-3" />
                        Enrichment Loaded
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEnrichmentData(null);
                          handleLoadEnrichment();
                        }}
                      >
                        Reload
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Email Form */}
            <Card>
              <CardHeader>
                <CardTitle>Email Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="body">Body</Label>
                  <Textarea
                    id="body"
                    name="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Email body..."
                    rows={15}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </Button>
              <Button onClick={handleSend}>
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </Button>
            </div>
          </div>

          {/* Suggestions Sidebar */}
          <div className="space-y-6">
            {enrichmentData && showSuggestions && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Enrichment Suggestions</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSuggestions(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {enrichmentData.keyPoints && enrichmentData.keyPoints.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-yellow-600" />
                        <Label className="text-sm font-semibold">Key Points</Label>
                      </div>
                      <div className="space-y-1">
                        {enrichmentData.keyPoints.slice(0, 3).map((point: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleInsertSnippet(point)}
                            className="w-full text-left text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                          >
                            {point}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {enrichmentData.painPoints && enrichmentData.painPoints.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <Label className="text-sm font-semibold">Pain Points</Label>
                      </div>
                      <div className="space-y-1">
                        {enrichmentData.painPoints.slice(0, 3).map((point: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleInsertSnippet(point)}
                            className="w-full text-left text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                          >
                            {point}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {enrichmentData.opportunities && enrichmentData.opportunities.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <Label className="text-sm font-semibold">Opportunities</Label>
                      </div>
                      <div className="space-y-1">
                        {enrichmentData.opportunities.slice(0, 3).map((opp: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleInsertSnippet(opp)}
                            className="w-full text-left text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                          >
                            {opp}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {enrichmentData.templateSnippets && (
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Template Snippets</Label>
                      {enrichmentData.templateSnippets.valueProposition && (
                        <button
                          onClick={() => handleInsertSnippet(enrichmentData.templateSnippets.valueProposition)}
                          className="w-full text-left text-xs p-2 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors mb-1"
                        >
                          Value Prop: {enrichmentData.templateSnippets.valueProposition}
                        </button>
                      )}
                      {enrichmentData.templateSnippets.callToAction && (
                        <button
                          onClick={() => handleInsertSnippet(enrichmentData.templateSnippets.callToAction)}
                          className="w-full text-left text-xs p-2 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                        >
                          CTA: {enrichmentData.templateSnippets.callToAction}
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!showSuggestions && (
              <Button
                variant="outline"
                onClick={() => setShowSuggestions(true)}
                className="w-full"
              >
                Show Suggestions
              </Button>
            )}

            {/* Enrichment Suggestions */}
            {(enrichmentSuggestions.length > 0 || externalEnrichment.length > 0) && showSuggestions && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile Enrichment</CardTitle>
                  <CardDescription className="text-xs">
                    Suggested updates from documents and external databases
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="contacts" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="contacts" className="text-xs">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Contact Info
                        {enrichmentSuggestions.length > 0 && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {enrichmentSuggestions.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="projects" className="text-xs">
                        <Database className="w-3 h-3 mr-1" />
                        Project Info
                        {externalEnrichment.length > 0 && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {externalEnrichment.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    
                    {/* Contacts Tab */}
                    <TabsContent value="contacts" className="space-y-3 mt-4">
                      {enrichmentSuggestions.length > 0 ? (
                        enrichmentSuggestions.slice(0, 5).map((suggestion: any) => (
                          <EnrichmentSuggestionCard
                            key={suggestion.id}
                            suggestion={suggestion}
                            onAccept={() => {
                              if (prospect?.clientId) {
                                acceptEnrichmentSuggestion(prospect.clientId, suggestion.id);
                                // Reload suggestions after accepting
                                const suggestions = getEnrichmentSuggestions(prospect.clientId);
                                setEnrichmentSuggestions(suggestions.filter((s: any) => s.status === 'pending'));
                              }
                            }}
                            onReject={() => {
                              if (prospect?.clientId) {
                                rejectEnrichmentSuggestion(prospect.clientId, suggestion.id);
                                // Reload suggestions after rejecting
                                const suggestions = getEnrichmentSuggestions(prospect.clientId);
                                setEnrichmentSuggestions(suggestions.filter((s: any) => s.status === 'pending'));
                              }
                            }}
                            documentName={getDocumentName(suggestion.documentId)}
                          />
                        ))
                      ) : (
                        <div className="text-center text-sm text-gray-500 py-4">
                          No contact enrichment suggestions available
                        </div>
                      )}
                    </TabsContent>
                    
                    {/* Projects Tab */}
                    <TabsContent value="projects" className="space-y-3 mt-4">
                      {externalEnrichment.length > 0 ? (
                        externalEnrichment.map((enrichment: any) => (
                          <div
                            key={enrichment.id}
                            className={`border rounded-lg p-3 space-y-2 ${
                              enrichment.used ? 'bg-gray-50 opacity-60' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {enrichment.type === 'loan' && <TrendingUp className="w-4 h-4 text-green-600" />}
                                  {enrichment.type === 'project' && <Lightbulb className="w-4 h-4 text-blue-600" />}
                                  {enrichment.type === 'announcement' && <AlertCircle className="w-4 h-4 text-orange-600" />}
                                  {enrichment.type === 'news' && <BookOpen className="w-4 h-4 text-purple-600" />}
                                  <span className="font-semibold text-sm">{enrichment.title}</span>
                                  {enrichment.used && (
                                    <Badge variant="outline" className="text-xs">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Added
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 mb-2">{enrichment.description}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span>{enrichment.source}</span>
                                  <span>•</span>
                                  <span>{new Date(enrichment.date).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span className="text-green-600">{Math.round(enrichment.confidence * 100)}% confidence</span>
                                </div>
                              </div>
                            </div>
                            {!enrichment.used && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => handleAcceptExternalEnrichment(enrichment)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add to Email
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-sm text-gray-500 py-4">
                          No external database enrichment available
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Merge Fields Reference */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Merge Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;firstName&#125;&#125;</code> - First name</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;companyName&#125;&#125;</code> - Company name</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;industry&#125;&#125;</code> - Industry</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;keyPoint&#125;&#125;</code> - Key point</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;painPoint&#125;&#125;</code> - Pain point</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;opportunity&#125;&#125;</code> - Opportunity</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;valueProposition&#125;&#125;</code> - Value prop</div>
                  <div><code className="bg-gray-100 px-1 rounded">&#123;&#123;callToAction&#125;&#125;</code> - Call to action</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

