'use client';

import { CheckCircle, Loader2, X } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface BulkActionConfirmationModalProps {
  actions: Array<{
    id: string;
    type: string;
    data: any;
  }>;
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting: boolean;
}

// Convex IDs are alphanumeric strings of a specific length — reject obvious non-IDs
function looksLikeConvexId(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z0-9]{20,}$/i.test(value);
}

export default function BulkActionConfirmationModal({
  actions,
  onConfirm,
  onCancel,
  isExecuting,
}: BulkActionConfirmationModalProps) {
  // Resolve entity IDs from the first action (only query if value looks like a real ID)
  const firstData = actions[0]?.data;
  const clientId = firstData?.clientId;
  const projectId = firstData?.projectId;
  const client = useQuery(api.clients.get, looksLikeConvexId(clientId) ? { id: clientId as Id<"clients"> } : 'skip');
  const project = useQuery(api.projects.get, looksLikeConvexId(projectId) ? { id: projectId as Id<"projects"> } : 'skip');

  const resolvedNames: Record<string, string> = {};
  if (client?.name) resolvedNames['clientId'] = client.name;
  if (project?.name) resolvedNames['projectId'] = project.name;

  const getActionTitle = (type: string) => {
    const titles: Record<string, string> = {
      createReminder: 'Reminder',
      createTask: 'Task',
      createClient: 'Client',
      createProject: 'Project',
      createKnowledgeBankEntry: 'Knowledge Bank Entry',
      createNote: 'Note',
      saveChatDocument: 'Document',
    };
    return titles[type] || type.replace('create', '').replace(/([A-Z])/g, ' $1').trim();
  };

  const getActionTypeName = () => {
    if (actions.length === 0) return 'items';
    const type = actions[0].type;
    return getActionTitle(type).toLowerCase();
  };

  const formatActionData = (data: any) => {
    const importantFields = ['title', 'name', 'scheduledFor', 'dueDate', 'description', 'clientId', 'projectId'];
    return importantFields
      .filter(field => data[field] !== undefined && data[field] !== null)
      .map(field => {
        let value = data[field];
        // Resolve IDs to names
        if (resolvedNames[field]) {
          value = resolvedNames[field];
        } else if (field === 'scheduledFor' || field === 'dueDate') {
          try {
            value = new Date(value).toLocaleString();
          } catch (e) {
            // Keep original value if parsing fails
          }
        }
        const label = field
          .replace(/Id$/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim();
        return (
          <div key={field} className="flex gap-2 text-sm">
            <span className="font-medium text-gray-700 capitalize">
              {label}:
            </span>
            <span className="text-gray-900">{String(value)}</span>
          </div>
        );
      });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm Bulk Creation
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                The AI assistant would like to create {actions.length} {getActionTypeName()}{actions.length > 1 ? 's' : ''}. Please review and confirm:
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="space-y-4">
            {actions.map((action, index) => (
              <div key={action.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {getActionTitle(action.type)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {formatActionData(action.data)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> All {actions.length} {getActionTypeName()}{actions.length > 1 ? 's' : ''} will be created at once. Make sure the information is correct before confirming.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isExecuting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isExecuting}
            className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating {actions.length} {getActionTypeName()}{actions.length > 1 ? 's' : ''}...
              </>
            ) : (
              `Create ${actions.length} ${getActionTypeName()}${actions.length > 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
