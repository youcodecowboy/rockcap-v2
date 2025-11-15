'use client';

import { useState } from 'react';
import { KnowledgeBankEntry } from '@/types';
import { Id } from '../../convex/_generated/dataModel';

interface EditableKnowledgeBankEntryProps {
  entry: KnowledgeBankEntry;
  onUpdate: (updates: {
    title?: string;
    content?: string;
    keyPoints?: string[];
    tags?: string[];
    metadata?: Record<string, any>;
  }) => Promise<void>;
}

export default function EditableKnowledgeBankEntry({
  entry,
  onUpdate,
}: EditableKnowledgeBankEntryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [keyPoints, setKeyPoints] = useState(entry.keyPoints.join('\n'));
  const [tags, setTags] = useState(entry.tags.join(', '));
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({
        title: title !== entry.title ? title : undefined,
        content: content !== entry.content ? content : undefined,
        keyPoints: keyPoints !== entry.keyPoints.join('\n') 
          ? keyPoints.split('\n').filter(kp => kp.trim().length > 0)
          : undefined,
        tags: tags !== entry.tags.join(', ')
          ? tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
          : undefined,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update entry:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle(entry.title);
    setContent(entry.content);
    setKeyPoints(entry.keyPoints.join('\n'));
    setTags(entry.tags.join(', '));
    setIsEditing(false);
  };

  const getEntryTypeColor = (type: string) => {
    switch (type) {
      case 'deal_update':
        return 'bg-green-100 text-green-800';
      case 'project_status':
        return 'bg-blue-100 text-blue-800';
      case 'call_transcript':
        return 'bg-purple-100 text-purple-800';
      case 'email':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-6 bg-white">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-blue-500 focus:outline-none pb-2"
                placeholder="Entry title"
              />
            ) : (
              <h1 className="text-2xl font-bold text-gray-900">{entry.title}</h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-3 py-1 text-sm font-medium rounded ${getEntryTypeColor(entry.entryType)}`}>
                {entry.entryType.replace('_', ' ')}
              </span>
              <span className="text-sm text-gray-500">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Content */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Content</h2>
          {isEditing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px]"
              placeholder="Entry content..."
            />
          ) : (
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{entry.content}</p>
            </div>
          )}
        </div>

        {/* Key Points */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Key Points</h2>
          {isEditing ? (
            <textarea
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px]"
              placeholder="Enter key points, one per line..."
            />
          ) : (
            <ul className="list-disc list-inside space-y-2">
              {entry.keyPoints.length > 0 ? (
                entry.keyPoints.map((point, idx) => (
                  <li key={idx} className="text-gray-700">{point}</li>
                ))
              ) : (
                <li className="text-gray-400 italic">No key points</li>
              )}
            </ul>
          )}
        </div>

        {/* Tags */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Tags</h2>
          {isEditing ? (
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter tags separated by commas..."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {entry.tags.length > 0 ? (
                entry.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 italic">No tags</span>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Metadata</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(entry.metadata).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm font-medium text-gray-500">{key}</dt>
                    <dd className="mt-1 text-sm text-gray-900">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

