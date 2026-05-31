'use client';

import { Inbox, Bell } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { EmptyState } from '@/components/layouts';
import FlagDetailPanel from './FlagDetailPanel';

interface InboxDetailPanelProps {
  selectedId: string | null;
  selectedKind: 'flag' | 'notification' | null;
}

function NotificationDetail({ id }: { id: string }) {
  const colors = useColors();
  // We don't have a dedicated getNotification query, so we show basic info
  // The notification data is passed from the list — for now show a simple view
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={20} style={{ color: colors.text.dim }} />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}>Notification</h2>
      </div>
      <p style={{ fontSize: 13, color: colors.text.muted }}>
        Notification details will be shown here.
      </p>
      <p
        className="mt-4"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          color: colors.text.dim,
        }}
      >
        {id}
      </p>
    </div>
  );
}

export default function InboxDetailPanel({ selectedId, selectedKind }: InboxDetailPanelProps) {
  if (!selectedId || !selectedKind) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyState icon={<Inbox size={32} />} title="Select an item to view details" />
      </div>
    );
  }

  if (selectedKind === 'flag') {
    return <FlagDetailPanel flagId={selectedId} />;
  }

  return <NotificationDetail id={selectedId} />;
}
