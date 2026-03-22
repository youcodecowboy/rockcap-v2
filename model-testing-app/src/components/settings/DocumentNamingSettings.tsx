'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

  return (
    <div className="space-y-6">
      {/* Stats */}
      {documents.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Document Statistics</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.hasCodes} with codes, {stats.missingCodes} without codes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {stats.hasCodes} coded
              </Badge>
              {stats.missingCodes > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  {stats.missingCodes} missing
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inheritance Banner (project level only) */}
      {entityType === 'project' && (
        <div className={`rounded-lg border p-4 ${inheriting ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {inheriting
                  ? `Inheriting naming pattern from ${resolvedClientName || 'client'}.`
                  : 'Using project-level naming pattern.'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {inheriting
                  ? 'Toggle off to override with a project-specific pattern.'
                  : 'Toggle on to inherit from the client settings.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="inherit-toggle" className="text-xs text-gray-600">Inherit</Label>
              <Switch
                id="inherit-toggle"
                checked={inheriting}
                onCheckedChange={handleToggleInheritance}
              />
            </div>
          </div>
        </div>
      )}

      {/* Abbreviation / Code Input */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            {entityType === 'client' ? 'Client' : 'Project'} Code
          </h3>
          {entityType === 'project' && projectShortcode && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Shortcode configured
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">
            {entityType === 'client' ? 'Client Abbreviation' : 'Project Shortcode'}
          </Label>
          <Input
            id="code"
            value={config.code}
            onChange={(e) => setConfig((prev) => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
            placeholder={entityType === 'client' ? 'e.g., FIRESIDE' : 'e.g., WIMBPARK28'}
            className="font-mono"
            maxLength={maxLength}
          />
          <p className="text-xs text-gray-500">
            Max {maxLength} characters, alphanumeric only. Used in document naming.
            {entityType === 'project' && projectShortcode && (
              <span className="block mt-1 text-green-600">
                Current shortcode: <span className="font-mono font-medium">{projectShortcode}</span>
              </span>
            )}
          </p>
        </div>
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Custom Tokens</Label>
            {config.customTokens.length < MAX_CUSTOM_TOKENS && !showTokenForm && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowTokenForm(true)}
              >
                <Plus className="w-3 h-3" />
                Add Custom Token
              </Button>
            )}
          </div>

          {/* New token form */}
          {showTokenForm && (
            <div className="flex items-end gap-2 p-3 bg-gray-50 rounded-lg border">
              <div className="flex-1 space-y-1">
                <Label htmlFor="token-label" className="text-xs">Token Label</Label>
                <Input
                  id="token-label"
                  value={newTokenLabel}
                  onChange={(e) => setNewTokenLabel(e.target.value)}
                  placeholder="e.g., Phase, Block"
                  className="h-8 text-sm"
                />
                {newTokenLabel.trim() && (
                  <p className="text-xs text-gray-400 font-mono">
                    ID: {labelToTokenId(newTokenLabel)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="token-required"
                    checked={newTokenRequired}
                    onCheckedChange={setNewTokenRequired}
                  />
                  <Label htmlFor="token-required" className="text-xs">Required</Label>
                </div>
                <Button size="sm" className="h-8" onClick={handleAddCustomToken} disabled={!newTokenLabel.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowTokenForm(false); setNewTokenLabel(''); setNewTokenRequired(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Existing custom tokens */}
          {config.customTokens.length > 0 && (
            <div className="space-y-1.5">
              {config.customTokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-md border border-purple-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-800">{token.label}</span>
                    <span className="text-xs font-mono text-purple-500">{token.id}</span>
                    {token.required && (
                      <Badge variant="outline" className="text-[10px] h-4 bg-purple-100 text-purple-600 border-purple-300">
                        required
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-purple-400 hover:text-red-600"
                    onClick={() => handleRemoveCustomToken(token.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-gray-400">
                {config.customTokens.length}/{MAX_CUSTOM_TOKENS} custom tokens used
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-4 border-t">
        {stats.missingCodes > 0 && (
          <Button
            onClick={handleApplyToDocuments}
            disabled={isApplying || !config.code.trim()}
            className="w-full gap-2"
            variant="outline"
          >
            <Sparkles className="w-4 h-4" />
            {isApplying ? 'Applying...' : `Apply to ${stats.missingCodes} Documents Without Codes`}
          </Button>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving || !config.code.trim()}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Naming Settings'}
        </Button>
      </div>
    </div>
  );
}
