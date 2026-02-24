'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckSquare,
  Plus,
  Search,
  Calendar,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Flag,
  Circle,
  CheckCircle2,
  Pencil,
  Save,
} from 'lucide-react';

interface ProjectTasksTabProps {
  projectId: Id<"projects">;
  projectName: string;
  clientId: Id<"clients">;
}

type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high';

export default function ProjectTasksTab({
  projectId,
  projectName,
  clientId,
}: ProjectTasksTabProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<any>(null);

  // Query tasks for this project
  const tasks = useQuery(api.tasks.getByProject, { projectId }) || [];

  // Mutations
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const deleteTask = useMutation(api.tasks.remove);

  // Get selected task data
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t: any) => t._id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task: any) => {
      // Search filter
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchesSearch = (
          task.title?.toLowerCase().includes(queryLower) ||
          task.description?.toLowerCase().includes(queryLower) ||
          task.tags?.some((tag: string) => tag.toLowerCase().includes(queryLower))
        );
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;

      // Priority filter
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;

      return true;
    });
  }, [tasks, searchQuery, filterStatus, filterPriority]);

  // Group tasks by status for sidebar display
  const groupedTasks = useMemo(() => {
    const active = filteredTasks.filter((t: any) => t.status === 'todo' || t.status === 'in_progress');
    const completed = filteredTasks.filter((t: any) => t.status === 'completed');
    const cancelled = filteredTasks.filter((t: any) => t.status === 'cancelled');
    return { active, completed, cancelled };
  }, [filteredTasks]);

  // Check if any filters are active
  const hasActiveFilters = filterStatus !== 'all' || filterPriority !== 'all';

  const clearAllFilters = () => {
    setFilterStatus('all');
    setFilterPriority('all');
    setSearchQuery('');
  };

  const handleCreateTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;

    try {
      const taskId = await createTask({
        title: newTaskTitle.trim(),
        projectId,
        clientId,
        priority: 'medium',
      });
      setNewTaskTitle('');
      setIsCreating(false);
      setSelectedTaskId(taskId);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }, [createTask, projectId, clientId, newTaskTitle]);

  const handleDeleteTask = async (taskId: Id<"tasks">) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await deleteTask({ id: taskId });
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleStatusChange = async (taskId: Id<"tasks">, status: TaskStatus) => {
    try {
      await updateTask({ id: taskId, status });
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  const handleSaveTask = async () => {
    if (!editedTask || !selectedTaskId) return;

    try {
      await updateTask({
        id: selectedTaskId,
        title: editedTask.title,
        description: editedTask.description,
        notes: editedTask.notes,
        priority: editedTask.priority,
        dueDate: editedTask.dueDate || null,
      });
      setIsEditing(false);
      setEditedTask(null);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const startEditing = () => {
    if (selectedTask) {
      setEditedTask({ ...selectedTask });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setEditedTask(null);
    setIsEditing(false);
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'todo': return <Circle className="w-4 h-4 text-gray-400" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-purple-500" />;
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'cancelled': return <X className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'todo': return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'in_progress': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'cancelled': return 'text-gray-500 bg-gray-100 border-gray-300';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Left Sidebar - Tasks List */}
      <div className={`${isSidebarMinimized ? 'w-16' : 'w-80'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-visible`}>
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="absolute -right-3 top-4 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 transition-colors"
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header with buttons */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="text-xs">
                      <Filter className="w-3 h-3 mr-1" />
                      {filteredTasks.length}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Create Task */}
              {isCreating ? (
                <div className="mb-3">
                  <Input
                    placeholder="Task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateTask();
                      if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewTaskTitle('');
                      }
                    }}
                    className="mb-2"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateTask}
                      size="sm"
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      disabled={!newTaskTitle.trim()}
                    >
                      Create
                    </Button>
                    <Button
                      onClick={() => {
                        setIsCreating(false);
                        setNewTaskTitle('');
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setIsCreating(true)}
                  size="sm"
                  className="w-full bg-purple-600 hover:bg-purple-700 mb-3"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Task
                </Button>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9"
                />
              </div>

              {/* Collapsible Filters */}
              <div className="mt-3">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="text-[10px] px-1">
                        {(filterStatus !== 'all' ? 1 : 0) + (filterPriority !== 'all' ? 1 : 0)}
                      </Badge>
                    )}
                  </div>
                  {isFiltersExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {isFiltersExpanded && (
                  <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button
                        onClick={clearAllFilters}
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Status Filter */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                      <div className="flex flex-wrap gap-1">
                        {(['all', 'todo', 'in_progress', 'completed', 'cancelled'] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-2 py-1 text-xs rounded ${
                              filterStatus === status
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority Filter */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
                      <div className="flex gap-1">
                        {(['all', 'high', 'medium', 'low'] as const).map((priority) => (
                          <button
                            key={priority}
                            onClick={() => setFilterPriority(priority)}
                            className={`px-2 py-1 text-xs rounded ${
                              filterPriority === priority
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {priority === 'all' ? 'All' : priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tasks List */}
            <div className="flex-1 overflow-y-auto">
              {tasks === undefined ? (
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : filteredTasks.length === 0 ? (
                <div className="p-4 text-center">
                  <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {hasActiveFilters || searchQuery
                      ? 'No tasks match your filters.'
                      : 'No tasks yet. Create your first task!'}
                  </p>
                </div>
              ) : (
                <div>
                  {/* Active Tasks */}
                  {groupedTasks.active.length > 0 && (
                    <div className="mb-2">
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Active ({groupedTasks.active.length})
                      </div>
                      <div className="divide-y divide-gray-100">
                        {groupedTasks.active.map((task: any) => (
                          <TaskListItem
                            key={task._id}
                            task={task}
                            isSelected={selectedTaskId === task._id}
                            onSelect={() => setSelectedTaskId(task._id)}
                            onDelete={() => handleDeleteTask(task._id)}
                            onStatusChange={(status) => handleStatusChange(task._id, status)}
                            getStatusIcon={getStatusIcon}
                            getPriorityColor={getPriorityColor}
                            isOverdue={isOverdue}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed Tasks */}
                  {groupedTasks.completed.length > 0 && (
                    <div className="mb-2">
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Completed ({groupedTasks.completed.length})
                      </div>
                      <div className="divide-y divide-gray-100">
                        {groupedTasks.completed.map((task: any) => (
                          <TaskListItem
                            key={task._id}
                            task={task}
                            isSelected={selectedTaskId === task._id}
                            onSelect={() => setSelectedTaskId(task._id)}
                            onDelete={() => handleDeleteTask(task._id)}
                            onStatusChange={(status) => handleStatusChange(task._id, status)}
                            getStatusIcon={getStatusIcon}
                            getPriorityColor={getPriorityColor}
                            isOverdue={isOverdue}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cancelled Tasks */}
                  {groupedTasks.cancelled.length > 0 && (
                    <div className="mb-2">
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Cancelled ({groupedTasks.cancelled.length})
                      </div>
                      <div className="divide-y divide-gray-100">
                        {groupedTasks.cancelled.map((task: any) => (
                          <TaskListItem
                            key={task._id}
                            task={task}
                            isSelected={selectedTaskId === task._id}
                            onSelect={() => setSelectedTaskId(task._id)}
                            onDelete={() => handleDeleteTask(task._id)}
                            onStatusChange={(status) => handleStatusChange(task._id, status)}
                            getStatusIcon={getStatusIcon}
                            getPriorityColor={getPriorityColor}
                            isOverdue={isOverdue}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Minimized sidebar view */
          <>
            <div className="p-2 border-b border-gray-200 flex flex-col items-center gap-2">
              <button
                onClick={() => setIsCreating(true)}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                title="New Task"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {filteredTasks.map((task: any) => (
                <button
                  key={task._id}
                  onClick={() => {
                    setSelectedTaskId(task._id);
                    setIsSidebarMinimized(false);
                  }}
                  className={`w-full p-2 flex justify-center ${
                    selectedTaskId === task._id
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title={task.title}
                >
                  {getStatusIcon(task.status)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main Detail Area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedTaskId && selectedTask ? (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Task Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                {isEditing ? (
                  <Input
                    value={editedTask?.title || ''}
                    onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                    className="text-xl font-semibold mb-2"
                  />
                ) : (
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">{selectedTask.title}</h2>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`${getStatusColor(selectedTask.status)}`}>
                    {getStatusIcon(selectedTask.status)}
                    <span className="ml-1">
                      {selectedTask.status === 'in_progress' ? 'In Progress' : selectedTask.status.charAt(0).toUpperCase() + selectedTask.status.slice(1)}
                    </span>
                  </Badge>
                  <Badge variant="outline" className={`${getPriorityColor(selectedTask.priority)}`}>
                    <Flag className="w-3 h-3 mr-1" />
                    {(selectedTask.priority || 'medium').charAt(0).toUpperCase() + (selectedTask.priority || 'medium').slice(1)}
                  </Badge>
                  {selectedTask.dueDate && (
                    <Badge variant="outline" className={isOverdue(selectedTask.dueDate) && selectedTask.status !== 'completed' ? 'text-red-600 bg-red-50 border-red-200' : ''}>
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(selectedTask.dueDate).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button onClick={handleSaveTask} size="sm" className="gap-1 bg-purple-600 hover:bg-purple-700">
                      <Save className="w-4 h-4" />
                      Save
                    </Button>
                    <Button onClick={cancelEditing} size="sm" variant="outline">
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={startEditing} size="sm" variant="outline" className="gap-1">
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteTask(selectedTask._id)}
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Status Actions */}
            {!isEditing && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Quick Actions</label>
                <div className="flex gap-2 flex-wrap">
                  {selectedTask.status !== 'todo' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(selectedTask._id, 'todo')}
                      className="gap-1"
                    >
                      <Circle className="w-4 h-4" />
                      Mark To Do
                    </Button>
                  )}
                  {selectedTask.status !== 'in_progress' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(selectedTask._id, 'in_progress')}
                      className="gap-1 text-purple-600 hover:bg-purple-50"
                    >
                      <Clock className="w-4 h-4" />
                      Start Progress
                    </Button>
                  )}
                  {selectedTask.status !== 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(selectedTask._id, 'completed')}
                      className="gap-1 text-green-600 hover:bg-green-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Task Details */}
            <div className="space-y-6">
              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Description</label>
                {isEditing ? (
                  <Textarea
                    value={editedTask?.description || ''}
                    onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                    placeholder="Add a description..."
                    className="min-h-[100px]"
                  />
                ) : (
                  <p className="text-gray-600 whitespace-pre-wrap">
                    {selectedTask.description || <span className="text-gray-400 italic">No description</span>}
                  </p>
                )}
              </div>

              {/* Due Date & Priority */}
              {isEditing && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Due Date</label>
                    <Input
                      type="date"
                      value={editedTask?.dueDate ? editedTask.dueDate.split('T')[0] : ''}
                      onChange={(e) => setEditedTask({ ...editedTask, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Priority</label>
                    <Select
                      value={editedTask?.priority || 'medium'}
                      onValueChange={(value) => setEditedTask({ ...editedTask, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Notes</label>
                {isEditing ? (
                  <Textarea
                    value={editedTask?.notes || ''}
                    onChange={(e) => setEditedTask({ ...editedTask, notes: e.target.value })}
                    placeholder="Add notes..."
                    className="min-h-[150px]"
                  />
                ) : (
                  <p className="text-gray-600 whitespace-pre-wrap">
                    {selectedTask.notes || <span className="text-gray-400 italic">No notes</span>}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Created: {new Date(selectedTask.createdAt).toLocaleString()}</p>
                  <p>Updated: {new Date(selectedTask.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center max-w-md">
              <CheckSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {tasks.length === 0 ? 'No tasks yet' : 'Select a task'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {tasks.length === 0
                  ? `Create tasks to track work items for ${projectName}. Tasks can have due dates, priorities, and notes.`
                  : 'Select a task from the sidebar to view and edit it, or create a new task.'}
              </p>
              <Button onClick={() => setIsCreating(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4" />
                New Task
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Task List Item Component
interface TaskListItemProps {
  task: any;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
  getStatusIcon: (status: TaskStatus) => React.ReactNode;
  getPriorityColor: (priority?: string) => string;
  isOverdue: (dueDate?: string) => boolean;
}

function TaskListItem({
  task,
  isSelected,
  onSelect,
  onDelete,
  onStatusChange,
  getStatusIcon,
  getPriorityColor,
  isOverdue,
}: TaskListItemProps) {
  return (
    <div className="group relative">
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        className={`w-full text-left p-3 hover:bg-gray-50 transition-colors cursor-pointer ${
          isSelected ? 'bg-purple-50 border-l-4 border-purple-600' : ''
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (task.status === 'completed') {
                onStatusChange('todo');
              } else {
                onStatusChange('completed');
              }
            }}
            className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform"
          >
            {getStatusIcon(task.status)}
          </button>
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-sm truncate ${
              task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
            }`}>
              {task.title}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${getPriorityColor(task.priority)}`}
              >
                {task.priority || 'medium'}
              </Badge>
              {task.dueDate && (
                <span className={`text-[10px] flex items-center gap-0.5 ${
                  isOverdue(task.dueDate) && task.status !== 'completed' ? 'text-red-500' : 'text-gray-400'
                }`}>
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 z-10 p-1 opacity-0 group-hover:opacity-100 bg-white rounded shadow hover:bg-red-50 transition-all border border-gray-200"
        title="Delete task"
      >
        <Trash2 className="w-3 h-3 text-red-600" />
      </button>
    </div>
  );
}
