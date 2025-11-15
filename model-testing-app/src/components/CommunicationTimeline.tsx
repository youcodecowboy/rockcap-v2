'use client';

import { Communication } from '@/types';
import { Mail, Phone, FileText, Calendar, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface CommunicationTimelineProps {
  communications: Communication[];
  getDocumentName?: (documentId: string) => string;
}

const typeIcons = {
  email: Mail,
  meeting: Calendar,
  call: Phone,
  document: FileText,
  other: FileText,
};

const typeColors = {
  email: 'bg-blue-100 text-blue-600',
  meeting: 'bg-purple-100 text-purple-600',
  call: 'bg-green-100 text-green-600',
  document: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

export default function CommunicationTimeline({
  communications,
  getDocumentName,
}: CommunicationTimelineProps) {
  const router = useRouter();

  // Group communications by date
  const grouped = communications.reduce((acc, comm) => {
    const date = new Date(comm.date).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(comm);
    return acc;
  }, {} as Record<string, Communication[]>);

  // Sort dates descending
  const sortedDates = Object.keys(grouped).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {sortedDates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No communications found.
        </div>
      ) : (
        sortedDates.map((date) => (
          <div key={date}>
            <div className="sticky top-0 bg-gray-50 py-2 mb-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">{date}</h3>
            </div>
            <div className="space-y-3">
              {grouped[date].map((comm) => {
                const Icon = typeIcons[comm.type] || typeIcons.other;
                const colorClass = typeColors[comm.type] || typeColors.other;
                
                return (
                  <div
                    key={comm.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${colorClass} flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            {comm.subject && (
                              <h4 className="font-semibold text-gray-900 mb-1">
                                {comm.subject}
                              </h4>
                            )}
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span className="capitalize">{comm.type}</span>
                              <span>•</span>
                              <span>{formatTime(comm.date)}</span>
                            </div>
                          </div>
                        </div>

                        {comm.participants && comm.participants.length > 0 && (
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              {comm.participants.join(', ')}
                            </span>
                          </div>
                        )}

                        {comm.summary && (
                          <p className="text-sm text-gray-700 mb-2">{comm.summary}</p>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/docs/${comm.documentId}`)}
                          className="text-blue-600 hover:text-blue-700 h-auto py-1"
                        >
                          View Document
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

