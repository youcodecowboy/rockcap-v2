'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Upload, FileText, X } from 'lucide-react';

interface AddKnowledgeEntryModalProps {
  clientId: Id<"clients">;
  projectId?: Id<"projects"> | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddKnowledgeEntryModal({
  clientId,
  projectId,
  onClose,
  onSuccess,
}: AddKnowledgeEntryModalProps) {
  const [mode, setMode] = useState<'manual' | 'upload'>('manual');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keyPoints, setKeyPoints] = useState('');
  const [tags, setTags] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createEntry = useMutation(api.knowledgeBank.createManual);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await createEntry({
        clientId,
        projectId: projectId || undefined,
        entryType: 'general',
        title: title.trim(),
        content: content.trim(),
        keyPoints: keyPoints.split('\n').filter(kp => kp.trim().length > 0),
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to create entry:', error);
      alert('Failed to create entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create FormData and upload file
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Analyze file
      const analysisResponse = await fetch('/api/analyze-file', {
        method: 'POST',
        body: formData,
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze file');
      }

      const analysisResult = await analysisResponse.json();

      // Create knowledge bank entry from analysis
      await createEntry({
        clientId,
        projectId: projectId || undefined,
        entryType: 'document_summary',
        title: `${selectedFile.name} - ${analysisResult.category || 'Document'}`,
        content: analysisResult.summary || 'Document uploaded and analyzed.',
        keyPoints: analysisResult.summary
          ? analysisResult.summary.split(/[.!?]\s+/).slice(0, 5).filter((s: string) => s.trim().length > 0)
          : [],
        tags: [analysisResult.category || 'document', selectedFile.type.split('/')[1] || 'file'],
        metadata: {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          category: analysisResult.category,
        },
      });

      onSuccess();
    } catch (error) {
      console.error('Failed to upload and create entry:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add Knowledge Entry</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              mode === 'manual'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Write Entry
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              mode === 'upload'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload File
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'manual' ? (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Entry title..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px]"
                  placeholder="Write your entry content here..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Points (one per line)
                </label>
                <textarea
                  value={keyPoints}
                  onChange={(e) => setKeyPoints(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="Enter key points, one per line..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tag1, tag2, tag3"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Entry'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload File
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                        <span>Upload a file</span>
                        <input
                          type="file"
                          className="sr-only"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          accept=".pdf,.doc,.docx,.txt"
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT up to 100MB</p>
                    {selectedFile && (
                      <p className="text-sm text-gray-900 mt-2">{selectedFile.name}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  The file will be analyzed and automatically summarized. A knowledge entry will be created with the extracted information.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Uploading & Analyzing...' : 'Upload & Create Entry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

