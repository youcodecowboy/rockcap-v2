'use client';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILE_TYPE_DEFINITIONS } from '@/lib/fileTypeDefinitions';

interface EditableFileTypeBadgeProps {
  fileType: string;
  category?: string;
  onFileTypeChange: (fileType: string, category: string) => void;
  className?: string;
}

// Get unique file types from definitions
const fileTypeOptions = FILE_TYPE_DEFINITIONS.map(def => ({
  fileType: def.fileType,
  category: def.category,
}));

// Add "Other" option
fileTypeOptions.push({ fileType: 'Other', category: 'General' });

export default function EditableFileTypeBadge({ 
  fileType, 
  category,
  onFileTypeChange, 
  className = '' 
}: EditableFileTypeBadgeProps) {
  const currentFileType = fileType || 'Other';
  const currentCategory = category || 'General';
  
  // Find matching option or default to "Other"
  const currentOption = fileTypeOptions.find(opt => opt.fileType === currentFileType) || 
                        fileTypeOptions.find(opt => opt.fileType === 'Other')!;

  return (
    <Select
      value={currentFileType}
      onValueChange={(value) => {
        const selectedOption = fileTypeOptions.find(opt => opt.fileType === value) || 
                              fileTypeOptions.find(opt => opt.fileType === 'Other')!;
        onFileTypeChange(selectedOption.fileType, selectedOption.category);
      }}
    >
      <SelectTrigger
        className={cn(
          "h-auto py-1 px-2 border rounded-md cursor-pointer hover:opacity-80 transition-opacity shadow-none bg-white",
          "data-[state=open]:ring-2 data-[state=open]:ring-blue-500 data-[state=open]:ring-offset-1",
          "focus:ring-0 focus-visible:ring-0",
          "[&>svg]:hidden",
          className
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-700">{currentFileType}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {fileTypeOptions.map((option) => (
          <SelectItem key={option.fileType} value={option.fileType}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{option.fileType}</span>
              <span className="text-xs text-gray-500">{option.category}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

