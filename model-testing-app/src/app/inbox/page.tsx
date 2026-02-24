'use client';

import { Mail } from 'lucide-react';

export default function InboxPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Development Banner */}
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600">🚧</span>
            <p className="text-sm text-amber-800">
              <span className="font-medium">In Development</span> — This feature is not yet functional. Google Workspace integration will be deployed in a future release.
            </p>
          </div>
        </div>

        {/* Coming Soon Content */}
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Mail className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h1>
            <p className="text-gray-600 max-w-md">
              This inbox will be connected to Google Workspace for mail integration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

