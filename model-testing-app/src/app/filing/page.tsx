'use client';

import Link from 'next/link';
import BulkUpload from '@/components/BulkUpload';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle2, Sparkles, FolderOpen, ClipboardList } from 'lucide-react';

export default function FilingAgent() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Filing</h1>
            <p className="mt-1 text-gray-600">
              Upload documents to organize, classify, and link to your knowledge checklist
            </p>
          </div>
          <Link href="/docs">
            <Button className="bg-black text-white hover:bg-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              View Library
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Bulk Upload (spans 2 columns) */}
          <div className="lg:col-span-2">
            <BulkUpload />
          </div>

          {/* Right Column: Info Cards */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  AI-Powered Filing
                </h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Automatic document classification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Smart folder suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Checklist matching & linking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Duplicate detection & versioning</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-500" />
                  Checklist Integration
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Documents are matched to your client's knowledge checklist. Look for the 
                  <Sparkles className="w-3 h-3 text-amber-500 inline mx-1" />
                  icon to see AI suggestions.
                </p>
                <p className="text-xs text-muted-foreground">
                  Linked documents automatically mark checklist items as fulfilled.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-purple-500" />
                  Document Naming
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Documents are automatically named:
                </p>
                <code className="text-[10px] bg-muted p-2 rounded block font-mono">
                  PROJECT-TYPE-INT/EXT-INITIALS-VER-DATE
                </code>
                <p className="text-[10px] text-muted-foreground mt-2">
                  e.g. WIMBPARK-APPRAISAL-EXT-JS-V1.0-2026-01-12
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
