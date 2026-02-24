'use client';

import { useState, useCallback } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Brain,
  Upload,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';

interface AddIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  onIntelligenceAdded?: () => void;
}

type InputMode = 'text' | 'document';

interface ExtractedField {
  fieldPath: string;
  value: any;
  confidence: number;
  sourceText?: string;
}

interface ProcessingResult {
  success: boolean;
  fieldsUpdated: string[];
  summary: string;
  error?: string;
  extractionStats?: {
    fieldsExtracted: number;
    attributesExtracted: number;
    keyFindings: number;
    risksIdentified: number;
  };
  extractedFields?: ExtractedField[];
  insights?: {
    keyFindings?: string[];
    risks?: Array<{ risk: string; severity?: string }>;
  };
}

export default function AddIntelligenceModal({
  isOpen,
  onClose,
  clientId,
  projectId,
  onIntelligenceAdded,
}: AddIntelligenceModalProps) {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  }, []);

  const handleSubmit = async () => {
    if (inputMode === 'text' && !textInput.trim()) return;
    if (inputMode === 'document' && !selectedFile) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      
      if (clientId) formData.append('clientId', clientId);
      if (projectId) formData.append('projectId', projectId);
      formData.append('inputMode', inputMode);
      
      if (inputMode === 'text') {
        formData.append('textInput', textInput);
      } else if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const response = await fetch('/api/intelligence-extract', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process intelligence');
      }

      const fieldsExtracted = data.extraction?.fieldsExtracted || data.fieldsUpdated?.length || 0;
      const attributesExtracted = data.extraction?.attributesExtracted || 0;
      const insightsCount = (data.extraction?.keyFindings || 0) + (data.extraction?.risksIdentified || 0);

      // Build a meaningful summary
      let summary = '';
      if (fieldsExtracted > 0 || attributesExtracted > 0) {
        const parts = [];
        if (fieldsExtracted > 0) parts.push(`${fieldsExtracted} field${fieldsExtracted !== 1 ? 's' : ''}`);
        if (attributesExtracted > 0) parts.push(`${attributesExtracted} custom attribute${attributesExtracted !== 1 ? 's' : ''}`);
        summary = `Extracted ${parts.join(' and ')} from your input`;
        if (insightsCount > 0) summary += `, plus ${insightsCount} insight${insightsCount !== 1 ? 's' : ''}`;
      } else if (insightsCount > 0) {
        summary = `Saved ${insightsCount} insight${insightsCount !== 1 ? 's' : ''} (no structured fields extracted)`;
      } else {
        summary = data.message || 'No extractable data found. Try including specific details like names, addresses, financial figures, or dates.';
      }

      setResult({
        success: true,
        fieldsUpdated: data.fieldsUpdated || [],
        summary,
        extractionStats: data.extraction,
        extractedFields: data.fields,
        insights: data.insights,
      });

      // Notify parent and optionally close after success
      if (onIntelligenceAdded) {
        onIntelligenceAdded();
      }
    } catch (error) {
      console.error('Error processing intelligence:', error);
      setResult({
        success: false,
        fieldsUpdated: [],
        summary: '',
        error: error instanceof Error ? error.message : 'An error occurred while processing',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setTextInput('');
    setSelectedFile(null);
    setResult(null);
    setInputMode('text');
    onClose();
  };

  const canSubmit = inputMode === 'text' ? textInput.trim().length > 0 : selectedFile !== null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            Add Intelligence
          </DialogTitle>
          <DialogDescription>
            Add new information to update the intelligence profile. You can paste text or upload a document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Input Mode Tabs */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => {
                setInputMode('text');
                setResult(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                inputMode === 'text'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              Text Input
            </button>
            <button
              onClick={() => {
                setInputMode('document');
                setResult(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                inputMode === 'document'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
          </div>

          {/* Text Input Mode */}
          {inputMode === 'text' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Intelligence Context
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Paste meeting notes, emails, call summaries, or any relevant information. 
                  The AI will extract and update relevant fields automatically.
                </p>
                <Textarea
                  value={textInput}
                  onChange={(e) => {
                    setTextInput(e.target.value);
                    setResult(null);
                  }}
                  placeholder="Example: Had a call with John Smith (new CFO) today. Their new office address is 123 Main St, London EC1A 1BB. They mentioned they're now looking for loans between £2M-£5M for residential developments in the South East..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Sparkles className="w-3 h-3" />
                <span>AI will extract: contacts, addresses, preferences, financial details, and more</span>
              </div>
            </div>
          )}

          {/* Document Upload Mode */}
          {inputMode === 'document' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Upload Document
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Upload a document containing client or project information. Supported formats: PDF, Word, Text files.
                </p>
                
                {!selectedFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 mb-3 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PDF, DOCX, DOC, or TXT (max 10MB)</p>
                    </div>
                    <Input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <FileText className="w-8 h-8 text-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setResult(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing Result */}
          {result && (
            <div className={`p-4 rounded-lg border ${
              result.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    result.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {result.success ? 'Intelligence Updated' : 'Processing Failed'}
                  </p>
                  {result.success ? (
                    <p className="text-sm mt-1 text-green-700">
                      {result.summary}
                    </p>
                  ) : (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      <p className="text-sm text-red-700 whitespace-pre-wrap break-words font-mono bg-red-100/50 p-2 rounded">
                        {result.error}
                      </p>
                    </div>
                  )}

                  {/* Extraction Statistics */}
                  {result.success && result.extractionStats && (
                    <div className="grid grid-cols-4 gap-2 mt-3 p-2 bg-white/50 rounded-md">
                      <div className="text-center">
                        <p className="text-lg font-semibold text-green-700">{result.extractionStats.fieldsExtracted}</p>
                        <p className="text-xs text-gray-600">Fields</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-green-700">{result.extractionStats.attributesExtracted}</p>
                        <p className="text-xs text-gray-600">Attributes</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-blue-700">{result.extractionStats.keyFindings}</p>
                        <p className="text-xs text-gray-600">Findings</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-amber-700">{result.extractionStats.risksIdentified}</p>
                        <p className="text-xs text-gray-600">Risks</p>
                      </div>
                    </div>
                  )}

                  {/* Extracted Fields Detail */}
                  {result.success && result.extractedFields && result.extractedFields.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-gray-700">Extracted Data:</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {result.extractedFields.slice(0, 10).map((field, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white/50 px-2 py-1 rounded">
                            <span className="text-gray-600">{field.fieldPath.split('.').pop()}</span>
                            <span className="font-medium text-gray-900 truncate max-w-[200px]">
                              {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value)}
                            </span>
                          </div>
                        ))}
                        {result.extractedFields.length > 10 && (
                          <p className="text-xs text-gray-500 italic">...and {result.extractedFields.length - 10} more fields</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Key Findings */}
                  {result.success && result.insights?.keyFindings && result.insights.keyFindings.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Key Findings:</p>
                      <ul className="space-y-1">
                        {result.insights.keyFindings.slice(0, 3).map((finding, idx) => (
                          <li key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                            <span className="text-blue-500 mt-0.5">•</span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks */}
                  {result.success && result.insights?.risks && result.insights.risks.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Risks Identified:</p>
                      <ul className="space-y-1">
                        {result.insights.risks.slice(0, 3).map((risk, idx) => (
                          <li key={idx} className="text-xs text-amber-700 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{risk.risk}</span>
                            {risk.severity && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                                {risk.severity}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.success && result.fieldsUpdated.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {result.fieldsUpdated.map((field, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs bg-green-100 text-green-800">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            {projectId ? 'Updating project intelligence' : 'Updating client intelligence'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              {result?.success ? 'Close' : 'Cancel'}
            </Button>
            {!result?.success && (
              <Button 
                onClick={handleSubmit} 
                disabled={!canSubmit || isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract & Update
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
