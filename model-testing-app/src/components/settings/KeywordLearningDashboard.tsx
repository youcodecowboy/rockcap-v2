'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sparkles,
  Undo2,
  X,
  TrendingUp,
  Calendar,
  FileType,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

export default function KeywordLearningDashboard() {
  const recentEvents = useQuery(api.keywordLearning.getRecentLearningEvents, { limit: 20 });
  const stats = useQuery(api.keywordLearning.getLearningStats);
  const undoLearnedKeyword = useMutation(api.keywordLearning.undoLearnedKeyword);
  const dismissEvent = useMutation(api.keywordLearning.dismissLearningEvent);
  const dismissAll = useMutation(api.keywordLearning.dismissAllLearningEvents);

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleUndo = async (eventId: string) => {
    setProcessingIds((prev) => new Set(prev).add(eventId));
    try {
      await undoLearnedKeyword({ learningEventId: eventId as any });
    } catch (error) {
      console.error('Failed to undo keyword:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleDismiss = async (eventId: string) => {
    setProcessingIds((prev) => new Set(prev).add(eventId));
    try {
      await dismissEvent({ learningEventId: eventId as any });
    } catch (error) {
      console.error('Failed to dismiss event:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleDismissAll = async () => {
    try {
      await dismissAll({});
    } catch (error) {
      console.error('Failed to dismiss all:', error);
    }
  };

  const isLoading = recentEvents === undefined || stats === undefined;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalKeywordsLearned ?? '-'}</p>
                <p className="text-xs text-gray-500">Total Learned</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.thisWeek ?? '-'}</p>
                <p className="text-xs text-gray-500">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.thisMonth ?? '-'}</p>
                <p className="text-xs text-gray-500">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileType className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.fileTypesWithLearning ?? '-'}</p>
                <p className="text-xs text-gray-500">File Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Learning Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Recent Auto-Learned Keywords
            </CardTitle>
            <CardDescription>
              Keywords automatically learned from user corrections. These are now used for
              deterministic document classification.
            </CardDescription>
          </div>
          {recentEvents && recentEvents.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDismissAll}>
              <X className="w-4 h-4 mr-1" />
              Dismiss All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : recentEvents && recentEvents.length > 0 ? (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event._id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{event.keyword}</span>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          {event.fileType}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Learned from {event.correctionCount} correction
                        {event.correctionCount !== 1 ? 's' : ''} &middot;{' '}
                        {new Date(event.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUndo(event._id)}
                      disabled={processingIds.has(event._id)}
                      title="Undo - Remove this keyword from the file type"
                    >
                      <Undo2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(event._id)}
                      disabled={processingIds.has(event._id)}
                      title="Dismiss - Hide this notification"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">No recent learning events</h3>
              <p className="text-sm text-gray-500">
                Keywords will appear here when the system learns from user corrections.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Keyword Learning Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>
              When you correct a document&apos;s file type (e.g., AI said &quot;IMR&quot; but you corrected
              to &quot;RedBook Valuation&quot;), the system records the document&apos;s keywords.
            </li>
            <li>
              After 3+ similar corrections, the system identifies common keywords across those
              documents.
            </li>
            <li>
              These keywords are automatically added to the correct file type definition to improve
              future classifications.
            </li>
            <li>
              You can undo any learned keyword if it was incorrectly associated, or dismiss the
              notification to keep the keyword.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
