'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Field Configuration</p>
            <p className="text-xs text-gray-500 mt-1">
              {Object.keys(canonicalFields).length} standard fields, {customFields.length} custom fields
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hiddenFields.length > 0 && (
              <Badge variant="outline" className="bg-gray-100 text-gray-700">
                {hiddenFields.length} hidden
              </Badge>
            )}
            {Object.keys(customLabels).length > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                {Object.keys(customLabels).length} renamed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Field Categories */}
      <div className="space-y-3">
        {categories.map((category) => {
          const fields = groupedFields[category];
          const hiddenCount = fields.filter(f => hiddenFields.includes(f.path)).length;
          const isExpanded = expandedCategories.includes(category);

          return (
            <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full p-3 bg-white rounded-lg border hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="font-medium text-sm text-gray-900">
                      {categoryLabels[category] || category}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {fields.length}
                    </Badge>
                  </div>
                  {hiddenCount > 0 && (
                    <Badge variant="outline" className="text-xs bg-gray-100">
                      {hiddenCount} hidden
                    </Badge>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2 pl-6">
                  {fields.map(({ path, config }) => {
                    const isHidden = hiddenFields.includes(path);
                    const hasCustomLabel = customLabels[path];
                    const displayLabel = customLabels[path] || config.label;

                    return (
                      <div
                        key={path}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          isHidden ? 'bg-gray-50 opacity-60' : 'bg-white border'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Switch
                            checked={!isHidden}
                            onCheckedChange={() => toggleFieldVisibility(path)}
                          />
                          <div className="flex-1 min-w-0">
                            {editingLabel === path ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingLabelValue}
                                  onChange={(e) => setEditingLabelValue(e.target.value)}
                                  className="h-7 text-sm"
                                  placeholder={config.label}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveCustomLabel(path);
                                    if (e.key === 'Escape') cancelEditingLabel();
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => saveCustomLabel(path)}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={cancelEditingLabel}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${isHidden ? 'text-gray-400' : 'text-gray-900'}`}>
                                  {displayLabel}
                                </span>
                                {hasCustomLabel && (
                                  <Badge variant="outline" className="text-[10px] px-1">
                                    custom
                                  </Badge>
                                )}
                              </div>
                            )}
                            {config.description && !editingLabel && (
                              <p className="text-xs text-gray-400 truncate">{config.description}</p>
                            )}
                          </div>
                        </div>
                        {editingLabel !== path && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                            onClick={() => startEditingLabel(path, config.label)}
                          >
                            <Edit2 className="w-3 h-3 text-gray-400" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Custom Fields Section */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Custom Fields</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddCustom(!showAddCustom)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Field
          </Button>
        </div>

        {showAddCustom && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Field Name *</Label>
                <Input
                  value={newField.label || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Custom Metric"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Input
                  value={newField.category || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., custom or financial"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Field Type</Label>
                <Select
                  value={newField.type || 'string'}
                  onValueChange={(value) => setNewField(prev => ({ ...prev, type: value as FieldType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="currency">Currency</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="boolean">Yes/No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  value={newField.description || ''}
                  onChange={(e) => setNewField(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddCustom(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={addCustomField}
                disabled={!newField.label?.trim() || !newField.category?.trim()}
              >
                Add Field
              </Button>
            </div>
          </div>
        )}

        {customFields.length > 0 ? (
          <div className="space-y-2">
            {customFields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-2 bg-white rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">{field.label}</span>
                      <Badge variant="outline" className="text-[10px]">{field.type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{field.category}</Badge>
                    </div>
                    {field.description && (
                      <p className="text-xs text-gray-400">{field.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => removeCustomField(field.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No custom fields added yet
          </p>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave}>Save Field Preferences</Button>
      </div>
    </div>
  );
}
