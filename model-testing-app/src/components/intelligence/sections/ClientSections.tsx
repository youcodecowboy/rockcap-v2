'use client';

import { useMemo, useState } from 'react';
import { Building2, Wallet, TrendingUp, Users, MessageSquare, FileText, Database, FolderOpen, Sparkles, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IntelligenceSection } from '../IntelligenceSection';
import { Field, KeyPersonRow, DocumentSummaryCard, MeetingSummaryCard, formatCurrency } from '../SharedComponents';
import { categorizeFields } from '../types';
import {
  clientBasicFields,
  clientFinancialFields,
  borrowerProfileFields,
  lenderProfileFields,
} from '../fieldDefinitions';
import type { KnownField, MissingField } from '../types';

// ============================================================================
// CLIENT BASIC INFO SECTION
// ============================================================================

interface ClientBasicInfoSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ClientBasicInfoSection({ localData, updateField }: ClientBasicInfoSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, clientBasicFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Basic Information</h3>
        <p className="text-sm text-gray-500">Company identity, contacts, and addresses</p>
      </div>

      <IntelligenceSection
        title="Company & Contact Details"
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
// CLIENT FINANCIAL SECTION
// ============================================================================

interface ClientFinancialSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
}

export function ClientFinancialSection({ localData, updateField }: ClientFinancialSectionProps) {
  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, clientFinancialFields);
  }, [localData]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Financial Information</h3>
        <p className="text-sm text-gray-500">Banking details and wire information</p>
      </div>

      <IntelligenceSection
        title="Banking Details"
        icon={<Wallet className="w-5 h-5 text-gray-500" />}
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
// CLIENT PROFILE SECTION (Borrower or Lender)
// ============================================================================

interface ClientProfileSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
  isLender: boolean;
}

export function ClientProfileSection({ localData, updateField, isLender }: ClientProfileSectionProps) {
  const profileFields = isLender ? lenderProfileFields : borrowerProfileFields;

  const { known, missing } = useMemo(() => {
    return categorizeFields(localData, profileFields);
  }, [localData, profileFields]);

  const handleEditField = (key: string, value: string) => {
    const [section, field] = key.split('.');
    updateField(section, field, value);
  };

  if (isLender) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Lender Profile</h3>
          <p className="text-sm text-gray-500">Lending criteria and preferences</p>
        </div>

        <IntelligenceSection
          title="Deal Parameters"
          icon={<TrendingUp className="w-5 h-5 text-gray-500" />}
          knownFields={known}
          missingFields={missing}
          onEditField={handleEditField}
          onAddField={handleEditField}
          gridCols={2}
        />

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-4">Preferences</h4>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Property Types</label>
              <p className="text-xs text-gray-500 mb-1">Comma-separated</p>
              <Input
                value={localData.lenderProfile?.propertyTypes?.join(', ') || ''}
                onChange={(e) => updateField('lenderProfile', 'propertyTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="residential, commercial, mixed-use"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Loan Types</label>
              <p className="text-xs text-gray-500 mb-1">Comma-separated</p>
              <Input
                value={localData.lenderProfile?.loanTypes?.join(', ') || ''}
                onChange={(e) => updateField('lenderProfile', 'loanTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="bridge, development, term"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Geographic Regions</label>
              <p className="text-xs text-gray-500 mb-1">Comma-separated</p>
              <Input
                value={localData.lenderProfile?.geographicRegions?.join(', ') || ''}
                onChange={(e) => updateField('lenderProfile', 'geographicRegions', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="London, South East, Midlands"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-4">Relationship Notes</h4>
          <Textarea
            value={localData.lenderProfile?.relationshipNotes || ''}
            onChange={(e) => updateField('lenderProfile', 'relationshipNotes', e.target.value)}
            placeholder="Notes about working with this lender..."
            rows={4}
            className="text-sm"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Borrower Profile</h3>
        <p className="text-sm text-gray-500">Development experience and capabilities</p>
      </div>

      <IntelligenceSection
        title="Development Experience"
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
// CLIENT KEY PEOPLE SECTION
// ============================================================================

interface ClientKeyPeopleSectionProps {
  localData: any;
  addKeyPerson: () => void;
  updateKeyPerson: (index: number, field: string, value: any) => void;
  removeKeyPerson: (index: number) => void;
}

export function ClientKeyPeopleSection({ localData, addKeyPerson, updateKeyPerson, removeKeyPerson }: ClientKeyPeopleSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Key People</h3>
          <p className="text-sm text-gray-500">Contacts and decision makers</p>
        </div>
        <Button variant="outline" size="sm" onClick={addKeyPerson}>
          <Plus className="w-4 h-4 mr-2" />
          Add Person
        </Button>
      </div>

      <div className="space-y-3">
        {localData.keyPeople?.length > 0 ? (
          localData.keyPeople.map((person: any, index: number) => (
            <KeyPersonRow
              key={index}
              person={person}
              onUpdate={(field, value) => updateKeyPerson(index, field, value)}
              onRemove={() => removeKeyPerson(index)}
            />
          ))
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No key people added yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={addKeyPerson}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Person
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CLIENT MEETINGS SECTION
// ============================================================================

interface ClientMeetingsSectionProps {
  meetingNotes: any[];
}

export function ClientMeetingsSection({ meetingNotes }: ClientMeetingsSectionProps) {
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
                <Sparkles className="w-4 h-4 text-blue-600" />
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
// CLIENT DOCUMENTS SECTION
// ============================================================================

interface ClientDocumentsSectionProps {
  documents: any[];
  documentsByCategory: Record<string, any[]>;
}

export function ClientDocumentsSection({ documents, documentsByCategory }: ClientDocumentsSectionProps) {
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
// CLIENT DATA LIBRARY SECTION
// ============================================================================

interface ClientDataLibrarySectionProps {
  localData: any;
}

export function ClientDataLibrarySection({ localData }: ClientDataLibrarySectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Data Library Summary</h3>
          <p className="text-sm text-gray-500">Aggregated financial data across all projects</p>
        </div>
      </div>

      {localData.dataLibraryAggregate && localData.dataLibraryAggregate.totalItemCount > 0 ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-blue-600">Total Development Cost</p>
                <p className="text-xl font-bold text-blue-900">
                  {formatCurrency(localData.dataLibraryAggregate.totalDevelopmentCostAllProjects || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Projects</p>
                <p className="text-xl font-bold text-blue-900">
                  {localData.dataLibraryAggregate.projectCount || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Source Documents</p>
                <p className="text-xl font-bold text-blue-900">
                  {localData.dataLibraryAggregate.totalDocumentCount || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Total Items</p>
                <p className="text-xl font-bold text-blue-900">
                  {localData.dataLibraryAggregate.totalItemCount || 0}
                </p>
              </div>
            </div>
            {localData.dataLibraryAggregate.lastSyncedAt && (
              <p className="text-xs text-blue-600">
                Last synced: {new Date(localData.dataLibraryAggregate.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>

          {localData.projectSummaries && localData.projectSummaries.some((p: any) => p.dataSummary) && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4">By Project</h4>
              <div className="space-y-3">
                {localData.projectSummaries
                  .filter((p: any) => p.dataSummary)
                  .map((project: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">{project.projectName}</span>
                        <span className="text-xs text-gray-400">({project.dataSummary?.itemCount || 0} items)</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(project.dataSummary?.totalDevelopmentCost || 0)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {localData.dataLibraryAggregate.categoryTotals?.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4">By Category</h4>
              <div className="space-y-2">
                {localData.dataLibraryAggregate.categoryTotals.map((cat: any, index: number) => (
                  <div key={index} className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">{cat.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(cat.total)}</span>
                      <span className="text-xs text-gray-400">({cat.itemCount} items)</span>
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
          <p className="text-gray-500">No extracted data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Upload spreadsheets with extraction enabled to populate this section
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CLIENT AI INSIGHTS SECTION
// ============================================================================

interface ClientAIInsightsSectionProps {
  localData: any;
  updateField: (section: string, field: string, value: any) => void;
  clientId: string;
}

export function ClientAIInsightsSection({ localData, updateField, clientId }: ClientAIInsightsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInsights = async () => {
    setIsGenerating(true);
    try {
      // Build context from existing data
      const context = buildClientContext(localData);

      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          context,
          type: 'client',
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
          <p className="text-sm text-gray-500">AI-generated summaries and key facts</p>
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

      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-100">
        <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          Executive Summary
        </h4>
        <Textarea
          value={localData.aiSummary?.executiveSummary || ''}
          onChange={(e) => updateField('aiSummary', 'executiveSummary', e.target.value)}
          placeholder="AI-generated or manual summary of this client..."
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
          rows={6}
          className="text-sm"
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
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CLIENT PROJECTS SECTION
// ============================================================================

interface ClientProjectsSectionProps {
  localData: any;
}

export function ClientProjectsSection({ localData }: ClientProjectsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Related Projects</h3>
        <p className="text-sm text-gray-500">Projects where this client has a role</p>
      </div>

      {localData.projectSummaries && localData.projectSummaries.length > 0 ? (
        <div className="grid gap-3">
          {localData.projectSummaries.map((project: any, index: number) => (
            <div key={index} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{project.projectName}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Role: <span className="font-medium">{project.role}</span>
                    {project.status && <> • Status: <span className="font-medium">{project.status}</span></>}
                  </p>
                  {project.dataSummary && (
                    <p className="text-xs text-blue-600 mt-1">
                      {formatCurrency(project.dataSummary.totalDevelopmentCost)} • {project.dataSummary.itemCount} data items
                    </p>
                  )}
                </div>
                {project.loanAmount && (
                  <Badge variant="outline" className="text-sm">
                    £{project.loanAmount.toLocaleString()}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No projects linked yet</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildClientContext(data: any): string {
  const parts: string[] = [];

  if (data.identity?.legalName) {
    parts.push(`Company: ${data.identity.legalName}`);
  }
  if (data.identity?.companyNumber) {
    parts.push(`Company Number: ${data.identity.companyNumber}`);
  }
  if (data.primaryContact?.name) {
    parts.push(`Primary Contact: ${data.primaryContact.name} (${data.primaryContact.role || 'N/A'})`);
  }
  if (data.borrowerProfile?.experienceLevel) {
    parts.push(`Experience Level: ${data.borrowerProfile.experienceLevel}`);
  }
  if (data.borrowerProfile?.completedProjects) {
    parts.push(`Completed Projects: ${data.borrowerProfile.completedProjects}`);
  }
  if (data.borrowerProfile?.netWorth) {
    parts.push(`Net Worth: £${data.borrowerProfile.netWorth.toLocaleString()}`);
  }
  if (data.projectSummaries?.length > 0) {
    parts.push(`Active Projects: ${data.projectSummaries.length}`);
    const totalLoanAmount = data.projectSummaries.reduce((sum: number, p: any) => sum + (p.loanAmount || 0), 0);
    if (totalLoanAmount > 0) {
      parts.push(`Total Loan Exposure: £${totalLoanAmount.toLocaleString()}`);
    }
  }

  return parts.join('\n');
}
