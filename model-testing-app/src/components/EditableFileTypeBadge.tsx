'use client';

import { ChevronDown } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { FILE_TYPE_DEFINITIONS } from '@/lib/fileTypeDefinitions';

interface EditableFileTypeBadgeProps {
  fileType: string;
  category?: string;
  onFileTypeChange: (fileType: string, category: string) => void;
  className?: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// Get unique file types from definitions
const fileTypeOptions = FILE_TYPE_DEFINITIONS.map((def) => ({
  fileType: def.fileType,
  category: def.category,
}));

// Add "Other" option
fileTypeOptions.push({ fileType: 'Other', category: 'General' });

export default function EditableFileTypeBadge({
  fileType,
  onFileTypeChange,
  className = '',
}: EditableFileTypeBadgeProps) {
  const colors = useColors();
  const currentFileType = fileType || 'Other';
  const tone = colors.text.secondary;

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={currentFileType}
        onChange={(e) => {
          const value = e.target.value;
          const selectedOption =
            fileTypeOptions.find((opt) => opt.fileType === value) ||
            fileTypeOptions.find((opt) => opt.fileType === 'Other')!;
          onFileTypeChange(selectedOption.fileType, selectedOption.category);
        }}
        style={{
          appearance: 'none',
          cursor: 'pointer',
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 1.3,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '3px 20px 3px 6px',
          borderRadius: 2,
          background: colors.bg.card,
          color: tone,
          border: `1px solid ${colors.border.default}`,
          outline: 'none',
        }}
      >
        {fileTypeOptions.map((option) => (
          <option
            key={option.fileType}
            value={option.fileType}
            style={{ color: colors.text.primary, background: colors.bg.card }}
          >
            {option.fileType} — {option.category}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        style={{ position: 'absolute', right: 5, color: colors.text.muted, pointerEvents: 'none', opacity: 0.7 }}
      />
    </div>
  );
}
