'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
import {
  Button,
  IconButton,
  Field,
  Input,
  Textarea,
  Select,
  StatusPill,
  EmptyState,
  Skeleton,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
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
  Circle,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Save,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ProjectTasksTabProps {
  projectId: Id<"projects">;
  projectName: string;
  clientId: Id<"clients">;
}

type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high';

function taskStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch (status) {
    case 'todo': return colors.text.muted;
    case 'in_progress': return colors.accent.blue;
    case 'completed': return colors.accent.green;
    case 'cancelled': return colors.text.dim;
    default: return colors.text.muted;
  }
}

function priorityTone(priority: string | undefined, colors: ColorPalette): string {
  switch (priority) {
    case 'high': return colors.accent.red;
    case 'medium': return colors.accent.yellow;
    case 'low': return colors.accent.green;
    default: return colors.text.muted;
  }
}

export default function ProjectTasksTab({
  projectId,
  projectName,
  clientId,
}: ProjectTasksTabProps) {
  const colors = useColors();
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
      case 'todo': return <Circle size={16} color={colors.text.muted} />;
      case 'in_progress': return <Clock size={16} color={colors.accent.blue} />;
      case 'completed': return <CheckCircle2 size={16} color={colors.accent.green} />;
      case 'cancelled': return <X size={16} color={colors.text.muted} />;
    }
  };

  const statusLabel = (status: TaskStatus) =>
    status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: colors.bg.base, overflow: 'hidden' }}>
      {/* Left Sidebar - Tasks List */}
      <div
        style={{
          width: isSidebarMinimized ? 64 : 320,
          background: colors.bg.card,
          borderRight: `1px solid ${colors.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 300ms ease-in-out',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
          style={{
            position: 'absolute',
            right: -12,
            top: 16,
            zIndex: 10,
            padding: 4,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 999,
            cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          {isSidebarMinimized ? (
            <ChevronRight size={16} color={colors.text.muted} />
          ) : (
            <ChevronLeft size={16} color={colors.text.muted} />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header with buttons */}
            <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: colors.text.primary,
                      fontWeight: 500,
                    }}
                  >
                    Tasks
                  </span>
                  {hasActiveFilters && (
                    <StatusPill label={`${filteredTasks.length}`} tone={colors.entityTypes.project} />
                  )}
                </div>
              </div>

              {/* Create Task */}
              {isCreating ? (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="primary"
                      accent={colors.entityTypes.project}
                      size="sm"
                      onClick={handleCreateTask}
                      disabled={!newTaskTitle.trim()}
                    >
                      Create
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsCreating(false);
                        setNewTaskTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 12, display: 'flex' }}>
                  <Button
                    variant="primary"
                    accent={colors.entityTypes.project}
                    size="sm"
                    onClick={() => setIsCreating(true)}
                  >
                    <Plus size={14} />
                    New Task
                  </Button>
                </div>
              )}

              {/* Search */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 10px',
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                }}
              >
                <Search size={14} color={colors.text.muted} style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    fontSize: 12,
                    color: colors.text.primary,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Collapsible Filters */}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: colors.text.muted,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Filter size={12} />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <StatusPill
                        label={`${(filterStatus !== 'all' ? 1 : 0) + (filterPriority !== 'all' ? 1 : 0)}`}
                        tone={colors.entityTypes.project}
                      />
                    )}
                  </span>
                  {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {isFiltersExpanded && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${colors.border.default}`, paddingTop: 8 }}>
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                        <X size={12} />
                        Clear Filters
                      </Button>
                    )}

                    {/* Status Filter */}
                    <div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Status
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(['all', 'todo', 'in_progress', 'completed', 'cancelled'] as const).map((status) => {
                          const active = filterStatus === status;
                          return (
                            <button
                              key={status}
                              onClick={() => setFilterStatus(status)}
                              style={{
                                padding: '3px 8px',
                                fontSize: 11,
                                borderRadius: 3,
                                cursor: 'pointer',
                                border: `1px solid ${active ? colors.entityTypes.project : colors.border.default}`,
                                background: active ? `${colors.entityTypes.project}20` : colors.bg.card,
                                color: active ? colors.entityTypes.project : colors.text.secondary,
                              }}
                            >
                              {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Priority Filter */}
                    <div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Priority
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['all', 'high', 'medium', 'low'] as const).map((priority) => {
                          const active = filterPriority === priority;
                          return (
                            <button
                              key={priority}
                              onClick={() => setFilterPriority(priority)}
                              style={{
                                padding: '3px 8px',
                                fontSize: 11,
                                borderRadius: 3,
                                cursor: 'pointer',
                                border: `1px solid ${active ? colors.entityTypes.project : colors.border.default}`,
                                background: active ? `${colors.entityTypes.project}20` : colors.bg.card,
                                color: active ? colors.entityTypes.project : colors.text.secondary,
                              }}
                            >
                              {priority === 'all' ? 'All' : priority.charAt(0).toUpperCase() + priority.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tasks List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {tasks === undefined ? (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={40} />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    icon={<CheckSquare size={28} />}
                    title={hasActiveFilters || searchQuery ? 'No tasks match your filters' : 'No tasks yet'}
                    body={hasActiveFilters || searchQuery ? undefined : 'Create your first task.'}
                  />
                </div>
              ) : (
                <div>
                  {(
                    [
                      ['active', 'Active', groupedTasks.active],
                      ['completed', 'Completed', groupedTasks.completed],
                      ['cancelled', 'Cancelled', groupedTasks.cancelled],
                    ] as const
                  ).map(([key, label, list]) =>
                    list.length > 0 ? (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            padding: '8px 16px',
                            fontFamily: MONO,
                            fontSize: 9,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: colors.text.muted,
                            fontWeight: 500,
                            background: colors.bg.light,
                          }}
                        >
                          {label} ({list.length})
                        </div>
                        <div>
                          {list.map((task: any, i: number) => (
                            <div
                              key={task._id}
                              style={{ borderTop: i === 0 ? 'none' : `1px solid ${colors.border.light}` }}
                            >
                              <TaskListItem
                                task={task}
                                isSelected={selectedTaskId === task._id}
                                onSelect={() => setSelectedTaskId(task._id)}
                                onDelete={() => handleDeleteTask(task._id)}
                                onStatusChange={(status) => handleStatusChange(task._id, status)}
                                getStatusIcon={getStatusIcon}
                                isOverdue={isOverdue}
                                colors={colors}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Minimized sidebar view */
          <>
            <div style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setIsCreating(true)}
                title="New Task"
                style={{
                  padding: 8,
                  background: colors.entityTypes.project,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'inline-flex',
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {filteredTasks.map((task: any) => {
                const selected = selectedTaskId === task._id;
                return (
                  <button
                    key={task._id}
                    onClick={() => {
                      setSelectedTaskId(task._id);
                      setIsSidebarMinimized(false);
                    }}
                    title={task.title}
                    style={{
                      width: '100%',
                      padding: 8,
                      display: 'flex',
                      justifyContent: 'center',
                      background: selected ? `${colors.entityTypes.project}20` : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {getStatusIcon(task.status)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Main Detail Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg.card, overflow: 'hidden' }}>
        {selectedTaskId && selectedTask ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {/* Task Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
              <div style={{ flex: 1 }}>
                {isEditing ? (
                  <div style={{ marginBottom: 8 }}>
                    <Input
                      value={editedTask?.title || ''}
                      onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                    />
                  </div>
                ) : (
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: colors.text.primary, marginBottom: 8 }}>
                    {selectedTask.title}
                  </h2>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusPill label={statusLabel(selectedTask.status)} tone={taskStatusTone(selectedTask.status, colors)} />
                  <StatusPill
                    label={(selectedTask.priority || 'medium')}
                    tone={priorityTone(selectedTask.priority, colors)}
                  />
                  {selectedTask.dueDate && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontFamily: MONO,
                        fontSize: 10,
                        color:
                          isOverdue(selectedTask.dueDate) && selectedTask.status !== 'completed'
                            ? colors.accent.red
                            : colors.text.muted,
                      }}
                    >
                      <Calendar size={12} />
                      {new Date(selectedTask.dueDate).toLocaleDateString()}
                      {isOverdue(selectedTask.dueDate) && selectedTask.status !== 'completed' && (
                        <AlertCircle size={12} />
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isEditing ? (
                  <>
                    <Button variant="primary" accent={colors.entityTypes.project} size="sm" onClick={handleSaveTask}>
                      <Save size={14} />
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={cancelEditing}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={startEditing}>
                      <Pencil size={14} />
                      Edit
                    </Button>
                    <IconButton label="Delete task" onClick={() => handleDeleteTask(selectedTask._id)}>
                      <Trash2 size={14} color={colors.accent.red} />
                    </IconButton>
                  </>
                )}
              </div>
            </div>

            {/* Quick Status Actions */}
            {!isEditing && (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: colors.text.muted,
                    fontWeight: 500,
                    marginBottom: 8,
                  }}
                >
                  Quick Actions
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedTask.status !== 'todo' && (
                    <Button variant="secondary" size="sm" onClick={() => handleStatusChange(selectedTask._id, 'todo')}>
                      <Circle size={14} />
                      Mark To Do
                    </Button>
                  )}
                  {selectedTask.status !== 'in_progress' && (
                    <Button variant="secondary" size="sm" onClick={() => handleStatusChange(selectedTask._id, 'in_progress')}>
                      <Clock size={14} color={colors.accent.blue} />
                      Start Progress
                    </Button>
                  )}
                  {selectedTask.status !== 'completed' && (
                    <Button variant="secondary" size="sm" onClick={() => handleStatusChange(selectedTask._id, 'completed')}>
                      <CheckCircle2 size={14} color={colors.accent.green} />
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Task Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Description */}
              <div>
                {isEditing ? (
                  <Field label="Description">
                    <Textarea
                      value={editedTask?.description || ''}
                      onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                      placeholder="Add a description..."
                      rows={4}
                    />
                  </Field>
                ) : (
                  <>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: colors.text.muted,
                        fontWeight: 500,
                        marginBottom: 8,
                      }}
                    >
                      Description
                    </div>
                    <p style={{ color: colors.text.secondary, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {selectedTask.description || <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>No description</span>}
                    </p>
                  </>
                )}
              </div>

              {/* Due Date & Priority */}
              {isEditing && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Due Date">
                    <Input
                      type="date"
                      value={editedTask?.dueDate ? editedTask.dueDate.split('T')[0] : ''}
                      onChange={(e) => setEditedTask({ ...editedTask, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={editedTask?.priority || 'medium'}
                      onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </Select>
                  </Field>
                </div>
              )}

              {/* Notes */}
              <div>
                {isEditing ? (
                  <Field label="Notes">
                    <Textarea
                      value={editedTask?.notes || ''}
                      onChange={(e) => setEditedTask({ ...editedTask, notes: e.target.value })}
                      placeholder="Add notes..."
                      rows={6}
                    />
                  </Field>
                ) : (
                  <>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: colors.text.muted,
                        fontWeight: 500,
                        marginBottom: 8,
                      }}
                    >
                      Notes
                    </div>
                    <p style={{ color: colors.text.secondary, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {selectedTask.notes || <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>No notes</span>}
                    </p>
                  </>
                )}
              </div>

              {/* Metadata */}
              <div style={{ paddingTop: 16, borderTop: `1px solid ${colors.border.light}` }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Created: {new Date(selectedTask.createdAt).toLocaleString()}</span>
                  <span>Updated: {new Date(selectedTask.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <EmptyState
              icon={<CheckSquare size={40} />}
              title={tasks.length === 0 ? 'No tasks yet' : 'Select a task'}
              body={
                tasks.length === 0
                  ? `Create tasks to track work items for ${projectName}. Tasks can have due dates, priorities, and notes.`
                  : 'Select a task from the sidebar to view and edit it, or create a new task.'
              }
              action={
                <Button variant="primary" accent={colors.entityTypes.project} onClick={() => setIsCreating(true)}>
                  <Plus size={14} />
                  New Task
                </Button>
              }
            />
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
  isOverdue: (dueDate?: string) => boolean;
  colors: ColorPalette;
}

function TaskListItem({
  task,
  isSelected,
  onSelect,
  onDelete: _onDelete,
  onStatusChange,
  getStatusIcon,
  isOverdue,
  colors,
}: TaskListItemProps) {
  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 12,
          cursor: 'pointer',
          background: isSelected ? `${colors.entityTypes.project}15` : 'transparent',
          borderLeft: isSelected ? `3px solid ${colors.entityTypes.project}` : '3px solid transparent',
          transition: 'background 100ms linear',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (task.status === 'completed') {
                onStatusChange('todo');
              } else {
                onStatusChange('completed');
              }
            }}
            style={{ marginTop: 2, flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex' }}
          >
            {getStatusIcon(task.status)}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 500,
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: task.status === 'completed' ? colors.text.muted : colors.text.primary,
                textDecoration: task.status === 'completed' ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <StatusPill label={task.priority || 'medium'} tone={priorityTone(task.priority, colors)} />
              {task.dueDate && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    fontFamily: MONO,
                    fontSize: 9,
                    color:
                      isOverdue(task.dueDate) && task.status !== 'completed'
                        ? colors.accent.red
                        : colors.text.muted,
                  }}
                >
                  <Clock size={10} />
                  {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
