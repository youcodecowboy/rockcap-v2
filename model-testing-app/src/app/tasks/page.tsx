'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
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
import { Plus, Filter, CheckSquare, Circle, Clock, Flag, Building2, FolderKanban, Tag, Settings, Bell, ArrowRight, ListTodo, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'reminders' | 'completed'>('tasks');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todo' | 'in_progress' | 'completed' | 'cancelled' | 'all'>('all');
  const [reminderStatusFilter, setReminderStatusFilter] = useState<'pending' | 'completed' | 'dismissed' | 'overdue' | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [suggestedClientId, setSuggestedClientId] = useState<Id<'clients'> | undefined>();
  const [suggestedProjectId, setSuggestedProjectId] = useState<Id<'projects'> | undefined>();

  const completeTask = useMutation(api.tasks.complete);
  const completeReminder = useMutation(api.reminders.complete);

  const tasks = useQuery(api.tasks.getByUser, {
    status: activeTab === 'completed' ? undefined : (statusFilter === 'all' ? undefined : statusFilter),
  });
  const reminders = useQuery(api.reminders.getByUser, {
    status: activeTab === 'completed' ? undefined : (reminderStatusFilter === 'all' ? undefined : reminderStatusFilter),
  });
  
  // Get completed items for the Completed tab
  const completedTasks = useQuery(api.tasks.getByUser, {
    status: 'completed',
  });
  const completedReminders = useQuery(api.reminders.getByUser, {
    status: 'completed',
  });
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const reminderMetrics = useQuery(api.reminders.getMetrics, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});
  const currentUser = useQuery(api.users.getCurrent, {});

  // Filter tasks based on active tab
  const displayTasks = activeTab === 'completed' ? completedTasks : tasks;
  
  // Filter reminders based on active tab
  const displayReminders = activeTab === 'completed' ? completedReminders : reminders;

  // Enhance tasks with names
  const enhancedTasks = displayTasks?.map(task => ({
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
  }))
    .filter(task => activeTab === 'completed' ? task.status === 'completed' : task.status !== 'completed')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, activeTab === 'completed' ? 20 : undefined) || [];

  // Enhance reminders with names
  const enhancedReminders = displayReminders?.map(reminder => ({
    ...reminder,
    clientName: reminder.clientId
      ? clients?.find(c => c._id === reminder.clientId)?.name
      : undefined,
    projectName: reminder.projectId
      ? projects?.find(p => p._id === reminder.projectId)?.name
      : undefined,
    taskName: reminder.taskId
      ? tasks?.find(t => t._id === reminder.taskId)?.title
      : undefined,
  }))
    .filter(reminder => activeTab === 'completed' ? reminder.status === 'completed' : reminder.status !== 'completed')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, activeTab === 'completed' ? 20 : undefined) || [];

  const handleCompleteTask = async (taskId: Id<'tasks'>) => {
    try {
      await completeTask({ id: taskId });
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  const handleCompleteReminder = async (reminderId: Id<'reminders'>) => {
    try {
      await completeReminder({ id: reminderId });
    } catch (error) {
      console.error('Failed to complete reminder:', error);
    }
  };

  const handleNaturalLanguageParse = (parsedData: any) => {
    // Helper function to resolve clientId from name or ID
    const resolveClientId = (clientId: any, clientName?: string): Id<'clients'> | undefined => {
      let resolved: Id<'clients'> | undefined = undefined;
      if (clientId) {
        // Check if it's a valid Convex ID (starts with 'j')
        if (typeof clientId === 'string' && clientId.startsWith('j')) {
          resolved = clientId as Id<'clients'>;
        } else if (clients && typeof clientId === 'string') {
          // Try to find client by name
          const foundClient = clients.find(
            c => c.name.toLowerCase() === clientId.toLowerCase() ||
                 c.companyName?.toLowerCase() === clientId.toLowerCase()
          );
          if (foundClient) {
            resolved = foundClient._id;
          }
        }
      }
      
      // Also try clientName if clientId wasn't found
      if (!resolved && clientName && clients) {
        const foundClient = clients.find(
          c => c.name.toLowerCase() === clientName.toLowerCase() ||
               c.companyName?.toLowerCase() === clientName.toLowerCase()
        );
        if (foundClient) {
          resolved = foundClient._id;
        }
      }
      
      return resolved;
    };

    let resolvedClientId: Id<'clients'> | undefined = undefined;

    if (activeTab === 'tasks') {
      // Handle task parsing
      let assignedTo = undefined;
      if (parsedData.assignedToMe && currentUser?._id) {
        assignedTo = currentUser._id;
      }

      // Resolve clientId for tasks
      resolvedClientId = resolveClientId(parsedData.clientId, parsedData.clientName);

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
        clientId: resolvedClientId,
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
      const parsedDateTime = parsedData.scheduledTime 
        ? new Date(parsedData.scheduledTime)
        : new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour from now
      
      // Use local date/time methods to avoid timezone issues
      const year = parsedDateTime.getFullYear();
      const month = String(parsedDateTime.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDateTime.getDate()).padStart(2, '0');
      const scheduledDate = `${year}-${month}-${day}`;
      
      const hours = String(parsedDateTime.getHours()).padStart(2, '0');
      const minutes = String(parsedDateTime.getMinutes()).padStart(2, '0');
      const scheduledTime = `${hours}:${minutes}`;

      // Resolve clientId for reminders
      resolvedClientId = resolveClientId(parsedData.clientId, parsedData.clientName);

      // Use the parsed DateTime directly for DateTimePicker
      setFormData({
        title: parsedData.title || '',
        description: parsedData.description || '',
        scheduledDate: scheduledDate,
        scheduledTime: scheduledTime,
        scheduledDateTime: parsedDateTime, // Date object for DateTimePicker
        clientId: resolvedClientId,
        projectId: parsedData.projectId || undefined,
        notes: parsedData.notes || '',
      });
    }
    
    // Set suggested client/project if LLM found them (use resolved IDs)
    if (resolvedClientId) {
      setSuggestedClientId(resolvedClientId);
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
              {activeTab === 'tasks' ? 'Add Task' : 'Add Reminder'}
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
                className="md:col-span-1 bg-black text-white"
              />
              <CompactMetricCard
                label="Active Tasks"
                value={taskMetrics.activeTasks}
                icon={CheckSquare}
                iconColor="blue"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Active Reminders"
                value={reminderMetrics.activeReminders}
                icon={Bell}
                iconColor="orange"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Completed"
                value={
                  (taskMetrics.completed || 0) + 
                  (completedReminders?.length || 0)
                }
                icon={CheckSquare}
                iconColor="green"
                className="bg-black text-white"
              />
            </>
          )}
        </div>

        {/* Tabs - Select between Tasks, Reminders, and Completed */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tasks' | 'reminders' | 'completed')}>
          <TabsList>
            <TabsTrigger 
              value="tasks"
              className="data-[state=active]:!bg-black data-[state=active]:!text-white data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700"
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Tasks
            </TabsTrigger>
            <TabsTrigger 
              value="reminders"
              className="data-[state=active]:!bg-black data-[state=active]:!text-white data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700"
            >
              <Bell className="w-4 h-4 mr-2" />
              Reminders
            </TabsTrigger>
            <TabsTrigger 
              value="completed"
              className="data-[state=active]:!bg-black data-[state=active]:!text-white data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Completed
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Natural Language Input - Hide for Completed tab */}
        {activeTab !== 'completed' && (
          <Card className="hover:shadow-lg transition-shadow rounded-xl p-0 gap-0" style={{ overflow: 'visible' }}>
            <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {activeTab === 'tasks' ? 'Create a Task' : 'Create a Reminder'}
                </span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                AI Powered
              </span>
            </div>
            <CardContent className="pt-6 pb-6 px-6 space-y-4" style={{ overflow: 'visible' }}>
              <div>
                <p className="text-sm text-gray-600">
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
        )}

        {/* Filters - Hide for Completed tab */}
        {showFilters && activeTab !== 'completed' && (
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

        {/* Create Form Modal - Hide for Completed tab */}
        {showCreateForm && activeTab !== 'completed' && (
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
          displayTasks === undefined ? (
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
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-white" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Tasks</span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {enhancedTasks.length} {enhancedTasks.length === 1 ? 'Task' : 'Tasks'}
                  </span>
                </div>
                <CardContent className="pt-0 pb-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200">
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
                    <TableBody className="min-h-[600px]">
                      {enhancedTasks.map((task) => (
                        <TableRow key={task._id} className="hover:bg-gray-50">
                          <TableCell>
                            {task.status === 'completed' ? (
                              <CheckSquare className="w-4 h-4 text-green-600" />
                            ) : (
                              <button
                                onClick={() => handleCompleteTask(task._id)}
                                className="hover:opacity-70 transition-opacity cursor-pointer"
                                title="Click to complete task"
                              >
                                <Circle className="w-4 h-4 text-gray-600" />
                              </button>
                            )}
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
        ) : activeTab === 'reminders' ? (
          /* Reminders Tab */
          displayReminders === undefined ? (
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
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-white" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Reminders</span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {enhancedReminders.length} {enhancedReminders.length === 1 ? 'Reminder' : 'Reminders'}
                  </span>
                </div>
                <CardContent className="pt-0 pb-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200">
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Reminder</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled For</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="min-h-[600px]">
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
                          <TableCell>
                            {reminder.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCompleteReminder(reminder._id)}
                                className="flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
        ) : null}

        {/* Completed Tab - Show both tasks and reminders */}
        {activeTab === 'completed' && (
          <>
            {/* Completed Tasks Section */}
            {completedTasks === undefined ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-gray-500">Loading completed tasks...</div>
                </CardContent>
              </Card>
            ) : enhancedTasks.length === 0 && enhancedReminders.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-gray-500">
                    <p>No completed tasks or reminders found</p>
                  </div>
                </CardContent>
              </Card>
            ) : enhancedTasks.length > 0 ? (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-white" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Completed Tasks</span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {enhancedTasks.length} {enhancedTasks.length === 1 ? 'Task' : 'Tasks'} (Most Recent 20)
                  </span>
                </div>
                <CardContent className="pt-0 pb-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200">
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
                            <CheckSquare className="w-4 h-4 text-green-600" />
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
            ) : null}

            {/* Completed Reminders Section */}
            {completedReminders === undefined ? (
              enhancedTasks && enhancedTasks.length > 0 ? (
                <Card className="mt-6">
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-gray-500">Loading completed reminders...</div>
                  </CardContent>
                </Card>
              ) : null
            ) : (() => {
              // Enhance completed reminders with names for display
              const completedRemindersEnhanced = completedReminders
                .map(reminder => ({
                  ...reminder,
                  clientName: reminder.clientId
                    ? clients?.find(c => c._id === reminder.clientId)?.name
                    : undefined,
                  projectName: reminder.projectId
                    ? projects?.find(p => p._id === reminder.projectId)?.name
                    : undefined,
                }))
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 20);

              return completedRemindersEnhanced.length > 0 ? (
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 mt-6">
                  <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-white" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Completed Reminders</span>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {completedRemindersEnhanced.length} {completedRemindersEnhanced.length === 1 ? 'Reminder' : 'Reminders'} (Most Recent 20)
                    </span>
                  </div>
                  <CardContent className="pt-0 pb-6">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Reminder</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Completed At</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Project</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedRemindersEnhanced.map((reminder) => (
                        <TableRow key={reminder._id} className="hover:bg-gray-50">
                          <TableCell>
                            <CheckSquare className="w-4 h-4 text-green-600" />
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
                              {formatDateTime(reminder.updatedAt)}
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
              ) : null;
            })()}
          </>
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
