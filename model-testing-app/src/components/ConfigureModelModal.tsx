'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Layers, 
  FileSpreadsheet, 
  Settings2,
  Play,
  ChevronRight,
} from 'lucide-react';

// Types for dynamic groups
export interface DynamicGroupConfig {
  groupId: string;
  label: string;
  sheetIds: string[];
  sheetNames: string[];
  min: number;
  max: number;
  defaultCount: number;
  namePlaceholder: string;
}

export interface TemplateConfig {
  templateId: string;
  templateName: string;
  modelType: string;
  coreSheetNames: string[];
  dynamicGroups: DynamicGroupConfig[];
}

interface ConfigureModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateConfig: TemplateConfig;
  onConfirm: (groupCounts: Record<string, number>) => void;
}

export default function ConfigureModelModal({
  isOpen,
  onClose,
  templateConfig,
  onConfirm,
}: ConfigureModelModalProps) {
  // State for group counts
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    templateConfig.dynamicGroups.forEach(group => {
      initial[group.groupId] = group.defaultCount;
    });
    return initial;
  });

  // Calculate preview of sheets that will be generated
  const sheetPreview = useMemo(() => {
    const sheets: { name: string; type: 'core' | 'dynamic'; groupLabel?: string }[] = [];
    
    // Add core sheets
    templateConfig.coreSheetNames.forEach(name => {
      sheets.push({ name, type: 'core' });
    });
    
    // Add dynamic sheets based on counts
    templateConfig.dynamicGroups.forEach(group => {
      const count = groupCounts[group.groupId] || group.defaultCount;
      for (let n = 1; n <= count; n++) {
        group.sheetNames.forEach(templateName => {
          const name = templateName.replace(
            new RegExp(escapeRegExp(group.namePlaceholder), 'g'),
            n.toString()
          );
          sheets.push({ name, type: 'dynamic', groupLabel: group.label });
        });
      }
    });
    
    return sheets;
  }, [templateConfig, groupCounts]);

  // Calculate total sheet count
  const totalSheets = sheetPreview.length;
  const coreCount = templateConfig.coreSheetNames.length;
  const dynamicCount = totalSheets - coreCount;

  const handleConfirm = () => {
    onConfirm(groupCounts);
  };

  // Generate options for a count selector
  const generateCountOptions = (min: number, max: number): number[] => {
    const options: number[] = [];
    for (let i = min; i <= max; i++) {
      options.push(i);
    }
    return options;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Configure Model
          </DialogTitle>
          <DialogDescription>
            Set up your model from template: <strong>{templateConfig.templateName}</strong>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Dynamic Group Configuration */}
            {templateConfig.dynamicGroups.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <h3 className="font-medium">Dynamic Groups</h3>
                </div>
                
                <p className="text-sm text-gray-500">
                  Choose how many copies of each dynamic group to generate:
                </p>

                {templateConfig.dynamicGroups.map(group => (
                  <div 
                    key={group.groupId}
                    className="p-4 border rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium">{group.label}</Label>
                        <p className="text-sm text-gray-500 mt-1">
                          {group.sheetNames.length} sheet template(s) with placeholder{' '}
                          <code className="bg-gray-200 px-1 rounded">{group.namePlaceholder}</code>
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.sheetNames.map(name => (
                            <Badge 
                              key={name} 
                              variant="secondary" 
                              className="text-xs"
                            >
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Label className="text-sm text-gray-500">Count:</Label>
                        <Select
                          value={String(groupCounts[group.groupId] || group.defaultCount)}
                          onValueChange={(v) => setGroupCounts(prev => ({
                            ...prev,
                            [group.groupId]: parseInt(v, 10),
                          }))}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {generateCountOptions(group.min, group.max).map(n => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  This template has no dynamic groups configured.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  All {coreCount} sheets will be included as-is.
                </p>
              </div>
            )}

            <Separator />

            {/* Sheet Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Sheet Preview
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{coreCount} core</Badge>
                  {dynamicCount > 0 && (
                    <Badge variant="secondary">{dynamicCount} dynamic</Badge>
                  )}
                  <Badge>{totalSheets} total</Badge>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-60 overflow-y-auto">
                  {sheetPreview.map((sheet, index) => (
                    <div
                      key={`${sheet.name}-${index}`}
                      className={`flex items-center justify-between px-3 py-2 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                        <span className="text-sm">{sheet.name}</span>
                      </div>
                      {sheet.type === 'dynamic' && sheet.groupLabel && (
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                        >
                          {sheet.groupLabel}
                        </Badge>
                      )}
                      {sheet.type === 'core' && (
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                        >
                          Core
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="gap-2">
            <Play className="w-4 h-4" />
            Generate Model ({totalSheets} sheets)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

