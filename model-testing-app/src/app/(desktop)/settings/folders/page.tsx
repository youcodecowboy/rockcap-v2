'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import {
  Panel,
  Button,
  Field,
  Select,
  FlagChip,
  TabStrip,
} from '@/components/layouts';
import {
  FolderTree,
  FileText,
  RefreshCw,
  AlertTriangle,
  Building2,
  Briefcase,
} from 'lucide-react';
import FolderTemplateEditor from '@/components/FolderTemplateEditor';
import PlacementRulesTable from '@/components/PlacementRulesTable';

export default function FolderSettingsPage() {
  const colors = useColors();
  const [selectedClientType, setSelectedClientType] = useState<string>('borrower');
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'templates' | 'rules'>('templates');

  // Queries
  const clientTypes = useQuery(api.folderTemplates.getClientTypes);
  const clientTemplate = useQuery(
    api.folderTemplates.getByClientTypeAndLevel,
    { clientType: selectedClientType, level: 'client' }
  );
  const projectTemplate = useQuery(
    api.folderTemplates.getByClientTypeAndLevel,
    { clientType: selectedClientType, level: 'project' }
  );
  const placementRules = useQuery(
    api.placementRules.getByClientType,
    { clientType: selectedClientType }
  );

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <FolderTree style={{ width: 22, height: 22, color: colors.text.muted }} />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>Folder Structure Settings</h1>
              <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted }}>
                Configure folder templates and document placement rules for different client types
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleRefresh}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        </div>

        {/* Client Type Selector */}
        <div className="mb-6">
          <Panel title="Client Type">
            <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
              Select a client type to view and edit its folder structure and placement rules
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div style={{ width: 250 }}>
                <Field label="Client type">
                  <Select
                    value={selectedClientType}
                    onChange={(e) => setSelectedClientType(e.target.value)}
                  >
                    <option value="borrower">Borrower</option>
                    <option value="lender">Lender</option>
                    {clientTypes?.filter(t => t !== 'borrower' && t !== 'lender').map(type => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <FlagChip
                  severity="info"
                  label={clientTemplate ? `${clientTemplate.folders.length} client folders` : 'No client template'}
                />
                <FlagChip
                  severity="info"
                  label={projectTemplate ? `${projectTemplate.folders.length} project folders` : 'No project template'}
                />
                <FlagChip severity="info" label={`${placementRules?.length ?? 0} placement rules`} />
              </div>
            </div>
          </Panel>
        </div>

        {/* Main Tabs */}
        <div style={{ marginBottom: 24 }}>
          <TabStrip
            entityType="project"
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'templates' | 'rules')}
            tabs={[
              { id: 'templates', label: 'Folder Templates' },
              { id: 'rules', label: 'Placement Rules' },
            ]}
          />
        </div>

        {/* Folder Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            {/* Warning if no templates */}
            {!clientTemplate && !projectTemplate && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 16,
                  borderRadius: 4,
                  color: colors.accent.orange,
                  background: `${colors.accent.orange}15`,
                  border: `1px solid ${colors.accent.orange}40`,
                }}
              >
                <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>No templates found for {selectedClientType}</p>
                  <p style={{ fontSize: 11, color: colors.text.secondary }}>Run the seed migration to create default templates.</p>
                </div>
              </div>
            )}

            {/* Client-level Folders */}
            <Panel title="Client-level Folders">
              <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
                Folders created automatically when a new {selectedClientType} client is added
              </p>
              {clientTemplate ? (
                <FolderTemplateEditor
                  key={`client-${selectedClientType}-${refreshKey}`}
                  templateId={clientTemplate._id}
                  folders={clientTemplate.folders}
                  level="client"
                  clientType={selectedClientType}
                />
              ) : (
                <p style={{ fontSize: 12, color: colors.text.muted }}>No client-level template defined</p>
              )}
            </Panel>

            {/* Project-level Folders */}
            <Panel title="Project-level Folders">
              <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
                Folders created automatically when a new project is added for a {selectedClientType} client
              </p>
              {projectTemplate ? (
                <FolderTemplateEditor
                  key={`project-${selectedClientType}-${refreshKey}`}
                  templateId={projectTemplate._id}
                  folders={projectTemplate.folders}
                  level="project"
                  clientType={selectedClientType}
                />
              ) : (
                <p style={{ fontSize: 12, color: colors.text.muted }}>No project-level template defined</p>
              )}
            </Panel>
          </div>
        )}

        {/* Placement Rules Tab */}
        {activeTab === 'rules' && (
          <Panel title="Document Placement Rules">
            <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
              Define which folders documents should be filed into based on their type and category.
              Rules are specific to {selectedClientType} clients.
            </p>
            <PlacementRulesTable
              key={`rules-${selectedClientType}-${refreshKey}`}
              clientType={selectedClientType}
              rules={placementRules ?? []}
              clientFolders={clientTemplate?.folders ?? []}
              projectFolders={projectTemplate?.folders ?? []}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
