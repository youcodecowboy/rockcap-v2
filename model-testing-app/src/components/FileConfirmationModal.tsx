'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult, FileMetadata } from '@/types';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Input, Select, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
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

  const stepTitle =
    step === 'client' ? 'Organize File' :
    step === 'project' ? 'Select Project' :
    step === 'review' ? 'Review & Confirm' :
    'File Organized';

  const metaPill = (label: string) => (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, textTransform: 'uppercase', background: colors.bg.cardAlt, color: colors.text.muted, border: `1px solid ${colors.border.default}` }}>
      {label}
    </span>
  );

  const reviewBlock: React.CSSProperties = { background: colors.bg.light, borderRadius: 4, padding: 16, border: `1px solid ${colors.border.default}` };

  return (
    <Modal open={isOpen} onClose={onCancel} title={stepTitle} width={500}>
      {/* Progress Indicator */}
      {step !== 'completed' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          {[
            { key: 'client', label: 'Client', n: '1' },
            { key: 'project', label: 'Project', n: '2' },
            { key: 'review', label: 'Review', n: '3' },
          ].map((s, idx) => {
            const order = ['client', 'project', 'review'];
            const done = order.indexOf(step) > idx;
            const active = step === s.key;
            const tone = active || done ? colors.accent.blue : colors.text.dim;
            return (
              <React.Fragment key={s.key}>
                {idx > 0 && (
                  <div style={{ flex: 1, height: 1, margin: '0 8px', background: done || active ? colors.accent.blue : colors.border.default }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', color: tone }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active || done ? `${colors.accent.blue}20` : colors.bg.cardAlt, fontSize: 12 }}>
                    {done ? <CheckCircle2 size={16} /> : s.n}
                  </div>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500 }}>{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Step 1: Client Selection */}
      {step === 'client' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 4, background: `${colors.accent.blue}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} style={{ color: colors.accent.blue }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginBottom: 2 }}>Organize File</h2>
                <p style={{ fontSize: 12, color: colors.text.muted }}>{file.name}</p>
              </div>
            </div>

            {analysisResult.suggestedClientName && !analysisResult.clientId && (
              <div style={{ background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40`, borderRadius: 4, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: colors.accent.blue, fontWeight: 500, marginBottom: 4 }}>AI Suggestion</p>
                <p style={{ fontSize: 12, color: colors.text.secondary }}>
                  Based on the file content, we detected a potential client: <span style={{ fontWeight: 600 }}>{analysisResult.suggestedClientName}</span>
                </p>
                {analysisResult.reasoning && (
                  <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 8, fontStyle: 'italic' }}>
                    {analysisResult.reasoning.split('.').slice(0, 2).join('.')}
                  </p>
                )}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: colors.text.primary, marginBottom: 8 }}>Select Client</label>
            {isCreatingClient ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Enter client name" autoFocus />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={handleCreateClient} disabled={!newClientName.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                    Create Client
                  </Button>
                  <Button variant="secondary" onClick={() => { setIsCreatingClient(false); setNewClientName(analysisResult?.suggestedClientName || ''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Select value={selectedClientId || ''} onChange={(e) => handleClientSelect(e.target.value)}>
                <option value="" disabled>Choose a client...</option>
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
                <option value="internal">Mark as Internal Document</option>
              </Select>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
            <Button variant="secondary" onClick={onCancel} style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleNext} disabled={!canProceedFromClient} style={{ flex: 1, justifyContent: 'center' }}>
              Next
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Project Selection */}
      {step === 'project' && selectedClient && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 4, background: `${colors.accent.purple}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderKanban size={18} style={{ color: colors.accent.purple }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginBottom: 2 }}>Select Project</h2>
                <p style={{ fontSize: 12, color: colors.text.muted }}>Client: <span style={{ fontWeight: 500 }}>{selectedClient.name}</span></p>
              </div>
            </div>

            {analysisResult.suggestedProjectName && !analysisResult.projectId && (
              <div style={{ background: `${colors.accent.purple}15`, border: `1px solid ${colors.accent.purple}40`, borderRadius: 4, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: colors.accent.purple, fontWeight: 500, marginBottom: 4 }}>AI Suggestion</p>
                <p style={{ fontSize: 12, color: colors.text.secondary }}>
                  We detected a potential project: <span style={{ fontWeight: 600 }}>{analysisResult.suggestedProjectName}</span>
                </p>
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: colors.text.primary, marginBottom: 8 }}>Select Project (Optional)</label>
            {isCreatingProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Enter project name" autoFocus />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={handleCreateProject} disabled={!newProjectName.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                    Create Project
                  </Button>
                  <Button variant="secondary" onClick={() => { setIsCreatingProject(false); setNewProjectName(analysisResult?.suggestedProjectName || ''); }}>
                    Cancel
                  </Button>
                </div>
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
          </div>

          <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
            <Button variant="secondary" onClick={handleBack} style={{ flex: 1, justifyContent: 'center' }}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button variant="primary" onClick={handleNext} style={{ flex: 1, justifyContent: 'center' }}>
              Review
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 4, background: `${colors.accent.green}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={18} style={{ color: colors.accent.green }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginBottom: 2 }}>Review & Confirm</h2>
                <p style={{ fontSize: 12, color: colors.text.muted }}>Please review the file organization details</p>
              </div>
            </div>

            <div style={{ ...reviewBlock, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ fontSize: 10, color: colors.text.muted, marginBottom: 2 }}>File</p>
                <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{file.name}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {metaPill(analysisResult.fileType)}
                {metaPill(analysisResult.category)}
              </div>
              {selectedClientId ? (
                <div>
                  <p style={{ fontSize: 10, color: colors.text.muted, marginBottom: 2 }}>Client</p>
                  <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {getClientName(selectedClientId)}
                    {createdClientId && <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent.green }}>(New)</span>}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 10, color: colors.text.muted, marginBottom: 2 }}>Document Type</p>
                  <p style={{ fontSize: 12, fontWeight: 500, color: colors.accent.green }}>Internal RockCap Document</p>
                </div>
              )}
              {selectedProjectId && (
                <div>
                  <p style={{ fontSize: 10, color: colors.text.muted, marginBottom: 2 }}>Project</p>
                  <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {getProjectName(selectedProjectId)}
                    {createdProjectId && <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent.green }}>(New)</span>}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
            <Button variant="secondary" onClick={handleBack} style={{ flex: 1, justifyContent: 'center' }}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button variant="primary" accent={colors.accent.green} onClick={handleConfirm} style={{ flex: 1, justifyContent: 'center' }}>
              Confirm & Save
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Completed */}
      {step === 'completed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${colors.accent.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} style={{ color: colors.accent.green }} />
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginBottom: 8 }}>File Organized Successfully</h2>
            <p style={{ fontSize: 12, color: colors.text.muted }}>
              {file.name} has been saved and organized.
            </p>
          </div>

          <div style={{ ...reviewBlock, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            {finalClientId && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: colors.text.muted }}>Client:</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                  {getClientName(finalClientId)}
                  {createdClientId && <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent.green }}>(Created)</span>}
                </span>
              </div>
            )}
            {finalProjectId && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: colors.text.muted }}>Project:</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                  {getProjectName(finalProjectId)}
                  {createdProjectId && <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent.green }}>(Created)</span>}
                </span>
              </div>
            )}
            {!finalClientId && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: colors.text.muted }}>Type:</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.accent.green }}>Internal Document</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
            {finalClientId && (
              <Button variant="secondary" onClick={() => { router.push(`/clients/${finalClientId}`); onCancel(); }} style={{ width: '100%', justifyContent: 'center' }}>
                <Building2 size={16} />
                View Client
              </Button>
            )}
            {finalProjectId && (
              <Button variant="secondary" onClick={() => { router.push(`/projects/${finalProjectId}`); onCancel(); }} style={{ width: '100%', justifyContent: 'center' }}>
                <FolderKanban size={16} />
                View Project
              </Button>
            )}
            <Button variant="primary" onClick={() => { router.push(`/docs/${file.id}`); onCancel(); }} style={{ width: '100%', justifyContent: 'center' }}>
              <FileText size={16} />
              View File
            </Button>
            <Button variant="ghost" onClick={onCancel} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
