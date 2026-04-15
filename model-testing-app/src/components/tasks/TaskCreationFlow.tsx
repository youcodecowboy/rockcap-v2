'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ArrowLeft, ArrowUp, Loader2, Sparkles } from 'lucide-react';
import TaskConfirmationCard from './TaskConfirmationCard';

interface TaskCreationFlowProps {
  onTaskCreated: (taskId: string) => void;
  onClose: () => void;
  initialClientId?: string;
  initialClientName?: string;
  initialProjectId?: string;
  initialProjectName?: string;
}

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ParsedTask {
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string[];
  clientId?: string;
  projectId?: string;
}

export default function TaskCreationFlow({
  onTaskCreated,
  onClose,
  initialClientId,
  initialClientName,
  initialProjectId,
  initialProjectName,
}: TaskCreationFlowProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedTask, setParsedTask] = useState<ParsedTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});
  const currentUser = useQuery(api.users.getCurrent, {});
  const createTask = useMutation(api.tasks.create);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages: AgentMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const context = {
        userId: currentUser?._id || '',
        clients: (clients || []).map(c => ({ id: c._id, name: c.name })),
        projects: (projects || []).map(p => ({ id: p._id, name: p.name, clientId: (p as any).clientRoles?.[0]?.clientId })),
        users: (allUsers || []).map(u => ({ id: u._id, name: u.name || u.email })),
      };

      // If this flow was opened from a client/project context, prepend a
      // system hint so the AI knows the scope without the user having to
      // repeat it. Only inject on the first message to avoid duplication.
      let agentMessages = newMessages;
      if (newMessages.length === 1 && (initialClientName || initialProjectName)) {
        const parts: string[] = [];
        if (initialClientName) parts.push(`client "${initialClientName}"`);
        if (initialProjectName) parts.push(`project "${initialProjectName}"`);
        const hint = `[Context: this task is for ${parts.join(', ')}]`;
        agentMessages = [
          { role: 'user' as const, content: `${hint}\n\n${newMessages[0].content}` },
        ];
      }

      const res = await fetch('/api/tasks/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentMessages, context }),
      });

      if (!res.ok) throw new Error('Agent request failed');

      const data = await res.json();

      if (data.type === 'task') {
        const task = { ...data.task };
        // Default to the initial client/project if the AI didn't resolve one
        if (!task.clientId && initialClientId) task.clientId = initialClientId;
        if (!task.projectId && initialProjectId) task.projectId = initialProjectId;
        setParsedTask(task);
        setMessages([...newMessages, { role: 'assistant', content: 'Here\'s your task — review and confirm below.' }]);
      } else if (data.type === 'message') {
        setMessages([...newMessages, { role: 'assistant', content: data.content }]);
      }
    } catch (err) {
      console.error('Task agent error:', err);
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedTask) return;
    setIsCreating(true);
    try {
      const assignees = parsedTask.assignedTo.length > 0
        ? parsedTask.assignedTo as Id<'users'>[]
        : currentUser?._id ? [currentUser._id] : undefined;

      const taskId = await createTask({
        title: parsedTask.title,
        description: parsedTask.description || undefined,
        dueDate: parsedTask.dueDate || undefined,
        priority: parsedTask.priority,
        clientId: parsedTask.clientId ? parsedTask.clientId as Id<'clients'> : undefined,
        projectId: parsedTask.projectId ? parsedTask.projectId as Id<'projects'> : undefined,
        assignedTo: assignees,
      });
      onTaskCreated(taskId);
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = () => {
    setParsedTask(null);
    setMessages(prev => [...prev, { role: 'user', content: 'I want to make some changes.' }]);
  };

  const clientName = parsedTask?.clientId ? clients?.find(c => c._id === parsedTask.clientId)?.name : undefined;
  const projectName = parsedTask?.projectId ? projects?.find(p => p._id === parsedTask.projectId)?.name : undefined;
  const assigneeNames = parsedTask?.assignedTo.map(id => {
    const u = allUsers?.find(u => u._id === id);
    return u?.name || u?.email || 'You';
  }) || [];

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
        <button onClick={onClose} className="text-sm text-[var(--m-text-tertiary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-[15px] font-bold text-[var(--m-text-primary)]">New Task</span>
        <div className="w-5" />
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages && (
          <div className="px-5 pt-12 pb-6 text-center">
            <div className="w-12 h-12 bg-[var(--m-accent-subtle)] rounded-full flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-[var(--m-accent)]" />
            </div>
            <div className="text-[15px] font-semibold text-[var(--m-text-primary)] mb-1.5">What do you need to do?</div>
            <p className="text-[13px] text-[var(--m-text-tertiary)] leading-relaxed max-w-[280px] mx-auto">
              Tell me what you need to do, when you need to do it, and who you need to do it with.
            </p>
          </div>
        )}

        {hasMessages && (
          <div className="px-4 py-4 space-y-2.5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--m-accent)] text-white rounded-2xl rounded-br-sm'
                    : 'bg-white border border-[var(--m-border)] text-[var(--m-text-primary)] rounded-2xl rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[var(--m-border)] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-[13px] text-[var(--m-text-tertiary)]">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
                  Creating your task...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation card */}
      {parsedTask && (
        <TaskConfirmationCard
          task={parsedTask}
          clientName={clientName}
          projectName={projectName}
          assigneeNames={assigneeNames}
          onConfirm={handleConfirm}
          onEdit={handleEdit}
          isCreating={isCreating}
        />
      )}

      {/* Input area */}
      {!parsedTask && (
        <div className="px-4 pb-4 pt-2">
          <div className={`flex items-end gap-2 bg-white border rounded-xl px-3 py-2 ${
            input ? 'border-[var(--m-accent)]' : 'border-[var(--m-border)]'
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={initialClientName ? `Describe your task for ${initialClientName}...` : 'Describe your task...'}
              rows={1}
              className="flex-1 text-[16px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] resize-none bg-transparent outline-none max-h-[120px]"
              style={{ fieldSizing: 'content' } as any}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                input.trim() ? 'bg-[var(--m-accent)] text-white' : 'bg-[var(--m-border)] text-[var(--m-text-tertiary)]'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
