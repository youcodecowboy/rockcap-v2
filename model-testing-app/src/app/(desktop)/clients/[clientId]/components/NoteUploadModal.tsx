'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Modal, Field, Input, Select, Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import TagInput from '@/components/TagInput';
import {
  Upload,
  FileText,
  File,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { markdownToTiptap } from '@/lib/notes/markdownToTiptap';

interface NoteUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  clientName: string;
  projectId?: Id<"projects">;
  onNoteCreated: (noteId: Id<"notes">) => void;
}

type NoteType = 'meeting_transcript' | 'call_notes' | 'general_notes' | 'research' | 'other';

const noteTypeOptions: { value: NoteType; label: string }[] = [
  { value: 'meeting_transcript', label: 'Meeting Transcript' },
  { value: 'call_notes', label: 'Call Notes' },
  { value: 'general_notes', label: 'General Notes' },
  { value: 'research', label: 'Research' },
  { value: 'other', label: 'Other' },
];

export default function NoteUploadModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  projectId,
  onNoteCreated,
}: NoteUploadModalProps) {
  const colors = useColors();
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
    return markdownToTiptap(text);
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

  const getFileIcon = (size = 30) => {
    if (!file) return <Upload size={size} style={{ color: colors.text.dim }} />;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['txt', 'md'].includes(ext || '')) return <FileText size={size} style={{ color: colors.accent.blue }} />;
    if (ext === 'pdf') return <File size={size} style={{ color: colors.accent.red }} />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText size={size} style={{ color: colors.accent.blue }} />;
    return <File size={size} style={{ color: colors.text.muted }} />;
  };

  // Drop-zone border/background reflects drag + selection state via tokens.
  const dropBorder = isDragOver
    ? colors.accent.blue
    : file
    ? colors.entityTypes.client
    : colors.border.mid;
  const dropBg = isDragOver
    ? `${colors.accent.blue}10`
    : file
    ? `${colors.entityTypes.client}10`
    : colors.bg.card;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Upload notes"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            accent={colors.entityTypes.client}
            onClick={handleUpload}
            disabled={!file || !title.trim() || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                Create note
              </>
            )}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 11, color: colors.text.muted }}>
          Upload meeting transcripts, call notes, or other documents for {clientName}
        </p>

        {/* File Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            position: 'relative',
            border: `1px dashed ${dropBorder}`,
            borderRadius: 4,
            padding: 24,
            cursor: 'pointer',
            background: dropBg,
            transition: 'border-color 100ms linear, background 100ms linear',
          }}
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
                    style={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      padding: 2,
                      background: colors.bg.card,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 999,
                      cursor: 'pointer',
                      lineHeight: 0,
                    }}
                  >
                    <X size={12} style={{ color: colors.text.muted }} />
                  </button>
                </div>
                <p style={{ marginTop: 8, fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{file.name}</p>
                <p style={{ fontSize: 10, color: colors.text.muted }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                {getFileIcon()}
                <p style={{ marginTop: 8, fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                  Drop your file here, or click to browse
                </p>
                <p style={{ fontSize: 10, color: colors.text.muted }}>
                  Supports .txt, .md, .pdf, .doc, .docx (max 10MB)
                </p>
              </>
            )}
          </div>
        </div>

        {/* Note Type */}
        <Field label="Note type">
          <Select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>
            {noteTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Title */}
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter note title..."
          />
        </Field>

        {/* Tags */}
        <Field label="Tags">
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={['meeting', 'call', 'important', 'follow-up', 'action-items']}
            placeholder="Add tags..."
          />
        </Field>

        {/* Error Message */}
        {error && (
          <div
            className="flex items-center gap-2"
            style={{
              padding: 10,
              background: `${colors.accent.red}10`,
              border: `1px solid ${colors.accent.red}40`,
              borderRadius: 4,
              fontSize: 11,
              color: colors.accent.red,
            }}
          >
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
