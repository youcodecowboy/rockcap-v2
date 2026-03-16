'use client';

import { Id } from '../../../../../convex/_generated/dataModel';
import { ThreadPanel } from '@/components/threads';

interface ClientThreadsTabProps {
  clientId: Id<'clients'>;
}

export default function ClientThreadsTab({ clientId }: ClientThreadsTabProps) {
  return (
    <div className="h-full flex flex-col">
      <ThreadPanel
        clientId={clientId}
        showEntityBadge
        showCreateButton
      />
    </div>
  );
}
