'use client';

import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface ActionConfirmationModalProps {
  action: {
    id: string;
    type: string;
    data: any;
  };
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting: boolean;
}

// Convex IDs are alphanumeric strings of a specific length — reject obvious non-IDs
function looksLikeConvexId(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z0-9]{20,}$/i.test(value);
}

export default function ActionConfirmationModal({
  action,
  onConfirm,
  onCancel,
  isExecuting,
}: ActionConfirmationModalProps) {
  // Resolve entity IDs to human-readable names (only query if value looks like a real ID)
  const clientId = action.data?.clientId;
  const projectId = action.data?.projectId;
  const client = useQuery(api.clients.get, looksLikeConvexId(clientId) ? { id: clientId as Id<"clients"> } : 'skip');
  const project = useQuery(api.projects.get, looksLikeConvexId(projectId) ? { id: projectId as Id<"projects"> } : 'skip');

  const resolvedNames: Record<string, string> = {};
  if (client?.name) resolvedNames['clientId'] = client.name;
  if (project?.name) resolvedNames['projectId'] = project.name;

  // Format action data for display
  const formatActionData = (data: any) => {
    return Object.entries(data)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const displayValue = resolvedNames[key]
          ? resolvedNames[key]
          : typeof value === 'object' ? JSON.stringify(value) : String(value);
        const label = key
          .replace(/Id$/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim();
        return (
          <div key={key} className="flex gap-2">
            <span className="font-medium text-gray-700 capitalize">
              {label}:
            </span>
            <span className="text-gray-900">
              {displayValue}
            </span>
          </div>
        );
      });
  };

  const getActionTitle = (type: string) => {
    const titles: Record<string, string> = {
      createClient: 'Create New Client',
      createProject: 'Create New Project',
      createKnowledgeBankEntry: 'Create Knowledge Bank Entry',
      createNote: 'Create Note',
      updateClient: 'Update Client',
      updateProject: 'Update Project',
      uploadAndAnalyzeFile: 'Upload and Analyze File',
      saveChatDocument: 'File Document',
    };
    return titles[type] || type;
  };

  const getActionIcon = (type: string) => {
    if (type.startsWith('create') || type.startsWith('upload') || type === 'saveChatDocument') {
      return <CheckCircle className="w-6 h-6 text-blue-600" />;
    }
    if (type.startsWith('update')) {
      return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
    }
    return <AlertTriangle className="w-6 h-6 text-gray-600" />;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start gap-4">
            {getActionIcon(action.type)}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm Action
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {getActionTitle(action.type)}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-gray-700 mb-4">
            The AI assistant would like to perform the following action. Please review and confirm:
          </p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            {formatActionData(action.data)}
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> This action will modify your data. Make sure the information is correct before confirming.
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
                Executing...
              </>
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
