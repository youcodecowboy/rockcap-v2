'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
import { Panel, SkeletonTable } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { DataFileBrowser, type DataItem } from '@/components/data/DataFileBrowser';

interface ProjectDataTabProps {
  projectId: Id<"projects">;
  projectName: string;
}

// File-based Data tab: the project's extracted figures grouped by the document
// they came from. Replaces the old category-grouped view. Shared rendering lives
// in DataFileBrowser; this wrapper just supplies the project's data library.
export default function ProjectDataTab({ projectId }: ProjectDataTabProps) {
  const colors = useColors();
  const dataLibrary = useQuery(api.projectDataLibrary.getProjectLibrary, { projectId });

  if (dataLibrary === undefined) return <Panel><SkeletonTable /></Panel>;

  // Drop auto-computed category totals — they aren't sourced from a file.
  const items = (dataLibrary as any[]).filter((it) => !it.isComputed) as DataItem[];

  return (
    <Panel>
      <DataFileBrowser items={items} accent={colors.entityTypes.project} groupByProject={false} />
    </Panel>
  );
}
