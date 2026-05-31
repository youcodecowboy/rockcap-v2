'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Panel, Button, Field, Input, Select, StatusPill, FlagChip, EmptyState } from '@/components/layouts';
import { Switch } from '@/components/ui/switch';
import { FileText, Building2, FolderKanban, X, Save, User, Eye, EyeOff, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useDocument, useGetFileUrl } from '@/lib/documentStorage';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import InstructionsModal from '@/components/InstructionsModal';
import DocumentCodeEditorModal from '@/components/DocumentCodeEditorModal';
import EditableField from '@/components/EditableField';
import QueueNavigationFooter from '@/components/QueueNavigationFooter';
import CommentsSection from '@/components/CommentsSection';
import FolderSelectionModal from '@/components/FolderSelectionModal';
import { useState, useEffect, useMemo } from 'react';
import { AnalysisResult } from '@/types';
import { generateDocumentCode, generateInternalDocumentCode } from '@/lib/documentCodeUtils';
import { useCreateDocument, useCreateInternalDocument } from '@/lib/documentStorage';
import { useSaveProspectingContext } from '@/lib/prospectingStorage';
import { useCreateEnrichment } from '@/lib/clientStorage';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function UploadSummaryPage() {
  const colors = useColors();
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as Id<"fileUploadQueue">;

  const job = useQuery(api.fileQueue.getJob, { jobId });
  const updateJobStatus = useMutation(api.fileQueue.updateJobStatus);
  const markAsRead = useMutation(api.fileQueue.markAsRead);
  const deleteJob = useMutation(api.fileQueue.deleteJob);
  const updateDocument = useMutation(api.documents.update);
  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);

  const [isDeleting, setIsDeleting] = useState(false);
  const [filedDocumentId, setFiledDocumentId] = useState<Id<"documents"> | null>(null);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [codeEditorModalOpen, setCodeEditorModalOpen] = useState(false);
  const [folderSelectionModalOpen, setFolderSelectionModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'preview'>('summary');

  // Editable state
  const [editedDocumentCode, setEditedDocumentCode] = useState<string>('');
  const [editedSummary, setEditedSummary] = useState<string>('');
  const [editedReasoning, setEditedReasoning] = useState<string>('');
  const [editedFileType, setEditedFileType] = useState<string>('');
  const [editedCategory, setEditedCategory] = useState<string>('');
  const [editedClientId, setEditedClientId] = useState<string | null>(null);
  const [editedProjectId, setEditedProjectId] = useState<string | null>(null);
  const [isBaseDocument, setIsBaseDocument] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isFiling, setIsFiling] = useState(false);

  // Filing hooks
  const createDocument = useCreateDocument();
  const createInternalDocument = useCreateInternalDocument();
  const saveProspectingContext = useSaveProspectingContext();
  const createEnrichment = useCreateEnrichment();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Update filedDocumentId when job loads or updates
  useEffect(() => {
    if (job?.documentId) {
      setFiledDocumentId(job.documentId);
    }
  }, [job?.documentId]);

  const document = useDocument(filedDocumentId || undefined);
  const analysisResult = job?.analysisResult as AnalysisResult | undefined;
  const fileUrl = useGetFileUrl(document?.fileStorageId || job?.fileStorageId);

  // Clients and projects - always call hooks
  const clients = useClients() || [];
  const projects = useProjectsByClient(editedClientId ? (editedClientId as Id<"clients">) : undefined) || [];
  const createClient = useCreateClient();
  const createProject = useCreateProject();
  const selectedClient = useClient(editedClientId ? (editedClientId as Id<"clients">) : undefined);
  const selectedProject = useProject(editedProjectId ? (editedProjectId as Id<"projects">) : undefined);

  // Get user info for uploaded by - always call hooks
  const userIds = useMemo(() => {
    const ids: Id<"users">[] = [];
    if (document?.uploadedBy) ids.push(document.uploadedBy);
    if (job?.userId) ids.push(job.userId as Id<"users">);
    return ids;
  }, [document?.uploadedBy, job?.userId]);
  const users = useQuery(api.users.getByIds, userIds.length > 0 ? { userIds } : "skip");
  const uploadedByUser = useMemo(() => {
    const userId = document?.uploadedBy || (job?.userId as Id<"users"> | undefined);
    return users?.find(u => u._id === userId);
  }, [users, document?.uploadedBy, job?.userId]);

  // Initialize editable state from document or analysis result
  useEffect(() => {
    if (document) {
      setEditedDocumentCode(document.documentCode || '');
      setEditedSummary(document.summary || '');
      setEditedReasoning(document.reasoning || '');
      setEditedFileType(document.fileTypeDetected || '');
      setEditedCategory(document.category || '');
      setEditedClientId(document.clientId || null);
      setEditedProjectId(document.projectId || null);
      setIsBaseDocument(document.isBaseDocument || false);
      setIsInternal(false);
    } else if (analysisResult) {
      setEditedSummary(analysisResult.summary || '');
      setEditedReasoning(analysisResult.reasoning || '');
      setEditedFileType(analysisResult.fileType || '');
      setEditedCategory(analysisResult.category || '');
      // Note: Client/project auto-population happens in separate useEffect hooks
      // after clients/projects are loaded to ensure we have the full lists

      // Auto-generate document code immediately if we have client info
      if (analysisResult.clientName || analysisResult.suggestedClientName) {
        const clientName = analysisResult.clientName || analysisResult.suggestedClientName || '';
        const generatedCode = generateDocumentCode(
          clientName,
          analysisResult.category,
          analysisResult.projectName || analysisResult.suggestedProjectName || undefined,
          job?.createdAt || new Date().toISOString()
        );
        setEditedDocumentCode(generatedCode);
      }
    }
  }, [document, analysisResult, job?.createdAt]);

  // Auto-populate client from AI suggestion when clients are loaded
  useEffect(() => {
    if (analysisResult?.suggestedClientName && clients.length > 0 && !editedClientId && !document) {
      const matchingClient = clients.find(c =>
        c.name.toLowerCase() === analysisResult.suggestedClientName?.toLowerCase()
      );
      if (matchingClient) {
        setEditedClientId(matchingClient._id);
      }
    }
  }, [analysisResult?.suggestedClientName, clients, editedClientId, document]);

  // Auto-select project when client is set and we have a suggested project name
  useEffect(() => {
    if (analysisResult?.suggestedProjectName && editedClientId && projects.length > 0 && !editedProjectId && !document) {
      const matchingProject = projects.find(p =>
        p.name.toLowerCase() === analysisResult.suggestedProjectName?.toLowerCase()
      );
      if (matchingProject) {
        setEditedProjectId(matchingProject._id);
      }
    }
  }, [analysisResult?.suggestedProjectName, editedClientId, projects, editedProjectId, document]);

  // Mark as read when page loads
  useEffect(() => {
    if (job && !job.isRead) {
      markAsRead({ jobId });
    }
  }, [job, jobId, markAsRead]);

  // Show instructions modal if needed
  useEffect(() => {
    if (job && job.hasCustomInstructions && !job.customInstructions && !filedDocumentId) {
      setInstructionsModalOpen(true);
    }
  }, [job, filedDocumentId]);

  const handleInstructionsSaved = () => {
    // Instructions saved, modal will close
  };

  // Calculate hasChanges - must be before early return
  const hasChanges = useMemo(() => {
    if (!document) return false;
    return (
      editedDocumentCode !== (document.documentCode || '') ||
      editedSummary !== document.summary ||
      editedReasoning !== document.reasoning ||
      editedFileType !== document.fileTypeDetected ||
      editedCategory !== document.category ||
      editedClientId !== (document.clientId || null) ||
      editedProjectId !== (document.projectId || null) ||
      isBaseDocument !== (document.isBaseDocument || false)
    );
  }, [document, editedDocumentCode, editedSummary, editedReasoning, editedFileType, editedCategory, editedClientId, editedProjectId, isBaseDocument]);

  // Early return AFTER all hooks
  if (!job) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg.light }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
          <EmptyState
            icon={<FileText size={40} />}
            title="Upload job not found"
            action={
              <Button variant="secondary" onClick={() => router.push('/')}>
                Back to Home
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this upload job?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteJob({ jobId });
      router.push('/');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileDocument = async () => {
    if (isFiling || filedDocumentId) return;

    if (!isInternal && !editedClientId && !analysisResult?.suggestedClientName) {
      alert('Please select a client or mark as internal document');
      return;
    }

    setIsFiling(true);
    try {
      // Auto-create client if suggested but not selected
      let finalClientId = editedClientId;
      if (!isInternal && !finalClientId && analysisResult?.suggestedClientName) {
        try {
          const clientId = await createClient({ name: analysisResult.suggestedClientName });
          finalClientId = clientId as string;
          setEditedClientId(finalClientId);
        } catch (error) {
          console.error('Error auto-creating client:', error);
          alert('Failed to create client. Please try again.');
          setIsFiling(false);
          return;
        }
      }

      // Auto-create project if suggested but not selected
      let finalProjectId = editedProjectId;
      if (!isInternal && finalClientId && !finalProjectId && analysisResult?.suggestedProjectName) {
        try {
          const projectId = await createProject({
            name: analysisResult.suggestedProjectName,
            clientRoles: [{
              clientId: finalClientId as Id<"clients">,
              role: "client",
            }],
          });
          finalProjectId = projectId as string;
          setEditedProjectId(finalProjectId);
        } catch (error) {
          console.error('Error auto-creating project:', error);
          // Continue without project - not critical
        }
      }

      if (isInternal) {
        // Create internal document
        const uploadedAt = new Date().toISOString();
        const documentCode = generateInternalDocumentCode(editedCategory || analysisResult?.category || 'Document', uploadedAt);

        const internalDocumentId = await createInternalDocument({
          fileStorageId: job.fileStorageId,
          fileName: job.fileName,
          fileSize: job.fileSize,
          fileType: job.fileType,
          summary: editedSummary || analysisResult?.summary || '',
          fileTypeDetected: editedFileType || analysisResult?.fileType || '',
          category: editedCategory || analysisResult?.category || '',
          reasoning: editedReasoning || analysisResult?.reasoning || '',
          confidence: analysisResult?.confidence || 0,
          tokensUsed: analysisResult?.tokensUsed || 0,
          linkedClientId: editedClientId ? (editedClientId as Id<"clients">) : undefined,
          clientName: selectedClient?.name || undefined,
          linkedProjectIds: editedProjectId ? [editedProjectId as Id<"projects">] : undefined,
          projectNames: selectedProject?.name ? [selectedProject.name] : undefined,
          extractedData: analysisResult?.extractedData || undefined,
          status: 'completed',
          documentCode,
        });

        // Internal documents use a different table, so we don't set filedDocumentId
        // The job will be marked as completed below
      } else {
        // Get userId from job for uploadedBy
        const uploadedBy = job?.userId ? (job.userId as Id<"users">) : undefined;

        // Generate document code if not already set
        let finalDocumentCode = editedDocumentCode;
        if (!finalDocumentCode) {
          const clientName = selectedClient?.name || analysisResult?.suggestedClientName || analysisResult?.clientName || '';
          const projectName = selectedProject?.name || analysisResult?.suggestedProjectName || analysisResult?.projectName;
          if (clientName) {
            finalDocumentCode = generateDocumentCode(
              clientName,
              editedCategory || analysisResult?.category || '',
              projectName || undefined,
              job.createdAt
            );
          }
        }

        // Create regular document record
        const documentId = await createDocument({
          fileStorageId: job.fileStorageId,
          fileName: job.fileName,
          fileSize: job.fileSize,
          fileType: job.fileType,
          summary: editedSummary || analysisResult?.summary || '',
          fileTypeDetected: editedFileType || analysisResult?.fileType || '',
          category: editedCategory || analysisResult?.category || '',
          reasoning: editedReasoning || analysisResult?.reasoning || '',
          confidence: analysisResult?.confidence || 0,
          tokensUsed: analysisResult?.tokensUsed || 0,
          clientId: finalClientId ? (finalClientId as Id<"clients">) : undefined,
          clientName: selectedClient?.name || analysisResult?.clientName || analysisResult?.suggestedClientName || undefined,
          projectId: finalProjectId ? (finalProjectId as Id<"projects">) : undefined,
          projectName: selectedProject?.name || analysisResult?.projectName || analysisResult?.suggestedProjectName || undefined,
          suggestedClientName: analysisResult?.suggestedClientName || undefined,
          suggestedProjectName: analysisResult?.suggestedProjectName || undefined,
          extractedData: analysisResult?.extractedData || undefined,
          status: 'completed',
          uploadedBy: uploadedBy,
          documentCode: finalDocumentCode,
          isBaseDocument: isBaseDocument,
        });

        // Trigger Fast Pass codification if we have extracted data (non-blocking)
        if (analysisResult?.extractedData && documentId) {
          fetch('/api/codify-extraction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'fast-pass',
              documentId: documentId,
              projectId: finalProjectId,
              extractedData: analysisResult.extractedData,
            }),
          }).then(response => {
            if (response.ok) {
              console.log('[Upload] Fast Pass codification triggered for document:', documentId);
            } else {
              console.warn('[Upload] Fast Pass codification failed for document:', documentId);
            }
          }).catch(err => {
            console.error('[Upload] Error triggering Fast Pass:', err);
          });
        }

        // Create enrichment suggestions if any
        if (analysisResult?.enrichmentSuggestions && analysisResult.enrichmentSuggestions.length > 0) {
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
                source: suggestion.context || job.fileName,
                documentId: documentId,
                clientId: editedClientId ? (editedClientId as Id<"clients">) : undefined,
                projectId: editedProjectId ? (editedProjectId as Id<"projects">) : undefined,
                confidence: suggestion.confidence || 0.8,
              });
            } catch (err) {
              console.error('Failed to create enrichment suggestion:', err);
            }
          }
        }

        // Trigger prospecting context extraction (non-blocking)
        if (editedClientId) {
          fetch('/api/extract-prospecting-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentId: documentId,
              clientId: editedClientId,
              projectId: editedProjectId,
              fileName: job.fileName,
              analysisResult: analysisResult,
              textContent: '',
              clientName: selectedClient?.name || analysisResult?.clientName || null,
              projectName: selectedProject?.name || analysisResult?.projectName || null,
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
                clientId: editedClientId ? (editedClientId as Id<"clients">) : null,
                projectId: editedProjectId ? (editedProjectId as Id<"projects">) : null,
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
          analysisResult: analysisResult,
        });

        setFiledDocumentId(documentId);
      }

      setIsFiling(false);
      alert('Document filed successfully!');
    } catch (error) {
      console.error('Error filing document:', error);
      setIsFiling(false);
      alert('Failed to file document. Please try again.');
    }
  };

  const handleSave = async () => {
    if (!filedDocumentId) {
      alert('Please file the document first before saving changes.');
      return;
    }

    setIsSaving(true);
    try {
      // Get client and project names
      const clientName = selectedClient?.name || analysisResult?.clientName || undefined;
      const projectName = selectedProject?.name || analysisResult?.projectName || undefined;

      // Update document with all edited fields
      await updateDocument({
        id: filedDocumentId,
        documentCode: editedDocumentCode || undefined,
        summary: editedSummary,
        reasoning: editedReasoning,
        fileTypeDetected: editedFileType,
        category: editedCategory,
        clientId: isInternal ? null : (editedClientId as Id<"clients"> | null) || null,
        clientName: isInternal ? undefined : clientName,
        projectId: isInternal ? null : (editedProjectId as Id<"projects"> | null) || null,
        projectName: isInternal ? undefined : projectName,
      });

      // Update document code if changed
      if (editedDocumentCode && editedDocumentCode !== document?.documentCode) {
        await updateDocumentCode({
          id: filedDocumentId,
          documentCode: editedDocumentCode,
        });
      }

      alert('Document updated successfully!');
    } catch (error) {
      console.error('Error saving document:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isPDF = job.fileType === 'application/pdf' || job.fileName.toLowerCase().endsWith('.pdf');
  const isExcel = job.fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                  job.fileType === 'application/vnd.ms-excel' ||
                  job.fileName.toLowerCase().endsWith('.xlsx') ||
                  job.fileName.toLowerCase().endsWith('.xls');

  const sectionHeaderStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.muted,
    fontWeight: 500,
    display: 'block',
    marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.bg.light }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 96px' }}>
        {/* Page Title */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text.primary, margin: 0 }}>
              File Summary
            </h1>
            <p style={{ marginTop: 8, color: colors.text.muted, fontSize: 13 }}>
              Review and confirm file analysis results
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {analysisResult && (
              <Button
                variant={viewMode === 'preview' ? 'primary' : 'secondary'}
                accent={colors.text.primary}
                onClick={() => setViewMode(viewMode === 'summary' ? 'preview' : 'summary')}
              >
                {viewMode === 'preview' ? (
                  <>
                    <EyeOff size={16} />
                    Summary
                  </>
                ) : (
                  <>
                    <Eye size={16} />
                    Preview
                  </>
                )}
              </Button>
            )}
            {filedDocumentId && hasChanges && (
              <Button variant="primary" accent={colors.text.primary} onClick={handleSave} disabled={isSaving}>
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {filedDocumentId && (
              <Link href={`/docs/${filedDocumentId}`}>
                <Button variant="secondary">
                  <FileText size={16} />
                  View Document
                </Button>
              </Link>
            )}
            <Button variant="ghost" onClick={handleDelete} disabled={isDeleting}>
              <X size={16} />
              Delete Upload
            </Button>
          </div>
        </div>

        {/* Preview View */}
        {viewMode === 'preview' && fileUrl && (
          <div key={`preview-${jobId}`} style={{ marginBottom: 24 }}>
            <Panel padded={false}>
              {isPDF ? (
                <iframe
                  src={fileUrl}
                  style={{ width: '100%', height: 800, border: 0 }}
                  title={job.fileName}
                />
              ) : isExcel && analysisResult?.extractedData ? (
                <div style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: colors.text.primary }}>Extracted Data</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ minWidth: '100%', borderCollapse: 'collapse', border: `1px solid ${colors.border.default}` }}>
                      <thead>
                        <tr style={{ background: colors.bg.light }}>
                          {(() => {
                            const dataArray = Array.isArray(analysisResult.extractedData)
                              ? analysisResult.extractedData
                              : analysisResult.extractedData
                                ? [analysisResult.extractedData]
                                : [];
                            const firstRow = dataArray[0] || {};
                            return Object.keys(firstRow).map((key) => (
                              <th key={key} style={{ border: `1px solid ${colors.border.default}`, padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: colors.text.primary }}>
                                {key}
                              </th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const dataArray = Array.isArray(analysisResult.extractedData)
                            ? analysisResult.extractedData
                            : analysisResult.extractedData
                              ? [analysisResult.extractedData]
                              : [];
                          return dataArray.slice(0, 100).map((row: any, idx: number) => {
                            const firstRow = dataArray[0] || {};
                            return (
                              <tr key={idx}>
                                {Object.keys(firstRow).map((key) => (
                                  <td key={key} style={{ border: `1px solid ${colors.border.default}`, padding: '8px 16px', fontSize: 12, color: colors.text.secondary }}>
                                    {row[key] || ''}
                                  </td>
                                ))}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState icon={<FileText size={40} />} title="Preview not available for this file type" />
              )}
            </Panel>
          </div>
        )}

        {/* Summary View */}
        {viewMode === 'summary' && (
          <div key={`summary-${jobId}`}>
            {/* Full-Width Header */}
            <div style={{ marginBottom: 24 }}>
              <Panel>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    {/* Document Code/Name */}
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: colors.text.primary }}>
                        {editedDocumentCode || 'Document code will be generated'}
                      </div>
                      {editedDocumentCode && (
                        <Button variant="ghost" size="sm" onClick={() => setCodeEditorModalOpen(true)}>
                          <Pencil size={12} />
                          Edit Code
                        </Button>
                      )}
                    </div>
                    {job.fileName && (
                      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
                        Original filename: <span style={{ fontFamily: MONO }}>{job.fileName}</span>
                      </p>
                    )}

                    {/* Metadata Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: colors.text.secondary, flexWrap: 'wrap' }}>
                      <span>{formatFileSize(job.fileSize)}</span>
                      <span>•</span>
                      <span>Uploaded {new Date(job.createdAt).toLocaleString()}</span>
                      {uploadedByUser && (
                        <>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={12} />
                            Uploaded by: {uploadedByUser.name || uploadedByUser.email}
                          </span>
                        </>
                      )}
                      {analysisResult && (
                        <>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            Confidence:
                            <StatusPill
                              label={`${(analysisResult.confidence * 100).toFixed(0)}%`}
                              tone={analysisResult.confidence >= 0.9 ? colors.accent.green : colors.accent.yellow}
                            />
                          </span>
                        </>
                      )}
                      {job.status === 'completed' && (
                        <>
                          <span>•</span>
                          <FlagChip label="Filed" severity="ok" />
                        </>
                      )}
                      {job.status === 'needs_confirmation' && (
                        <>
                          <span>•</span>
                          <FlagChip label="Needs Review" severity="warn" />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            {/* Custom Instructions Section */}
            {job.hasCustomInstructions && (
              <div style={{ marginBottom: 24 }}>
                <Panel
                  title="Custom Instructions"
                  accent={colors.accent.blue}
                  actions={
                    !filedDocumentId ? (
                      <Button variant="secondary" size="sm" onClick={() => setInstructionsModalOpen(true)}>
                        {job.customInstructions ? 'Edit Instructions' : 'Add Instructions'}
                      </Button>
                    ) : undefined
                  }
                >
                  {job.customInstructions ? (
                    <div style={{ padding: 12, background: colors.bg.light, borderRadius: 4 }}>
                      <p style={{ fontSize: 12, color: colors.text.primary, whiteSpace: 'pre-wrap', margin: 0 }}>{job.customInstructions}</p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: colors.text.muted, fontStyle: 'italic', margin: 0 }}>
                      No instructions provided yet. Click &quot;Add Instructions&quot; to provide context for better filing accuracy.
                    </p>
                  )}
                </Panel>
              </div>
            )}

            {/* Two-Column Layout */}
            {analysisResult && job.status !== 'error' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: File Assignment */}
                <Panel title="File Assignment" accent={colors.accent.blue}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 600 }}>
                    {/* Internal Document Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="internal" style={{ fontSize: 12, fontWeight: 500, color: colors.text.secondary }}>
                        Mark as Internal Document
                      </label>
                      <Switch
                        id="internal"
                        checked={isInternal}
                        onCheckedChange={setIsInternal}
                      />
                    </div>

                    {/* AI Suggestions Display */}
                    {!isInternal && (analysisResult?.suggestedClientName || analysisResult?.suggestedProjectName) && (
                      <div style={{ padding: 12, background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40`, borderRadius: 4 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 500, color: colors.accent.blue, marginBottom: 8 }}>AI Suggestions</h3>
                        {analysisResult.suggestedClientName && (
                          <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>Suggested Client:</span> {analysisResult.suggestedClientName}
                            {editedClientId && selectedClient?.name === analysisResult.suggestedClientName && (
                              <span style={{ color: colors.accent.green }}>✓ Selected</span>
                            )}
                            {!editedClientId && analysisResult.suggestedClientName && (
                              <FlagChip label="New" severity="warn" />
                            )}
                          </p>
                        )}
                        {analysisResult.suggestedProjectName && (
                          <p style={{ fontSize: 12, color: colors.text.secondary, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>Suggested Project:</span> {analysisResult.suggestedProjectName}
                            {editedProjectId && selectedProject?.name === analysisResult.suggestedProjectName && (
                              <span style={{ color: colors.accent.green }}>✓ Selected</span>
                            )}
                            {!editedProjectId && analysisResult.suggestedProjectName && (
                              <FlagChip label="New" severity="warn" />
                            )}
                          </p>
                        )}
                        {analysisResult.reasoning && (
                          <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 8, fontStyle: 'italic' }}>
                            {analysisResult.reasoning.split('The property address')[0].split('No client from')[0].trim()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Client Selection - Always visible unless internal */}
                    {!isInternal && (
                      <Field label={`Client ${editedClientId || analysisResult?.suggestedClientName ? '' : '*'}`}>
                        {isCreatingClient ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Input
                              value={newClientName || analysisResult?.suggestedClientName || ''}
                              onChange={(e) => setNewClientName(e.target.value)}
                              placeholder="Enter client name"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && newClientName.trim()) {
                                  try {
                                    const clientId = await createClient({ name: newClientName.trim() });
                                    setEditedClientId(clientId as string);
                                    setIsCreatingClient(false);
                                    setNewClientName('');
                                  } catch (error) {
                                    console.error('Error creating client:', error);
                                    alert('Failed to create client');
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsCreatingClient(false);
                                  setNewClientName('');
                                }
                              }}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={async () => {
                                  if (!newClientName.trim()) return;
                                  try {
                                    const clientId = await createClient({ name: newClientName.trim() });
                                    setEditedClientId(clientId as string);
                                    setIsCreatingClient(false);
                                    setNewClientName('');
                                  } catch (error) {
                                    console.error('Error creating client:', error);
                                    alert('Failed to create client');
                                  }
                                }}
                              >
                                Create
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setIsCreatingClient(false);
                                  setNewClientName('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Select
                            value={editedClientId || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === 'new') {
                                setNewClientName(analysisResult?.suggestedClientName || '');
                                setIsCreatingClient(true);
                              } else {
                                setEditedClientId(value);
                                setEditedProjectId(null);
                              }
                            }}
                          >
                            <option value="" disabled>
                              {analysisResult?.suggestedClientName
                                ? `Use suggested: ${analysisResult.suggestedClientName.length > 40 ? analysisResult.suggestedClientName.substring(0, 40) + '...' : analysisResult.suggestedClientName}`
                                : 'Select a client'}
                            </option>
                            {clients.map((client) => (
                              <option key={client._id} value={client._id}>
                                {client.name}
                              </option>
                            ))}
                            <option value="new">+ Create New Client</option>
                          </Select>
                        )}
                      </Field>
                    )}

                    {/* Project Selection - Always visible unless internal */}
                    {!isInternal && (
                      <Field label="Project">
                        {isCreatingProject ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Input
                              value={newProjectName || analysisResult?.suggestedProjectName || ''}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder="Enter project name"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && newProjectName.trim() && (editedClientId || analysisResult?.suggestedClientName)) {
                                  try {
                                    // If no client selected but we have a suggested one, create client first
                                    let clientIdToUse = editedClientId;
                                    if (!clientIdToUse && analysisResult?.suggestedClientName) {
                                      const clientId = await createClient({ name: analysisResult.suggestedClientName });
                                      clientIdToUse = clientId as string;
                                      setEditedClientId(clientIdToUse);
                                    }
                                    if (clientIdToUse) {
                                      const projectId = await createProject({
                                        name: newProjectName.trim(),
                                        clientRoles: [{
                                          clientId: clientIdToUse as Id<"clients">,
                                          role: "client",
                                        }],
                                      });
                                      setEditedProjectId(projectId as string);
                                      setIsCreatingProject(false);
                                      setNewProjectName('');
                                    }
                                  } catch (error) {
                                    console.error('Error creating project:', error);
                                    alert('Failed to create project');
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsCreatingProject(false);
                                  setNewProjectName('');
                                }
                              }}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={async () => {
                                  if (!newProjectName.trim()) return;
                                  try {
                                    // If no client selected but we have a suggested one, create client first
                                    let clientIdToUse = editedClientId;
                                    if (!clientIdToUse && analysisResult?.suggestedClientName) {
                                      const clientId = await createClient({ name: analysisResult.suggestedClientName });
                                      clientIdToUse = clientId as string;
                                      setEditedClientId(clientIdToUse);
                                    }
                                    if (clientIdToUse) {
                                      const projectId = await createProject({
                                        name: newProjectName.trim(),
                                        clientRoles: [{
                                          clientId: clientIdToUse as Id<"clients">,
                                          role: "client",
                                        }],
                                      });
                                      setEditedProjectId(projectId as string);
                                      setIsCreatingProject(false);
                                      setNewProjectName('');
                                    }
                                  } catch (error) {
                                    console.error('Error creating project:', error);
                                    alert('Failed to create project');
                                  }
                                }}
                              >
                                Create
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setIsCreatingProject(false);
                                  setNewProjectName('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Select
                            value={editedProjectId || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === 'new') {
                                setNewProjectName(analysisResult?.suggestedProjectName || '');
                                setIsCreatingProject(true);
                              } else {
                                setEditedProjectId(value);
                              }
                            }}
                            disabled={!editedClientId && !analysisResult?.suggestedClientName}
                          >
                            <option value="" disabled>
                              {!editedClientId && !analysisResult?.suggestedClientName
                                ? 'Select a client first'
                                : analysisResult?.suggestedProjectName
                                  ? `Use suggested: ${analysisResult.suggestedProjectName.length > 40 ? analysisResult.suggestedProjectName.substring(0, 40) + '...' : analysisResult.suggestedProjectName}`
                                  : 'Select a project'}
                            </option>
                            {projects.map((project) => (
                              <option key={project._id} value={project._id}>
                                {project.name}
                              </option>
                            ))}
                            <option value="new">+ Create New Project</option>
                          </Select>
                        )}
                      </Field>
                    )}

                    {/* File Document Button - Show when not filed yet */}
                    {!filedDocumentId && (
                      <Button
                        variant="primary"
                        accent={colors.text.primary}
                        onClick={handleFileDocument}
                        disabled={isFiling || (!isInternal && !editedClientId)}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        {isFiling ? 'Filing...' : 'File Document'}
                      </Button>
                    )}
                  </div>
                </Panel>

                {/* Right Column: File Analysis */}
                <Panel title="File Analysis" accent={colors.accent.blue}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Summary - Editable with Edit Icon */}
                    <div style={{ position: 'relative' }}>
                      <EditableField
                        value={editedSummary}
                        onChange={setEditedSummary}
                        label="Summary"
                        multiline
                        placeholder="Document summary..."
                        className="relative"
                      />
                    </div>

                    {/* Reasoning - Editable with Edit Icon */}
                    <div style={{ position: 'relative' }}>
                      <EditableField
                        value={editedReasoning}
                        onChange={setEditedReasoning}
                        label="Reasoning"
                        multiline
                        placeholder="AI reasoning for categorization..."
                        className="relative"
                      />
                    </div>

                    {/* File Type and Category - Editable with Edit Icon */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div style={{ position: 'relative' }}>
                        <EditableField
                          value={editedFileType}
                          onChange={setEditedFileType}
                          label="File Type"
                          placeholder="e.g., PDF, Excel"
                          className="relative"
                        />
                      </div>
                      <div style={{ position: 'relative' }}>
                        <EditableField
                          value={editedCategory}
                          onChange={setEditedCategory}
                          label="Category"
                          placeholder="e.g., Valuation, Legal"
                          className="relative"
                        />
                      </div>
                    </div>

                    {/* Confidence */}
                    {analysisResult && (
                      <div>
                        <label style={sectionHeaderStyle}>Confidence</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: colors.bg.cardAlt, borderRadius: 999, height: 8 }}>
                            <div
                              style={{ background: colors.accent.blue, height: 8, borderRadius: 999, width: `${analysisResult.confidence * 100}%` }}
                            />
                          </div>
                          <span style={{ fontSize: 12, color: colors.text.secondary }}>
                            {(analysisResult.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Folder Placement - Moved here from File Assignment */}
                    {!isInternal && (
                      <div>
                        <label style={sectionHeaderStyle}>Folder Placement</label>
                        <div style={{ padding: 12, background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8 }}>
                            {isBaseDocument ? (
                              <>
                                <Building2 size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
                                <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  Base Documents ({selectedClient?.name || analysisResult?.suggestedClientName || 'Client'})
                                </span>
                              </>
                            ) : editedProjectId || analysisResult?.suggestedProjectName ? (
                              <>
                                <FolderKanban size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
                                <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {(() => {
                                    const projectName = selectedProject?.name || analysisResult?.suggestedProjectName || 'Project';
                                    return projectName.length > 50 ? projectName.substring(0, 50) + '...' : projectName;
                                  })()} Folder
                                </span>
                              </>
                            ) : (
                              <>
                                <FolderKanban size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
                                <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  Will be placed in Base Documents or Project folder when selected
                                </span>
                              </>
                            )}
                          </div>
                          {(editedClientId || analysisResult?.suggestedClientName) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setFolderSelectionModalOpen(true)}
                              style={{ width: '100%', justifyContent: 'center' }}
                            >
                              File Elsewhere
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Extracted Data */}
                    {analysisResult?.extractedData && (
                      <div>
                        <label style={sectionHeaderStyle}>Extracted Data</label>
                        <pre
                          style={{
                            fontSize: 11,
                            fontFamily: MONO,
                            background: colors.bg.light,
                            padding: 12,
                            borderRadius: 4,
                            overflow: 'auto',
                            maxHeight: 256,
                            border: `1px solid ${colors.border.default}`,
                            color: colors.text.secondary,
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(analysisResult.extractedData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            )}

            {/* Comments Section */}
            <CommentsSection
              jobId={!filedDocumentId ? jobId : undefined}
              documentId={filedDocumentId || undefined}
            />
          </div>
        )}

        {/* Instructions Modal */}
        <InstructionsModal
          open={instructionsModalOpen}
          onOpenChange={setInstructionsModalOpen}
          jobId={jobId}
          fileName={job.fileName}
          existingInstructions={job.customInstructions}
          onInstructionsSaved={handleInstructionsSaved}
        />

        {/* Document Code Editor Modal */}
        {document && (
          <DocumentCodeEditorModal
            isOpen={codeEditorModalOpen}
            onClose={() => {
              setCodeEditorModalOpen(false);
              // Refetch document to get updated code
              // The useDocument hook will automatically refetch
            }}
            documentCode={editedDocumentCode}
            fileName={job.fileName}
            category={editedCategory}
            clientName={selectedClient?.name || analysisResult?.clientName || undefined}
            projectName={selectedProject?.name || analysisResult?.projectName || undefined}
            uploadedAt={job.createdAt}
            documentId={document._id}
            clientId={editedClientId as Id<"clients"> | undefined}
            projectId={editedProjectId as Id<"projects"> | undefined}
            onUpdate={() => {
              // Modal will close and document will refetch automatically
            }}
          />
        )}

        {/* Folder Selection Modal */}
        {(editedClientId || analysisResult?.suggestedClientName) && (
          <FolderSelectionModal
            isOpen={folderSelectionModalOpen}
            onClose={() => setFolderSelectionModalOpen(false)}
            clientId={editedClientId ? (editedClientId as Id<"clients">) : null}
            projects={projects}
            currentProjectId={editedProjectId ? (editedProjectId as Id<"projects">) : null}
            currentIsBaseDocument={isBaseDocument}
            onSelect={(isBaseDoc, projectId) => {
              setIsBaseDocument(isBaseDoc);
              if (projectId) {
                setEditedProjectId(projectId);
              } else if (!isBaseDoc && editedProjectId) {
                // Keep current project if switching to project folder
              } else {
                // Clear project if switching to base documents
                setEditedProjectId(null);
              }
            }}
          />
        )}
      </div>

      {/* Queue Navigation Footer */}
      <QueueNavigationFooter currentJobId={jobId} />
    </div>
  );
}
