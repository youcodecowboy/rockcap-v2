'use client';

import { useState, useEffect } from 'react';
import { Settings, User, FileText, Database, FolderOpen } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import DocumentNamingSettings from '@/components/settings/DocumentNamingSettings';
import CanonicalFieldPreferences from '@/components/settings/CanonicalFieldPreferences';
import FolderManagement from '@/components/settings/FolderManagement';

interface ProjectSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  defaultTab?: 'general' | 'naming' | 'fields' | 'folders';
}

export default function ProjectSettingsPanel({
  isOpen,
  onClose,
  projectId,
  clientId,
  defaultTab = 'general',
}: ProjectSettingsPanelProps) {
  const project = useQuery(api.projects.get, { id: projectId });
  const updateProject = useMutation(api.projects.update);
  const [activeTab, setActiveTab] = useState(defaultTab);
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

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Project Settings
          </SheetTitle>
          <SheetDescription>
            Configure settings for {project.name}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="general" className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="naming" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Naming</span>
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-1.5">
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Fields</span>
            </TabsTrigger>
            <TabsTrigger value="folders" className="flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Folders</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Basic Information</h3>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="projectShortcode">Project Shortcode</Label>
                  <Input
                    id="projectShortcode"
                    value={formData.projectShortcode}
                    onChange={(e) => handleInputChange('projectShortcode', e.target.value.toUpperCase().slice(0, 10))}
                    placeholder="e.g., WIMBPARK28"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500">
                    Max 10 characters. Used for document naming.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Brief description of the project"
                    className="min-h-[80px]"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => handleInputChange('status', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on-hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="inactive">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dealPhase">Deal Phase</Label>
                    <Select
                      value={formData.dealPhase}
                      onValueChange={(value) => handleInputChange('dealPhase', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select phase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indicative_terms">Indicative Terms</SelectItem>
                        <SelectItem value="credit_submission">Credit Submission</SelectItem>
                        <SelectItem value="post_credit">Post Credit</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Location</h3>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="London"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State/Region</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="Greater London"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zip">Postal Code</Label>
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={(e) => handleInputChange('zip', e.target.value)}
                      placeholder="SW1A 1AA"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      placeholder="United Kingdom"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Timeline</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expectedCompletionDate">Expected Completion</Label>
                  <Input
                    id="expectedCompletionDate"
                    type="date"
                    value={formData.expectedCompletionDate}
                    onChange={(e) => handleInputChange('expectedCompletionDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Loan Details</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="loanNumber">Loan Number</Label>
                  <Input
                    id="loanNumber"
                    value={formData.loanNumber}
                    onChange={(e) => handleInputChange('loanNumber', e.target.value)}
                    placeholder="e.g., LN-2024-001"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount</Label>
                  <Input
                    id="loanAmount"
                    type="number"
                    value={formData.loanAmount}
                    onChange={(e) => handleInputChange('loanAmount', e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interestRate">Interest Rate (%)</Label>
                  <Input
                    id="interestRate"
                    type="number"
                    step="0.01"
                    value={formData.interestRate}
                    onChange={(e) => handleInputChange('interestRate', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Notes</h3>
              <div className="space-y-2">
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Add any additional notes about this project..."
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleSaveGeneral}
                disabled={isSaving || !formData.name}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </TabsContent>

          {/* Document Naming Tab */}
          <TabsContent value="naming" className="space-y-6">
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
          </TabsContent>

          {/* Field Preferences Tab */}
          <TabsContent value="fields" className="space-y-6">
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
          </TabsContent>

          {/* Folders Tab */}
          <TabsContent value="folders" className="space-y-6">
            <FolderManagement
              entityType="project"
              projectId={projectId}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
