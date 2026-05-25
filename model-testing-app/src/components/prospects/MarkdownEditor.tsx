"use client";
// v1.2 stub — full editor in v1.2.1
export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={20} style={{ width: "100%", fontFamily: "system-ui, sans-serif", boxSizing: "border-box" as const }} />;
}
