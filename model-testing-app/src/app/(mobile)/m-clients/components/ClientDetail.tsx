'use client';

interface ClientDetailProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientDetail({ clientId, clientName, onBack, onSelectProject }: ClientDetailProps) {
  void clientId;
  void clientName;
  void onBack;
  void onSelectProject;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Client detail coming soon
    </div>
  );
}
