'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Panel, SkeletonTable } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { DataFileBrowser, type DataItem } from '@/components/data/DataFileBrowser';

interface ClientDataTabProps {
  clientId: Id<"clients">;
  clientName: string;
}

// File-based Data tab for a client: extracted figures across all the client's
// projects, grouped by file, with a per-project separator in the sidebar.
// Replaces the old category-grouped view. Shared rendering lives in DataFileBrowser.
export default function ClientDataTab({ clientId }: ClientDataTabProps) {
  const colors = useColors();
  const dataLibrary = useQuery(api.projectDataLibrary.getClientDataLibrary, { clientId });

  if (dataLibrary === undefined) return <Panel><SkeletonTable /></Panel>;

  // getClientDataLibrary returns { items: [...] }, each item carrying projectName.
  const items = ((dataLibrary as any).items as any[] ?? []).filter((it) => !it.isComputed) as DataItem[];

  return (
    <Panel>
      <DataFileBrowser items={items} accent={colors.entityTypes.client} groupByProject={true} />
    </Panel>
  );
}
