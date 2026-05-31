'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button, Field, Input, Textarea, Select, TabStrip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import DocumentNamingSettings from '@/components/settings/DocumentNamingSettings';
import CanonicalFieldPreferences from '@/components/settings/CanonicalFieldPreferences';
import FolderManagement from '@/components/settings/FolderManagement';
import DangerZone from './DangerZone';
import { toast } from 'sonner';

interface ProjectSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  defaultTab?: 'general' | 'naming' | 'fields' | 'folders';
  onTrash?: () => void;
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'naming', label: 'Naming' },
  { id: 'fields', label: 'Fields' },
  { id: 'folders', label: 'Folders' },
];

export default function ProjectSettingsPanel({
  isOpen,
  onClose,
  projectId,
  clientId,
  defaultTab = 'general',
  onTrash,
}: ProjectSettingsPanelProps) {
  const colors = useColors();
  const project = useQuery(api.projects.get, { id: projectId });
  const updateProject = useMutation(api.projects.update);
  const deleteProjectMutation = useMutation(api.projects.remove);
  const restoreProjectMutation = useMutation(api.projects.restore);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isSaving, setIsSaving] = useState(false);

  // General settings form state
  const [formData, setFormData] = useState({
    name: '',
    projectShortcode: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    status: '' as '' | 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled',
    dealPhase: '' as '' | 'indicative_terms' | 'credit_submission' | 'post_credit' | 'completed',
    startDate: '',
    endDate: '',
    expectedCompletionDate: '',
    loanNumber: '',
    loanAmount: '',
    interestRate: '',
    notes: '',
  });

  // Update form data when project loads
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        projectShortcode: project.projectShortcode || '',
        description: project.description || '',
        address: project.address || '',
        city: project.city || '',
        state: project.state || '',
        zip: project.zip || '',
        country: project.country || '',
        status: project.status || '',
        dealPhase: project.dealPhase || '',
        startDate: project.startDate || '',
        endDate: project.endDate || '',
        expectedCompletionDate: project.expectedCompletionDate || '',
        loanNumber: project.loanNumber || '',
        loanAmount: project.loanAmount?.toString() || '',
        interestRate: project.interestRate?.toString() || '',
        notes: project.notes || '',
      });
    }
  }, [project]);

  // Reset to default tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  const handleSaveGeneral = async () => {
    if (!project) return;

    setIsSaving(true);
    try {
      await updateProject({
        id: projectId,
        name: formData.name || undefined,
        projectShortcode: formData.projectShortcode || undefined,
        description: formData.description || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip: formData.zip || undefined,
        country: formData.country || undefined,
        status: formData.status || undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        expectedCompletionDate: formData.expectedCompletionDate || undefined,
        loanNumber: formData.loanNumber || undefined,
        loanAmount: formData.loanAmount ? parseFloat(formData.loanAmount) : undefined,
        interestRate: formData.interestRate ? parseFloat(formData.interestRate) : undefined,
        notes: formData.notes || undefined,
      });
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!project) {
    return null;
  }

  const sectionTitleStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
    color: colors.text.muted,
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2" style={{ color: colors.text.primary }}>
            <Settings size={18} />
            Project Settings
          </SheetTitle>
          <SheetDescription style={{ color: colors.text.muted }}>
            Configure settings for {project.name}
          </SheetDescription>
        </SheetHeader>

        <div style={{ marginBottom: 24, marginLeft: -24, marginRight: -24 }}>
          <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} entityType="project" />
        </div>

        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={sectionTitleStyle}>Basic Information</h3>

              <Field label="Project Name *">
                <Input
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter project name"
                />
              </Field>

              <Field label="Project Shortcode" hint="Max 10 characters. Used for document naming.">
                <Input
                  value={formData.projectShortcode}
                  onChange={(e) => handleInputChange('projectShortcode', e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="e.g., WIMBPARK28"
                  maxLength={10}
                />
              </Field>

              <Field label="Description">
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Brief description of the project"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <Select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                  >
                    <option value="">Select status</option>
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="inactive">Archived</option>
                  </Select>
                </Field>

                <Field label="Deal Phase">
                  <Select
                    value={formData.dealPhase}
                    onChange={(e) => handleInputChange('dealPhase', e.target.value)}
                  >
                    <option value="">Select phase</option>
                    <option value="indicative_terms">Indicative Terms</option>
                    <option value="credit_submission">Credit Submission</option>
                    <option value="post_credit">Post Credit</option>
                    <option value="completed">Completed</option>
                  </Select>
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={sectionTitleStyle}>Location</h3>

              <Field label="Street Address">
                <Input
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="123 Main Street"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City">
                  <Input
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="London"
                  />
                </Field>

                <Field label="State/Region">
                  <Input
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    placeholder="Greater London"
                  />
                </Field>

                <Field label="Postal Code">
                  <Input
                    value={formData.zip}
                    onChange={(e) => handleInputChange('zip', e.target.value)}
                    placeholder="SW1A 1AA"
                  />
                </Field>

                <Field label="Country">
                  <Input
                    value={formData.country}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                    placeholder="United Kingdom"
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={sectionTitleStyle}>Timeline</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Start Date">
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                  />
                </Field>

                <Field label="Expected Completion">
                  <Input
                    type="date"
                    value={formData.expectedCompletionDate}
                    onChange={(e) => handleInputChange('expectedCompletionDate', e.target.value)}
                  />
                </Field>

                <Field label="End Date">
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={sectionTitleStyle}>Loan Details</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Loan Number">
                  <Input
                    value={formData.loanNumber}
                    onChange={(e) => handleInputChange('loanNumber', e.target.value)}
                    placeholder="e.g., LN-2024-001"
                  />
                </Field>

                <Field label="Loan Amount">
                  <Input
                    type="number"
                    value={formData.loanAmount}
                    onChange={(e) => handleInputChange('loanAmount', e.target.value)}
                    placeholder="0.00"
                  />
                </Field>

                <Field label="Interest Rate (%)">
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.interestRate}
                    onChange={(e) => handleInputChange('interestRate', e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={sectionTitleStyle}>Notes</h3>
              <Field>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Add any additional notes about this project..."
                  style={{ minHeight: 100 }}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
              <Button
                variant="primary"
                accent={colors.entityTypes.project}
                onClick={handleSaveGeneral}
                disabled={isSaving || !formData.name}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <DangerZone
              entityType="project"
              entityName={project?.name || formData.name || 'this project'}
              onConfirmTrash={async () => {
                await deleteProjectMutation({ id: projectId });
                toast(`${project?.name || 'Project'} moved to trash`, {
                  duration: 8000,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restoreProjectMutation({ id: projectId });
                      toast.success(`${project?.name || 'Project'} restored`);
                    },
                  },
                });
                onClose();
                onTrash?.();
              }}
            />
          </div>
        )}

        {/* Document Naming Tab */}
        {activeTab === 'naming' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <DocumentNamingSettings
              entityType="project"
              clientId={clientId}
              projectId={projectId}
              projectName={project.name}
              projectShortcode={project.projectShortcode}
              metadata={project.metadata}
              onShortcodeChange={async (shortcode) => {
                try {
                  await updateProject({
                    id: projectId,
                    projectShortcode: shortcode,
                  });
                } catch (error) {
                  console.error('Failed to update project shortcode:', error);
                }
              }}
              onSave={async (namingSettings) => {
                try {
                  await updateProject({
                    id: projectId,
                    metadata: {
                      ...(project.metadata || {}),
                      documentNaming: namingSettings,
                    },
                  });
                } catch (error) {
                  console.error('Failed to save naming settings:', error);
                }
              }}
            />
          </div>
        )}

        {/* Field Preferences Tab */}
        {activeTab === 'fields' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <CanonicalFieldPreferences
              entityType="project"
              preferences={project.metadata?.fieldPreferences}
              onSave={async (preferences) => {
                try {
                  await updateProject({
                    id: projectId,
                    metadata: {
                      ...(project.metadata || {}),
                      fieldPreferences: preferences,
                    },
                  });
                } catch (error) {
                  console.error('Failed to save field preferences:', error);
                }
              }}
            />
          </div>
        )}

        {/* Folders Tab */}
        {activeTab === 'folders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <FolderManagement
              entityType="project"
              projectId={projectId}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
