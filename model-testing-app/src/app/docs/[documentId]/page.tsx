'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Legacy document viewer route — redirects to the new reader view.
 * All document viewing now happens at /docs/reader/[documentId].
 */
export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;

  useEffect(() => {
    router.replace(`/docs/reader/${documentId}`);
  }, [router, documentId]);

  return null;
}
