'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Client profile error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center max-w-md">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Client not found</h2>
        <p className="text-gray-500 mb-6">
          This client ID is invalid or no longer exists.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Try again
          </button>
          <Link href="/clients" className="text-sm text-blue-600 hover:text-blue-700 underline">
            Back to Clients
          </Link>
        </div>
      </div>
    </div>
  );
}
