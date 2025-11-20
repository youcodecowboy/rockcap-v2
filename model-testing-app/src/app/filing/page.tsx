'use client';

import { useState } from 'react';
import Link from 'next/link';
import FileUpload from '@/components/FileUpload';
import ClientManager from '@/components/ClientManager';
import OutputWindow from '@/components/OutputWindow';
import { FileMetadata, AnalysisResult } from '@/types';

export default function FilingAgent() {
  const [analysisLog, setAnalysisLog] = useState<
    Array<{
      file: FileMetadata;
      result: AnalysisResult;
      timestamp: string;
    }>
  >([]);

  const handleFileAnalyzed = (file: FileMetadata, result: AnalysisResult) => {
    // Document is already saved in FileUpload component with file content
    // Just update the log here
    
    setAnalysisLog(prev => [
      ...prev,
      {
        file,
        result,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const handleFileError = (file: FileMetadata, error: string) => {
    console.error('File analysis error:', error);
    // Optionally add error entries to the log
  };

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">File Organization Agent</h1>
            <p className="mt-2 text-gray-600">
              Drag and drop files to automatically categorize and associate them with clients
            </p>
          </div>
          <Link
            href="/library"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Library
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: File Upload & Client Management */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <FileUpload
                onFileAnalyzed={handleFileAnalyzed}
                onError={handleFileError}
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <ClientManager />
            </div>
          </div>

          {/* Right Column: Output Window */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <OutputWindow analysisLog={analysisLog} />
          </div>
        </div>
      </div>
    </div>
  );
}

