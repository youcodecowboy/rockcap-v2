'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import TemplateEditor from '@/components/TemplateEditor';
import { NoteTemplate } from '@/types';

export default function TemplatesPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NoteTemplate | null>(null);
  const templates = useQuery(api.noteTemplates.list);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Note Templates</h1>
          <p className="text-gray-600 mt-1">Create and manage templates for generating notes from knowledge bank entries</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Create Template
        </button>
      </div>

      {(isCreating || editingTemplate) && (
        <div className="mb-6">
          <TemplateEditor
            template={editingTemplate || undefined}
            onSave={() => {
              setIsCreating(false);
              setEditingTemplate(null);
            }}
            onCancel={() => {
              setIsCreating(false);
              setEditingTemplate(null);
            }}
          />
        </div>
      )}

      <div className="space-y-4">
        {templates === undefined ? (
          <div className="text-center py-8 text-gray-500">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No templates yet. Create your first template!
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template._id}
              className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    {template.isActive ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                  )}
                  {template.knowledgeBankFields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.knowledgeBankFields.map((field, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-gray-500">
                    Created {new Date(template.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => setEditingTemplate(template)}
                  className="ml-4 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

