'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Modal, Field, Input, Textarea, Select, Button, StatusPill, IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Sparkles,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface ParsedRequirement {
  name: string;
  category: string;
  description?: string;
  priority: 'required' | 'nice_to_have' | 'optional';
}

interface DynamicChecklistInputProps {
  clientId: Id<"clients">;
  projectId?: Id<"projects">;
  onClose: () => void;
}

export default function DynamicChecklistInput({
  clientId,
  projectId,
  onClose,
}: DynamicChecklistInputProps) {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<'llm' | 'manual'>('llm');

  // LLM parsing state
  const [llmInput, setLlmInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRequirements, setParsedRequirements] = useState<ParsedRequirement[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Manual input state
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualPriority, setManualPriority] = useState<'required' | 'nice_to_have' | 'optional'>('required');

  // Queries
  const existingChecklistItems = useQuery(
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    { clientId, projectId }
  );

  // Mutations
  const addCustomRequirement = useMutation(api.knowledgeLibrary.addCustomRequirement);
  const addFromLLM = useMutation(api.knowledgeLibrary.addCustomRequirementsFromLLM);

  // Handle LLM parsing
  const handleParse = async () => {
    if (!llmInput.trim()) {
      alert('Please enter some text describing the additional requirements you need.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParsedRequirements([]);

    // Prepare existing items for context
    const existingItems = existingChecklistItems?.map(item => ({
      name: item.name,
      category: item.category,
      description: item.description,
      status: item.status,
    })) || [];

    try {
      const response = await fetch('/api/knowledge-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: llmInput, existingItems }),
      });

      if (!response.ok) {
        throw new Error('Failed to parse requirements');
      }

      const data = await response.json();

      if (data.requirements && data.requirements.length > 0) {
        setParsedRequirements(data.requirements);
      } else {
        setParseError('No requirements could be extracted from your text. Please try being more specific.');
      }
    } catch (error) {
      setParseError('Failed to parse requirements. Please try again.');
      console.error('Parse error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle adding parsed requirements
  const handleAddParsed = async () => {
    if (parsedRequirements.length === 0) return;

    try {
      await addFromLLM({
        clientId,
        projectId,
        requirements: parsedRequirements,
      });
      onClose();
    } catch (error) {
      console.error('Failed to add requirements:', error);
      alert('Failed to add requirements. Please try again.');
    }
  };

  // Handle removing a parsed requirement
  const handleRemoveParsed = (index: number) => {
    setParsedRequirements(prev => prev.filter((_, i) => i !== index));
  };

  // Handle manual add
  const handleManualAdd = async () => {
    if (!manualName.trim() || !manualCategory.trim()) {
      alert('Name and category are required.');
      return;
    }

    try {
      await addCustomRequirement({
        clientId,
        projectId,
        name: manualName,
        category: manualCategory,
        description: manualDescription || undefined,
        priority: manualPriority,
      });
      onClose();
    } catch (error) {
      console.error('Failed to add requirement:', error);
      alert('Failed to add requirement. Please try again.');
    }
  };

  // Priority → StatusPill tone
  const priorityTone = (priority: string) =>
    priority === 'required'
      ? colors.accent.red
      : priority === 'nice_to_have'
      ? colors.accent.blue
      : colors.text.muted;

  const priorityLabel = (priority: string) =>
    priority === 'required' ? 'Required' : priority === 'nice_to_have' ? 'Nice to have' : 'Optional';

  // Token-styled tab trigger.
  const tabButton = (key: 'llm' | 'manual', icon: React.ReactNode, label: string) => {
    const active = activeTab === key;
    return (
      <button
        onClick={() => setActiveTab(key)}
        style={{
          flex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '7px 10px',
          fontSize: 11,
          fontWeight: 500,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: active ? colors.text.primary : colors.text.muted,
          background: active ? colors.bg.card : 'transparent',
          border: `1px solid ${active ? colors.border.default : 'transparent'}`,
          borderRadius: 4,
          cursor: 'pointer',
          transition: 'background 100ms linear, color 100ms linear',
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <Modal open onClose={onClose} title="Add custom requirements" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 11, color: colors.text.muted }}>
          Add new document requirements to the checklist
        </p>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: colors.bg.cardAlt,
            border: `1px solid ${colors.border.light}`,
            borderRadius: 4,
          }}
        >
          {tabButton('llm', <Sparkles size={13} />, 'AI assisted')}
          {tabButton('manual', <FileText size={13} />, 'Manual entry')}
        </div>

        {/* LLM Tab */}
        {activeTab === 'llm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Describe additional requirements"
              hint="Describe what additional documents you need in natural language. The AI will parse your text and extract structured requirements."
            >
              <Textarea
                placeholder="Example: This client is working on an additional project at another location, and we are going to do some due diligence on it. I will be asking them for some additional project plans and evaluation reports..."
                value={llmInput}
                onChange={(e) => setLlmInput(e.target.value)}
                rows={6}
              />
            </Field>

            <Button
              variant="primary"
              accent={colors.entityTypes.client}
              onClick={handleParse}
              disabled={isParsing || !llmInput.trim()}
            >
              {isParsing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Parsing
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Parse requirements
                </>
              )}
            </Button>

            {/* Parse Error */}
            {parseError && (
              <div
                className="flex items-start gap-2"
                style={{
                  padding: 10,
                  background: `${colors.accent.red}10`,
                  border: `1px solid ${colors.accent.red}40`,
                  borderRadius: 4,
                  fontSize: 11,
                  color: colors.accent.red,
                }}
              >
                <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{parseError}</span>
              </div>
            )}

            {/* Parsed Requirements Preview */}
            {parsedRequirements.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: colors.text.muted,
                    fontWeight: 500,
                  }}
                >
                  Parsed requirements ({parsedRequirements.length})
                </div>
                <div
                  style={{
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  {parsedRequirements.map((req, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3"
                      style={{
                        padding: 10,
                        borderBottom: index === parsedRequirements.length - 1 ? 'none' : `1px solid ${colors.border.light}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{req.name}</span>
                          <StatusPill label={priorityLabel(req.priority)} tone={priorityTone(req.priority)} />
                        </div>
                        <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
                          Category: {req.category}
                        </p>
                        {req.description && (
                          <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }} className="line-clamp-2">
                            {req.description}
                          </p>
                        )}
                      </div>
                      <IconButton label="Remove requirement" onClick={() => handleRemoveParsed(index)}>
                        <X size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>

                <Button
                  variant="primary"
                  accent={colors.entityTypes.client}
                  onClick={handleAddParsed}
                >
                  <Check size={14} />
                  Add {parsedRequirements.length} requirement{parsedRequirements.length > 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Manual Tab */}
        {activeTab === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Requirement name *">
              <Input
                placeholder="e.g., Environmental Survey Report"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Category *">
                <Input
                  placeholder="e.g., Professional Reports"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                />
              </Field>

              <Field label="Priority">
                <Select value={manualPriority} onChange={(e) => setManualPriority(e.target.value as any)}>
                  <option value="required">Required</option>
                  <option value="nice_to_have">Nice to have</option>
                  <option value="optional">Optional</option>
                </Select>
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                placeholder="Brief description of what this document should contain..."
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                rows={3}
              />
            </Field>

            <Button
              variant="primary"
              accent={colors.entityTypes.client}
              onClick={handleManualAdd}
              disabled={!manualName.trim() || !manualCategory.trim()}
            >
              <Plus size={14} />
              Add requirement
            </Button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
