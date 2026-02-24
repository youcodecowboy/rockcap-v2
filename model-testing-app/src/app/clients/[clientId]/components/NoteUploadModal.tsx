'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TagInput from '@/components/TagInput';
import {
  Upload,
  FileText,
  FileAudio,
  File,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface NoteUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  clientName: string;
  projectId?: Id<"projects">;
  onNoteCreated: (noteId: Id<"notes">) => void;
}

type NoteType = 'meeting_transcript' | 'call_notes' | 'general_notes' | 'research' | 'other';

const noteTypeOptions: { value: NoteType; label: string; description: string }[] = [
  { value: 'meeting_transcript', label: 'Meeting Transcript', description: 'Notes from a meeting or conference call' },
  { value: 'call_notes', label: 'Call Notes', description: 'Notes from a phone call or conversation' },
  { value: 'general_notes', label: 'General Notes', description: 'General notes or observations' },
  { value: 'research', label: 'Research', description: 'Research findings or analysis' },
  { value: 'other', label: 'Other', description: 'Other type of notes' },
];

export default function NoteUploadModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  projectId,
  onNoteCreated,
}: NoteUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('meeting_transcript');
  const [tags, setTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createNote = useMutation(api.notes.create);

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setNoteType('meeting_transcript');
    setTags([]);
    setError(null);
    setIsUploading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    
    // Check file type
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    
    const allowedExtensions = ['.txt', '.md', '.csv', '.pdf', '.docx', '.doc'];
    const fileExtension = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.includes(fileExtension)) {
      setError('Please upload a text file (.txt, .md), PDF, or Word document (.doc, .docx)');
      return;
    }
    
    // Check file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }
    
    setFile(selectedFile);
    
    // Auto-generate title from filename if empty
    if (!title) {
      const generatedTitle = selectedFile.name
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
        .replace(/\b\w/g, (c) => c.toUpperCase()); // Capitalize first letter of each word
      setTitle(generatedTitle);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const parseFileContent = async (file: File): Promise<string> => {
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    // For text-based files, read directly
    if (['.txt', '.md', '.csv'].includes(fileExtension) || file.type.startsWith('text/')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string || '');
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
    
    // For PDF files, we'll need to use an API to extract text
    if (fileExtension === '.pdf' || file.type === 'application/pdf') {
      // Convert file to base64 and send to API for parsing
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('Failed to read PDF'));
        reader.readAsDataURL(file);
      });
      
      // Call API to parse PDF
      const response = await fetch('/api/knowledge-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64,
          fileName: file.name,
          fileType: 'application/pdf',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to parse PDF');
      }
      
      const data = await response.json();
      return data.text || '';
    }
    
    // For Word documents
    if (['.doc', '.docx'].includes(fileExtension)) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('Failed to read document'));
        reader.readAsDataURL(file);
      });
      
      // Call API to parse document
      const response = await fetch('/api/knowledge-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64,
          fileName: file.name,
          fileType: file.type,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to parse document');
      }
      
      const data = await response.json();
      return data.text || '';
    }
    
    throw new Error('Unsupported file type');
  };

  const convertTextToTipTapContent = (text: string) => {
    // Convert plain text to TipTap JSON format
    const lines = text.split('\n');
    const content: any[] = [];
    
    for (const line of lines) {
      if (line.trim() === '') {
        // Empty paragraph
        content.push({
          type: 'paragraph',
        });
      } else {
        // Paragraph with text
        content.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: line,
            },
          ],
        });
      }
    }
    
    return {
      type: 'doc',
      content,
    };
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError('Please provide a title and select a file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Parse file content
      const textContent = await parseFileContent(file);
      
      // Convert to TipTap format
      const editorContent = convertTextToTipTapContent(textContent);
      
      // Calculate word count
      const wordCount = textContent.trim().split(/\s+/).filter(word => word.length > 0).length;
      
      // Add note type tag if not already present
      const noteTypeTags = [...tags];
      const typeTag = noteType.replace(/_/g, '-');
      if (!noteTypeTags.includes(typeTag)) {
        noteTypeTags.push(typeTag);
      }
      
      // Create note
      const noteId = await createNote({
        title: title.trim(),
        content: editorContent,
        clientId,
        projectId,
        tags: noteTypeTags,
        wordCount,
      });

      onNoteCreated(noteId);
      handleClose();
    } catch (err) {
      console.error('Failed to upload note:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload note');
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-8 h-8 text-gray-400" />;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['txt', 'md'].includes(ext || '')) return <FileText className="w-8 h-8 text-blue-500" />;
    if (ext === 'pdf') return <File className="w-8 h-8 text-red-500" />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText className="w-8 h-8 text-blue-600" />;
    return <File className="w-8 h-8 text-gray-500" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Notes
          </DialogTitle>
          <DialogDescription>
            Upload meeting transcripts, call notes, or other documents for {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-50'
                : file
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div className="flex flex-col items-center text-center">
              {file ? (
                <>
                  <div className="relative">
                    {getFileIcon()}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow border border-gray-200 hover:bg-red-50"
                    >
                      <X className="w-3 h-3 text-gray-500 hover:text-red-500" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  {getFileIcon()}
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    Drop your file here, or click to browse
                  </p>
                  <p className="text-xs text-gray-500">
                    Supports .txt, .md, .pdf, .doc, .docx (max 10MB)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Note Type */}
          <div>
            <Label htmlFor="noteType">Note Type</Label>
            <Select value={noteType} onValueChange={(value) => setNoteType(value as NoteType)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select note type" />
              </SelectTrigger>
              <SelectContent>
                {noteTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title..."
              className="mt-1.5"
            />
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="mt-1.5">
              <TagInput
                tags={tags}
                onChange={setTags}
                suggestions={['meeting', 'call', 'important', 'follow-up', 'action-items']}
                placeholder="Add tags..."
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || !title.trim() || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Create Note
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
