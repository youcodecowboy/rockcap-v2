'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  FileStack, 
  ArrowLeft,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import StandardQueueView from './components/StandardQueueView';
import BulkBatchList from './components/BulkBatchList';

export default function DocumentQueuePage() {
  const [activeTab, setActiveTab] = useState<'standard' | 'bulk'>('standard');
  
  // Get current user
  const currentUser = useQuery(api.users.getCurrent);
  
  // Get queue counts for badges
  const standardQueue = useQuery(api.fileQueue.getReviewQueueWithNav);
  const pendingBatches = useQuery(
    api.bulkUpload.getPendingBatches,
    currentUser?._id ? { userId: currentUser._id } : "skip"
  );

  const standardCount = standardQueue?.total || 0;
  const bulkCount = pendingBatches?.length || 0;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/docs">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Library
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Document Queue</h1>
              <p className="text-sm text-gray-500">Review and file uploaded documents</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>{standardCount + bulkCount} items need attention</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as 'standard' | 'bulk')}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="bg-white border-b px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            <TabsTrigger 
              value="standard"
              className="relative h-12 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FileText className="w-4 h-4 mr-2" />
              Standard Upload
              {standardCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-100"
                >
                  {standardCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="bulk"
              className="relative h-12 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FileStack className="w-4 h-4 mr-2" />
              Bulk Upload
              {bulkCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100"
                >
                  {bulkCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="standard" className="flex-1 m-0 overflow-hidden">
          <StandardQueueView />
        </TabsContent>

        <TabsContent value="bulk" className="flex-1 m-0 overflow-hidden">
          {currentUser?._id ? (
            <BulkBatchList userId={currentUser._id} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Loading...
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
