'use client';

import { useMemo, useState } from 'react';
import { Building2, MapPin, TrendingUp, Calendar, Home, Users, MessageSquare, FileText, Database, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IntelligenceSection } from '../IntelligenceSection';
import { Field, DocumentSummaryCard, MeetingSummaryCard, formatCurrency } from '../SharedComponents';
import { categorizeFields } from '../types';
import {
  projectOverviewFields,
  projectLocationFields,
  projectFinancialsFields,
  projectTimelineFields,
  projectDevelopmentFields,
} from '../fieldDefinitions';

// ============================================================================
// PROJECT OVERVIEW SECTION
// ============================================================================

interface ProjectOverviewSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectOverviewSection({ localData, updateField }: ProjectOverviewSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, projectOverviewFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Project Overview</h3>
        <p className="text-sm text-gray-500">Basic project information and unit details</p>
      </div>

      <IntelligenceSection
        title="Project Details"
        icon={<Building2 className="w-5 h-5 text-gray-500" />}
        knownFields={known}
        missingFields={missing}
        onEditField={handleEditField}
        onAddField={handleEditField}
        gridCols={2}
      />
    </div>
  );
}

// ============================================================================
// PROJECT LOCATION SECTION
// ============================================================================

interface ProjectLocationSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectLocationSection({ localData, updateField }: ProjectLocationSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, projectLocationFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Location & Title</h3>
        <p className="text-sm text-gray-500">Property location and legal title information</p>
      </div>

      <IntelligenceSection
        title="Location Details"
        icon={<MapPin className="w-5 h-5 text-gray-500" />}
        knownFields={known}
        missingFields={missing}
        onEditField={handleEditField}
        onAddField={handleEditField}
        gridCols={2}
      />
    </div>
  );
}

// ============================================================================
// PROJECT FINANCIALS SECTION
// ============================================================================

interface ProjectFinancialsSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectFinancialsSection({ localData, updateField }: ProjectFinancialsSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, projectFinancialsFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Project Financials</h3>
        <p className="text-sm text-gray-500">Costs, values, and profit projections</p>
      </div>

      <IntelligenceSection
        title="Financial Summary"
        icon={<TrendingUp className="w-5 h-5 text-gray-500" />}
        knownFields={known}
        missingFields={missing}
        onEditField={handleEditField}
        onAddField={handleEditField}
        gridCols={2}
      />
    </div>
  );
}

// ============================================================================
// PROJECT TIMELINE SECTION
// ============================================================================

interface ProjectTimelineSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectTimelineSection({ localData, updateField }: ProjectTimelineSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, projectTimelineFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Project Timeline</h3>
        <p className="text-sm text-gray-500">Key dates and planning status</p>
      </div>

      <IntelligenceSection
        title="Timeline & Planning"
        icon={<Calendar className="w-5 h-5 text-gray-500" />}
        knownFields={known}
        missingFields={missing}
        onEditField={handleEditField}
        onAddField={handleEditField}
        gridCols={2}
      />
    </div>
  );
}

// ============================================================================
// PROJECT DEVELOPMENT SECTION
// ============================================================================

interface ProjectDevelopmentSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectDevelopmentSection({ localData, updateField }: ProjectDevelopmentSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, projectDevelopmentFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Development Details</h3>
        <p className="text-sm text-gray-500">Units, planning, and specifications</p>
      </div>

      <IntelligenceSection
        title="Development Specifications"
        icon={<Home className="w-5 h-5 text-gray-500" />}
        knownFields={known}
        missingFields={missing}
        onEditField={handleEditField}
        onAddField={handleEditField}
        gridCols={2}
      />
    </div>
  );
}

// ============================================================================
// PROJECT KEY PARTIES SECTION
// ============================================================================

interface ProjectKeyPartiesSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ProjectKeyPartiesSection({ localData, updateField }: ProjectKeyPartiesSectionProps) {
  const updateParty = (party: string, data: any) => {
    updateField('keyParties', party, { ...localData.keyParties?.[party], ...data });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Key Parties</h3>
        <p className="text-sm text-gray-500">Borrower, lender, and professional team</p>
      </div>

      <div className="space-y-4">
        {/* Borrower */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Borrower</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.borrower?.name || ''}
              onChange={(e) => updateParty('borrower', { name: e.target.value })}
              placeholder="Company name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.borrower?.contactName || ''}
              onChange={(e) => updateParty('borrower', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.borrower?.contactEmail || ''}
              onChange={(e) => updateParty('borrower', { contactEmail: e.target.value })}
              placeholder="Email"
              type="email"
              className="text-sm col-span-2"
            />
          </div>
        </div>

        {/* Lender */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Lender</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.lender?.name || ''}
              onChange={(e) => updateParty('lender', { name: e.target.value })}
              placeholder="Lender name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.lender?.contactName || ''}
              onChange={(e) => updateParty('lender', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.lender?.contactEmail || ''}
              onChange={(e) => updateParty('lender', { contactEmail: e.target.value })}
              placeholder="Email"
              type="email"
              className="text-sm col-span-2"
            />
          </div>
        </div>

        {/* Solicitor */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Solicitor</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.solicitor?.firm || ''}
              onChange={(e) => updateParty('solicitor', { firm: e.target.value })}
              placeholder="Firm name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.solicitor?.contactName || ''}
              onChange={(e) => updateParty('solicitor', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.solicitor?.contactEmail || ''}
              onChange={(e) => updateParty('solicitor', { contactEmail: e.target.value })}
              placeholder="Email"
              type="email"
              className="text-sm col-span-2"
            />
          </div>
        </div>

        {/* Contractor */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Contractor</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.contractor?.firm || ''}
              onChange={(e) => updateParty('contractor', { firm: e.target.value })}
              placeholder="Firm name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.contractor?.contactName || ''}
              onChange={(e) => updateParty('contractor', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.contractor?.contractValue?.toString() || ''}
              onChange={(e) => updateParty('contractor', {
                contractValue: e.target.value ? parseFloat(e.target.value) : undefined
              })}
              placeholder="Contract value (£)"
              type="number"
              className="text-sm col-span-2"
            />
          </div>
        </div>

        {/* Valuer */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Valuer</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.valuer?.firm || ''}
              onChange={(e) => updateParty('valuer', { firm: e.target.value })}
              placeholder="Firm name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.valuer?.contactName || ''}
              onChange={(e) => updateParty('valuer', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
          </div>
        </div>

        {/* Monitoring Surveyor */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Monitoring Surveyor</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={localData.keyParties?.monitoringSurveyor?.firm || ''}
              onChange={(e) => updateParty('monitoringSurveyor', { firm: e.target.value })}
              placeholder="Firm name"
              className="text-sm"
            />
            <Input
              value={localData.keyParties?.monitoringSurveyor?.contactName || ''}
              onChange={(e) => updateParty('monitoringSurveyor', { contactName: e.target.value })}
              placeholder="Contact name"
              className="text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PROJECT MEETINGS SECTION
// ============================================================================

interface ProjectMeetingsSectionProps {
  meetingNotes: any[];
}

export function ProjectMeetingsSection({ meetingNotes }: ProjectMeetingsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Meeting Timeline</h3>
        <p className="text-sm text-gray-500">
          {meetingNotes.length} meeting{meetingNotes.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      {meetingNotes.length > 0 ? (
        <div className="relative">
          {meetingNotes[0] && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h4 className="font-medium text-gray-900">Most Recent</h4>
              </div>
              <MeetingSummaryCard meeting={meetingNotes[0]} isLatest={true} />
            </div>
          )}

          {meetingNotes.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-900">Previous Meetings</h4>
              </div>
              <div className="ml-1.5">
                {meetingNotes.slice(1).map((meeting: any) => (
                  <MeetingSummaryCard
                    key={meeting._id}
                    meeting={meeting}
                    isLatest={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No meeting notes yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Upload meeting transcripts or create notes with &quot;meeting&quot; or &quot;call&quot; in the title
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PROJECT DOCUMENTS SECTION
// ============================================================================

interface ProjectDocumentsSectionProps {
  documents: any[];
  documentsByCategory: Record<string, any[]>;
}

export function ProjectDocumentsSection({ documents, documentsByCategory }: ProjectDocumentsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Document Summaries</h3>
        <p className="text-sm text-gray-500">
          Intelligence extracted from {documents.length} uploaded documents
        </p>
      </div>

      {documents.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(documentsByCategory).map(([category, docs]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-gray-500" />
                <h4 className="font-medium text-gray-900">{category}</h4>
                <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
              </div>
              <div className="grid gap-3">
                {docs.map((doc: any) => (
                  <DocumentSummaryCard key={doc._id} doc={doc} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No documents uploaded yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Upload documents to see AI-generated summaries here
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PROJECT DATA LIBRARY SECTION
// ============================================================================

interface ProjectDataLibrarySectionProps {
  localData: any;
  onSync: () => Promise<void>;
  isSyncing: boolean;
}

export function ProjectDataLibrarySection({ localData, onSync, isSyncing }: ProjectDataLibrarySectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Data Library Summary</h3>
          <p className="text-sm text-gray-500">Aggregated financial data from extracted documents</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync Now
        </Button>
      </div>

      {localData.dataLibrarySummary ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-blue-600">Total Development Cost</p>
                <p className="text-xl font-bold text-blue-900">
                  {formatCurrency(localData.dataLibrarySummary.totalDevelopmentCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Source Documents</p>
                <p className="text-xl font-bold text-blue-900">
                  {localData.dataLibrarySummary.sourceDocumentCount || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Total Items</p>
                <p className="text-xl font-bold text-blue-900">
                  {localData.dataLibrarySummary.totalItemCount || 0}
                </p>
              </div>
            </div>
            {localData.dataLibrarySummary.lastSyncedAt && (
              <p className="text-xs text-blue-600">
                Last synced: {new Date(localData.dataLibrarySummary.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Cost Breakdown */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-4">Cost Breakdown</h4>
            <div className="space-y-3">
              {localData.dataLibrarySummary.landCost && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Land Cost</span>
                  <span className="font-medium">{formatCurrency(localData.dataLibrarySummary.landCost)}</span>
                </div>
              )}
              {localData.dataLibrarySummary.constructionCost && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Construction Cost</span>
                  <span className="font-medium">{formatCurrency(localData.dataLibrarySummary.constructionCost)}</span>
                </div>
              )}
              {localData.dataLibrarySummary.professionalFees && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Professional Fees</span>
                  <span className="font-medium">{formatCurrency(localData.dataLibrarySummary.professionalFees)}</span>
                </div>
              )}
              {localData.dataLibrarySummary.contingency && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Contingency</span>
                  <span className="font-medium">{formatCurrency(localData.dataLibrarySummary.contingency)}</span>
                </div>
              )}
              {localData.dataLibrarySummary.financeCosts && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Finance Costs</span>
                  <span className="font-medium">{formatCurrency(localData.dataLibrarySummary.financeCosts)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Category Totals */}
          {localData.dataLibrarySummary.categoryTotals?.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4">By Category</h4>
              <div className="space-y-2">
                {localData.dataLibrarySummary.categoryTotals.map((cat: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-gray-600">{cat.category}</span>
                    <div className="text-right">
                      <span className="font-medium">{formatCurrency(cat.total)}</span>
                      <span className="text-xs text-gray-400 ml-2">({cat.itemCount} items)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No data library items yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Extract data from documents to see aggregated summaries here
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PROJECT AI INSIGHTS SECTION
// ============================================================================

interface ProjectAIInsightsSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
  projectId: string;
}

export function ProjectAIInsightsSection({ localData, updateField, projectId }: ProjectAIInsightsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInsights = async () => {
    setIsGenerating(true);
    try {
      const context = buildProjectContext(localData);

      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          context,
          type: 'project',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.executiveSummary) {
          updateField('aiSummary', 'executiveSummary', data.executiveSummary);
        }
        if (data.keyFacts) {
          updateField('aiSummary', 'keyFacts', data.keyFacts);
        }
        if (data.risks) {
          updateField('aiSummary', 'risks', data.risks);
        }
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">AI Insights</h3>
          <p className="text-sm text-gray-500">AI-generated summaries, key facts, and risks</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={generateInsights}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Insights
            </>
          )}
        </Button>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100">
        <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          Executive Summary
        </h4>
        <Textarea
          value={localData.aiSummary?.executiveSummary || ''}
          onChange={(e) => updateField('aiSummary', 'executiveSummary', e.target.value)}
          placeholder="AI-generated or manual summary of this project..."
          rows={4}
          className="text-sm bg-white"
        />
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Key Facts</h4>
        <p className="text-xs text-gray-500 mb-3">One per line</p>
        <Textarea
          value={localData.aiSummary?.keyFacts?.join('\n') || ''}
          onChange={(e) => updateField('aiSummary', 'keyFacts', e.target.value.split('\n').filter(Boolean))}
          placeholder="Key fact 1&#10;Key fact 2&#10;Key fact 3"
          rows={5}
          className="text-sm"
        />
      </div>

      <div className="bg-red-50 rounded-lg p-4 border border-red-100">
        <h4 className="font-medium text-gray-900 mb-2">Risks & Concerns</h4>
        <p className="text-xs text-gray-500 mb-3">One per line</p>
        <Textarea
          value={localData.aiSummary?.risks?.join('\n') || ''}
          onChange={(e) => updateField('aiSummary', 'risks', e.target.value.split('\n').filter(Boolean))}
          placeholder="Risk 1&#10;Risk 2&#10;Risk 3"
          rows={5}
          className="text-sm bg-white"
        />
      </div>

      {/* Show extracted insights if available */}
      {localData.aiInsights && (
        <div className="space-y-4">
          {localData.aiInsights.keyFindings?.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Key Findings from Documents</h4>
              <ul className="space-y-1">
                {localData.aiInsights.keyFindings.map((finding: string, i: number) => (
                  <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {localData.aiInsights.risks?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">Identified Risks</h4>
              <ul className="space-y-1">
                {localData.aiInsights.risks.map((risk: any, i: number) => (
                  <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    {typeof risk === 'string' ? risk : risk.risk}
                    {risk.severity && (
                      <Badge variant={risk.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px] ml-1">
                        {risk.severity}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildProjectContext(data: any): string {
  const parts: string[] = [];

  if (data.overview?.projectName) {
    parts.push(`Project: ${data.overview.projectName}`);
  }
  if (data.overview?.projectType) {
    parts.push(`Type: ${data.overview.projectType}`);
  }
  if (data.location?.address) {
    parts.push(`Location: ${data.location.address}`);
  }
  if (data.financials?.totalDevelopmentCost) {
    parts.push(`TDC: £${data.financials.totalDevelopmentCost.toLocaleString()}`);
  }
  if (data.financials?.gdv) {
    parts.push(`GDV: £${data.financials.gdv.toLocaleString()}`);
  }
  if (data.financials?.profitMargin) {
    parts.push(`Profit Margin: ${data.financials.profitMargin}%`);
  }
  if (data.development?.totalUnits) {
    parts.push(`Units: ${data.development.totalUnits}`);
  }
  if (data.timeline?.planningStatus) {
    parts.push(`Planning Status: ${data.timeline.planningStatus}`);
  }

  return parts.join('\n');
}
