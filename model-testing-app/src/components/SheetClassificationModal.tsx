'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, 
  Layers, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronRight,
  Settings2,
  Info,
  Plus,
  Trash2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Types for parsed sheet data
export interface ParsedSheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  hasFormulas: boolean;
  hasStyles: boolean;
  data: any[][];
  styles?: Record<string, any>;
  formulas?: Record<string, string>;
  columnWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  mergedCells?: any[];
}

// Classification types
export type SheetType = 'core' | 'dynamic';

export interface DynamicGroup {
  groupId: string;
  label: string;
  sheetNames: string[];
  min: number;
  max: number;
  defaultCount: number;
  namePlaceholder: string;
}

export interface SheetClassification {
  sheetName: string;
  type: SheetType;
  groupId?: string; // Only for dynamic sheets
}

interface SheetClassificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheets: ParsedSheetInfo[];
  templateName: string;
  onConfirm: (classifications: SheetClassification[], dynamicGroups: DynamicGroup[]) => void;
}

export default function SheetClassificationModal({
  isOpen,
  onClose,
  sheets,
  templateName,
  onConfirm,
}: SheetClassificationModalProps) {
  // Initial state: all sheets as core
  const [classifications, setClassifications] = useState<SheetClassification[]>(() => 
    sheets.map(sheet => ({
      sheetName: sheet.name,
      type: 'core' as SheetType,
      groupId: undefined,
    }))
  );

  // Dynamic groups state
  const [dynamicGroups, setDynamicGroups] = useState<DynamicGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPlaceholder, setNewGroupPlaceholder] = useState('{N}');
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['core']));

  // Computed values
  const coreSheets = useMemo(() => 
    classifications.filter(c => c.type === 'core'),
    [classifications]
  );

  const dynamicSheetsByGroup = useMemo(() => {
    const grouped: Record<string, SheetClassification[]> = {};
    classifications
      .filter(c => c.type === 'dynamic' && c.groupId)
      .forEach(c => {
        if (!grouped[c.groupId!]) {
          grouped[c.groupId!] = [];
        }
        grouped[c.groupId!].push(c);
      });
    return grouped;
  }, [classifications]);

  const unassignedDynamic = useMemo(() => 
    classifications.filter(c => c.type === 'dynamic' && !c.groupId),
    [classifications]
  );

  // Handlers
  const toggleExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const setSheetType = (sheetName: string, type: SheetType) => {
    setClassifications(prev => prev.map(c => 
      c.sheetName === sheetName 
        ? { ...c, type, groupId: type === 'core' ? undefined : c.groupId }
        : c
    ));
  };

  const setSheetGroup = (sheetName: string, groupId: string | undefined) => {
    setClassifications(prev => prev.map(c => 
      c.sheetName === sheetName ? { ...c, groupId } : c
    ));
  };

  const addDynamicGroup = () => {
    if (!newGroupName.trim()) return;
    
    const groupId = newGroupName.toLowerCase().replace(/\s+/g, '-');
    
    if (dynamicGroups.some(g => g.groupId === groupId)) {
      alert('A group with this name already exists');
      return;
    }

    setDynamicGroups(prev => [...prev, {
      groupId,
      label: newGroupName.trim(),
      sheetNames: [],
      min: 1,
      max: 10,
      defaultCount: 1,
      namePlaceholder: newGroupPlaceholder || '{N}',
    }]);

    setNewGroupName('');
    setNewGroupPlaceholder('{N}');
    setIsAddingGroup(false);
    setExpandedGroups(prev => new Set([...prev, groupId]));
  };

  const removeDynamicGroup = (groupId: string) => {
    // Move all sheets in this group back to core
    setClassifications(prev => prev.map(c => 
      c.groupId === groupId ? { ...c, type: 'core' as SheetType, groupId: undefined } : c
    ));
    setDynamicGroups(prev => prev.filter(g => g.groupId !== groupId));
  };

  const updateGroupSettings = (groupId: string, updates: Partial<DynamicGroup>) => {
    setDynamicGroups(prev => prev.map(g => 
      g.groupId === groupId ? { ...g, ...updates } : g
    ));
  };

  const handleConfirm = () => {
    // Build final dynamic groups with sheet names
    const finalGroups = dynamicGroups.map(group => ({
      ...group,
      sheetNames: classifications
        .filter(c => c.groupId === group.groupId)
        .map(c => c.sheetName),
    }));

    // Validate: warn if there are unassigned dynamic sheets
    if (unassignedDynamic.length > 0) {
      const proceed = confirm(
        `You have ${unassignedDynamic.length} dynamic sheet(s) not assigned to any group. ` +
        'They will be converted to core sheets. Continue?'
      );
      if (!proceed) return;
      
      // Convert unassigned dynamic to core
      setClassifications(prev => prev.map(c => 
        c.type === 'dynamic' && !c.groupId 
          ? { ...c, type: 'core' as SheetType }
          : c
      ));
    }

    onConfirm(classifications, finalGroups);
  };

  const getSheetInfo = (sheetName: string) => {
    return sheets.find(s => s.name === sheetName);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Configure Template Sheets
          </DialogTitle>
          <DialogDescription>
            Classify sheets in <strong>{templateName}</strong> as Core (always included) or 
            Dynamic (duplicated based on user selection, e.g., multiple sites).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Core Sheets Section */}
            <div className="border rounded-lg">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors rounded-t-lg cursor-pointer"
                onClick={() => toggleExpanded('core')}
                onKeyDown={(e) => e.key === 'Enter' && toggleExpanded('core')}
              >
                <div className="flex items-center gap-3">
                  {expandedGroups.has('core') ? (
                    <ChevronDown className="w-4 h-4 text-blue-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-blue-600" />
                  )}
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-900">Core Sheets</span>
                  <Badge variant="secondary" className="ml-2">
                    {coreSheets.length} sheets
                  </Badge>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                        <Info className="w-4 h-4 text-blue-400" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Core sheets are always included in generated models. Typical examples: Control Sheet, Variables, Summary.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              {expandedGroups.has('core') && (
                <div className="p-4 space-y-2">
                  {coreSheets.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">
                      No core sheets. Drag sheets here or change their type.
                    </p>
                  ) : (
                    coreSheets.map(c => {
                      const info = getSheetInfo(c.sheetName);
                      return (
                        <div 
                          key={c.sheetName}
                          className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <Table className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{c.sheetName}</span>
                            {info && (
                              <span className="text-xs text-gray-400">
                                {info.rowCount} rows × {info.colCount} cols
                                {info.hasFormulas && ' • has formulas'}
                              </span>
                            )}
                          </div>
                          <Select
                            value="core"
                            onValueChange={(v) => setSheetType(c.sheetName, v as SheetType)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="core">Core</SelectItem>
                              <SelectItem value="dynamic">Dynamic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Dynamic Groups Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Dynamic Groups
                </h3>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsAddingGroup(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Group
                </Button>
              </div>

              {/* Add Group Form */}
              {isAddingGroup && (
                <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new-group-name">Group Name</Label>
                      <Input
                        id="new-group-name"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="e.g., Site"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-group-placeholder">Placeholder Pattern</Label>
                      <Input
                        id="new-group-placeholder"
                        value={newGroupPlaceholder}
                        onChange={(e) => setNewGroupPlaceholder(e.target.value)}
                        placeholder="{N}"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Used in sheet names and formulas (e.g., AppraisalSite{'{N}'})
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setIsAddingGroup(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={addDynamicGroup}>
                      Create Group
                    </Button>
                  </div>
                </div>
              )}

              {/* Existing Dynamic Groups */}
              {dynamicGroups.map(group => (
                <div key={group.groupId} className="border rounded-lg">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors rounded-t-lg"
                    onClick={() => toggleExpanded(group.groupId)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedGroups.has(group.groupId) ? (
                        <ChevronDown className="w-4 h-4 text-amber-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-amber-600" />
                      )}
                      <Layers className="w-4 h-4 text-amber-600" />
                      <span className="font-medium text-amber-900">{group.label}</span>
                      <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800">
                        {dynamicSheetsByGroup[group.groupId]?.length || 0} sheets
                      </Badge>
                      <code className="text-xs bg-amber-100 px-1 rounded">
                        {group.namePlaceholder}
                      </code>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDynamicGroup(group.groupId);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </button>

                  {expandedGroups.has(group.groupId) && (
                    <div className="p-4 space-y-4">
                      {/* Group Settings */}
                      <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg">
                        <div>
                          <Label className="text-xs">Min Count</Label>
                          <Input
                            type="number"
                            min={1}
                            value={group.min}
                            onChange={(e) => updateGroupSettings(group.groupId, { min: parseInt(e.target.value) || 1 })}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Max Count</Label>
                          <Input
                            type="number"
                            min={1}
                            value={group.max}
                            onChange={(e) => updateGroupSettings(group.groupId, { max: parseInt(e.target.value) || 10 })}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Default Count</Label>
                          <Input
                            type="number"
                            min={group.min}
                            max={group.max}
                            value={group.defaultCount}
                            onChange={(e) => updateGroupSettings(group.groupId, { defaultCount: parseInt(e.target.value) || 1 })}
                            className="h-8"
                          />
                        </div>
                      </div>

                      {/* Sheets in this group */}
                      <div className="space-y-2">
                        {(dynamicSheetsByGroup[group.groupId] || []).length === 0 ? (
                          <p className="text-sm text-gray-500 py-4 text-center">
                            No sheets in this group. Change sheet type to Dynamic and select this group.
                          </p>
                        ) : (
                          (dynamicSheetsByGroup[group.groupId] || []).map(c => {
                            const info = getSheetInfo(c.sheetName);
                            return (
                              <div 
                                key={c.sheetName}
                                className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-3">
                                  <Table className="w-4 h-4 text-gray-400" />
                                  <span className="font-medium">{c.sheetName}</span>
                                  {info && (
                                    <span className="text-xs text-gray-400">
                                      {info.rowCount} rows × {info.colCount} cols
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Select
                                    value={c.groupId}
                                    onValueChange={(v) => setSheetGroup(c.sheetName, v || undefined)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue placeholder="Select group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {dynamicGroups.map(g => (
                                        <SelectItem key={g.groupId} value={g.groupId}>
                                          {g.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value="dynamic"
                                    onValueChange={(v) => setSheetType(c.sheetName, v as SheetType)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="core">Core</SelectItem>
                                      <SelectItem value="dynamic">Dynamic</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Unassigned Dynamic Sheets */}
              {unassignedDynamic.length > 0 && (
                <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                  <h4 className="text-sm font-medium text-orange-800 mb-2">
                    Unassigned Dynamic Sheets ({unassignedDynamic.length})
                  </h4>
                  <p className="text-xs text-orange-600 mb-3">
                    These sheets are marked as dynamic but not assigned to a group. 
                    Create a group or change them back to core.
                  </p>
                  <div className="space-y-2">
                    {unassignedDynamic.map(c => (
                      <div 
                        key={c.sheetName}
                        className="flex items-center justify-between p-3 bg-white border border-orange-200 rounded-lg"
                      >
                        <span className="font-medium">{c.sheetName}</span>
                        <div className="flex gap-2">
                          <Select
                            value={c.groupId || ''}
                            onValueChange={(v) => setSheetGroup(c.sheetName, v || undefined)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Select group" />
                            </SelectTrigger>
                            <SelectContent>
                              {dynamicGroups.map(g => (
                                <SelectItem key={g.groupId} value={g.groupId}>
                                  {g.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value="dynamic"
                            onValueChange={(v) => setSheetType(c.sheetName, v as SheetType)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="core">Core</SelectItem>
                              <SelectItem value="dynamic">Dynamic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dynamicGroups.length === 0 && !isAddingGroup && (
                <div className="text-center py-8 text-gray-500 border rounded-lg bg-gray-50">
                  <Layers className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No dynamic groups configured.</p>
                  <p className="text-xs">Create a group to enable multi-site templates.</p>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• <strong>{coreSheets.length}</strong> core sheets (always included)</p>
                {dynamicGroups.map(g => (
                  <p key={g.groupId}>
                    • <strong>{dynamicSheetsByGroup[g.groupId]?.length || 0}</strong> sheets in &quot;{g.label}&quot; group 
                    (multiplied {g.min}-{g.max}x)
                  </p>
                ))}
                {unassignedDynamic.length > 0 && (
                  <p className="text-orange-600">
                    • <strong>{unassignedDynamic.length}</strong> unassigned dynamic sheets (will become core)
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

