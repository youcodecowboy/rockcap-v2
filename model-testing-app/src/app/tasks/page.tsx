'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent } from '@/components/ui/card';
import TaskFormCompact from '@/components/TaskFormCompact';
import TaskNaturalLanguageInput from '@/components/TaskNaturalLanguageInput';
import ClientProjectSearch from '@/components/ClientProjectSearch';
import TagManagementModal from '@/components/TagManagementModal';
import ReminderForm from '@/components/ReminderForm';
import CompactMetricCard from '@/components/CompactMetricCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Filter, CheckSquare, Circle, Clock, Flag, Building2, FolderKanban, Tag, Settings, Bell } from 'lucide-react';
import Link from 'next/link';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'reminders'>('tasks');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todo' | 'in_progress' | 'completed' | 'cancelled' | 'all'>('all');
  const [reminderStatusFilter, setReminderStatusFilter] = useState<'pending' | 'completed' | 'dismissed' | 'overdue' | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [suggestedClientId, setSuggestedClientId] = useState<Id<'clients'> | undefined>();
  const [suggestedProjectId, setSuggestedProjectId] = useState<Id<'projects'> | undefined>();

  const tasks = useQuery(api.tasks.getByUser, {
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const reminders = useQuery(api.reminders.getByUser, {
    status: reminderStatusFilter === 'all' ? undefined : reminderStatusFilter,
  });
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const reminderMetrics = useQuery(api.reminders.getMetrics, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});
  const currentUser = useQuery(api.users.getCurrent, {});

  // Enhance tasks with names
  const enhancedTasks = tasks?.map(task => ({
    ...task,
    clientName: task.clientId
      ? clients?.find(c => c._id === task.clientId)?.name
      : undefined,
    projectName: task.projectId
      ? projects?.find(p => p._id === task.projectId)?.name
      : undefined,
    assignedToName: task.assignedTo
      ? allUsers?.find(u => u._id === task.assignedTo)?.name || allUsers?.find(u => u._id === task.assignedTo)?.email
      : undefined,
  })) || [];

  // Enhance reminders with names
  const enhancedReminders = reminders?.map(reminder => ({
    ...reminder,
    clientName: reminder.clientId
      ? clients?.find(c => c._id === reminder.clientId)?.name
      : undefined,
    projectName: reminder.projectId
      ? projects?.find(p => p._id === reminder.projectId)?.name
      : undefined,
  })) || [];

  const handleNaturalLanguageParse = (parsedData: any) => {
    if (activeTab === 'tasks') {
      // Handle task parsing
      let assignedTo = undefined;
      if (parsedData.assignedToMe && currentUser?._id) {
        assignedTo = currentUser._id;
      }

      // Handle reminder - if "remind me" was mentioned, set up reminder
      const hasReminder = parsedData.hasReminder || false;
      let reminderDate = '';
      let reminderTime = '';
      
      if (hasReminder) {
        const reminderDateTime = parsedData.reminderTime 
          ? new Date(parsedData.reminderTime)
          : parsedData.dueDate
          ? new Date(parsedData.dueDate)
          : new Date(Date.now() + 60 * 60 * 1000);
        
        reminderDate = reminderDateTime.toISOString().split('T')[0];
        reminderTime = reminderDateTime.toTimeString().slice(0, 5);
      }

      setFormData({
        title: parsedData.title || '',
        description: parsedData.description || '',
        priority: parsedData.priority || 'medium',
        dueDate: parsedData.dueDate ? new Date(parsedData.dueDate).toISOString().split('T')[0] : '',
        clientId: parsedData.clientId || undefined,
        projectId: parsedData.projectId || undefined,
        tags: parsedData.tags || [],
        assignedTo: assignedTo,
        hasReminder: hasReminder,
        reminderDate: reminderDate,
        reminderTime: reminderTime,
        reminderTitle: parsedData.title ? `Reminder: ${parsedData.title}` : '',
      });
    } else {
      // Handle reminder parsing
      const scheduledDateTime = parsedData.scheduledTime 
        ? new Date(parsedData.scheduledTime)
        : new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour from now
      
      const scheduledDate = scheduledDateTime.toISOString().split('T')[0];
      const scheduledTime = scheduledDateTime.toTimeString().slice(0, 5);

      setFormData({
        title: parsedData.title || '',
        description: parsedData.description || '',
        scheduledDate: scheduledDate,
        scheduledTime: scheduledTime,
        clientId: parsedData.clientId || undefined,
        projectId: parsedData.projectId || undefined,
        notes: parsedData.notes || '',
      });
    }
    
    // Set suggested client/project if LLM found them
    if (parsedData.clientId) {
      setSuggestedClientId(parsedData.clientId);
    }
    if (parsedData.projectId) {
      setSuggestedProjectId(parsedData.projectId);
    }
    setShowCreateForm(true);
  };

  const handleSuccess = () => {
    setShowCreateForm(false);
    setFormData(null);
    setSuggestedClientId(undefined);
    setSuggestedProjectId(undefined);
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setFormData(null);
    setSuggestedClientId(undefined);
    setSuggestedProjectId(undefined);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'cancelled':
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <Circle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getReminderStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'dismissed':
        return <Circle className="w-4 h-4 text-gray-400" />;
      case 'overdue':
        return <Clock className="w-4 h-4 text-red-600" />;
      default:
        return <Bell className="w-4 h-4 text-blue-600" />;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeUntil = (dateString: string) => {
    const now = new Date();
    const target = new Date(dateString);
    const diffMs = target.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Overdue';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tasks and Reminders</h1>
            <p className="mt-2 text-gray-600">Manage your tasks and reminders</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowTagModal(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Edit Tags
            </Button>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button
              onClick={() => {
                setFormData(null);
                setShowCreateForm(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {taskMetrics && reminderMetrics && (
            <>
              <CompactMetricCard
                label="Up Next"
                value={
                  taskMetrics.upNext
                    ? (() => {
                        const now = new Date();
                        const dueDate = new Date(taskMetrics.upNext.dueDate!);
                        const isOverdue = dueDate.getTime() < now.getTime();
                        // If overdue, show just the title as the value
                        if (isOverdue) {
                          return taskMetrics.upNext.title;
                        }
                        // Otherwise show the time until
                        return getTimeUntil(taskMetrics.upNext.dueDate!);
                      })()
                    : 'None'
                }
                icon={Clock}
                iconColor={
                  taskMetrics.upNext && new Date(taskMetrics.upNext.dueDate!).getTime() < new Date().getTime()
                    ? 'red'
                    : 'blue'
                }
                badge={
                  taskMetrics.upNext &&
                  new Date(taskMetrics.upNext.dueDate!).getTime() >= new Date().getTime()
                    ? { text: taskMetrics.upNext.title, variant: 'outline' }
                    : undefined
                }
                className="md:col-span-1"
              />
              <CompactMetricCard
                label="Active Tasks"
                value={taskMetrics.activeTasks}
                icon={CheckSquare}
                iconColor="blue"
              />
              <CompactMetricCard
                label="Active Reminders"
                value={reminderMetrics.activeReminders}
                icon={Bell}
                iconColor="orange"
              />
              <CompactMetricCard
                label="Completed"
                value={taskMetrics.completed}
                icon={CheckSquare}
                iconColor="green"
              />
            </>
          )}
        </div>

        {/* Tabs - Select between Tasks and Reminders */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tasks' | 'reminders')}>
          <TabsList>
            <TabsTrigger value="tasks">
              <CheckSquare className="w-4 h-4 mr-2" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="reminders">
              <Bell className="w-4 h-4 mr-2" />
              Reminders
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Natural Language Input */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {activeTab === 'tasks' ? 'Create a Task' : 'Create a Reminder'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {activeTab === 'tasks' 
                  ? 'Describe your task in natural language and let AI parse the details'
                  : 'Describe your reminder in natural language and let AI parse the details'}
              </p>
            </div>
            <TaskNaturalLanguageInput 
              onParse={handleNaturalLanguageParse} 
              mode={activeTab === 'tasks' ? 'task' : 'reminder'}
            />
            <ClientProjectSearch
              selectedClientId={formData?.clientId}
              selectedProjectId={formData?.projectId}
              suggestedClientId={suggestedClientId}
              suggestedProjectId={suggestedProjectId}
              onClientSelect={(clientId) => {
                setFormData((prev: any) => ({
                  ...prev,
                  clientId,
                  projectId: clientId ? prev?.projectId : undefined,
                }));
                if (clientId && !showCreateForm) {
                  setShowCreateForm(true);
                }
                if (clientId === suggestedClientId) {
                  setSuggestedClientId(undefined);
                }
              }}
              onProjectSelect={(projectId) => {
                setFormData((prev: any) => ({
                  ...prev,
                  projectId,
                }));
                if (projectId && !showCreateForm) {
                  setShowCreateForm(true);
                }
                if (projectId === suggestedProjectId) {
                  setSuggestedProjectId(undefined);
                }
              }}
              onClientSuggestionAccept={() => setSuggestedClientId(undefined)}
              onProjectSuggestionAccept={() => setSuggestedProjectId(undefined)}
            />
          </CardContent>
        </Card>

        {/* Filters */}
        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Status:</label>
                {activeTab === 'tasks' ? (
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as any)
                    }
                    className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                ) : (
                  <select
                    value={reminderStatusFilter}
                    onChange={(e) =>
                      setReminderStatusFilter(e.target.value as any)
                    }
                    className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Form Modal */}
        {showCreateForm && (
          <Card className="border-2 border-blue-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {activeTab === 'tasks' 
                    ? (formData ? 'Review & Create Task' : 'Create New Task')
                    : (formData ? 'Review & Create Reminder' : 'Create New Reminder')}
                </h2>
              </div>
              {activeTab === 'tasks' ? (
                <TaskFormCompact
                  initialData={formData}
                  onSuccess={handleSuccess}
                  onCancel={handleCancel}
                />
              ) : (
                <ReminderForm
                  initialData={formData}
                  onSuccess={handleSuccess}
                  onCancel={handleCancel}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Tasks and Reminders Tables */}
        {activeTab === 'tasks' ? (
          /* Tasks Tab */
          tasks === undefined ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-gray-500">Loading tasks...</div>
              </CardContent>
            </Card>
          ) : enhancedTasks.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-4">No tasks found</p>
                  <Button onClick={() => setShowCreateForm(true)}>
                    Create your first task
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
              <Card>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enhancedTasks.map((task) => (
                        <TableRow key={task._id} className="hover:bg-gray-50">
                          <TableCell>
                            {getStatusIcon(task.status)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{task.title}</div>
                              {task.description && (
                                <div className="text-sm text-gray-500 mt-1">{task.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-600">{task.assignedToName || 'Unassigned'}</span>
                          </TableCell>
                          <TableCell>
                            {task.priority && (
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                <Flag className="w-3 h-3" />
                                {task.priority}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm capitalize">{task.status.replace('_', ' ')}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="w-4 h-4" />
                              {formatDate(task.dueDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {task.clientName ? (
                              <Link
                                href={`/clients/${task.clientId}`}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                <Building2 className="w-3 h-3" />
                                {task.clientName}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.projectName ? (
                              <Link
                                href={`/projects/${task.projectId}`}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline max-w-[200px]"
                              >
                                <FolderKanban className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{task.projectName}</span>
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.tags && task.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {task.tags.map((tag, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                  >
                                    <Tag className="w-3 h-3" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
        ) : (
          /* Reminders Tab */
          reminders === undefined ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-gray-500">Loading reminders...</div>
                </CardContent>
              </Card>
            ) : enhancedReminders.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-gray-500">
                    <p>No reminders found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Reminder</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled For</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Project</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enhancedReminders.map((reminder) => (
                        <TableRow key={reminder._id} className="hover:bg-gray-50">
                          <TableCell>
                            {getReminderStatusIcon(reminder.status)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{reminder.title}</div>
                              {reminder.description && (
                                <div className="text-sm text-gray-500 mt-1">{reminder.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm capitalize">{reminder.status}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="w-4 h-4" />
                              {formatDateTime(reminder.scheduledFor)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {reminder.clientName ? (
                              <Link
                                href={`/clients/${reminder.clientId}`}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                <Building2 className="w-3 h-3" />
                                {reminder.clientName}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {reminder.projectName ? (
                              <Link
                                href={`/projects/${reminder.projectId}`}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline max-w-[200px]"
                              >
                                <FolderKanban className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{reminder.projectName}</span>
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
        )}

        {/* Tag Management Modal */}
        <TagManagementModal
          isOpen={showTagModal}
          onClose={() => setShowTagModal(false)}
        />
      </div>
    </div>
  );
}
