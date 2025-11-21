'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  CheckSquare, 
  Bell, 
  Mail,
  Calendar, 
  FileText, 
  UserPlus, 
  Plus, 
  Upload,
  Clock,
  Inbox,
  ArrowRight,
  X,
  FolderKanban,
  Building2,
  ListTodo
} from 'lucide-react';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import CreateRolodexModal from '@/components/CreateRolodexModal';
import TaskFormCompact from '@/components/TaskFormCompact';
import { Id } from '../../convex/_generated/dataModel';

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const firstName = user?.firstName || 'there';
  const { setIsOpen: setChatDrawerOpen } = useChatDrawer();
  
  // State for modals
  const [isCreateContactModalOpen, setIsCreateContactModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  
  // Fetch dashboard data
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const nextReminder = useQuery(api.reminders.getUpcoming, { limit: 1 });
  const nextEvent = useQuery(api.events.getNextEvent, {});
  const upcomingTasks = useQuery(api.tasks.getByUser, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Format date/time helpers
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMs < 0) return 'Overdue';
    if (diffMins < 60) return `${diffMins} minutes`;
    if (diffHours < 24) return `${diffHours} hours`;
    if (diffDays < 7) return `${diffDays} days`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const formatTimeRemaining = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMs < 0) return { text: 'Overdue', urgent: true, isOverdue: true };
    if (diffMins < 60) return { text: `${diffMins}m remaining`, urgent: diffMins < 30, isOverdue: false };
    if (diffHours < 24) return { text: `${diffHours}h remaining`, urgent: diffHours < 2, isOverdue: false };
    if (diffDays < 7) return { text: `${diffDays}d remaining`, urgent: false, isOverdue: false };
    return { text: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), urgent: false, isOverdue: false };
  };

  // Get today's date formatted
  const getTodayDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Filter upcoming tasks (non-completed, include all tasks including overdue)
  const filteredUpcomingTasks = upcomingTasks?.filter(task => {
    // Exclude only completed and cancelled tasks
    return task.status !== 'completed' && task.status !== 'cancelled';
  }).sort((a, b) => {
    // Sort: overdue tasks first (most urgent), then upcoming tasks, then tasks without due dates
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1; // Tasks without due dates go to end
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  }).slice(0, 10) || [];

  // Get client/project names for tasks
  const getTaskClientName = (clientId?: Id<'clients'>) => {
    if (!clientId) return null;
    return clients?.find(c => c._id === clientId)?.name;
  };

  const getTaskProjectName = (projectId?: Id<'projects'>) => {
    if (!projectId) return null;
    return projects?.find(p => p._id === projectId)?.name;
  };

  const getTaskName = (taskId?: Id<'tasks'>) => {
    if (!taskId) return null;
    return upcomingTasks?.find(t => t._id === taskId)?.title;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Check if task/reminder is overdue
  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const date = new Date(dueDate);
    const now = new Date();
    return date.getTime() < now.getTime();
  };

  // Check if task/reminder is urgent
  const isUrgent = (dueDate?: string) => {
    if (!dueDate) return false;
    const date = new Date(dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    return diffMs < 0 || diffHours < 24; // Overdue or less than 24 hours
  };

  // Action handlers
  const handleNewNote = () => {
    router.push('/notes');
  };

  const handleNewContact = () => {
    setIsCreateContactModalOpen(true);
  };

  const handleNewTask = () => {
    setIsCreateTaskModalOpen(true);
  };

  const handleNewReminder = () => {
    router.push('/tasks');
  };

  const handleNewUpload = () => {
    router.push('/docs');
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Hello {isLoaded ? firstName : '...'}
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Here is what you have to do today — {getTodayDate()}
          </p>
        </div>

        {/* Action Buttons - Moved Above Cards */}
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={handleNewNote}
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              <span>New Note</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNewContact}
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg"
            >
              <UserPlus className="w-4 h-4 text-green-400" />
              <span>New Contact</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg opacity-50"
            >
              <Mail className="w-4 h-4 text-purple-400" />
              <span>New E-mail</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNewTask}
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg"
            >
              <Plus className="w-4 h-4 text-yellow-400" />
              <span>New Task</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNewReminder}
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg"
            >
              <Bell className="w-4 h-4 text-orange-400" />
              <span>New Reminder</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNewUpload}
              className="bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2 h-9 rounded-lg"
            >
              <Upload className="w-4 h-4 text-red-400" />
              <span>New Upload</span>
            </Button>
          </div>
        </div>

        {/* Dynamic Cards - 3 Rectangular Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-stretch">
          {/* Next Task Card */}
          <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 h-full flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">Next Task</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {taskMetrics?.upNext?.dueDate && isOverdue(taskMetrics.upNext.dueDate)
                  ? 'OVERDUE'
                  : taskMetrics?.upNext
                  ? 'UPCOMING'
                  : 'NO TASK'}
              </span>
            </div>
            <div className="px-4 pt-3 pb-3 flex-1 flex flex-col">
              <div className="flex flex-col h-full">
                <div className="mb-3">
                  {taskMetrics?.upNext ? (
                    <>
                      <h2 className="text-base font-bold text-gray-900 mb-2">
                        {taskMetrics.upNext.title}
                      </h2>
                      {taskMetrics.upNext.description && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {taskMetrics.upNext.description}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {getTaskClientName(taskMetrics.upNext.clientId) && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Client:</span>
                            <Link 
                              href={`/clients/${taskMetrics.upNext.clientId}`}
                              className="text-xs text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskClientName(taskMetrics.upNext.clientId)}
                            </Link>
                          </div>
                        )}
                        {getTaskProjectName(taskMetrics.upNext.projectId) && (
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Project:</span>
                            <Link 
                              href={`/projects/${taskMetrics.upNext.projectId}`}
                              className="text-xs font-bold text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskProjectName(taskMetrics.upNext.projectId)}
                            </Link>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <h2 className="text-base font-bold text-gray-500 mb-0.5">
                      No tasks scheduled
                    </h2>
                  )}
                </div>
                
                <div className="pt-2 border-t border-gray-200 mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {taskMetrics?.upNext?.dueDate ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className={`text-xs font-medium ${
                          formatTimeRemaining(taskMetrics.upNext.dueDate).urgent ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {formatTimeRemaining(taskMetrics.upNext.dueDate).text}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No scheduled time</span>
                    )}
                    {taskMetrics?.upNext?.priority && (
                      <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${getPriorityColor(taskMetrics.upNext.priority)}`}>
                        {taskMetrics.upNext.priority}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => router.push('/tasks')}
                    className="bg-black hover:bg-gray-800 text-white rounded-lg h-8 text-xs px-3"
                  >
                    {taskMetrics?.upNext ? 'View Task' : 'Create Task'}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Next Reminder Card */}
          <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 h-full flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">Next Reminder</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {nextReminder && nextReminder.length > 0 && nextReminder[0].scheduledFor && isOverdue(nextReminder[0].scheduledFor)
                  ? 'OVERDUE'
                  : nextReminder && nextReminder.length > 0
                  ? 'UPCOMING'
                  : 'NO REMINDER'}
              </span>
            </div>
            <div className="px-4 pt-3 pb-3 flex-1 flex flex-col">
              <div className="flex flex-col h-full">
                <div className="mb-3">
                  {nextReminder && nextReminder.length > 0 ? (
                    <>
                      <h2 className="text-base font-bold text-gray-900 mb-2">
                        {nextReminder[0].title}
                      </h2>
                      {nextReminder[0].description && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {nextReminder[0].description}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {getTaskName(nextReminder[0].taskId) && (
                          <div className="flex items-center gap-1.5">
                            <ListTodo className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Task:</span>
                            <Link 
                              href={`/tasks`}
                              className="text-xs text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskName(nextReminder[0].taskId)}
                            </Link>
                          </div>
                        )}
                        {getTaskClientName(nextReminder[0].clientId) && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Client:</span>
                            <Link 
                              href={`/clients/${nextReminder[0].clientId}`}
                              className="text-xs text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskClientName(nextReminder[0].clientId)}
                            </Link>
                          </div>
                        )}
                        {getTaskProjectName(nextReminder[0].projectId) && (
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Project:</span>
                            <Link 
                              href={`/projects/${nextReminder[0].projectId}`}
                              className="text-xs font-bold text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskProjectName(nextReminder[0].projectId)}
                            </Link>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <h2 className="text-base font-bold text-gray-500 mb-0.5">
                      No reminders scheduled
                    </h2>
                  )}
                </div>
                
                <div className="pt-2 border-t border-gray-200 mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {nextReminder && nextReminder.length > 0 && nextReminder[0].scheduledFor ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className={`text-xs font-medium ${
                          formatTimeRemaining(nextReminder[0].scheduledFor).urgent ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {formatTimeRemaining(nextReminder[0].scheduledFor).text}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No scheduled time</span>
                    )}
                  </div>
                  <Button
                    onClick={() => router.push('/tasks')}
                    className="bg-black hover:bg-gray-800 text-white rounded-lg h-8 text-xs px-3"
                  >
                    {nextReminder && nextReminder.length > 0 ? 'View Reminder' : 'Create Reminder'}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Next Event Card */}
          <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 h-full flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">Next Event</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {nextEvent && nextEvent.startTime && isOverdue(nextEvent.startTime)
                  ? 'OVERDUE'
                  : nextEvent
                  ? 'UPCOMING'
                  : 'NO EVENT'}
              </span>
            </div>
            <div className="px-4 pt-3 pb-3 flex-1 flex flex-col">
              <div className="flex flex-col h-full">
                <div className="mb-3">
                  {nextEvent ? (
                    <>
                      <h2 className="text-base font-bold text-gray-900 mb-2">
                        {nextEvent.title}
                      </h2>
                      {nextEvent.description && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {nextEvent.description}
                        </p>
                      )}
                      {nextEvent.location && (
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <span className="w-3 h-3">📍</span>
                          {nextEvent.location}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {getTaskClientName(nextEvent.clientId) && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Client:</span>
                            <Link 
                              href={`/clients/${nextEvent.clientId}`}
                              className="text-xs text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskClientName(nextEvent.clientId)}
                            </Link>
                          </div>
                        )}
                        {getTaskProjectName(nextEvent.projectId) && (
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">Project:</span>
                            <Link 
                              href={`/projects/${nextEvent.projectId}`}
                              className="text-xs font-bold text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {getTaskProjectName(nextEvent.projectId)}
                            </Link>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <h2 className="text-base font-bold text-gray-500 mb-0.5">
                      No events scheduled
                    </h2>
                  )}
                </div>
                
                <div className="pt-2 border-t border-gray-200 mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {nextEvent?.startTime ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className={`text-xs font-medium ${
                          formatTimeRemaining(nextEvent.startTime).urgent ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {formatTimeRemaining(nextEvent.startTime).text}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No scheduled time</span>
                    )}
                  </div>
                  <Button
                    onClick={() => router.push('/calendar')}
                    className="bg-black hover:bg-gray-800 text-white rounded-lg h-8 text-xs px-3"
                  >
                    {nextEvent ? 'View Event' : 'Create Event'}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Tables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inbox */}
          <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 h-full flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">Inbox</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">Notifications & Emails</span>
            </div>
            <div className="px-4 pb-3 flex-1 flex flex-col">
              <div className="flex flex-col h-full">
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center py-8 text-gray-500">
                    <Inbox className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-sm">Coming soon</p>
                    <p className="text-xs text-gray-400 mt-2">Email integration and notifications will appear here</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200 mt-auto flex flex-col">
                  <Button
                    onClick={() => router.push('/inbox')}
                    className="ml-auto bg-black hover:bg-gray-800 text-white rounded-lg h-8 text-xs px-3"
                  >
                    View Inbox
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Upcoming Tasks */}
          <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 h-full flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">Upcoming Tasks</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {upcomingTasks === undefined 
                  ? 'Loading...' 
                  : filteredUpcomingTasks.length > 0 
                  ? `${filteredUpcomingTasks.length} Tasks` 
                  : 'No Tasks'}
              </span>
            </div>
            <div className="px-4 pb-3 flex-1 flex flex-col">
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto">
                  {upcomingTasks === undefined ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                  ) : filteredUpcomingTasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-sm">No upcoming tasks</p>
                    </div>
                  ) : (
                    <div className="pb-2 pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Task</TableHead>
                            <TableHead className="text-xs">Due Date</TableHead>
                            <TableHead className="text-xs">Priority</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUpcomingTasks.slice(0, 5).map((task) => (
                            <TableRow key={task._id}>
                              <TableCell className="py-2">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{task.title}</span>
                                  {(getTaskClientName(task.clientId) || getTaskProjectName(task.projectId)) && (
                                    <span className="text-xs text-gray-500 mt-1">
                                      {getTaskClientName(task.clientId) && getTaskProjectName(task.projectId)
                                        ? `${getTaskClientName(task.clientId)} • ${getTaskProjectName(task.projectId)}`
                                        : getTaskClientName(task.clientId) || getTaskProjectName(task.projectId)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span className="text-xs">
                                    {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${getPriorityColor(task.priority || 'medium')}`}>
                                  {task.priority || 'medium'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {filteredUpcomingTasks.length > 5 && (
                        <p className="text-xs text-gray-500 text-center mt-2">
                          +{filteredUpcomingTasks.length - 5} more tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-gray-200 mt-auto flex flex-col">
                  <Button
                    onClick={() => router.push('/tasks')}
                    className="ml-auto bg-black hover:bg-gray-800 text-white rounded-lg h-8 text-xs px-3"
                  >
                    {filteredUpcomingTasks && filteredUpcomingTasks.length > 0 ? 'View All Tasks' : 'Create Task'}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Modals */}
        <CreateRolodexModal
          isOpen={isCreateContactModalOpen}
          onClose={() => setIsCreateContactModalOpen(false)}
          onSuccess={() => {
            setIsCreateContactModalOpen(false);
          }}
        />

        {isCreateTaskModalOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsCreateTaskModalOpen(false);
              }
            }}
          >
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Create New Task</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCreateTaskModalOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <TaskFormCompact
                  onSuccess={() => {
                    setIsCreateTaskModalOpen(false);
                  }}
                  onCancel={() => {
                    setIsCreateTaskModalOpen(false);
                  }}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
