'use client';

import { Mail } from 'lucide-react';

export default function InboxPage() {
  return (
    <div className="bg-gray-50 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Mail className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h1>
        <p className="text-gray-600 max-w-md">
          This inbox will be connected to Google Workspace for mail integration.
        </p>
      </div>
    </div>
  );
}

