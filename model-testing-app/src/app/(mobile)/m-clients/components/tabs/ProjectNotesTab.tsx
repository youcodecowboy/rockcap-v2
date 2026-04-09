'use client';

interface ProjectNotesTabProps {
  projectId: string;
}

export default function ProjectNotesTab({ projectId }: ProjectNotesTabProps) {
  void projectId;
  return (
    <div className="px-[var(--m-page-px)] py-4">
      <p className="text-[13px] text-[var(--m-text-secondary)]">Notes coming soon.</p>
    </div>
  );
}
