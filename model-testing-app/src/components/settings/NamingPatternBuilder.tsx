'use client';

import { Select } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BUILT_IN_TOKENS,
  type DocumentNamingConfig,
  assembleDocumentCode,
  getBuiltInTokenValues,
} from '@/lib/namingConfig';

interface NamingPatternBuilderProps {
  config: DocumentNamingConfig;
  onChange: (config: DocumentNamingConfig) => void;
  sampleClientCode?: string;
  sampleProjectCode?: string;
  sampleCategory?: string;
  disabled?: boolean;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function NamingPatternBuilder({
  config,
  onChange,
  sampleClientCode = "ACME",
  sampleProjectCode = "PARK28",
  sampleCategory = "Appraisals",
  disabled = false,
}: NamingPatternBuilderProps) {
  const colors = useColors();
  const allAvailableTokens = [
    ...BUILT_IN_TOKENS.map((t) => ({ id: t, label: t, isBuiltIn: true })),
    ...config.customTokens.map((t) => ({ id: t.id.toUpperCase(), label: t.label, isBuiltIn: false })),
  ];

  const unusedTokens = allAvailableTokens.filter(
    (t) => !config.pattern.includes(t.id)
  );

  const handleAddToken = (tokenId: string) => {
    onChange({ ...config, pattern: [...config.pattern, tokenId] });
  };

  const handleRemoveToken = (index: number) => {
    const newPattern = [...config.pattern];
    newPattern.splice(index, 1);
    onChange({ ...config, pattern: newPattern });
  };

  const handleMoveToken = (index: number, direction: -1 | 1) => {
    const newPattern = [...config.pattern];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newPattern.length) return;
    [newPattern[index], newPattern[newIndex]] = [newPattern[newIndex], newPattern[index]];
    onChange({ ...config, pattern: newPattern });
  };

  const handleSeparatorChange = (sep: string) => {
    onChange({ ...config, separator: sep });
  };

  // Generate preview
  const sampleTokenValues: Record<string, string> = {
    ...getBuiltInTokenValues(sampleClientCode, sampleCategory, sampleProjectCode),
  };
  for (const ct of config.customTokens) {
    sampleTokenValues[ct.id] = "ABC123";
  }
  const previewCode = assembleDocumentCode(config, sampleTokenValues);

  const labelStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
    fontWeight: 500,
    display: 'block',
    marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Pattern chips */}
      <div>
        <label style={labelStyle}>Naming Pattern</label>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: 12,
            background: colors.bg.cardAlt,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
            minHeight: 44,
          }}
        >
          {config.pattern.map((token, index) => {
            const isBuiltIn = (BUILT_IN_TOKENS as readonly string[]).includes(token);
            const tone = isBuiltIn ? colors.accent.blue : colors.accent.purple;
            return (
              <div key={`${token}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {index > 0 && (
                  <span style={{ color: colors.text.dim, fontSize: 11, fontFamily: MONO, margin: '0 2px' }}>{config.separator}</span>
                )}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontFamily: MONO,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: `${tone}20`,
                    color: tone,
                    border: `1px solid ${tone}40`,
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {!disabled && index > 0 && (
                    <button onClick={() => handleMoveToken(index, -1)} style={{ display: 'inline-flex', cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'inherit' }}>
                      <ChevronLeft style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                  {token}
                  {!disabled && index < config.pattern.length - 1 && (
                    <button onClick={() => handleMoveToken(index, 1)} style={{ display: 'inline-flex', cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'inherit' }}>
                      <ChevronRight style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                  {!disabled && (
                    <button onClick={() => handleRemoveToken(index)} style={{ display: 'inline-flex', cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginLeft: 2, color: 'inherit' }}>
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}

          {/* Add token dropdown */}
          {!disabled && unusedTokens.length > 0 && (
            <Select
              value=""
              onChange={(e) => { if (e.target.value) handleAddToken(e.target.value); }}
              style={{ width: 'auto', padding: '4px 8px', fontSize: 11, borderStyle: 'dashed' }}
            >
              <option value="">+ Add token</option>
              {unusedTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}{!t.isBuiltIn ? ' (custom)' : ''}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* Separator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Separator</label>
        <Select
          value={config.separator}
          onChange={(e) => handleSeparatorChange(e.target.value)}
          disabled={disabled}
          style={{ width: 120, fontSize: 11 }}
        >
          <option value="-">- (dash)</option>
          <option value="_">_ (underscore)</option>
          <option value=".">. (dot)</option>
          <option value=" ">(space)</option>
        </Select>
      </div>

      {/* Preview */}
      <div
        style={{
          background: colors.bg.cardAlt,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 12,
        }}
      >
        <p style={{ ...labelStyle, marginBottom: 4 }}>Preview</p>
        <p style={{ fontSize: 13, fontFamily: MONO, fontWeight: 500, color: colors.text.primary }}>
          {previewCode || <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>No tokens selected</span>}
        </p>
      </div>
    </div>
  );
}
