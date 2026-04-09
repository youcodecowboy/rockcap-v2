'use client';

interface ClientProjectsTabProps {
  clientId: string;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientProjectsTab({ clientId, onSelectProject }: ClientProjectsTabProps) {
  void clientId;
  void onSelectProject;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Projects tab coming soon
    </div>
  );
}
