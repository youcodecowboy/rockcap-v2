'use client';

interface ClientThreadsTabProps {
  clientId: string;
}

export default function ClientThreadsTab({ clientId }: ClientThreadsTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Threads tab coming soon
    </div>
  );
}
