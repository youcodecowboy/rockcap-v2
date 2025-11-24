'use client';

import Link from 'next/link';
import FileUpload from '@/components/FileUpload';
import RecentlyAnalyzedFiles from '@/components/RecentlyAnalyzedFiles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

export default function FilingAgent() {
  const handleFileError = (fileName: string, error: string) => {
    console.error('File analysis error:', fileName, error);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">File Organization Agent</h1>
            <p className="mt-2 text-lg text-gray-600">
              Drag and drop files to automatically categorize and associate them with clients
            </p>
          </div>
          <Link href="/docs">
            <Button className="bg-black text-white hover:bg-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              View Library
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: File Upload */}
          <div>
            {/* File Upload Card */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Upload Files
                  </span>
                </div>
              </div>
              <CardContent className="pt-6 pb-6 px-6">
                <FileUpload
                  onError={handleFileError}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Recently Analyzed Files */}
          <div>
            <RecentlyAnalyzedFiles />
          </div>
        </div>
      </div>
    </div>
  );
}

