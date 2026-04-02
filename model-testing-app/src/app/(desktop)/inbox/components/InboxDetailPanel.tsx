'use client';

import { Inbox, Bell } from 'lucide-react';
import FlagDetailPanel from './FlagDetailPanel';

interface InboxDetailPanelProps {
  selectedId: string | null;
  selectedKind: 'flag' | 'notification' | null;
}

function NotificationDetail({ id }: { id: string }) {
  // We don't have a dedicated getNotification query, so we show basic info
  // The notification data is passed from the list — for now show a simple view
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900">Notification</h2>
      </div>
      <p className="text-sm text-gray-500">
        Notification details will be shown here.
      </p>
      <p className="text-[10px] text-gray-300 mt-4 font-mono">{id}</p>
    </div>
  );
}

export default function InboxDetailPanel({ selectedId, selectedKind }: InboxDetailPanelProps) {
  if (!selectedId || !selectedKind) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">Select an item to view details</p>
        </div>
      </div>
    );
  }

  if (selectedKind === 'flag') {
    return <FlagDetailPanel flagId={selectedId} />;
  }

  return <NotificationDetail id={selectedId} />;
}
