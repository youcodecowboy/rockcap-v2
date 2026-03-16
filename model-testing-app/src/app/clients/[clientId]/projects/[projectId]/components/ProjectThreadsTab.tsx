'use client';

import { Id } from '../../../../../../../convex/_generated/dataModel';
import { ThreadPanel } from '@/components/threads';

interface ProjectThreadsTabProps {
  projectId: Id<'projects'>;
  clientId: Id<'clients'>;
}

export default function ProjectThreadsTab({ projectId, clientId }: ProjectThreadsTabProps) {
  return (
    <div className="h-full flex flex-col">
      <ThreadPanel
        projectId={projectId}
        showEntityBadge
        showCreateButton
      />
    </div>
  );
}
