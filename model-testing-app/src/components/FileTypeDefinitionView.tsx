'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Download, X } from 'lucide-react';

interface FileTypeDefinitionViewProps {
  definitionId: Id<'fileTypeDefinitions'>;
  onClose: () => void;
}

export default function FileTypeDefinitionView({
  definitionId,
  onClose,
}: FileTypeDefinitionViewProps) {
  const definition = useQuery(api.fileTypeDefinitions.getById, { id: definitionId });
  const fileUrl = useQuery(
    api.fileTypeDefinitions.getFileUrl,
    definition?.exampleFileStorageId ? { storageId: definition.exampleFileStorageId } : 'skip'
  );

  const handleDownloadExample = () => {
    if (!fileUrl || !definition?.exampleFileName) return;

    // Open file URL in new tab for download
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = definition.exampleFileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!definition) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading File Type Definition</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {definition.fileType}
          </DialogTitle>
          <DialogDescription>
            {definition.isSystemDefault && (
              <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs mr-2">
                System Default
              </span>
            )}
            Category: {definition.category}
            {definition.parentType && ` • Subtype of: ${definition.parentType}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-2">Description</h3>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{definition.description}</p>
            <p className="text-xs text-gray-500 mt-1">
              {definition.description.trim().split(/\s+/).length} words
            </p>
          </div>

          {/* Keywords */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-2">
              Keywords ({definition.keywords.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {definition.keywords.map((keyword, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          {/* Identification Rules */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-2">
              Identification Rules ({definition.identificationRules.length})
            </h3>
            <ul className="space-y-2">
              {definition.identificationRules.map((rule, index) => (
                <li key={index} className="text-sm text-gray-900 flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Category Rules */}
          {definition.categoryRules && (
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Category Rules</h3>
              <p className="text-sm text-gray-900">{definition.categoryRules}</p>
            </div>
          )}

          {/* Example File */}
          {definition.exampleFileStorageId && (
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Example File</h3>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-900 flex-1">
                  {definition.exampleFileName || 'Example file'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadExample}
                  className="flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Created:</span>{' '}
                <span className="text-gray-900">
                  {new Date(definition.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Last Updated:</span>{' '}
                <span className="text-gray-900">
                  {new Date(definition.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>{' '}
                <span
                  className={`font-medium ${
                    definition.isActive ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {definition.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

