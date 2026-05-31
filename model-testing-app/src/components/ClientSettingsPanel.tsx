'use client';

import { useState, useEffect } from 'react';
import { Settings, User, FileText, Database, FolderOpen } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useUpdateClient, useClient, useProjectsByClient } from '@/lib/clientStorage';
import { toast } from 'sonner';
import DangerZone from './DangerZone';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useColors } from '@/lib/useColors';
import { Panel, Field, Input, Textarea, Button } from '@/components/layouts';
import DocumentNamingSettings from '@/components/settings/DocumentNamingSettings';
import CanonicalFieldPreferences from '@/components/settings/CanonicalFieldPreferences';
import FolderManagement from '@/components/settings/FolderManagement';

interface ClientSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  defaultTab?: 'general' | 'naming' | 'fields' | 'folders';
  onTrash?: () => void;
}

export default function ClientSettingsPanel({
  isOpen,
  onClose,
  clientId,
  defaultTab = 'general',
  onTrash,
}: ClientSettingsPanelProps) {
  const client = useClient(clientId);
  const updateClient = useUpdateClient();
  const projects = useProjectsByClient(clientId) || [];
  const deleteClientMutation = useMutation(api.clients.remove);
  const restoreClientMutation = useMutation(api.clients.restore);
  const colors = useColors();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isSaving, setIsSaving] = useState(false);

  const activeProjectCount = projects.filter((p: any) => p.status === 'active').length;

  // General settings form state
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    industry: '',
    notes: '',
  });

  // Update form data when client loads
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        companyName: client.companyName || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        country: client.country || '',
        phone: client.phone || '',
        email: client.email || '',
        website: client.website || '',
        industry: client.industry || '',
        notes: client.notes || '',
      });
    }
  }, [client]);

  // Reset to default tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  const handleSaveGeneral = async () => {
    if (!client) return;

    setIsSaving(true);
    try {
      await updateClient({
        id: clientId,
        name: formData.name || undefined,
        companyName: formData.companyName || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip: formData.zip || undefined,
        country: formData.country || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        website: formData.website || undefined,
        industry: formData.industry || undefined,
        notes: formData.notes || undefined,
      });
    } catch (error) {
      console.error('Failed to update client:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!client) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2" style={{ color: colors.text.primary }}>
            <Settings className="w-5 h-5" style={{ color: colors.text.muted }} />
            Client Settings
          </SheetTitle>
          <SheetDescription style={{ color: colors.text.muted }}>
            Configure settings for {client.name}
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
          <TabsContent value="general" className="space-y-4">
            <Panel title="Basic Information">
              <div className="grid gap-4">
                <Field label="Client Name *">
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter client name"
                  />
                </Field>
                <Field label="Company Name">
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    placeholder="Enter company name"
                  />
                </Field>
                <Field label="Industry">
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => handleInputChange('industry', e.target.value)}
                    placeholder="e.g., Real Estate, Finance"
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Contact Information">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="+44 20 1234 5678"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Website">
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      placeholder="https://example.com"
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="Address">
              <div className="grid gap-4">
                <Field label="Street Address">
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="123 Main Street"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City">
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="London"
                    />
                  </Field>
                  <Field label="State/Region">
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="Greater London"
                    />
                  </Field>
                  <Field label="Postal Code">
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={(e) => handleInputChange('zip', e.target.value)}
                      placeholder="SW1A 1AA"
                    />
                  </Field>
                  <Field label="Country">
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      placeholder="United Kingdom"
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="Notes">
              <Field>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Add any additional notes about this client..."
                  style={{ minHeight: 100 }}
                />
              </Field>
            </Panel>

            <div className="flex justify-end pt-4" style={{ borderTop: `1px solid ${colors.border.default}` }}>
              <Button variant="primary" onClick={handleSaveGeneral} disabled={isSaving || !formData.name}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>

            <DangerZone
              entityType="client"
              entityName={client?.name || formData.name || 'this client'}
              cascadeCount={activeProjectCount}
              onConfirmTrash={async () => {
                await deleteClientMutation({ id: clientId });
                toast(`${client?.name || 'Client'} moved to trash`, {
                  duration: 8000,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restoreClientMutation({ id: clientId });
                      toast.success(`${client?.name || 'Client'} restored`);
                    },
                  },
                });
                onClose();
                onTrash?.();
              }}
            />
          </TabsContent>

          {/* Document Naming Tab */}
          <TabsContent value="naming" className="space-y-6">
            <DocumentNamingSettings
              entityType="client"
              clientId={clientId}
              clientName={client.name}
              metadata={client.metadata}
              onSave={async (namingSettings) => {
                try {
                  await updateClient({
                    id: clientId,
                    metadata: {
                      ...(client.metadata || {}),
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
              entityType="client"
              preferences={client.metadata?.fieldPreferences}
              onSave={async (preferences) => {
                try {
                  await updateClient({
                    id: clientId,
                    metadata: {
                      ...(client.metadata || {}),
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
              entityType="client"
              clientId={clientId}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
