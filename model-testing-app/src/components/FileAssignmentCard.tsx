'use client';

import { useState, useEffect } from 'react';
import { AnalysisResult } from '@/types';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Input, Select, Panel, Field } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Building2, FolderKanban, CheckCircle2, Plus } from 'lucide-react';
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
  const colors = useColors();
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

        // Trigger Fast Pass codification if we have extracted data (non-blocking)
        if (analysisResult.extractedData && documentId) {
          fetch('/api/codify-extraction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'fast-pass',
              documentId: documentId,
              projectId: selectedProjectId,
              extractedData: analysisResult.extractedData,
            }),
          }).then(response => {
            if (response.ok) {
              console.log('[FileAssignment] Fast Pass codification triggered for document:', documentId);
            } else {
              console.warn('[FileAssignment] Fast Pass codification failed for document:', documentId);
            }
          }).catch(err => {
            console.error('[FileAssignment] Error triggering Fast Pass:', err);
          });
        }

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
    <div style={{ marginBottom: 24 }}>
      <Panel
        title="File Assignment"
        actions={
          isFiled ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, textTransform: 'uppercase', background: `${colors.accent.green}20`, color: colors.accent.green, border: `1px solid ${colors.accent.green}40` }}>
              <CheckCircle2 size={11} />
              Filed
            </span>
          ) : undefined
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
          Assign this file to a client and project, or mark it as an internal document
        </p>

        {/* AI Suggestions */}
        {(analysisResult.suggestedClientName || analysisResult.suggestedProjectName) && (
          <div style={{ marginBottom: 16, padding: 12, background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40`, borderRadius: 4 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: colors.accent.blue, marginBottom: 4 }}>AI Suggestions</p>
            {analysisResult.suggestedClientName && (
              <p style={{ fontSize: 12, color: colors.text.secondary }}>
                Suggested Client: <span style={{ fontWeight: 600 }}>{analysisResult.suggestedClientName}</span>
              </p>
            )}
            {analysisResult.suggestedProjectName && (
              <p style={{ fontSize: 12, color: colors.text.secondary }}>
                Suggested Project: <span style={{ fontWeight: 600 }}>{analysisResult.suggestedProjectName}</span>
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mark as Internal Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
            <button
              role="checkbox"
              aria-checked={isInternal}
              onClick={() => {
                const next = !isInternal;
                setIsInternal(next);
                if (!next) setSelectedProjectIds([]);
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                border: `1px solid ${isInternal ? colors.accent.blue : colors.border.mid}`,
                background: isInternal ? colors.accent.blue : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {isInternal && <CheckCircle2 size={12} style={{ color: '#fff' }} />}
            </button>
            <span
              onClick={() => {
                const next = !isInternal;
                setIsInternal(next);
                if (!next) setSelectedProjectIds([]);
              }}
              style={{ fontSize: 12, fontWeight: 500, color: colors.text.secondary, cursor: 'pointer' }}
            >
              Mark as Internal Document
            </span>
            <span style={{ fontSize: 10, color: colors.text.muted, marginLeft: 'auto' }}>
              {isInternal ? '(Can still link to client/projects)' : ''}
            </span>
          </div>

          {/* Client Selection */}
          <Field label={`Client${isInternal ? ' (optional)' : ''}`}>
            {isCreatingClient ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Enter client name" autoFocus />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" onClick={handleCreateClient} disabled={!newClientName.trim()}>
                    Create Client
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setIsCreatingClient(false); setNewClientName(analysisResult.suggestedClientName || ''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Select value={selectedClientId || ''} onChange={(e) => handleClientSelect(e.target.value)}>
                <option value="" disabled>{isInternal ? 'Select a client (optional)...' : 'Select a client...'}</option>
                {clients.map((client) => {
                  const clientId = (client as any)._id || (client as any).id;
                  return (
                    <option key={clientId} value={clientId as string}>
                      {client.name}
                    </option>
                  );
                })}
                {analysisResult.suggestedClientName && (
                  <option value="new">+ Create: {analysisResult.suggestedClientName}</option>
                )}
              </Select>
            )}
          </Field>

          {/* Project Selection (if client is selected OR if internal) */}
          {(selectedClientId || isInternal) && (
            <Field label={`${isInternal ? 'Projects' : 'Project'} (optional${isInternal ? ', can select multiple' : ''})`}>
              {isCreatingProject ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Enter project name" autoFocus />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                      Create Project
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => { setIsCreatingProject(false); setNewProjectName(analysisResult.suggestedProjectName || ''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : isInternal ? (
                // Multiple project selection for internal documents
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 192, overflowY: 'auto', border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 8 }}>
                  {projects.length === 0 ? (
                    <p style={{ fontSize: 12, color: colors.text.muted, padding: 8 }}>No projects available</p>
                  ) : (
                    projects.map((project) => {
                      const projectId = ((project as any)._id || (project as any).id) as string;
                      const isSelected = selectedProjectIds.includes(projectId);
                      return (
                        <div
                          key={projectId}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedProjectIds(selectedProjectIds.filter(id => id !== projectId));
                            } else {
                              setSelectedProjectIds([...selectedProjectIds, projectId]);
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 4, cursor: 'pointer' }}
                        >
                          <span
                            role="checkbox"
                            aria-checked={isSelected}
                            style={{
                              width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                              border: `1px solid ${isSelected ? colors.accent.blue : colors.border.mid}`,
                              background: isSelected ? colors.accent.blue : 'transparent',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {isSelected && <CheckCircle2 size={12} style={{ color: '#fff' }} />}
                          </span>
                          <span style={{ fontSize: 12, color: colors.text.secondary, flex: 1 }}>{project.name}</span>
                        </div>
                      );
                    })
                  )}
                  {analysisResult.suggestedProjectName && (
                    <Button variant="secondary" size="sm" onClick={() => setIsCreatingProject(true)} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
                      <Plus size={14} />
                      Create: {analysisResult.suggestedProjectName}
                    </Button>
                  )}
                </div>
              ) : (
                <Select value={selectedProjectId || 'none'} onChange={(e) => handleProjectSelect(e.target.value)}>
                  <option value="none">No project (client-level document)</option>
                  {projects.map((project) => {
                    const projectId = (project as any)._id || (project as any).id;
                    return (
                      <option key={projectId} value={projectId as string}>
                        {project.name}
                      </option>
                    );
                  })}
                  {analysisResult.suggestedProjectName && (
                    <option value="new">+ Create: {analysisResult.suggestedProjectName}</option>
                  )}
                </Select>
              )}
            </Field>
          )}

          {/* Selected Assignment Display */}
          <div style={{ padding: 12, background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {isInternal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: colors.accent.green, fontWeight: 500 }}>Internal Document</span>
                </div>
              )}
              {selectedClientId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={16} style={{ color: colors.text.dim }} />
                  <span style={{ fontWeight: 500, color: colors.text.primary }}>{selectedClientData?.name || 'Loading...'}</span>
                </div>
              )}
              {!isInternal && selectedProjectId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderKanban size={16} style={{ color: colors.text.dim }} />
                  <span style={{ fontWeight: 500, color: colors.text.primary }}>{selectedProjectData?.name || 'Loading...'}</span>
                </div>
              )}
              {isInternal && selectedProjectIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <FolderKanban size={16} style={{ color: colors.text.dim }} />
                  <span style={{ fontSize: 10, color: colors.text.muted }}>{selectedProjectIds.length} project(s) selected</span>
                </div>
              )}
              {!isInternal && !selectedClientId && (
                <span style={{ color: colors.accent.red, fontSize: 10 }}>Please select a client</span>
              )}
            </div>
          </div>

          {/* File Button */}
          {!isFiled && (
            <Button variant="primary" onClick={handleFileDocument} disabled={isFiling} style={{ width: '100%', justifyContent: 'center' }}>
              {isFiling ? 'Filing...' : 'File Document'}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

