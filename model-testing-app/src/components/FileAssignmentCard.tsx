'use client';

import { useState, useEffect } from 'react';
import { AnalysisResult } from '@/types';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, FolderKanban, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { useCreateDocument, useCreateInternalDocument } from '@/lib/documentStorage';
import { useSaveProspectingContext } from '@/lib/prospectingStorage';
import { useCreateEnrichment } from '@/lib/clientStorage';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { generateInternalDocumentCode } from '@/lib/documentCodeUtils';

interface FileAssignmentCardProps {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileStorageId: Id<"_storage"> | undefined;
  analysisResult: AnalysisResult;
  jobId: Id<"fileUploadQueue">;
  onFiled: (documentId: Id<"documents">) => void;
}

export default function FileAssignmentCard({
  fileName,
  fileSize,
  fileType,
  fileStorageId,
  analysisResult,
  jobId,
  onFiled,
}: FileAssignmentCardProps) {
  // Initialize with analysis result
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    analysisResult.clientId || null
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(analysisResult.projectId || null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]); // For multiple projects when internal
  const [isInternal, setIsInternal] = useState(false);
  const [newClientName, setNewClientName] = useState(analysisResult.suggestedClientName || '');
  const [newProjectName, setNewProjectName] = useState(analysisResult.suggestedProjectName || '');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isFiling, setIsFiling] = useState(false);
  const [isFiled, setIsFiled] = useState(false);

  // Convex hooks
  const clients = useClients() || [];
  // For internal docs, we might want all projects, but for now show projects for selected client or empty if no client
  const projects = useProjectsByClient(selectedClientId ? (selectedClientId as Id<"clients">) : undefined) || [];
  const createClient = useCreateClient();
  const createProject = useCreateProject();
  const createDocument = useCreateDocument();
  const createInternalDocument = useCreateInternalDocument();
  const saveProspectingContext = useSaveProspectingContext();
  const createEnrichment = useCreateEnrichment();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const updateJobStatus = useMutation(api.fileQueue.updateJobStatus);
  const job = useQuery(api.fileQueue.getJob, { jobId });
  const selectedClientData = useClient(selectedClientId ? (selectedClientId as Id<"clients">) : undefined);
  const selectedProjectData = useProject(selectedProjectId ? (selectedProjectId as Id<"projects">) : undefined);

  const handleClientSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingClient(true);
      setSelectedClientId(null);
    } else {
      setIsCreatingClient(false);
      setSelectedClientId(value);
      setSelectedProjectId(null); // Reset project when client changes
      setSelectedProjectIds([]); // Reset multiple projects
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const clientId = await createClient({ name: newClientName.trim() });
      setSelectedClientId(clientId as string);
      setIsCreatingClient(false);
      setNewClientName('');
    } catch (error) {
      console.error('Error creating client:', error);
    }
  };

  const handleProjectSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingProject(true);
      setSelectedProjectId(null);
    } else if (value === 'none') {
      setSelectedProjectId(null);
      setIsCreatingProject(false);
    } else {
      setIsCreatingProject(false);
      setSelectedProjectId(value);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    // For internal docs, we can create projects without a client, but we need at least a client for regular docs
    if (!isInternal && !selectedClientId) return;
    
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        clientRoles: selectedClientId 
          ? [{ clientId: selectedClientId as Id<"clients">, role: 'primary' }]
          : [],
      });
      
      if (isInternal) {
        setSelectedProjectIds([...selectedProjectIds, projectId as string]);
      } else {
        setSelectedProjectId(projectId as string);
      }
      setIsCreatingProject(false);
      setNewProjectName('');
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleFileDocument = async () => {
    if (isFiling || isFiled) return;

    setIsFiling(true);
    try {
      if (isInternal) {
        // Create internal document
        const uploadedAt = new Date().toISOString();
        const documentCode = generateInternalDocumentCode(analysisResult.category, uploadedAt);
        
        // Get project names for internal doc
        const projectNames: string[] = [];
        if (selectedProjectIds.length > 0) {
          // We'll need to fetch project names, but for now use empty array
          // The backend will handle this
        }
        
        const internalDocumentId = await createInternalDocument({
          fileStorageId,
          fileName,
          fileSize,
          fileType,
          summary: analysisResult.summary,
          fileTypeDetected: analysisResult.fileType,
          category: analysisResult.category,
          reasoning: analysisResult.reasoning,
          confidence: analysisResult.confidence,
          tokensUsed: analysisResult.tokensUsed,
          linkedClientId: selectedClientId ? (selectedClientId as Id<"clients">) : undefined,
          clientName: selectedClientData?.name || undefined,
          linkedProjectIds: selectedProjectIds.length > 0 
            ? selectedProjectIds.map(id => id as Id<"projects">)
            : undefined,
          projectNames: projectNames.length > 0 ? projectNames : undefined,
          extractedData: analysisResult.extractedData || undefined,
          status: 'completed',
          documentCode,
        });
        
        setIsFiled(true);
        setIsFiling(false);
        // Internal documents don't use the onFiled callback
        return;
      } else {
        // Get userId from job for uploadedBy
        const uploadedBy = job?.userId ? (job.userId as Id<"users">) : undefined;
        
        // Create regular document record
        const documentId = await createDocument({
          fileStorageId,
          fileName,
          fileSize,
          fileType,
          summary: analysisResult.summary,
          fileTypeDetected: analysisResult.fileType,
          category: analysisResult.category,
          reasoning: analysisResult.reasoning,
          confidence: analysisResult.confidence,
          tokensUsed: analysisResult.tokensUsed,
          clientId: selectedClientId ? (selectedClientId as Id<"clients">) : undefined,
          clientName: selectedClientData?.name || analysisResult.clientName || undefined,
          projectId: selectedProjectId ? (selectedProjectId as Id<"projects">) : undefined,
          projectName: selectedProjectData?.name || analysisResult.projectName || undefined,
          suggestedClientName: analysisResult.suggestedClientName || undefined,
          suggestedProjectName: analysisResult.suggestedProjectName || undefined,
          extractedData: analysisResult.extractedData || undefined,
          status: 'completed',
          uploadedBy: uploadedBy,
        });

        // Create enrichment suggestions if any
      if (analysisResult.enrichmentSuggestions && analysisResult.enrichmentSuggestions.length > 0) {
        for (const suggestion of analysisResult.enrichmentSuggestions) {
          try {
            let suggestionType: 'email' | 'phone' | 'address' | 'company' | 'contact' | 'date' | 'other' = 'other';
            
            const typeStr = suggestion.type as string;
            if (typeStr === 'email') {
              suggestionType = 'email';
            } else if (typeStr === 'phone') {
              suggestionType = 'phone';
            } else if (typeStr === 'address') {
              suggestionType = 'address';
            } else if (typeStr === 'company' || typeStr === 'website') {
              suggestionType = 'company';
            } else if (typeStr === 'contactName' || typeStr === 'contact') {
              suggestionType = 'contact';
            } else if (typeStr === 'date') {
              suggestionType = 'date';
            }

            await createEnrichment({
              type: suggestionType,
              field: suggestion.field,
              value: suggestion.value,
              source: suggestion.context || fileName,
              documentId: documentId,
              clientId: selectedClientId ? (selectedClientId as Id<"clients">) : undefined,
              projectId: selectedProjectId ? (selectedProjectId as Id<"projects">) : undefined,
              confidence: suggestion.confidence || 0.8,
            });
          } catch (err) {
            console.error('Failed to create enrichment suggestion:', err);
          }
        }
      }

      // Trigger prospecting context extraction (non-blocking)
      if (selectedClientId) {
        fetch('/api/extract-prospecting-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: documentId,
            clientId: selectedClientId,
            projectId: selectedProjectId,
            fileName: fileName,
            analysisResult: analysisResult,
            textContent: '',
            clientName: selectedClientData?.name || analysisResult.clientName || null,
            projectName: selectedProjectData?.name || analysisResult.projectName || null,
            clientHistory: '',
          }),
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.prospectingContext && saveProspectingContext) {
            const sanitizedRelationshipContext = data.prospectingContext.relationshipContext ? {
              sentiment: data.prospectingContext.relationshipContext.sentiment && 
                         ['positive', 'neutral', 'negative'].includes(data.prospectingContext.relationshipContext.sentiment.toLowerCase())
                ? data.prospectingContext.relationshipContext.sentiment.toLowerCase() as 'positive' | 'neutral' | 'negative'
                : undefined,
              currentStage: data.prospectingContext.relationshipContext.currentStage || undefined,
              relationshipStrength: data.prospectingContext.relationshipContext.relationshipStrength || undefined,
              lastInteraction: data.prospectingContext.relationshipContext.lastInteraction || undefined,
            } : undefined;

            const sanitizedTimeline = data.prospectingContext.timeline ? {
              urgency: data.prospectingContext.timeline.urgency && 
                       ['high', 'medium', 'low'].includes(data.prospectingContext.timeline.urgency.toLowerCase())
                ? data.prospectingContext.timeline.urgency.toLowerCase() as 'high' | 'medium' | 'low'
                : undefined,
              deadlines: data.prospectingContext.timeline.deadlines || undefined,
              milestones: data.prospectingContext.timeline.milestones || undefined,
            } : undefined;

            const sanitizedFinancialContext = data.prospectingContext.financialContext ? {
              budgetMentioned: data.prospectingContext.financialContext.budgetMentioned ?? undefined,
              budgetRange: data.prospectingContext.financialContext.budgetRange || undefined,
              investmentLevel: data.prospectingContext.financialContext.investmentLevel || undefined,
              timeline: data.prospectingContext.financialContext.timeline || undefined,
            } : undefined;

            const sanitizedBusinessContext = data.prospectingContext.businessContext ? {
              industry: data.prospectingContext.businessContext.industry || undefined,
              companySize: data.prospectingContext.businessContext.companySize || undefined,
              growthIndicators: data.prospectingContext.businessContext.growthIndicators || undefined,
              challenges: data.prospectingContext.businessContext.challenges || undefined,
              goals: data.prospectingContext.businessContext.goals || undefined,
            } : undefined;

            const sanitizedCompetitiveMentions = data.prospectingContext.competitiveMentions || undefined;
            const sanitizedTemplateSnippets = data.prospectingContext.templateSnippets ? {
              opening: data.prospectingContext.templateSnippets.opening || undefined,
              valueProposition: data.prospectingContext.templateSnippets.valueProposition || undefined,
              callToAction: data.prospectingContext.templateSnippets.callToAction || undefined,
            } : undefined;

            saveProspectingContext({
              documentId: documentId,
              clientId: selectedClientId ? (selectedClientId as Id<"clients">) : null,
              projectId: selectedProjectId ? (selectedProjectId as Id<"projects">) : null,
              keyPoints: data.prospectingContext.keyPoints || [],
              painPoints: data.prospectingContext.painPoints || [],
              opportunities: data.prospectingContext.opportunities || [],
              decisionMakers: data.prospectingContext.decisionMakers || [],
              businessContext: sanitizedBusinessContext,
              financialContext: sanitizedFinancialContext,
              relationshipContext: sanitizedRelationshipContext,
              competitiveMentions: sanitizedCompetitiveMentions,
              timeline: sanitizedTimeline,
              templateSnippets: sanitizedTemplateSnippets,
              confidence: data.prospectingContext.confidence || 0,
              tokensUsed: data.prospectingContext.tokensUsed,
            });
          }
        })
        .catch(err => {
          console.error('Failed to extract prospecting context:', err);
        });
      }

        // Update job status
        await updateJobStatus({
          jobId,
          status: 'completed',
          progress: 100,
          documentId,
          analysisResult,
        });

        setIsFiled(true);
        setIsFiling(false);
        onFiled(documentId);
      }
    } catch (error) {
      console.error('Error filing document:', error);
      setIsFiling(false);
      alert('Failed to file document. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">File Assignment</h2>
          <p className="text-sm text-gray-600">
            Assign this file to a client and project, or mark it as an internal document
          </p>
        </div>
        {isFiled && (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Filed
          </Badge>
        )}
      </div>

      {/* AI Suggestions */}
      {(analysisResult.suggestedClientName || analysisResult.suggestedProjectName) && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-1">AI Suggestions</p>
          {analysisResult.suggestedClientName && (
            <p className="text-sm text-blue-800">
              Suggested Client: <span className="font-semibold">{analysisResult.suggestedClientName}</span>
            </p>
          )}
          {analysisResult.suggestedProjectName && (
            <p className="text-sm text-blue-800">
              Suggested Project: <span className="font-semibold">{analysisResult.suggestedProjectName}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Mark as Internal Checkbox */}
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input
            type="checkbox"
            id="isInternal"
            checked={isInternal}
            onChange={(e) => {
              setIsInternal(e.target.checked);
              if (!e.target.checked) {
                // Clear multiple project selection when unchecking internal
                setSelectedProjectIds([]);
              }
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="isInternal" className="text-sm font-medium text-gray-700 cursor-pointer">
            Mark as Internal Document
          </label>
          <span className="text-xs text-gray-500 ml-auto">
            {isInternal ? '(Can still link to client/projects)' : ''}
          </span>
        </div>

        {/* Client Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Client {!isInternal && !selectedClientId && <span className="text-red-500">*</span>}
            {isInternal && <span className="text-gray-500 text-xs">(Optional)</span>}
          </label>
          {isCreatingClient ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Enter client name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateClient}
                  disabled={!newClientName.trim()}
                  size="sm"
                >
                  Create Client
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreatingClient(false);
                    setNewClientName(analysisResult.suggestedClientName || '');
                  }}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Select 
              value={selectedClientId || ''} 
              onValueChange={handleClientSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={isInternal ? "Select a client (optional)..." : "Select a client..."} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => {
                  const clientId = (client as any)._id || (client as any).id;
                  return (
                    <SelectItem key={clientId} value={clientId as string}>
                      {client.name}
                    </SelectItem>
                  );
                })}
                {analysisResult.suggestedClientName && (
                  <SelectItem value="new">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      <span>Create: {analysisResult.suggestedClientName}</span>
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Project Selection (if client is selected OR if internal) */}
        {(selectedClientId || isInternal) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isInternal ? 'Projects' : 'Project'} <span className="text-gray-500 text-xs">(Optional{isInternal ? ', can select multiple' : ''})</span>
            </label>
            {isCreatingProject ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    size="sm"
                  >
                    Create Project
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreatingProject(false);
                      setNewProjectName(analysisResult.suggestedProjectName || '');
                    }}
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : isInternal ? (
              // Multiple project selection for internal documents
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-2">
                {projects.length === 0 ? (
                  <p className="text-sm text-gray-500 p-2">No projects available</p>
                ) : (
                  projects.map((project) => {
                    const projectId = ((project as any)._id || (project as any).id) as string;
                    const isSelected = selectedProjectIds.includes(projectId);
                    return (
                      <div key={projectId} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          id={`project-${projectId}`}
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectIds([...selectedProjectIds, projectId]);
                            } else {
                              setSelectedProjectIds(selectedProjectIds.filter(id => id !== projectId));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`project-${projectId}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                          {project.name}
                        </label>
                      </div>
                    );
                  })
                )}
                {analysisResult.suggestedProjectName && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreatingProject(true)}
                    className="w-full mt-2"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create: {analysisResult.suggestedProjectName}
                  </Button>
                )}
              </div>
            ) : (
              <Select value={selectedProjectId || 'none'} onValueChange={handleProjectSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project (client-level document)</SelectItem>
                  {projects.map((project) => {
                    const projectId = (project as any)._id || (project as any).id;
                    return (
                      <SelectItem key={projectId} value={projectId as string}>
                        {project.name}
                      </SelectItem>
                    );
                  })}
                  {analysisResult.suggestedProjectName && (
                    <SelectItem value="new">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        <span>Create: {analysisResult.suggestedProjectName}</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Selected Assignment Display */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex flex-col gap-2 text-sm">
            {isInternal && (
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">Internal Document</span>
              </div>
            )}
            {selectedClientId && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-900">{selectedClientData?.name || 'Loading...'}</span>
              </div>
            )}
            {!isInternal && selectedProjectId && (
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-900">{selectedProjectData?.name || 'Loading...'}</span>
              </div>
            )}
            {isInternal && selectedProjectIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <FolderKanban className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">{selectedProjectIds.length} project(s) selected</span>
              </div>
            )}
            {!isInternal && !selectedClientId && (
              <span className="text-red-500 text-xs">Please select a client</span>
            )}
          </div>
        </div>

        {/* File Button */}
        {!isFiled && (
          <Button
            onClick={handleFileDocument}
            disabled={isFiling}
            className="w-full"
          >
            {isFiling ? 'Filing...' : 'File Document'}
          </Button>
        )}
      </div>
    </div>
  );
}

