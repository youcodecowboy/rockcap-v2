'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, AlertCircle, Loader2, X, Clock, CheckSquare } from 'lucide-react';

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const recentJobs = useQuery(api.fileQueue.getRecentJobs, { includeRead: false });
  const unreadCount = useQuery(api.fileQueue.getUnreadCount);
  const markAsRead = useMutation(api.fileQueue.markAsRead);
  const markAllAsRead = useMutation(api.fileQueue.markAllAsRead);
  
  // Unified notifications
  const notifications = useQuery(api.notifications.getRecent, { limit: 20, includeRead: false });
  const notificationUnreadCount = useQuery(api.notifications.getUnreadCount, {});
  const markNotificationAsRead = useMutation(api.notifications.markAsRead);
  const markAllNotificationsAsRead = useMutation(api.notifications.markAllAsRead);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleJobClick = async (jobId: Id<"fileUploadQueue">, status: string) => {
    // Mark as read
    await markAsRead({ jobId });
    
    // Navigate to summary page if completed or needs confirmation
    if (status === 'completed' || status === 'needs_confirmation') {
      router.push(`/uploads/${jobId}`);
      setIsOpen(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'needs_confirmation':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
      case 'analyzing':
      case 'pending':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string, progress?: number) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'needs_confirmation':
        return 'Needs Review';
      case 'error':
        return 'Error';
      case 'uploading':
        return `Uploading ${progress !== undefined ? `${progress}%` : ''}`;
      case 'analyzing':
        return `Analyzing ${progress !== undefined ? `${progress}%` : ''}`;
      case 'pending':
        return 'Queued';
      default:
        return status;
    }
  };

  // Group jobs by status
  const groupedJobs = {
    processing: recentJobs?.filter(j => j.status === 'pending' || j.status === 'uploading' || j.status === 'analyzing') || [],
    completed: recentJobs?.filter(j => j.status === 'completed') || [],
    needsConfirmation: recentJobs?.filter(j => j.status === 'needs_confirmation') || [],
    errors: recentJobs?.filter(j => j.status === 'error') || [],
  };

  const hasNotifications = (unreadCount || 0) > 0 || (notificationUnreadCount || 0) > 0;
  const totalJobs = recentJobs?.length || 0;
  const totalNotifications = notifications?.length || 0;

  const handleNotificationClick = async (notificationId: Id<"notifications">, relatedId?: string, type?: string) => {
    await markNotificationAsRead({ id: notificationId });
    
    // Navigate based on notification type
    if (type === 'reminder' && relatedId) {
      router.push(`/reminders`);
    } else if (type === 'task' && relatedId) {
      router.push(`/tasks`);
    }
    setIsOpen(false);
  };

  const handleMarkAllNotificationsAsRead = async () => {
    await markAllNotificationsAsRead({});
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {hasNotifications && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
            {((unreadCount || 0) + (notificationUnreadCount || 0)) > 9 
              ? '9+' 
              : (unreadCount || 0) + (notificationUnreadCount || 0)}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {hasNotifications && (
              <div className="flex gap-2">
                {(notificationUnreadCount || 0) > 0 && (
                  <button
                    onClick={handleMarkAllNotificationsAsRead}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Mark all as read
                  </button>
                )}
                {(unreadCount || 0) > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Mark uploads as read
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1">
            {/* Reminder and Task Notifications */}
            {notifications && notifications.length > 0 && (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => {
                  const getNotificationIcon = () => {
                    switch (notification.type) {
                      case 'reminder':
                        return <Clock className="w-4 h-4 text-blue-600" />;
                      case 'task':
                        return <CheckSquare className="w-4 h-4 text-purple-600" />;
                      default:
                        return <Bell className="w-4 h-4 text-gray-600" />;
                    }
                  };

                  return (
                    <button
                      key={notification._id}
                      onClick={() => handleNotificationClick(notification._id, notification.relatedId, notification.type)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {getNotificationIcon()}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* File Uploads Section */}
            {totalJobs > 0 && (
              <div className="border-t border-gray-200">
                <div className="px-4 py-2 bg-gray-50">
                  <p className="text-xs font-medium text-gray-700">File Uploads</p>
                </div>
                <div className="divide-y divide-gray-100">
                {/* Processing */}
                {groupedJobs.processing.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <p className="text-xs font-medium text-gray-700">Processing</p>
                    </div>
                    {groupedJobs.processing.map((job) => (
                      <button
                        key={job._id}
                        onClick={() => handleJobClick(job._id, job.status)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {getStatusIcon(job.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{job.fileName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {getStatusText(job.status, job.progress)} • {formatFileSize(job.fileSize)}
                            </p>
                            {job.progress !== undefined && job.progress > 0 && job.progress < 100 && (
                              <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Needs Confirmation */}
                {groupedJobs.needsConfirmation.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-yellow-50 border-b border-gray-200">
                      <p className="text-xs font-medium text-yellow-900">Needs Review</p>
                    </div>
                    {groupedJobs.needsConfirmation.map((job) => (
                      <button
                        key={job._id}
                        onClick={() => handleJobClick(job._id, job.status)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {getStatusIcon(job.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{job.fileName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Click to review • {formatFileSize(job.fileSize)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimeAgo(job.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Completed */}
                {groupedJobs.completed.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-green-50 border-b border-gray-200">
                      <p className="text-xs font-medium text-green-900">Completed</p>
                    </div>
                    {groupedJobs.completed.map((job) => (
                      <button
                        key={job._id}
                        onClick={() => handleJobClick(job._id, job.status)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {getStatusIcon(job.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{job.fileName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Click to view details • {formatFileSize(job.fileSize)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimeAgo(job.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Errors */}
                {groupedJobs.errors.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-red-50 border-b border-gray-200">
                      <p className="text-xs font-medium text-red-900">Errors</p>
                    </div>
                    {groupedJobs.errors.map((job) => (
                      <button
                        key={job._id}
                        onClick={() => handleJobClick(job._id, job.status)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {getStatusIcon(job.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{job.fileName}</p>
                            <p className="text-xs text-red-600 mt-0.5">
                              {job.error || 'Processing failed'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimeAgo(job.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {totalJobs === 0 && totalNotifications === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No notifications
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

