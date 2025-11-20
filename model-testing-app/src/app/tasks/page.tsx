'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TaskCard from '@/components/TaskCard';
import TaskForm from '@/components/TaskForm';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TasksPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todo' | 'in_progress' | 'completed' | 'cancelled' | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const tasks = useQuery(api.tasks.getByUser, {
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const users = useQuery(api.users.getCurrent, {});

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
      ? users?._id === task.assignedTo ? users?.name || users?.email : 'Other User'
      : undefined,
    createdByName: users?._id === task.createdBy ? users?.name || users?.email : 'Other User',
  })) || [];

  const handleSuccess = () => {
    setShowCreateForm(false);
  };

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
            <p className="mt-2 text-gray-600">Manage your tasks and assignments</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Status:</label>
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
              </div>
            </CardContent>
          </Card>
        )}

        {showCreateForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Create New Task</CardTitle>
              <CardDescription>Add a new task to your list</CardDescription>
            </CardHeader>
            <CardContent>
              <TaskForm onSuccess={handleSuccess} onCancel={() => setShowCreateForm(false)} />
            </CardContent>
          </Card>
        )}

        {tasks === undefined ? (
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
          <div className="grid gap-4">
            {enhancedTasks.map((task) => (
              <TaskCard key={task._id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

