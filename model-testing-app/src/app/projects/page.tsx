'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Projects page redirect
 * Projects are now accessed via the Clients Portal at /clients
 * This page redirects to maintain backwards compatibility with bookmarks/links
 */
export default function ProjectsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to clients portal
    router.replace('/clients');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to Clients Portal...</p>
        <p className="text-sm text-gray-500 mt-2">
          Projects are now accessible via client profiles
        </p>
      </div>
    </div>
  );
}
