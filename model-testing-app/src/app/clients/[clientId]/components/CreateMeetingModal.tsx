'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Upload,
  FileText,
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

export default function CreateMeetingModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onMeetingCreated,
}: CreateMeetingModalProps) {
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Meeting for {clientName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          {!extractionResult ? (
            <div className="space-y-4">
              {/* Drag & Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : selectedFile
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }
                `}
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
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-3">
                      <File className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      Drop your meeting notes here
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      or click to browse files
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Badge variant="outline" className="text-xs">PDF</Badge>
                      <Badge variant="outline" className="text-xs">DOCX</Badge>
                      <Badge variant="outline" className="text-xs">TXT</Badge>
                    </div>
                  </div>
                )}
              </div>

              {extractionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {extractionError}
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  AI Extraction
                </h4>
                <p className="text-xs text-gray-600">
                  Our AI will automatically extract meeting details including attendees,
                  key discussion points, decisions made, and action items from your document.
                </p>
              </div>

              <Button
                onClick={handleExtract}
                disabled={isExtracting || !selectedFile}
                className="w-full"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting Meeting Data...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Extract Meeting Data
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Extraction Preview */
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <span className="text-sm text-green-700">
                  Extracted with {Math.round(extractionResult.confidence * 100)}% confidence
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtractionResult(null)}
                  className="text-xs"
                >
                  Re-extract
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Title</Label>
                  <p className="font-medium">{extractionResult.title}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Date</Label>
                    <p className="flex items-center gap-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(extractionResult.meetingDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Type</Label>
                    <Badge variant="secondary">{extractionResult.meetingType || 'other'}</Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Summary</Label>
                  <p className="text-sm text-gray-700">{extractionResult.summary}</p>
                </div>

                <div>
                  <Label className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Attendees ({extractionResult.attendees.length})
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {extractionResult.attendees.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {a.name}
                        {a.role && <span className="text-gray-400 ml-1">({a.role})</span>}
                      </Badge>
                    ))}
                  </div>
                </div>

                {extractionResult.keyPoints.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500">Key Points ({extractionResult.keyPoints.length})</Label>
                    <ul className="text-sm text-gray-700 list-disc list-inside mt-1">
                      {extractionResult.keyPoints.slice(0, 3).map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                      {extractionResult.keyPoints.length > 3 && (
                        <li className="text-gray-400">+{extractionResult.keyPoints.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {extractionResult.decisions.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500">Decisions ({extractionResult.decisions.length})</Label>
                    <ul className="text-sm text-gray-700 list-disc list-inside mt-1">
                      {extractionResult.decisions.slice(0, 3).map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                      {extractionResult.decisions.length > 3 && (
                        <li className="text-gray-400">+{extractionResult.decisions.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {extractionResult.actionItems.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" />
                      Action Items ({extractionResult.actionItems.length})
                    </Label>
                    <ul className="text-sm text-gray-700 mt-1 space-y-1">
                      {extractionResult.actionItems.slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckSquare className="w-3 h-3 mt-1 text-amber-500" />
                          <span>
                            {item.description}
                            {item.assignee && (
                              <span className="text-gray-400 ml-1">- {item.assignee}</span>
                            )}
                          </span>
                        </li>
                      ))}
                      {extractionResult.actionItems.length > 3 && (
                        <li className="text-gray-400 ml-5">+{extractionResult.actionItems.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {extractionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {extractionError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSaveExtraction} disabled={isSaving} className="flex-1">
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Save Meeting'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
