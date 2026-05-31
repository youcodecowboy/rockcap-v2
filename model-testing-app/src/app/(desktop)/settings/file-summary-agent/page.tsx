'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import {
  Panel,
  Button,
  StatusPill,
  FlagChip,
  EmptyState,
  Skeleton,
} from '@/components/layouts';
import { Plus, FileText, Edit2, Trash2, Eye } from 'lucide-react';
import FileTypeDefinitionDrawer from '@/components/FileTypeDefinitionDrawer';
import FileTypeDefinitionView from '@/components/FileTypeDefinitionView';
import KeywordLearningDashboard from '@/components/settings/KeywordLearningDashboard';

export default function FileSummaryAgentSettings() {
  const colors = useColors();
  const [selectedDefinition, setSelectedDefinition] = useState<Id<'fileTypeDefinitions'> | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [viewingDefinition, setViewingDefinition] = useState<Id<'fileTypeDefinitions'> | null>(null);

  const definitions = useQuery(api.fileTypeDefinitions.getAllIncludingInactive);
  const removeDefinition = useMutation(api.fileTypeDefinitions.remove);
  const seedDefinitions = useMutation(api.fileTypeDefinitions.seedDefinitions);

  const handleAdd = () => {
    setSelectedDefinition(null);
    setIsAddModalOpen(true);
  };

  const handleEdit = (id: Id<'fileTypeDefinitions'>) => {
    setSelectedDefinition(id);
    setIsEditModalOpen(true);
  };

  const handleView = (id: Id<'fileTypeDefinitions'>) => {
    setViewingDefinition(id);
  };

  const handleDelete = async (id: Id<'fileTypeDefinitions'>) => {
    if (confirm('Are you sure you want to delete this file type definition? This will make it inactive.')) {
      try {
        await removeDefinition({ id });
      } catch (error) {
        console.error('Failed to delete file type definition:', error);
        alert('Failed to delete file type definition. Please try again.');
      }
    }
  };

  const handleSeedDefinitions = async () => {
    if (confirm('This will seed the database with default file type definitions. Continue?')) {
      try {
        const result = await seedDefinitions({});
        alert(result.message || `Seeded ${result.count} file type definitions`);
      } catch (error) {
        console.error('Failed to seed definitions:', error);
        alert('Failed to seed file type definitions. Please try again.');
      }
    }
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    setSelectedDefinition(null);
  };

  // Group definitions by category
  const groupedDefinitions = definitions?.reduce((acc, def) => {
    if (!acc[def.category]) {
      acc[def.category] = [];
    }
    acc[def.category].push(def);
    return acc;
  }, {} as Record<string, typeof definitions>) || {};

  const categories = Object.keys(groupedDefinitions).sort();

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText style={{ width: 22, height: 22, color: colors.text.muted }} />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>File Summary Agent Settings</h1>
              <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted, maxWidth: 640 }}>
                Manage file types and examples for automatic file categorization. Add new file types with examples to improve the filing agent's accuracy.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {definitions !== undefined && definitions.length === 0 && (
              <Button onClick={handleSeedDefinitions} variant="secondary">
                <FileText style={{ width: 14, height: 14 }} />
                Seed Default Definitions
              </Button>
            )}
            <Button onClick={handleAdd} variant="primary">
              <Plus style={{ width: 14, height: 14 }} />
              Add File Type
            </Button>
          </div>
        </div>

        {/* Keyword Learning Dashboard */}
        <div className="mb-8">
          <KeywordLearningDashboard />
        </div>

        {/* File Type Definitions Library */}
        {definitions === undefined ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        ) : definitions.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title="No file type definitions found"
            action={<Button variant="primary" onClick={handleAdd}>Add Your First File Type</Button>}
          />
        ) : (
          <div className="space-y-6">
            {categories.map((category) => (
              <Panel
                key={category}
                title={category}
              >
                <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
                  {groupedDefinitions[category].length} file type{groupedDefinitions[category].length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {groupedDefinitions[category].map((def) => (
                    <div
                      key={def._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 14,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: 4,
                        background: colors.bg.card,
                        opacity: def.isActive ? 1 : 0.6,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{def.fileType}</h3>
                          {def.isSystemDefault && <FlagChip severity="info" label="System Default" />}
                          {!def.isActive && <StatusPill label="Inactive" tone={colors.text.dim} />}
                          {def.parentType && (
                            <FlagChip severity="info" label={`Subtype of ${def.parentType}`} />
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
                          {def.description.substring(0, 150)}...
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, fontSize: 10, color: colors.text.dim, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          <span>{def.keywords.length} keywords</span>
                          <span>{def.identificationRules.length} identification rules</span>
                          {def.exampleFileName && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <FileText style={{ width: 12, height: 12 }} />
                              Example file
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
                        <Button variant="ghost" size="sm" onClick={() => handleView(def._id)}>
                          <Eye style={{ width: 14, height: 14 }} />
                          View
                        </Button>
                        {!def.isSystemDefault && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(def._id)}>
                              <Edit2 style={{ width: 14, height: 14 }} />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(def._id)}
                              style={{ color: colors.accent.red }}
                            >
                              <Trash2 style={{ width: 14, height: 14 }} />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}

        {/* Add Drawer */}
        <FileTypeDefinitionDrawer
          isOpen={isAddModalOpen}
          onClose={handleModalClose}
          mode="create"
        />

        {/* Edit Drawer */}
        {selectedDefinition && (
          <FileTypeDefinitionDrawer
            isOpen={isEditModalOpen}
            onClose={handleModalClose}
            mode="edit"
            definitionId={selectedDefinition}
          />
        )}

        {/* View Modal */}
        {viewingDefinition && (
          <FileTypeDefinitionView
            definitionId={viewingDefinition}
            onClose={() => setViewingDefinition(null)}
          />
        )}
      </div>
    </div>
  );
}
