'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Panel, Button, IconButton, Field, Input, Select, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  CLIENT_CANONICAL_FIELDS,
  PROJECT_CANONICAL_FIELDS,
  FieldType,
} from '@/lib/canonicalFields';

interface CustomField {
  id: string;
  label: string;
  type: FieldType;
  category: string;
  description?: string;
}

interface FieldPreferences {
  hiddenFields: string[];
  customLabels: Record<string, string>;
  customFields: CustomField[];
}

interface CanonicalFieldPreferencesProps {
  entityType: 'client' | 'project';
  preferences?: FieldPreferences;
  onSave: (preferences: FieldPreferences) => void;
}

export default function CanonicalFieldPreferences({
  entityType,
  preferences,
  onSave,
}: CanonicalFieldPreferencesProps) {
  const colors = useColors();
  const canonicalFields = entityType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;

  const [hiddenFields, setHiddenFields] = useState<string[]>(preferences?.hiddenFields || []);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(preferences?.customLabels || {});
  const [customFields, setCustomFields] = useState<CustomField[]>(preferences?.customFields || []);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newField, setNewField] = useState<Partial<CustomField>>({
    label: '',
    type: 'string',
    category: '',
    description: '',
  });

  // Group fields by category
  const groupedFields = useMemo(() => {
    const groups: Record<string, { path: string; config: typeof canonicalFields[string] }[]> = {};

    Object.entries(canonicalFields).forEach(([path, config]) => {
      const category = path.split('.')[0];
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({ path, config });
    });

    return groups;
  }, [canonicalFields]);

  const categoryLabels: Record<string, string> = {
    contact: 'Contact Information',
    company: 'Company Details',
    financial: 'Financial Information',
    experience: 'Experience & Track Record',
    overview: 'Project Overview',
    location: 'Location Details',
    financials: 'Project Financials',
    timeline: 'Timeline & Dates',
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleFieldVisibility = (fieldPath: string) => {
    setHiddenFields(prev =>
      prev.includes(fieldPath)
        ? prev.filter(f => f !== fieldPath)
        : [...prev, fieldPath]
    );
  };

  const startEditingLabel = (fieldPath: string, currentLabel: string) => {
    setEditingLabel(fieldPath);
    setEditingLabelValue(customLabels[fieldPath] || currentLabel);
  };

  const saveCustomLabel = (fieldPath: string) => {
    if (editingLabelValue.trim()) {
      setCustomLabels(prev => ({
        ...prev,
        [fieldPath]: editingLabelValue.trim(),
      }));
    } else {
      // Remove custom label if empty
      setCustomLabels(prev => {
        const next = { ...prev };
        delete next[fieldPath];
        return next;
      });
    }
    setEditingLabel(null);
  };

  const cancelEditingLabel = () => {
    setEditingLabel(null);
    setEditingLabelValue('');
  };

  const addCustomField = () => {
    if (!newField.label?.trim() || !newField.category?.trim()) {
      return;
    }

    const field: CustomField = {
      id: `custom_${Date.now()}`,
      label: newField.label.trim(),
      type: (newField.type as FieldType) || 'string',
      category: newField.category.trim().toLowerCase(),
      description: newField.description?.trim(),
    };

    setCustomFields(prev => [...prev, field]);
    setNewField({ label: '', type: 'string', category: '', description: '' });
    setShowAddCustom(false);
  };

  const removeCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
  };

  const handleSave = () => {
    onSave({
      hiddenFields,
      customLabels,
      customFields,
    });
  };

  const categories = Object.keys(groupedFields);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <Panel title="Field Configuration">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <p style={{ fontSize: 11, color: colors.text.muted }}>
            {Object.keys(canonicalFields).length} standard fields, {customFields.length} custom fields
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hiddenFields.length > 0 && (
              <StatusPill label={`${hiddenFields.length} hidden`} tone={colors.text.muted} />
            )}
            {Object.keys(customLabels).length > 0 && (
              <StatusPill label={`${Object.keys(customLabels).length} renamed`} tone={colors.accent.blue} />
            )}
          </div>
        </div>
      </Panel>

      {/* Field Categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map((category) => {
          const fields = groupedFields[category];
          const hiddenCount = fields.filter(f => hiddenFields.includes(f.path)).length;
          const isExpanded = expandedCategories.includes(category);

          return (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 14px',
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isExpanded ? (
                    <ChevronDown style={{ width: 16, height: 16, color: colors.text.muted }} />
                  ) : (
                    <ChevronRight style={{ width: 16, height: 16, color: colors.text.muted }} />
                  )}
                  <span style={{ fontWeight: 500, fontSize: 13, color: colors.text.primary }}>
                    {categoryLabels[category] || category}
                  </span>
                  <StatusPill label={String(fields.length)} tone={colors.text.muted} />
                </span>
                {hiddenCount > 0 && (
                  <StatusPill label={`${hiddenCount} hidden`} tone={colors.text.muted} />
                )}
              </button>
              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 24 }}>
                  {fields.map(({ path, config }) => {
                    const isHidden = hiddenFields.includes(path);
                    const hasCustomLabel = customLabels[path];
                    const displayLabel = customLabels[path] || config.label;

                    return (
                      <div
                        key={path}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 8,
                          borderRadius: 4,
                          background: colors.bg.card,
                          border: `1px solid ${colors.border.default}`,
                          opacity: isHidden ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => toggleFieldVisibility(path)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.accent.blue }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingLabel === path ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Input
                                  value={editingLabelValue}
                                  onChange={(e) => setEditingLabelValue(e.target.value)}
                                  placeholder={config.label}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveCustomLabel(path);
                                    if (e.key === 'Escape') cancelEditingLabel();
                                  }}
                                />
                                <IconButton label="Save" onClick={() => saveCustomLabel(path)}>
                                  <Check style={{ width: 12, height: 12 }} />
                                </IconButton>
                                <IconButton label="Cancel" onClick={cancelEditingLabel}>
                                  <X style={{ width: 12, height: 12 }} />
                                </IconButton>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, color: isHidden ? colors.text.dim : colors.text.primary }}>
                                  {displayLabel}
                                </span>
                                {hasCustomLabel && (
                                  <StatusPill label="custom" tone={colors.accent.purple} />
                                )}
                              </div>
                            )}
                            {config.description && !editingLabel && (
                              <p style={{ fontSize: 11, color: colors.text.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.description}</p>
                            )}
                          </div>
                        </div>
                        {editingLabel !== path && (
                          <IconButton label="Edit label" onClick={() => startEditingLabel(path, config.label)}>
                            <Edit2 style={{ width: 12, height: 12, color: colors.text.dim }} />
                          </IconButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Fields Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Custom Fields</h3>
          <Button size="sm" variant="secondary" onClick={() => setShowAddCustom(!showAddCustom)}>
            <Plus style={{ width: 14, height: 14 }} />
            Add Field
          </Button>
        </div>

        {showAddCustom && (
          <Panel accent={colors.accent.blue}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <Field label="Field Name *">
                <Input
                  value={newField.label || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Custom Metric"
                />
              </Field>
              <Field label="Category *">
                <Input
                  value={newField.category || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., custom or financial"
                />
              </Field>
              <Field label="Field Type">
                <Select
                  value={newField.type || 'string'}
                  onChange={(e) => setNewField(prev => ({ ...prev, type: e.target.value as FieldType }))}
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="date">Date</option>
                  <option value="percentage">Percentage</option>
                  <option value="boolean">Yes/No</option>
                </Select>
              </Field>
              <Field label="Description">
                <Input
                  value={newField.description || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button size="sm" variant="secondary" onClick={() => setShowAddCustom(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={addCustomField}
                disabled={!newField.label?.trim() || !newField.category?.trim()}
              >
                Add Field
              </Button>
            </div>
          </Panel>
        )}

        {customFields.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customFields.map((field) => (
              <div
                key={field.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 8,
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: colors.text.primary }}>{field.label}</span>
                    <StatusPill label={field.type} tone={colors.text.muted} />
                    <StatusPill label={field.category} tone={colors.accent.indigo} />
                  </div>
                  {field.description && (
                    <p style={{ fontSize: 11, color: colors.text.dim }}>{field.description}</p>
                  )}
                </div>
                <IconButton label="Remove field" onClick={() => removeCustomField(field.id)}>
                  <Trash2 style={{ width: 12, height: 12, color: colors.accent.red }} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No custom fields added yet" />
        )}
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
        <Button variant="primary" onClick={handleSave}>Save Field Preferences</Button>
      </div>
    </div>
  );
}
