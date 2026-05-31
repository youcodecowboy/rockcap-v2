'use client';

import { useState, useCallback } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { Modal, Button, Field, Textarea, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [dropHover, setDropHover] = useState(false);

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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 3,
    cursor: 'pointer',
    border: 'none',
    color: active ? colors.text.primary : colors.text.muted,
    background: active ? colors.bg.card : 'transparent',
    transition: 'background 100ms linear, color 100ms linear',
  });

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Add Intelligence"
      width={672}
      footer={
        <>
          <span style={{ fontSize: 11, color: colors.text.muted, marginRight: 'auto' }}>
            {projectId ? 'Updating project intelligence' : 'Updating client intelligence'}
          </span>
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            {result?.success ? 'Close' : 'Cancel'}
          </Button>
          {!result?.success && (
            <Button variant="primary" accent={colors.accent.blue} onClick={handleSubmit} disabled={!canSubmit || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Extract &amp; Update
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.muted }}>
          <Brain size={16} style={{ color: colors.accent.blue }} />
          Add new information to update the intelligence profile. Paste text or upload a document.
        </div>

        {/* Input Mode Tabs */}
        <div className="flex gap-2 p-1" style={{ background: colors.bg.light, borderRadius: 4 }}>
          <button
            onClick={() => {
              setInputMode('text');
              setResult(null);
            }}
            style={tabStyle(inputMode === 'text')}
          >
            <FileText size={16} />
            Text Input
          </button>
          <button
            onClick={() => {
              setInputMode('document');
              setResult(null);
            }}
            style={tabStyle(inputMode === 'document')}
          >
            <Upload size={16} />
            Upload Document
          </button>
        </div>

        {/* Text Input Mode */}
        {inputMode === 'text' && (
          <div className="space-y-3">
            <Field
              label="Intelligence Context"
              hint="Paste meeting notes, emails, call summaries, or any relevant information. The AI will extract and update relevant fields automatically."
            >
              <Textarea
                value={textInput}
                onChange={(e) => {
                  setTextInput(e.target.value);
                  setResult(null);
                }}
                placeholder="Example: Had a call with John Smith (new CFO) today. Their new office address is 123 Main St, London EC1A 1BB. They mentioned they're now looking for loans between £2M-£5M for residential developments in the South East..."
                rows={10}
                style={{ fontFamily: MONO }}
              />
            </Field>
            <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.muted }}>
              <Sparkles size={12} />
              <span>AI will extract: contacts, addresses, preferences, financial details, and more</span>
            </div>
          </div>
        )}

        {/* Document Upload Mode */}
        {inputMode === 'document' && (
          <div className="space-y-3">
            <Field
              label="Upload Document"
              hint="Upload a document containing client or project information. Supported formats: PDF, Word, Text files."
            >
              {!selectedFile ? (
                <label
                  className="flex flex-col items-center justify-center w-full h-40 cursor-pointer"
                  onMouseEnter={() => setDropHover(true)}
                  onMouseLeave={() => setDropHover(false)}
                  style={{
                    border: `2px dashed ${colors.border.mid}`,
                    borderRadius: 4,
                    background: dropHover ? colors.bg.cardAlt : colors.bg.light,
                    transition: 'background 100ms linear',
                  }}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload size={40} style={{ color: colors.text.dim, marginBottom: 12 }} />
                    <p className="mb-2" style={{ fontSize: 13, color: colors.text.muted }}>
                      <span style={{ fontWeight: 600 }}>Click to upload</span> or drag and drop
                    </p>
                    <p style={{ fontSize: 11, color: colors.text.dim }}>PDF, DOCX, DOC, or TXT (max 10MB)</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <div
                  className="flex items-center gap-3 p-4"
                  style={{ background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}` }}
                >
                  <FileText size={32} style={{ color: colors.accent.blue }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                      {selectedFile.name}
                    </p>
                    <p style={{ fontSize: 11, color: colors.text.muted }}>
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
                    <X size={16} />
                  </Button>
                </div>
              )}
            </Field>
          </div>
        )}

        {/* Processing Result */}
        {result && (
          <div
            className="p-4"
            style={{
              borderRadius: 4,
              border: `1px solid ${result.success ? `${colors.accent.green}40` : `${colors.accent.red}40`}`,
              background: result.success ? `${colors.accent.green}10` : `${colors.accent.red}10`,
            }}
          >
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle2 size={20} style={{ color: colors.accent.green, flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertCircle size={20} style={{ color: colors.accent.red, flexShrink: 0, marginTop: 2 }} />
              )}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 500, color: result.success ? colors.accent.green : colors.accent.red }}>
                  {result.success ? 'Intelligence Updated' : 'Processing Failed'}
                </p>
                {result.success ? (
                  <p className="mt-1" style={{ fontSize: 13, color: colors.text.secondary }}>
                    {result.summary}
                  </p>
                ) : (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    <p
                      className="whitespace-pre-wrap break-words p-2"
                      style={{ fontFamily: MONO, fontSize: 12, color: colors.accent.red, background: `${colors.accent.red}12`, borderRadius: 3 }}
                    >
                      {result.error}
                    </p>
                  </div>
                )}

                {/* Extraction Statistics */}
                {result.success && result.extractionStats && (
                  <div
                    className="grid grid-cols-4 gap-2 mt-3 p-2"
                    style={{ background: colors.bg.card, borderRadius: 4 }}
                  >
                    {[
                      { value: result.extractionStats.fieldsExtracted, label: 'Fields', tone: colors.accent.green },
                      { value: result.extractionStats.attributesExtracted, label: 'Attributes', tone: colors.accent.green },
                      { value: result.extractionStats.keyFindings, label: 'Findings', tone: colors.accent.blue },
                      { value: result.extractionStats.risksIdentified, label: 'Risks', tone: colors.accent.orange },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center">
                        <p style={{ fontFamily: MONO, fontSize: 18, fontWeight: 300, color: stat.tone }}>{stat.value}</p>
                        <p style={{ fontSize: 11, color: colors.text.muted }}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Extracted Fields Detail */}
                {result.success && result.extractedFields && result.extractedFields.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>Extracted Data:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {result.extractedFields.slice(0, 10).map((field, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2 py-1"
                          style={{ fontSize: 11, background: colors.bg.card, borderRadius: 3 }}
                        >
                          <span style={{ color: colors.text.muted }}>{field.fieldPath.split('.').pop()}</span>
                          <span className="truncate max-w-[200px]" style={{ fontWeight: 500, color: colors.text.primary }}>
                            {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value)}
                          </span>
                        </div>
                      ))}
                      {result.extractedFields.length > 10 && (
                        <p style={{ fontSize: 11, fontStyle: 'italic', color: colors.text.dim }}>
                          ...and {result.extractedFields.length - 10} more fields
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Key Findings */}
                {result.success && result.insights?.keyFindings && result.insights.keyFindings.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1" style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>Key Findings:</p>
                    <ul className="space-y-1">
                      {result.insights.keyFindings.slice(0, 3).map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-1" style={{ fontSize: 11, color: colors.text.secondary }}>
                          <span style={{ color: colors.accent.blue, marginTop: 2 }}>•</span>
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {result.success && result.insights?.risks && result.insights.risks.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1" style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>Risks Identified:</p>
                    <ul className="space-y-1">
                      {result.insights.risks.slice(0, 3).map((risk, idx) => (
                        <li key={idx} className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.orange }}>
                          <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>{risk.risk}</span>
                          {risk.severity && <StatusPill label={risk.severity} tone={colors.accent.orange} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.success && result.fieldsUpdated.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {result.fieldsUpdated.map((field, idx) => (
                      <StatusPill key={idx} label={field} tone={colors.accent.green} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
