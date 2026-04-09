'use client';

interface ClientNotesTabProps {
  clientId: string;
}

export default function ClientNotesTab({ clientId }: ClientNotesTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Notes tab coming soon
    </div>
  );
}
