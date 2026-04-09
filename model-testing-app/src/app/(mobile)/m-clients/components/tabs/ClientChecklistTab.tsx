'use client';

interface ClientChecklistTabProps {
  clientId: string;
}

export default function ClientChecklistTab({ clientId }: ClientChecklistTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Checklist tab coming soon
    </div>
  );
}
