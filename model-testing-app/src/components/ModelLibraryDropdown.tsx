'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Play, ChevronDown, FileSpreadsheet, Zap, Download, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Template can be either legacy or new optimized type
export type TemplateSelection = 
  | { type: 'legacy'; id: Id<'modelingTemplates'> }
  | { type: 'optimized'; id: Id<'templateDefinitions'> };

interface ModelLibraryDropdownProps {
  onModelSelect: (templateId: Id<'modelingTemplates'>, quickExportMode?: boolean) => void;
  onOptimizedModelSelect?: (templateId: Id<'templateDefinitions'>, quickExportMode?: boolean) => void;
  disabled?: boolean;
  quickExportMode?: boolean;
}

// Combined template type for display
interface CombinedTemplate {
  id: string;
  name: string;
  description?: string;
  modelType: string;
  version: string;
  placeholderCount?: number;
  isOptimized: boolean;
  originalId: Id<'modelingTemplates'> | Id<'templateDefinitions'>;
}

export default function ModelLibraryDropdown({
  onModelSelect,
  onOptimizedModelSelect,
  disabled = false,
  quickExportMode = false,
}: ModelLibraryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Query both legacy and optimized templates
  const legacyTemplates = useQuery(api.modelingTemplates.getActiveTemplates, {});
  const optimizedTemplates = useQuery(api.templateDefinitions.listActive, {});

  // Combine both types of templates into a unified list
  const combinedTemplates = useMemo((): CombinedTemplate[] => {
    const result: CombinedTemplate[] = [];
    
    // Add legacy templates
    if (legacyTemplates) {
      legacyTemplates.forEach(template => {
        result.push({
          id: `legacy-${template._id}`,
          name: template.name,
          description: template.description,
          modelType: template.modelType,
          version: template.version,
          placeholderCount: template.placeholderCodes?.length,
          isOptimized: false,
          originalId: template._id,
        });
      });
    }
    
    // Add optimized templates
    if (optimizedTemplates) {
      optimizedTemplates.forEach(template => {
        result.push({
          id: `optimized-${template._id}`,
          name: template.name,
          description: template.description,
          modelType: template.modelType,
          version: String(template.version),
          placeholderCount: undefined, // Optimized templates don't track placeholders the same way
          isOptimized: true,
          originalId: template._id,
        });
      });
    }
    
    // Sort by name
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [legacyTemplates, optimizedTemplates]);

  const handleTemplateSelect = (template: CombinedTemplate) => {
    if (template.isOptimized) {
      // Handle optimized template
      if (onOptimizedModelSelect) {
        onOptimizedModelSelect(template.originalId as Id<'templateDefinitions'>, quickExportMode);
      } else {
        // Fallback: alert user that optimized templates need different handling
        console.warn('Optimized template selected but no handler provided');
        alert('This is an optimized template. Quick Export for optimized templates is coming soon!');
      }
    } else {
      // Handle legacy template
      onModelSelect(template.originalId as Id<'modelingTemplates'>, quickExportMode);
    }
    setIsOpen(false);
  };

  const getModelTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'appraisal':
        return 'bg-blue-100 text-blue-800';
      case 'operating':
        return 'bg-green-100 text-green-800';
      case 'custom':
      case 'other':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isLoading = legacyTemplates === undefined || optimizedTemplates === undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          disabled={disabled} 
          className={`flex items-center gap-2 ${quickExportMode ? 'bg-amber-600 hover:bg-amber-500' : ''}`}
        >
          {quickExportMode ? (
            <>
              <Zap className="w-4 h-4" />
              Quick Export
              <Download className="w-4 h-4" />
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Model
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className={`p-3 border-b ${quickExportMode ? 'bg-amber-50' : ''}`}>
          <h4 className="font-semibold text-sm">
            {quickExportMode ? 'Quick Export to Excel' : 'Select Model Template'}
          </h4>
          {quickExportMode && (
            <p className="text-xs text-amber-700 mt-1">
              Populate template and download instantly (preserves macros)
            </p>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-gray-500 text-center">Loading templates...</div>
          ) : combinedTemplates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4">
              <FileSpreadsheet className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-500">No templates available</p>
              <p className="text-xs text-gray-400">Upload templates in Settings</p>
            </div>
          ) : (
            <div className="divide-y">
              {combinedTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition-colors flex flex-col items-start gap-1 ${
                    quickExportMode ? 'hover:bg-amber-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{template.name}</span>
                      {template.isOptimized && (
                        <Badge className="bg-purple-100 text-purple-800 text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {quickExportMode && (
                        <Badge className="bg-amber-100 text-amber-800">
                          <Zap className="w-3 h-3 mr-1" />
                          Quick
                        </Badge>
                      )}
                      <Badge className={getModelTypeBadgeColor(template.modelType)}>
                        {template.modelType}
                      </Badge>
                    </div>
                  </div>
                  {template.description && (
                    <span className="text-xs text-gray-500">{template.description}</span>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">v{template.version}</span>
                    {template.placeholderCount !== undefined && template.placeholderCount > 0 && (
                      <span className="text-xs text-gray-400">
                        • {template.placeholderCount} placeholders
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
