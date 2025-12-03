'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Play, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ModelLibraryDropdownProps {
  onModelSelect: (templateId: Id<'modelingTemplates'>) => void;
  disabled?: boolean;
}

export default function ModelLibraryDropdown({
  onModelSelect,
  disabled = false,
}: ModelLibraryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const templates = useQuery(api.modelingTemplates.getActiveTemplates, {});

  const handleModelSelect = (templateId: Id<'modelingTemplates'>) => {
    onModelSelect(templateId);
    setIsOpen(false);
  };

  const getModelTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'appraisal':
        return 'bg-blue-100 text-blue-800';
      case 'operating':
        return 'bg-green-100 text-green-800';
      case 'custom':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button disabled={disabled} className="flex items-center gap-2">
          <Play className="w-4 h-4" />
          Run Model
          <ChevronDown className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">Select Model Template</h4>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {templates === undefined ? (
            <div className="p-4 text-sm text-gray-500 text-center">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4">
              <FileSpreadsheet className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-500">No templates available</p>
              <p className="text-xs text-gray-400">Upload templates in Settings</p>
            </div>
          ) : (
            <div className="divide-y">
              {templates.map((template) => (
                <button
                  key={template._id}
                  onClick={() => handleModelSelect(template._id)}
                  className="w-full text-left p-3 hover:bg-gray-50 transition-colors flex flex-col items-start gap-1"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-sm">{template.name}</span>
                    <Badge className={getModelTypeBadgeColor(template.modelType)}>
                      {template.modelType}
                    </Badge>
                  </div>
                  {template.description && (
                    <span className="text-xs text-gray-500">{template.description}</span>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">v{template.version}</span>
                    {template.placeholderCodes && template.placeholderCodes.length > 0 && (
                      <span className="text-xs text-gray-400">
                        • {template.placeholderCodes.length} placeholders
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

