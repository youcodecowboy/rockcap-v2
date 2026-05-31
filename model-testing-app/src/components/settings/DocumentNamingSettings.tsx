'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { Panel, Button, IconButton, Field, Input, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Id } from '../../../convex/_generated/dataModel';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { abbreviateText, generateDocumentCode } from '@/lib/documentCodeUtils';
import {
  resolveNamingConfig,
  type DocumentNamingConfig,
  type CustomToken,
  labelToTokenId,
  MAX_CUSTOM_TOKENS,
  DEFAULT_PATTERN,
  DEFAULT_SEPARATOR,
} from '@/lib/namingConfig';
import NamingPatternBuilder from './NamingPatternBuilder';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface DocumentNamingSettingsProps {
  entityType: 'client' | 'project';
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  projectShortcode?: string;
  metadata?: any;
  onSave?: (namingSettings: DocumentNamingConfig) => void;
  onShortcodeChange?: (shortcode: string) => void;
}

export default function DocumentNamingSettings({
  entityType,
  clientId,
  clientName,
  projectId,
  projectName,
  projectShortcode,
  metadata,
  onSave,
  onShortcodeChange,
}: DocumentNamingSettingsProps) {
  const colors = useColors();
  // Query client data for inheritance (project level)
  const client = useQuery(
    api.clients.get,
    entityType === 'project' && clientId ? { id: clientId } : 'skip'
  );
  const resolvedClientName = clientName || (client as any)?.name || '';
  const clientMetadata = (client as any)?.metadata;

  // Resolve initial config from metadata
  const initialConfig = useMemo(() => {
    if (entityType === 'project') {
      return resolveNamingConfig(metadata, clientMetadata);
    }
    return resolveNamingConfig(undefined, metadata);
  }, [metadata, clientMetadata, entityType]);

  const [config, setConfig] = useState<DocumentNamingConfig>({
    code: '',
    pattern: DEFAULT_PATTERN,
    separator: DEFAULT_SEPARATOR,
    customTokens: [],
  });
  const [inheriting, setInheriting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Custom token creation
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenRequired, setNewTokenRequired] = useState(false);
  const [showTokenForm, setShowTokenForm] = useState(false);

  // Sync config from resolved metadata
  useEffect(() => {
    const projectNaming = metadata?.documentNaming;
    const isInheriting = entityType === 'project' && (!projectNaming || projectNaming.inheritFromClient === true);
    setInheriting(isInheriting);

    setConfig((prev) => ({
      ...initialConfig,
      // For code: use projectShortcode if available, or the resolved config code
      code: entityType === 'project' && projectShortcode
        ? projectShortcode
        : initialConfig.code || prev.code,
    }));
  }, [initialConfig, projectShortcode, entityType, metadata]);

  // Set default code from names if no saved code
  useEffect(() => {
    setConfig((prev) => {
      if (prev.code) return prev;
      if (entityType === 'client' && clientName) {
        return { ...prev, code: abbreviateText(clientName, 8) };
      }
      if (entityType === 'project' && projectName) {
        return { ...prev, code: abbreviateText(projectName, 10) };
      }
      return prev;
    });
  }, [clientName, projectName, entityType]);

  // Get documents for stats
  const clientDocuments = useQuery(
    api.documents.getByClient,
    clientId ? { clientId } : 'skip'
  ) || [];

  const projectDocuments = useQuery(
    api.documents.getByProject,
    projectId ? { projectId } : 'skip'
  ) || [];

  const documents = entityType === 'client' ? clientDocuments : projectDocuments;

  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);

  // Calculate stats
  const stats = useMemo(() => {
    const missingCodes = documents.filter((doc: any) => !doc.documentCode || doc.documentCode.trim() === '');
    const hasCodes = documents.filter((doc: any) => doc.documentCode && doc.documentCode.trim() !== '');
    return {
      total: documents.length,
      missingCodes: missingCodes.length,
      hasCodes: hasCodes.length,
    };
  }, [documents]);

  // Resolve the client config for inheritance display
  const clientConfig = useMemo(() => {
    if (entityType !== 'project' || !clientMetadata) return null;
    return resolveNamingConfig(undefined, clientMetadata);
  }, [entityType, clientMetadata]);

  const handleToggleInheritance = (checked: boolean) => {
    setInheriting(checked);
    if (!checked && clientConfig) {
      // Override: copy client config as starting point
      setConfig((prev) => ({
        ...clientConfig,
        code: prev.code, // keep project's own code
      }));
    }
  };

  const handleConfigChange = (updated: DocumentNamingConfig) => {
    setConfig(updated);
  };

  const handleAddCustomToken = () => {
    if (!newTokenLabel.trim()) return;
    const id = labelToTokenId(newTokenLabel);
    if (config.customTokens.some((t) => t.id === id)) return;

    const token: CustomToken = {
      id,
      label: newTokenLabel.trim(),
      type: 'text',
      required: newTokenRequired,
    };

    setConfig((prev) => ({
      ...prev,
      customTokens: [...prev.customTokens, token],
    }));
    setNewTokenLabel('');
    setNewTokenRequired(false);
    setShowTokenForm(false);
  };

  const handleRemoveCustomToken = (tokenId: string) => {
    setConfig((prev) => ({
      ...prev,
      customTokens: prev.customTokens.filter((t) => t.id !== tokenId),
      // Also remove from pattern if present
      pattern: prev.pattern.filter((p) => p.toLowerCase() !== tokenId.toLowerCase()),
    }));
  };

  const handleSave = async () => {
    if (!config.code.trim()) return;

    setIsSaving(true);
    try {
      // For projects, update the actual projectShortcode field
      if (entityType === 'project' && onShortcodeChange) {
        await onShortcodeChange(config.code.toUpperCase());
      }

      if (onSave) {
        const savePayload: DocumentNamingConfig = {
          code: config.code.toUpperCase(),
          pattern: inheriting ? [] : config.pattern,
          separator: inheriting ? DEFAULT_SEPARATOR : config.separator,
          customTokens: inheriting ? [] : config.customTokens,
          inheritFromClient: entityType === 'project' ? inheriting : undefined,
        };
        onSave(savePayload);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToDocuments = async () => {
    if (!config.code.trim()) return;
    if (documents.length === 0) return;

    setIsApplying(true);
    try {
      const docsToUpdate = documents.filter((doc: any) => !doc.documentCode || doc.documentCode.trim() === '');

      if (docsToUpdate.length === 0) {
        alert('All documents already have codes assigned.');
        setIsApplying(false);
        return;
      }

      const usedCodes = new Set<string>();
      let successCount = 0;

      for (const doc of docsToUpdate) {
        try {
          const generatedCode = generateDocumentCode(
            resolvedClientName || '',
            doc.category,
            projectName,
            doc.uploadedAt
          );

          let finalCode = generatedCode;
          let counter = 1;
          while (usedCodes.has(finalCode)) {
            finalCode = `${generatedCode}-${counter}`;
            counter++;
          }

          usedCodes.add(finalCode);
          await updateDocumentCode({ id: doc._id, documentCode: finalCode });
          successCount++;
        } catch (error) {
          console.error(`Failed to update document ${doc._id}:`, error);
        }
      }

      alert(`Applied codes to ${successCount} document(s).`);
    } catch (error) {
      console.error('Failed to apply codes:', error);
      alert('Failed to apply codes. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  // The active config to display (inherited or local)
  const displayConfig = inheriting && clientConfig ? { ...clientConfig, code: config.code } : config;

  const maxLength = entityType === 'client' ? 8 : 10;

  const toggleStyle = (checked: boolean) => ({
    width: 16,
    height: 16,
    cursor: 'pointer',
    accentColor: checked ? colors.accent.blue : colors.border.mid,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      {documents.length > 0 && (
        <Panel title="Document Statistics">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <p style={{ fontSize: 11, color: colors.text.muted }}>
              {stats.hasCodes} with codes, {stats.missingCodes} without codes
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusPill label={`${stats.hasCodes} coded`} tone={colors.accent.green} />
              {stats.missingCodes > 0 && (
                <StatusPill label={`${stats.missingCodes} missing`} tone={colors.accent.orange} />
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Inheritance Banner (project level only) */}
      {entityType === 'project' && (
        <Panel accent={inheriting ? colors.accent.blue : colors.border.mid}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                {inheriting
                  ? `Inheriting naming pattern from ${resolvedClientName || 'client'}.`
                  : 'Using project-level naming pattern.'}
              </p>
              <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                {inheriting
                  ? 'Toggle off to override with a project-specific pattern.'
                  : 'Toggle on to inherit from the client settings.'}
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ fontSize: 11, color: colors.text.secondary }}>Inherit</span>
              <input
                type="checkbox"
                checked={inheriting}
                onChange={(e) => handleToggleInheritance(e.target.checked)}
                style={toggleStyle(inheriting)}
              />
            </label>
          </div>
        </Panel>
      )}

      {/* Abbreviation / Code Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
            {entityType === 'client' ? 'Client' : 'Project'} Code
          </h3>
          {entityType === 'project' && projectShortcode && (
            <StatusPill label="Shortcode configured" tone={colors.accent.green} />
          )}
        </div>

        <Field
          label={entityType === 'client' ? 'Client Abbreviation' : 'Project Shortcode'}
          hint={`Max ${maxLength} characters, alphanumeric only. Used in document naming.`}
        >
          <Input
            id="code"
            value={config.code}
            onChange={(e) => setConfig((prev) => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
            placeholder={entityType === 'client' ? 'e.g., FIRESIDE' : 'e.g., WIMBPARK28'}
            style={{ fontFamily: MONO }}
            maxLength={maxLength}
          />
        </Field>
        {entityType === 'project' && projectShortcode && (
          <p style={{ fontSize: 11, color: colors.accent.green }}>
            Current shortcode: <span style={{ fontFamily: MONO, fontWeight: 500 }}>{projectShortcode}</span>
          </p>
        )}
      </div>

      {/* Naming Pattern Builder */}
      <NamingPatternBuilder
        config={displayConfig}
        onChange={handleConfigChange}
        sampleClientCode={config.code || 'ACME'}
        sampleProjectCode={entityType === 'project' ? (projectShortcode || config.code || 'PARK28') : undefined}
        sampleCategory="Appraisals"
        disabled={inheriting}
      />

      {/* Custom Tokens Section */}
      {!inheriting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Custom Tokens</span>
            {config.customTokens.length < MAX_CUSTOM_TOKENS && !showTokenForm && (
              <Button variant="secondary" size="sm" onClick={() => setShowTokenForm(true)}>
                <Plus style={{ width: 12, height: 12 }} />
                Add Custom Token
              </Button>
            )}
          </div>

          {/* New token form */}
          {showTokenForm && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                padding: 12,
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
              }}
            >
              <div style={{ flex: 1 }}>
                <Field
                  label="Token Label"
                  hint={newTokenLabel.trim() ? `ID: ${labelToTokenId(newTokenLabel)}` : undefined}
                >
                  <Input
                    id="token-label"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    placeholder="e.g., Phase, Block"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newTokenRequired}
                    onChange={(e) => setNewTokenRequired(e.target.checked)}
                    style={toggleStyle(newTokenRequired)}
                  />
                  <span style={{ fontSize: 11, color: colors.text.secondary }}>Required</span>
                </label>
                <Button variant="primary" size="sm" onClick={handleAddCustomToken} disabled={!newTokenLabel.trim()}>
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowTokenForm(false); setNewTokenLabel(''); setNewTokenRequired(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Existing custom tokens */}
          {config.customTokens.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {config.customTokens.map((token) => (
                <div
                  key={token.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: `${colors.accent.purple}15`,
                    border: `1px solid ${colors.accent.purple}40`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: colors.accent.purple }}>{token.label}</span>
                    <span style={{ fontSize: 11, fontFamily: MONO, color: colors.accent.purple }}>{token.id}</span>
                    {token.required && (
                      <StatusPill label="required" tone={colors.accent.purple} />
                    )}
                  </div>
                  <IconButton label="Remove token" onClick={() => handleRemoveCustomToken(token.id)}>
                    <Trash2 style={{ width: 14, height: 14, color: colors.accent.purple }} />
                  </IconButton>
                </div>
              ))}
              <p style={{ fontSize: 11, color: colors.text.dim }}>
                {config.customTokens.length}/{MAX_CUSTOM_TOKENS} custom tokens used
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
        {stats.missingCodes > 0 && (
          <Button
            onClick={handleApplyToDocuments}
            disabled={isApplying || !config.code.trim()}
            variant="secondary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            {isApplying ? 'Applying...' : `Apply to ${stats.missingCodes} Documents Without Codes`}
          </Button>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving || !config.code.trim()}
          variant="primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isSaving ? 'Saving...' : 'Save Naming Settings'}
        </Button>
      </div>
    </div>
  );
}
