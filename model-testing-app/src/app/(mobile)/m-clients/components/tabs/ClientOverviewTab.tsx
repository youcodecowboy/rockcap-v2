'use client';

interface ClientOverviewTabProps {
  clientId: string;
  onSwitchTab: (tab: string) => void;
}

export default function ClientOverviewTab({ clientId, onSwitchTab }: ClientOverviewTabProps) {
  void clientId;
  void onSwitchTab;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Overview tab coming soon
    </div>
  );
}
