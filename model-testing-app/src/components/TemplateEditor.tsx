'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { NoteTemplate } from '@/types';

interface TemplateEditorProps {
  template?: NoteTemplate;
  onSave: () => void;
  onCancel: () => void;
}

export default function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const createTemplate = useMutation(api.noteTemplates.create);
  const updateTemplate = useMutation(api.noteTemplates.update);

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [knowledgeBankFields, setKnowledgeBankFields] = useState(
    template?.knowledgeBankFields.join(', ') || ''
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Template name is required');
      return;
    }

    const fields = knowledgeBankFields
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    try {
      if (template) {
        await updateTemplate({
          id: template._id as Id<"noteTemplates">,
          name,
          description: description || undefined,
          knowledgeBankFields: fields,
          isActive,
        });
      } else {
        await createTemplate({
          name,
          description: description || undefined,
          template: {}, // Basic template structure - can be enhanced later
          knowledgeBankFields: fields,
          isActive,
        });
      }
      onSave();
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template');
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        {template ? 'Edit Template' : 'Create Template'}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Lender Note"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="Describe what this template is used for..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Knowledge Bank Fields
          </label>
          <input
            type="text"
            value={knowledgeBankFields}
            onChange={(e) => setKnowledgeBankFields(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="loanAmount, interestRate, loanNumber (comma-separated)"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter field names from knowledge bank entries to include in this template
          </p>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
            Active (available for use)
          </label>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {template ? 'Update' : 'Create'} Template
          </button>
        </div>
      </div>
    </div>
  );
}

