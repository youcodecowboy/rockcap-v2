'use client';

interface ClientDocsTabProps {
  clientId: string;
  clientName: string;
}

export default function ClientDocsTab({ clientId, clientName }: ClientDocsTabProps) {
  void clientId;
  void clientName;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Docs tab coming soon
    </div>
  );
}
