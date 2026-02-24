'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, Edit2, Trash2, Eye } from 'lucide-react';
import FileTypeDefinitionDrawer from '@/components/FileTypeDefinitionDrawer';
import FileTypeDefinitionView from '@/components/FileTypeDefinitionView';
import KeywordLearningDashboard from '@/components/settings/KeywordLearningDashboard';

export default function FileSummaryAgentSettings() {
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
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">File Summary Agent Settings</h1>
            <p className="mt-2 text-gray-600">
              Manage file types and examples for automatic file categorization. Add new file types with examples to improve the filing agent's accuracy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {definitions !== undefined && definitions.length === 0 && (
              <Button onClick={handleSeedDefinitions} variant="outline" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Seed Default Definitions
              </Button>
            )}
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
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
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-gray-500">Loading file type definitions...</div>
            </CardContent>
          </Card>
        ) : definitions.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No file type definitions found.</p>
                <Button onClick={handleAdd}>Add Your First File Type</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {categories.map((category) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-xl">{category}</CardTitle>
                  <CardDescription>
                    {groupedDefinitions[category].length} file type{groupedDefinitions[category].length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {groupedDefinitions[category].map((def) => (
                      <div
                        key={def._id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          def.isActive ? 'bg-white' : 'bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{def.fileType}</h3>
                            {def.isSystemDefault && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                System Default
                              </span>
                            )}
                            {!def.isActive && (
                              <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">
                                Inactive
                              </span>
                            )}
                            {def.parentType && (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                Subtype of {def.parentType}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {def.description.substring(0, 150)}...
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>{def.keywords.length} keywords</span>
                            <span>{def.identificationRules.length} identification rules</span>
                            {def.exampleFileName && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                Example file
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(def._id)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                          {!def.isSystemDefault && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(def._id)}
                                className="flex items-center gap-1"
                              >
                                <Edit2 className="w-4 h-4" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(def._id)}
                                className="flex items-center gap-1 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
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

