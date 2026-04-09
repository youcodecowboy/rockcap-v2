'use client';

interface ClientMeetingsTabProps {
  clientId: string;
}

export default function ClientMeetingsTab({ clientId }: ClientMeetingsTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Meetings tab coming soon
    </div>
  );
}
