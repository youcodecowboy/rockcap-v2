'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  MessageSquare,
  Calendar,
} from 'lucide-react';

interface Communication {
  id: string;
  type: 'document';
  date: string;
  participants: string[];
  documentId: string;
  summary: string;
}

interface ClientCommunicationsTabProps {
  clientId: Id<"clients">;
  communications: Communication[];
  documents: any[];
}

export default function ClientCommunicationsTab({
  clientId,
  communications,
  documents,
}: ClientCommunicationsTabProps) {
  const router = useRouter();

  // Group communications by date
  const groupedCommunications = useMemo(() => {
    const sorted = [...communications].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const groups: Record<string, Communication[]> = {};
    sorted.forEach((comm) => {
      const dateKey = new Date(comm.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(comm);
    });

    return groups;
  }, [communications]);

  const getDocumentName = (documentId: string): string => {
    const doc = documents.find((d: any) => d._id === documentId);
    return doc?.fileName || 'Unknown Document';
  };

  const getDocumentType = (documentId: string): string => {
    const doc = documents.find((d: any) => d._id === documentId);
    return doc?.fileTypeDetected || doc?.category || 'Document';
  };

  if (communications.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Communications</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Communications will appear here as documents are uploaded and interactions are recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Communication Timeline</h3>
        <p className="text-sm text-gray-500">{communications.length} interactions</p>
      </div>

      <div className="divide-y divide-gray-100">
        {Object.entries(groupedCommunications).map(([date, comms]) => (
          <div key={date} className="py-4">
            {/* Date Header */}
            <div className="px-6 mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <Calendar className="w-4 h-4" />
                {date}
              </div>
            </div>

            {/* Communications for this date */}
            <div className="space-y-2">
              {comms.map((comm) => (
                <div
                  key={comm.id}
                  className="px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/docs/${comm.documentId}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {getDocumentName(comm.documentId)}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {getDocumentType(comm.documentId)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {comm.summary}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(comm.date).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
