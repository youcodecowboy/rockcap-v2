'use client';

interface ClientTasksTabProps {
  clientId: string;
}

export default function ClientTasksTab({ clientId }: ClientTasksTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Tasks tab coming soon
    </div>
  );
}
