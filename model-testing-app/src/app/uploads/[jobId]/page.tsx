'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FileText, Building2, FolderKanban, CheckCircle2, AlertCircle, X, Edit2, Save, User, Eye, EyeOff, Pencil } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateDocumentCode, generateInternalDocumentCode } from '@/lib/documentCodeUtils';
import { useCreateDocument, useCreateInternalDocument } from '@/lib/documentStorage';
import { useSaveProspectingContext } from '@/lib/prospectingStorage';
import { useCreateEnrichment } from '@/lib/clientStorage';

export default function UploadSummaryPage() {
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
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Upload job not found.</p>
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="mt-4"
            >
              Back to Home
            </Button>
          </div>
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

  return (
    <div className="min-h-screen bg-gray-50 transition-opacity duration-300 ease-in-out" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 transition-all duration-300 ease-in-out">
        {/* Page Title - Following UI Styling Guide */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
              File Summary
            </h1>
            <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
              Review and confirm file analysis results
            </p>
          </div>
          <div className="flex items-center gap-2">
            {analysisResult && (
              <Button
                variant={viewMode === 'preview' ? 'default' : 'outline'}
                onClick={() => setViewMode(viewMode === 'summary' ? 'preview' : 'summary')}
                className={viewMode === 'preview' ? 'bg-black text-white hover:bg-gray-800' : ''}
              >
                {viewMode === 'preview' ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Summary
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </>
                )}
              </Button>
            )}
            {filedDocumentId && hasChanges && (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {filedDocumentId && (
              <Link href={`/docs/${filedDocumentId}`}>
                <Button variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  View Document
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-black hover:text-gray-800"
            >
              <X className="w-4 h-4 mr-2" />
              Delete Upload
            </Button>
          </div>
        </div>

        {/* Preview View */}
        {viewMode === 'preview' && fileUrl && (
          <Card key={`preview-${jobId}`} className="mb-6 transition-opacity duration-300 ease-in-out">
            <CardContent className="p-0">
              {isPDF ? (
                <iframe
                  src={fileUrl}
                  className="w-full h-[800px] border-0"
                  title={job.fileName}
                />
              ) : isExcel && analysisResult?.extractedData ? (
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Extracted Data</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100">
                          {(() => {
                            const dataArray = Array.isArray(analysisResult.extractedData) 
                              ? analysisResult.extractedData 
                              : analysisResult.extractedData 
                                ? [analysisResult.extractedData] 
                                : [];
                            const firstRow = dataArray[0] || {};
                            return Object.keys(firstRow).map((key) => (
                              <th key={key} className="border border-gray-300 px-4 py-2 text-left font-semibold">
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
                                  <td key={key} className="border border-gray-300 px-4 py-2">
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
                <div className="p-12 text-center text-gray-500">
                  <p>Preview not available for this file type.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summary View */}
        {viewMode === 'summary' && (
          <div key={`summary-${jobId}`} className="transition-opacity duration-300 ease-in-out">
            <>
            {/* Full-Width Header - Following UI Styling Guide */}
            <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {/* Document Code/Name - Editable with Pencil Icon */}
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
                      {editedDocumentCode || 'Document code will be generated'}
                    </div>
                    {editedDocumentCode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCodeEditorModalOpen(true)}
                        className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit Code
                      </Button>
                    )}
                  </div>
                  {job.fileName && (
                    <p className="text-sm text-gray-500 mb-3">
                      Original filename: <span className="font-mono">{job.fileName}</span>
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                    <span>{formatFileSize(job.fileSize)}</span>
                    <span>•</span>
                    <span>Uploaded {new Date(job.createdAt).toLocaleString()}</span>
                    {uploadedByUser && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Uploaded by: {uploadedByUser.name || uploadedByUser.email}
                        </span>
                      </>
                    )}
                    {analysisResult && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          Confidence: 
                          <Badge 
                            variant={analysisResult.confidence >= 0.9 ? "default" : "secondary"}
                            className={analysisResult.confidence < 0.9 ? "bg-yellow-100 text-yellow-700" : ""}
                          >
                            {(analysisResult.confidence * 100).toFixed(0)}%
                          </Badge>
                        </span>
                      </>
                    )}
                    {job.status === 'completed' && (
                      <>
                        <span>•</span>
                        <Badge className="bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Filed
                        </Badge>
                      </>
                    )}
                    {job.status === 'needs_confirmation' && (
                      <>
                        <span>•</span>
                        <Badge className="bg-yellow-100 text-yellow-700">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Needs Review
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Instructions Section */}
            {job.hasCustomInstructions && (
              <Card className="mb-6">
                <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Custom Instructions
                  </span>
                  {!filedDocumentId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInstructionsModalOpen(true)}
                      className="bg-white text-blue-600 hover:bg-gray-100"
                    >
                      {job.customInstructions ? 'Edit Instructions' : 'Add Instructions'}
                    </Button>
                  )}
                </div>
                <CardContent className="pt-4">
                  {job.customInstructions ? (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{job.customInstructions}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      No instructions provided yet. Click "Add Instructions" to provide context for better filing accuracy.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Two-Column Layout */}
            {analysisResult && job.status !== 'error' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: File Assignment */}
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <div className="bg-blue-600 text-white px-3 py-2">
                    <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                      File Assignment
                    </span>
                  </div>
                  <CardContent className="pt-4 space-y-5 min-h-[600px]">
                    {/* Internal Document Toggle */}
                    <div className="flex items-center justify-between">
                      <label htmlFor="internal" className="text-sm font-medium text-gray-700">
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
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="text-sm font-medium text-blue-900 mb-2">AI Suggestions</h3>
                        {analysisResult.suggestedClientName && (
                          <p className="text-sm text-blue-800 mb-1">
                            <span className="font-semibold">Suggested Client:</span> {analysisResult.suggestedClientName}
                            {editedClientId && selectedClient?.name === analysisResult.suggestedClientName && (
                              <span className="ml-2 text-green-600">✓ Selected</span>
                            )}
                            {!editedClientId && analysisResult.suggestedClientName && (
                              <Badge variant="outline" className="ml-2 text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                New
                              </Badge>
                            )}
                          </p>
                        )}
                        {analysisResult.suggestedProjectName && (
                          <p className="text-sm text-blue-800">
                            <span className="font-semibold">Suggested Project:</span> {analysisResult.suggestedProjectName}
                            {editedProjectId && selectedProject?.name === analysisResult.suggestedProjectName && (
                              <span className="ml-2 text-green-600">✓ Selected</span>
                            )}
                            {!editedProjectId && analysisResult.suggestedProjectName && (
                              <Badge variant="outline" className="ml-2 text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                New
                              </Badge>
                            )}
                          </p>
                        )}
                        {analysisResult.reasoning && (
                          <p className="text-xs text-blue-700 mt-2 italic">
                            {analysisResult.reasoning.split('The property address')[0].split('No client from')[0].trim()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Client Selection - Always visible unless internal */}
                    {!isInternal && (
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Client {editedClientId || analysisResult?.suggestedClientName ? '' : '*'}
                        </label>
                        {isCreatingClient ? (
                            <div className="space-y-2">
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
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
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
                                  variant="outline"
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
                              onValueChange={(value) => {
                                if (value === 'new') {
                                  setNewClientName(analysisResult?.suggestedClientName || '');
                                  setIsCreatingClient(true);
                                } else {
                                  setEditedClientId(value);
                                  setEditedProjectId(null);
                                }
                              }}
                            >
                              <SelectTrigger className="truncate">
                                <SelectValue placeholder={
                                  editedClientId 
                                    ? undefined 
                                    : analysisResult?.suggestedClientName 
                                      ? `Use suggested: ${analysisResult.suggestedClientName.length > 40 ? analysisResult.suggestedClientName.substring(0, 40) + '...' : analysisResult.suggestedClientName}` 
                                      : "Select a client"
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                {clients.map((client) => (
                                  <SelectItem key={client._id} value={client._id}>
                                    {client.name}
                                  </SelectItem>
                                ))}
                                <SelectItem value="new">+ Create New Client</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                      </div>
                    )}

                    {/* Project Selection - Always visible unless internal */}
                    {!isInternal && (
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                              Project
                            </label>
                            {isCreatingProject ? (
                              <div className="space-y-3">
                                <Input
                                  value={newProjectName || analysisResult?.suggestedProjectName || ''}
                                  onChange={(e) => setNewProjectName(e.target.value)}
                                  placeholder="Enter project name"
                                  className="w-full"
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
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
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
                                    variant="outline"
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
                                onValueChange={(value) => {
                                  if (value === 'new') {
                                    setNewProjectName(analysisResult?.suggestedProjectName || '');
                                    setIsCreatingProject(true);
                                  } else {
                                    setEditedProjectId(value);
                                  }
                                }}
                                disabled={!editedClientId && !analysisResult?.suggestedClientName}
                              >
                                <SelectTrigger className="truncate">
                                  <SelectValue placeholder={
                                    !editedClientId && !analysisResult?.suggestedClientName 
                                      ? "Select a client first" 
                                      : editedProjectId 
                                        ? undefined 
                                        : analysisResult?.suggestedProjectName 
                                          ? `Use suggested: ${analysisResult.suggestedProjectName.length > 40 ? analysisResult.suggestedProjectName.substring(0, 40) + '...' : analysisResult.suggestedProjectName}` 
                                          : "Select a project"
                                  } />
                                </SelectTrigger>
                                <SelectContent>
                                  {projects.map((project) => (
                                    <SelectItem key={project._id} value={project._id}>
                                      {project.name}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="new">+ Create New Project</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}


                    {/* File Document Button - Show when not filed yet */}
                    {!filedDocumentId && (
                      <Button
                        onClick={handleFileDocument}
                        disabled={isFiling || (!isInternal && !editedClientId)}
                        className="w-full bg-black text-white hover:bg-gray-800"
                      >
                        {isFiling ? 'Filing...' : 'File Document'}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Right Column: File Analysis */}
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <div className="bg-blue-600 text-white px-3 py-2">
                    <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                      File Analysis
                    </span>
                  </div>
                  <CardContent className="pt-4 space-y-4">
                    {/* Summary - Editable with Edit Icon */}
                    <div className="relative">
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
                    <div className="relative">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <EditableField
                          value={editedFileType}
                          onChange={setEditedFileType}
                          label="File Type"
                          placeholder="e.g., PDF, Excel"
                          className="relative"
                        />
                      </div>
                      <div className="relative">
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
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Confidence
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${analysisResult.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">
                            {(analysisResult.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Folder Placement - Moved here from File Assignment */}
                    {!isInternal && (
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Folder Placement
                        </label>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2 text-sm mb-2">
                            {isBaseDocument ? (
                              <>
                                <Building2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <span className="text-gray-900 truncate">
                                  Base Documents ({selectedClient?.name || analysisResult?.suggestedClientName || 'Client'})
                                </span>
                              </>
                            ) : editedProjectId || analysisResult?.suggestedProjectName ? (
                              <>
                                <FolderKanban className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <span className="text-gray-900 truncate">
                                  {(() => {
                                    const projectName = selectedProject?.name || analysisResult?.suggestedProjectName || 'Project';
                                    return projectName.length > 50 ? projectName.substring(0, 50) + '...' : projectName;
                                  })()} Folder
                                </span>
                              </>
                            ) : (
                              <>
                                <FolderKanban className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <span className="text-gray-900 truncate">
                                  Will be placed in Base Documents or Project folder when selected
                                </span>
                              </>
                            )}
                          </div>
                          {(editedClientId || analysisResult?.suggestedClientName) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setFolderSelectionModalOpen(true)}
                              className="w-full"
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
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          Extracted Data
                        </label>
                        <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64 border border-gray-200">
                          {JSON.stringify(analysisResult.extractedData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Comments Section */}
            <CommentsSection
              jobId={!filedDocumentId ? jobId : undefined}
              documentId={filedDocumentId || undefined}
            />
            </>
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
