'use client';

import { useState } from 'react';
import Link from 'next/link';
import FileUpload from '@/components/FileUpload';
import BulkUpload from '@/components/BulkUpload';
import RecentlyAnalyzedFiles from '@/components/RecentlyAnalyzedFiles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, Files } from 'lucide-react';

export default function FilingAgent() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

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
              {activeTab === 'single' 
                ? 'Drag and drop files to automatically categorize and associate them with clients'
                : 'Upload up to 100 documents at once for a specific client'}
            </p>
          </div>
          <Link href="/docs">
            <Button className="bg-black text-white hover:bg-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              View Library
            </Button>
          </Link>
        </div>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'single' | 'bulk')} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Files
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Files className="w-4 h-4" />
              Bulk Upload
            </TabsTrigger>
          </TabsList>

          {/* Single File Upload Tab */}
          <TabsContent value="single">
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
          </TabsContent>

          {/* Bulk Upload Tab */}
          <TabsContent value="bulk">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Bulk Upload (spans 2 columns) */}
              <div className="lg:col-span-2">
                <BulkUpload />
              </div>

              {/* Right Column: Info & Recent Batches */}
              <div className="space-y-6">
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">About Bulk Upload</h3>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Upload up to 100 documents at once
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        All files are associated with a single client
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Quick summary analysis (no deep extraction)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Review and edit before filing
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Enable extraction manually per file
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">Document Naming</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Documents are automatically named using:
                    </p>
                    <code className="text-xs bg-muted p-2 rounded block">
                      PROJECT-TYPE-INT/EXT-INITIALS-VERSION-DATE
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Example: WIMBPARK28-APPRAISAL-EXT-JS-V1.0-2026-01-12
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

