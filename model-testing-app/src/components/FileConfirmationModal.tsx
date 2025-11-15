'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult, FileMetadata } from '@/types';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, FileText, Building2, FolderKanban, ArrowRight, ArrowLeft } from 'lucide-react';
import React from 'react';

interface FileConfirmationModalProps {
  isOpen: boolean;
  file: FileMetadata | null;
  analysisResult: AnalysisResult | null;
  onConfirm: (file: FileMetadata, clientId: string | null, projectId: string | null) => void;
  onCancel: () => void;
}

type Step = 'client' | 'project' | 'review' | 'completed';

// Helper functions removed - inline logic is clearer given TypeScript narrowing

export default function FileConfirmationModal({
  isOpen,
  file,
  analysisResult,
  onConfirm,
  onCancel,
}: FileConfirmationModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('client');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [finalClientId, setFinalClientId] = useState<string | null>(null);
  const [finalProjectId, setFinalProjectId] = useState<string | null>(null);

  // Convex hooks
  const clients = useClients() || [];
  const projects = useProjectsByClient(selectedClientId ? (selectedClientId as Id<"clients">) : undefined) || [];
  const createClient = useCreateClient();
  const createProject = useCreateProject();
  const selectedClientData = useClient(selectedClientId ? (selectedClientId as Id<"clients">) : undefined);
  const selectedProjectData = useProject(selectedProjectId ? (selectedProjectId as Id<"projects">) : undefined);

  useEffect(() => {
    if (isOpen && analysisResult) {
      // Reset state
      setNewClientName(analysisResult.suggestedClientName || '');
      setNewProjectName(analysisResult.suggestedProjectName || '');
      setIsCreatingClient(false);
      setIsCreatingProject(false);
      setCreatedClientId(null);
      setCreatedProjectId(null);
      setFinalClientId(null);
      setFinalProjectId(null);
      
      // Auto-select and advance if matches exist
      if (analysisResult.clientId) {
        setSelectedClientId(analysisResult.clientId);
        
        if (analysisResult.projectId) {
          // Both client and project matched - skip to review
          setSelectedProjectId(analysisResult.projectId);
          setStep('review');
        } else {
          // Only client matched - go to project step
          setStep('project');
        }
      } else {
        // No client match - start at client step
        setStep('client');
        setSelectedClientId(null);
        setSelectedProjectId(null);
      }
    }
  }, [isOpen, analysisResult]);

  // Projects are automatically loaded via useProjectsByClient hook when selectedClientId changes
  // No need for separate useEffect

  const handleClientSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingClient(true);
      setSelectedClientId(null);
    } else if (value === 'internal') {
      // Skip to completion with null client/project
      handleInternalDocument();
    } else {
      setIsCreatingClient(false);
      setSelectedClientId(value);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const clientId = await createClient({ name: newClientName.trim() });
      setSelectedClientId(clientId as string);
      setCreatedClientId(clientId as string);
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
    if (!newProjectName.trim() || !selectedClientId) return;
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        clientRoles: [{ clientId: selectedClientId as Id<"clients">, role: 'primary' }],
      });
      setSelectedProjectId(projectId as string);
      setCreatedProjectId(projectId as string);
      setIsCreatingProject(false);
      setNewProjectName('');
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleInternalDocument = () => {
    if (file && analysisResult) {
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setFinalClientId(null);
      setFinalProjectId(null);
      setStep('review');
    }
  };

  const handleNext = () => {
    if (step === 'client') {
      if (selectedClientId) {
        setStep('project');
      }
    } else if (step === 'project') {
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'project') {
      setStep('client');
    } else if (step === 'review') {
      // If it's an internal document (no client), go back to client step
      // Otherwise go back to project step
      if (!selectedClientId) {
        setStep('client');
      } else {
        setStep('project');
      }
    }
  };

  const handleConfirm = async () => {
    if (!file || !analysisResult) return;
    
    let clientId: string | null = null;
    let projectId: string | null = null;

    // Handle client creation or selection
    if (isCreatingClient && newClientName.trim()) {
      try {
        const newClientId = await createClient({ name: newClientName.trim() });
        clientId = newClientId as string;
        setCreatedClientId(newClientId as string);
      } catch (error) {
        console.error('Error creating client:', error);
        return;
      }
    } else if (selectedClientId) {
      clientId = selectedClientId;
    }

    // Handle project creation or selection (only if client exists)
    if (clientId) {
      if (isCreatingProject && newProjectName.trim()) {
        try {
          const newProjectId = await createProject({
            name: newProjectName.trim(),
            clientRoles: [{ clientId: clientId as Id<"clients">, role: 'primary' }],
          });
          projectId = newProjectId as string;
          setCreatedProjectId(newProjectId as string);
        } catch (error) {
          console.error('Error creating project:', error);
          return;
        }
      } else if (selectedProjectId) {
        projectId = selectedProjectId;
      }
    }

    setFinalClientId(clientId);
    setFinalProjectId(projectId);
    onConfirm(file, clientId, projectId);
    setStep('completed');
  };

  const getClientName = (id: string | null) => {
    if (!id) return null;
    // Find client in the clients array from hook - Convex uses _id
    const client = clients.find(c => {
      const clientId = (c as any)._id || (c as any).id;
      return clientId === id;
    });
    return client?.name || null;
  };

  const getProjectName = (id: string | null) => {
    if (!id) return null;
    // Find project in the projects array from hook - Convex uses _id
    const project = projects.find(p => {
      const projectId = (p as any)._id || (p as any).id;
      return projectId === id;
    });
    return project?.name || null;
  };

  if (!isOpen || !file || !analysisResult) return null;

  const canProceedFromClient = selectedClientId || (isCreatingClient && newClientName.trim());
  const canProceedFromProject = selectedProjectId !== undefined; // Can be null (no project) or a project ID
  const selectedClient = selectedClientData;
  const selectedProject = selectedProjectData;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 border-0 bg-transparent shadow-none" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>
            {step === 'client' && 'Organize File - Select Client'}
            {step === 'project' && 'Select Project'}
            {step === 'review' && 'Review & Confirm File Organization'}
            {step === 'completed' && 'File Organized Successfully'}
          </DialogTitle>
        </DialogHeader>
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Progress Indicator */}
          {step !== 'completed' && (
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`flex items-center ${step === 'client' ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'client' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    {step === 'client' ? '1' : <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <span className="ml-2 text-sm font-medium">Client</span>
                </div>
                <div className={`flex-1 h-0.5 mx-2 ${step !== 'client' ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <div className={`flex items-center ${step === 'project' ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === 'project' 
                      ? 'bg-blue-100' 
                      : step !== 'client' && (step === 'review' || step === 'completed')
                      ? 'bg-blue-100'
                      : 'bg-gray-100'
                  }`}>
                    {step === 'project' 
                      ? '2' 
                      : step !== 'client' && (step === 'review' || step === 'completed')
                      ? <CheckCircle2 className="w-5 h-5" />
                      : '2'}
                  </div>
                  <span className="ml-2 text-sm font-medium">Project</span>
                </div>
                <div className={`flex-1 h-0.5 mx-2 ${step === 'review' ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <div className={`flex items-center ${step === 'review' ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'review' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    {step === 'review' ? '3' : '3'}
                  </div>
                  <span className="ml-2 text-sm font-medium">Review</span>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 py-6">
            {/* Step 1: Client Selection */}
            {step === 'client' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 mb-1">Organize File</h2>
                      <p className="text-sm text-gray-600">{file.name}</p>
                    </div>
                  </div>

                  {analysisResult.suggestedClientName && !analysisResult.clientId && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-900 font-medium mb-1">AI Suggestion</p>
                      <p className="text-sm text-blue-800">
                        Based on the file content, we detected a potential client: <span className="font-semibold">{analysisResult.suggestedClientName}</span>
                      </p>
                      {analysisResult.reasoning && (
                        <p className="text-xs text-blue-700 mt-2 italic">
                          {analysisResult.reasoning.split('.').slice(0, 2).join('.')}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Select Client
                    </label>
                    {isCreatingClient ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          placeholder="Enter client name"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleCreateClient}
                            disabled={!newClientName.trim()}
                            className="flex-1"
                          >
                            Create Client
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsCreatingClient(false);
                              setNewClientName(analysisResult?.suggestedClientName || '');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Select value={selectedClientId || ''} onValueChange={handleClientSelect}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a client..." />
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
                                <span>+ Create:</span>
                                <span className="font-medium">{analysisResult.suggestedClientName}</span>
                              </div>
                            </SelectItem>
                          )}
                          <SelectItem value="internal">
                            <div className="flex items-center gap-2 text-green-600">
                              <span>Mark as Internal Document</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button
                    variant="outline"
                    onClick={onCancel}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={!canProceedFromClient}
                    className="flex-1"
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Project Selection */}
            {step === 'project' && selectedClient && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                      <FolderKanban className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Project</h2>
                      <p className="text-sm text-gray-600">Client: <span className="font-medium">{selectedClient.name}</span></p>
                    </div>
                  </div>

                  {analysisResult.suggestedProjectName && !analysisResult.projectId && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-purple-900 font-medium mb-1">AI Suggestion</p>
                      <p className="text-sm text-purple-800">
                        We detected a potential project: <span className="font-semibold">{analysisResult.suggestedProjectName}</span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Select Project (Optional)
                    </label>
                    {isCreatingProject ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          placeholder="Enter project name"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleCreateProject}
                            disabled={!newProjectName.trim()}
                            className="flex-1"
                          >
                            Create Project
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsCreatingProject(false);
                              setNewProjectName(analysisResult?.suggestedProjectName || '');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Select value={selectedProjectId || 'none'} onValueChange={handleProjectSelect}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a project..." />
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
                                <span>+ Create:</span>
                                <span className="font-medium">{analysisResult.suggestedProjectName}</span>
                              </div>
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1"
                  >
                    Review
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 'review' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 mb-1">Review & Confirm</h2>
                      <p className="text-sm text-gray-600">Please review the file organization details</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">File</p>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{analysisResult.fileType}</Badge>
                      <Badge variant="outline">{analysisResult.category}</Badge>
                    </div>
                    {selectedClientId ? (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Client</p>
                        <p className="text-sm font-medium text-gray-900">
                          {getClientName(selectedClientId)}
                          {createdClientId && <span className="ml-2 text-xs text-green-600">(New)</span>}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Document Type</p>
                        <p className="text-sm font-medium text-green-600">Internal RockCap Document</p>
                      </div>
                    )}
                    {selectedProjectId && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Project</p>
                        <p className="text-sm font-medium text-gray-900">
                          {getProjectName(selectedProjectId)}
                          {createdProjectId && <span className="ml-2 text-xs text-green-600">(New)</span>}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Confirm & Save
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Completed */}
            {step === 'completed' && (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">File Organized Successfully</h2>
                  <p className="text-sm text-gray-600">
                    {file.name} has been saved and organized.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-left">
                  {finalClientId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Client:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {getClientName(finalClientId)}
                        {createdClientId && <span className="ml-2 text-xs text-green-600">(Created)</span>}
                      </span>
                    </div>
                  )}
                  {finalProjectId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Project:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {getProjectName(finalProjectId)}
                        {createdProjectId && <span className="ml-2 text-xs text-green-600">(Created)</span>}
                      </span>
                    </div>
                  )}
                  {!finalClientId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Type:</span>
                      <span className="text-sm font-medium text-green-600">Internal Document</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-4 border-t border-gray-100">
                  {finalClientId && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        router.push(`/clients/${finalClientId}`);
                        onCancel();
                      }}
                      className="w-full"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      View Client
                    </Button>
                  )}
                  {finalProjectId && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        router.push(`/projects/${finalProjectId}`);
                        onCancel();
                      }}
                      className="w-full"
                    >
                      <FolderKanban className="w-4 h-4 mr-2" />
                      View Project
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      router.push(`/docs/${file.id}`);
                      onCancel();
                    }}
                    className="w-full"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View File
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onCancel}
                    className="w-full mt-2"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
