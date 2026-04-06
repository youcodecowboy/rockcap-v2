function getTypeInfo(fileType: string): { label: string; bg: string; text: string } {
  const t = fileType.toLowerCase();
  if (t.includes('pdf')) return { label: 'PDF', bg: 'bg-[#fef2f2]', text: 'text-[#991b1b]' };
  if (t.includes('word') || t.includes('doc')) return { label: 'DOC', bg: 'bg-[#eff6ff]', text: 'text-[#1e40af]' };
  if (t.includes('sheet') || t.includes('xls') || t.includes('csv')) return { label: 'XLS', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' };
  if (t.includes('image') || t.includes('jpg') || t.includes('jpeg') || t.includes('png') || t.includes('gif')) return { label: 'IMG', bg: 'bg-[#faf5ff]', text: 'text-[#6b21a8]' };
  return { label: 'FILE', bg: 'bg-[var(--m-bg-subtle)]', text: 'text-[var(--m-text-secondary)]' };
}

interface FileTypeBadgeProps {
  fileType: string;
}

export default function FileTypeBadge({ fileType }: FileTypeBadgeProps) {
  const { label, bg, text } = getTypeInfo(fileType);
  return (
    <div className={`w-8 h-8 rounded-md ${bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`text-[9px] font-bold ${text}`}>{label}</span>
    </div>
  );
}
