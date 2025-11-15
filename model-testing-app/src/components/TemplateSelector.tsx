'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface TemplateSelectorProps {
  onSelect: (templateId: Id<"noteTemplates">) => void;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  knowledgeBankEntryIds?: Id<"knowledgeBankEntries">[];
}

export default function TemplateSelector({
  onSelect,
  clientId,
  projectId,
  knowledgeBankEntryIds = [],
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const templates = useQuery(api.noteTemplates.list, { isActive: true });
  const applyTemplate = useMutation(api.notes.applyTemplate);

  const handleApplyTemplate = async (templateId: Id<"noteTemplates">) => {
    if (knowledgeBankEntryIds.length === 0) {
      alert('Please select knowledge bank entries first');
      return;
    }

    try {
      const noteId = await applyTemplate({
        templateId,
        clientId,
        projectId,
        knowledgeBankEntryIds,
      });
      onSelect(templateId);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to apply template:', error);
      alert('Failed to create note from template');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Use Template
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Select Template</h3>
              <p className="text-sm text-gray-500 mt-1">
                {knowledgeBankEntryIds.length} entries selected
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {templates === undefined ? (
                <div className="p-4 text-sm text-gray-500">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No templates available</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {templates.map((template) => (
                    <button
                      key={template._id}
                      onClick={() => handleApplyTemplate(template._id)}
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{template.name}</div>
                      {template.description && (
                        <div className="text-sm text-gray-500 mt-1">{template.description}</div>
                      )}
                      {template.knowledgeBankFields.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.knowledgeBankFields.slice(0, 3).map((field, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

