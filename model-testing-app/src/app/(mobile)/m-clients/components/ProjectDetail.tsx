'use client';

interface ProjectDetailProps {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
}

export default function ProjectDetail({ clientId, clientName, projectId, projectName, onBack }: ProjectDetailProps) {
  void clientId;
  void clientName;
  void projectId;
  void projectName;
  void onBack;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Project detail coming soon
    </div>
  );
}
