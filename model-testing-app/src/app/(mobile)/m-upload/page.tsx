'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUpload } from '@/contexts/UploadContext';
import { Id } from '../../../../convex/_generated/dataModel';
import FilePicker from './components/FilePicker';
import ProcessingScreen from './components/ProcessingScreen';
import ReviewFlow from './components/ReviewFlow';
import CompletionSummary from './components/CompletionSummary';

export default function MobileUploadPage() {
  const searchParams = useSearchParams();
  const { phase, setFilingContext } = useUpload();

  // Read URL params once on mount to set filing context
  useEffect(() => {
    const clientId = searchParams.get('clientId');
    const clientName = searchParams.get('clientName');
    const projectId = searchParams.get('projectId');
    const projectName = searchParams.get('projectName');
    const folderTypeKey = searchParams.get('folderTypeKey');
    const folderLevel = searchParams.get('folderLevel') as 'client' | 'project' | null;
    const folderName = searchParams.get('folderName');

    if (clientId || projectId || folderTypeKey) {
      setFilingContext({
        clientId: clientId ? (clientId as Id<'clients'>) : undefined,
        clientName: clientName ?? undefined,
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        projectName: projectName ?? undefined,
        folderTypeKey: folderTypeKey ?? undefined,
        folderLevel: folderLevel ?? undefined,
        folderName: folderName ?? undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  switch (phase.name) {
    case 'pick':
      return <FilePicker />;
    case 'processing':
      return <ProcessingScreen />;
    case 'review':
    case 'saving':
      return <ReviewFlow />;
    case 'done':
      return <CompletionSummary />;
    default:
      return <FilePicker />;
  }
}
