'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Modal, Button, StatusPill, FlagChip } from '@/components/layouts';
import {
  Loader2,
  Upload,
  Sparkles,
  Calendar,
  Users,
  CheckSquare,
  X,
  AlertCircle,
  File,
} from 'lucide-react';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  clientName: string;
  onMeetingCreated: (meetingId: Id<"meetings">) => void;
}

interface Attendee {
  name: string;
  role?: string;
  company?: string;
}

interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

interface ExtractionResult {
  title: string;
  meetingDate: string;
  meetingType?: 'progress' | 'kickoff' | 'review' | 'site_visit' | 'call' | 'other';
  attendees: Attendee[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  confidence: number;
}

function FieldLabel({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useColors>; }) {
  return (
    <div
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.text.muted,
        fontWeight: 500,
        marginBottom: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

export default function CreateMeetingModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onMeetingCreated,
}: CreateMeetingModalProps) {
  const colors = useColors();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMeeting = useMutation(api.meetings.create);

  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setExtractionResult(null);
    setExtractionError(null);
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileSelect = (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setExtractionError('Please upload a PDF, Word document, or text file');
      return;
    }

    setSelectedFile(file);
    setExtractionError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      setExtractionError('Please select a file');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);

    try {
      const formData = new FormData();
      formData.append('clientId', clientId);
      formData.append('file', selectedFile);

      const response = await fetch('/api/meeting-extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Extraction failed');
      }

      const result = await response.json();
      setExtractionResult(result.extraction);
    } catch (error) {
      console.error('Extraction error:', error);
      setExtractionError(error instanceof Error ? error.message : 'Failed to extract meeting data');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveExtraction = async () => {
    if (!extractionResult) return;

    setIsSaving(true);
    try {
      const meetingId = await createMeeting({
        clientId,
        title: extractionResult.title,
        meetingDate: extractionResult.meetingDate,
        meetingType: extractionResult.meetingType,
        attendees: extractionResult.attendees,
        summary: extractionResult.summary,
        keyPoints: extractionResult.keyPoints,
        decisions: extractionResult.decisions,
        actionItems: extractionResult.actionItems,
        extractionConfidence: extractionResult.confidence,
        sourceDocumentName: selectedFile?.name,
      });

      onMeetingCreated(meetingId);
      handleClose();
    } catch (error) {
      console.error('Failed to save meeting:', error);
      setExtractionError('Failed to save meeting. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const errorBlock = extractionError ? (
    <div
      className="p-3 rounded flex items-center gap-2"
      style={{ background: `${colors.accent.red}15`, border: `1px solid ${colors.accent.red}40`, fontSize: 13, color: colors.accent.red }}
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {extractionError}
    </div>
  ) : null;

  const footer = !extractionResult ? (
    <Button
      variant="primary"
      accent={colors.entityTypes.client}
      onClick={handleExtract}
      disabled={isExtracting || !selectedFile}
    >
      {isExtracting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Extracting Meeting Data...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          Extract Meeting Data
        </>
      )}
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={handleClose}>Cancel</Button>
      <Button
        variant="primary"
        accent={colors.entityTypes.client}
        onClick={handleSaveExtraction}
        disabled={isSaving}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Meeting'}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={`Add Meeting for ${clientName}`}
      width={640}
      footer={footer}
    >
      {!extractionResult ? (
        <div className="space-y-4">
          {/* Drag & Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className="p-8 text-center cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${
                isDragging ? colors.accent.blue : selectedFile ? colors.entityTypes.client : colors.border.mid
              }`,
              borderRadius: 4,
              background: isDragging
                ? `${colors.accent.blue}10`
                : selectedFile
                  ? `${colors.entityTypes.client}10`
                  : colors.bg.card,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center">
                <div
                  className="w-12 h-12 rounded flex items-center justify-center mb-3"
                  style={{ background: `${colors.entityTypes.client}15`, color: colors.entityTypes.client }}
                >
                  <File className="w-6 h-6" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{selectedFile.name}</p>
                <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div
                  className="w-12 h-12 rounded flex items-center justify-center mb-3"
                  style={{ background: colors.bg.cardAlt, color: colors.text.muted }}
                >
                  <Upload className="w-6 h-6" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                  Drop your meeting notes here
                </p>
                <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                  or click to browse files
                </p>
                <div className="flex gap-2 mt-3">
                  <FlagChip label="PDF" severity="info" />
                  <FlagChip label="DOCX" severity="info" />
                  <FlagChip label="TXT" severity="info" />
                </div>
              </div>
            )}
          </div>

          {errorBlock}

          <div className="p-4 rounded" style={{ background: colors.bg.cardAlt }}>
            <h4
              className="mb-2 flex items-center gap-2"
              style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}
            >
              <Sparkles className="w-4 h-4" style={{ color: colors.accent.blue }} />
              AI Extraction
            </h4>
            <p style={{ fontSize: 11, color: colors.text.muted, lineHeight: 1.6 }}>
              Our AI will automatically extract meeting details including attendees,
              key discussion points, decisions made, and action items from your document.
            </p>
          </div>
        </div>
      ) : (
        /* Extraction Preview */
        <div className="space-y-4">
          <div
            className="p-3 rounded flex items-center justify-between"
            style={{ background: `${colors.entityTypes.client}15`, border: `1px solid ${colors.entityTypes.client}40` }}
          >
            <span style={{ fontSize: 13, color: colors.entityTypes.client }}>
              Extracted with {Math.round(extractionResult.confidence * 100)}% confidence
            </span>
            <Button variant="ghost" size="sm" onClick={() => setExtractionResult(null)}>
              Re-extract
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <FieldLabel colors={colors}>Title</FieldLabel>
              <p style={{ fontWeight: 500, color: colors.text.primary }}>{extractionResult.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel colors={colors}>Date</FieldLabel>
                <p className="flex items-center gap-1" style={{ color: colors.text.primary }}>
                  <Calendar className="w-4 h-4" style={{ color: colors.text.muted }} />
                  {new Date(extractionResult.meetingDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <FieldLabel colors={colors}>Type</FieldLabel>
                <StatusPill label={extractionResult.meetingType || 'other'} tone={colors.accent.blue} />
              </div>
            </div>

            <div>
              <FieldLabel colors={colors}>Summary</FieldLabel>
              <p style={{ fontSize: 13, color: colors.text.primary }}>{extractionResult.summary}</p>
            </div>

            <div>
              <FieldLabel colors={colors}>
                <Users className="w-3 h-3" />
                Attendees ({extractionResult.attendees.length})
              </FieldLabel>
              <div className="flex flex-wrap gap-1 mt-1">
                {extractionResult.attendees.map((a, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '2px 8px',
                      background: colors.bg.cardAlt,
                      border: `1px solid ${colors.border.light}`,
                      borderRadius: 2,
                      fontSize: 11,
                      color: colors.text.secondary,
                    }}
                  >
                    {a.name}
                    {a.role && <span style={{ color: colors.text.dim, marginLeft: 4 }}>({a.role})</span>}
                  </span>
                ))}
              </div>
            </div>

            {extractionResult.keyPoints.length > 0 && (
              <div>
                <FieldLabel colors={colors}>Key Points ({extractionResult.keyPoints.length})</FieldLabel>
                <ul style={{ fontSize: 13, color: colors.text.primary, margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {extractionResult.keyPoints.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                  {extractionResult.keyPoints.length > 3 && (
                    <li style={{ color: colors.text.muted }}>+{extractionResult.keyPoints.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            {extractionResult.decisions.length > 0 && (
              <div>
                <FieldLabel colors={colors}>Decisions ({extractionResult.decisions.length})</FieldLabel>
                <ul style={{ fontSize: 13, color: colors.text.primary, margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {extractionResult.decisions.slice(0, 3).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                  {extractionResult.decisions.length > 3 && (
                    <li style={{ color: colors.text.muted }}>+{extractionResult.decisions.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            {extractionResult.actionItems.length > 0 && (
              <div>
                <FieldLabel colors={colors}>
                  <CheckSquare className="w-3 h-3" />
                  Action Items ({extractionResult.actionItems.length})
                </FieldLabel>
                <ul style={{ fontSize: 13, color: colors.text.primary, margin: '4px 0 0 0', listStyle: 'none', padding: 0 }} className="space-y-1">
                  {extractionResult.actionItems.slice(0, 3).map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckSquare className="w-3 h-3 mt-1" style={{ color: colors.accent.yellow }} />
                      <span>
                        {item.description}
                        {item.assignee && (
                          <span style={{ color: colors.text.muted, marginLeft: 4 }}>- {item.assignee}</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {extractionResult.actionItems.length > 3 && (
                    <li style={{ color: colors.text.muted, marginLeft: 20 }}>+{extractionResult.actionItems.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {errorBlock}
        </div>
      )}
    </Modal>
  );
}
