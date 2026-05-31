'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ArrowLeft, ArrowUp, Calendar, Loader2, Sparkles } from 'lucide-react';
import { IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import CreationModeToggle from './CreationModeToggle';
import EditableConfirmationCard, { type ParsedEvent } from './EditableConfirmationCard';

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

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function TaskCreationFlow({
  onTaskCreated,
  onClose,
  initialClientId,
  initialClientName,
  initialProjectId,
  initialProjectName,
}: TaskCreationFlowProps) {
  const colors = useColors();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedTask, setParsedTask] = useState<ParsedTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mode, setMode] = useState<'task' | 'meeting'>('task');
  const [parsedEvent, setParsedEvent] = useState<ParsedEvent | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});
  const allContacts = useQuery(api.contacts.getAll, {});
  const currentUser = useQuery(api.users.getCurrent, {});
  const createTask = useMutation(api.tasks.create);
  const createEvent = useMutation(api.events.create);
  const googleStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const isGoogleConnected = googleStatus?.isConnected ?? false;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setAddToCalendar(mode === 'meeting' && isGoogleConnected);
  }, [mode, isGoogleConnected]);

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
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
        body: JSON.stringify({ messages: agentMessages, context, mode }),
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
      } else if (data.type === 'event') {
        const event = { ...data.event };
        if (!event.clientId && initialClientId) event.clientId = initialClientId;
        if (!event.projectId && initialProjectId) event.projectId = initialProjectId;
        setParsedEvent(event);
        setMessages([...newMessages, { role: 'assistant', content: 'Here\'s your meeting — review and confirm below.' }]);
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

      // Push to Google Calendar if opted in
      if (addToCalendar && parsedTask.dueDate) {
        try {
          const res = await fetch('/api/google/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: parsedTask.title,
              description: parsedTask.clientId ? `Client task` : undefined,
              startDate: parsedTask.dueDate.split('T')[0],
              allDay: !parsedTask.dueDate.includes('T'),
              startTime: parsedTask.dueDate.includes('T') ? parsedTask.dueDate : undefined,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
          if (res.ok) {
            setToast('Added to Google Calendar');
            setTimeout(() => setToast(null), 3000);
          }
        } catch (err) {
          console.error('Failed to push to Google Calendar:', err);
        }
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmEvent = async () => {
    if (!parsedEvent || !parsedEvent.startTime || !parsedEvent.endTime) return;
    setIsCreating(true);
    try {
      const eventId = await createEvent({
        title: parsedEvent.title,
        description: parsedEvent.description,
        startTime: parsedEvent.startTime,
        endTime: parsedEvent.endTime,
        location: parsedEvent.location,
        clientId: parsedEvent.clientId ? parsedEvent.clientId as Id<'clients'> : undefined,
        projectId: parsedEvent.projectId ? parsedEvent.projectId as Id<'projects'> : undefined,
        attendees: parsedEvent.attendees?.map(id => ({ name: id })),
        reminders: parsedEvent.reminders?.map(r => ({ method: r.method as 'email' | 'popup', minutes: r.minutes })),
        recurrence: parsedEvent.recurrence,
        conferenceData: parsedEvent.videoLink ? { videoLink: parsedEvent.videoLink } : undefined,
      });
      onTaskCreated(String(eventId));

      if (addToCalendar && parsedEvent.startTime) {
        try {
          const res = await fetch('/api/google/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: parsedEvent.title,
              description: parsedEvent.description,
              startTime: parsedEvent.startTime,
              endTime: parsedEvent.endTime,
              allDay: false,
              attendees: parsedEvent.attendees?.map(a => {
                const isEmail = a.includes('@');
                return { email: isEmail ? a : `${a}@unknown`, name: isEmail ? undefined : a };
              }).filter(a => a.email !== '@unknown'),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
          if (res.ok) {
            setToast('Added to Google Calendar');
            setTimeout(() => setToast(null), 3000);
          }
        } catch (err) {
          console.error('Failed to push event to Google Calendar:', err);
        }
      }
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleManualCreate = () => {
    setManualMode(true);
    if (mode === 'task') {
      setParsedTask({ title: '', priority: 'medium', assignedTo: [] });
    } else {
      setParsedEvent({
        title: '',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
      });
    }
  };

  const handleEdit = () => {
    setParsedTask(null);
    setParsedEvent(null);
    setManualMode(false);
    setMessages(prev => [...prev, { role: 'user', content: 'I want to make some changes.' }]);
  };

  const activeClientId = parsedTask?.clientId || parsedEvent?.clientId;
  const activeProjectId = parsedTask?.projectId || parsedEvent?.projectId;
  const clientName = activeClientId ? clients?.find(c => c._id === activeClientId)?.name : undefined;
  const projectName = activeProjectId ? projects?.find(p => p._id === activeProjectId)?.name : undefined;
  const assigneeNames = parsedTask?.assignedTo.map(id => {
    const u = allUsers?.find(u => u._id === id);
    return u?.name || u?.email || 'You';
  }) || [];

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: colors.bg.base }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border.default}` }}>
        <IconButton label="Back" onClick={onClose}>
          <ArrowLeft size={18} />
        </IconButton>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, color: colors.text.primary }}>
          {mode === 'meeting' ? 'New Meeting' : 'New Task'}
        </span>
        <div style={{ width: 28 }} />
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages && (
          <div className="text-center" style={{ padding: '48px 20px 24px' }}>
            <div
              className="flex items-center justify-center mx-auto"
              style={{ width: 48, height: 48, borderRadius: 999, background: `${colors.accent.orange}15`, marginBottom: 12 }}
            >
              <Sparkles size={24} color={colors.accent.orange} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 6 }}>What do you need to do?</div>
            <p style={{ fontSize: 13, color: colors.text.muted, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
              Tell me what you need to do, when you need to do it, and who you need to do it with.
            </p>
          </div>
        )}

        {hasMessages && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    borderRadius: 4,
                    background: msg.role === 'user' ? colors.accent.orange : colors.bg.card,
                    color: msg.role === 'user' ? '#ffffff' : colors.text.primary,
                    border: msg.role === 'user' ? 'none' : `1px solid ${colors.border.default}`,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="flex items-center"
                  style={{ padding: '10px 14px', fontSize: 13, borderRadius: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, color: colors.text.muted, gap: 6 }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  Creating your task...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Google Calendar toggle */}
      {(parsedTask || parsedEvent) && isGoogleConnected && (parsedTask?.dueDate || parsedEvent?.startTime) && (
        <div style={{ padding: '0 16px 8px' }}>
          <button
            onClick={() => setAddToCalendar(!addToCalendar)}
            className="flex items-center gap-2 w-full"
            style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 4, border: `1px solid ${colors.border.default}`, fontSize: 13, background: colors.bg.card, cursor: 'pointer' }}
          >
            <Calendar size={14} color={colors.text.muted} />
            <span className="flex-1 text-left" style={{ color: colors.text.secondary }}>Add to Google Calendar</span>
            <div style={{ width: 32, height: 20, borderRadius: 999, transition: 'background 100ms linear', background: addToCalendar ? colors.accent.green : colors.border.mid }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, background: '#ffffff', marginTop: 2, transition: 'transform 100ms linear', transform: addToCalendar ? 'translateX(14px)' : 'translateX(2px)' }} />
            </div>
          </button>
        </div>
      )}

      {/* Confirmation card */}
      {(parsedTask || parsedEvent) && (
        <EditableConfirmationCard
          mode={mode}
          task={parsedTask || undefined}
          event={parsedEvent || undefined}
          clientName={clientName}
          projectName={projectName}
          assigneeNames={assigneeNames}
          onConfirm={mode === 'task' ? handleConfirm : handleConfirmEvent}
          onEdit={handleEdit}
          isCreating={isCreating}
          onTaskChange={setParsedTask}
          onEventChange={setParsedEvent}
          clients={clients?.map(c => ({ _id: String(c._id), name: c.name })) || []}
          projects={projects?.map(p => ({ _id: String(p._id), name: p.name, clientRoles: p.clientRoles })) || []}
          people={[
            ...(allUsers || []).filter(u => u.email).map(u => ({ name: u.name || u.email, email: u.email, source: 'user' as const })),
            ...(allContacts || []).filter((c: any) => c.email).map((c: any) => ({ name: c.name, email: c.email, source: 'contact' as const })),
          ]}
        />
      )}

      {/* Input area */}
      {!parsedTask && !parsedEvent && (
        <div style={{ padding: '8px 16px 16px' }}>
          <div style={{ marginBottom: 12 }}>
            <CreationModeToggle mode={mode} onModeChange={setMode} />
          </div>
          <div
            className="flex items-end gap-2"
            style={{
              background: colors.bg.card,
              border: `1px solid ${input ? colors.accent.blue : colors.border.default}`,
              borderRadius: 4,
              padding: '8px 12px',
              transition: 'border-color 100ms linear',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={mode === 'meeting'
                ? (initialClientName ? `Describe your meeting for ${initialClientName}...` : 'Describe your meeting...')
                : (initialClientName ? `Describe your task for ${initialClientName}...` : 'Describe your task...')
              }
              rows={1}
              className="flex-1 resize-none"
              style={{ fontSize: 16, color: colors.text.primary, background: 'transparent', border: 'none', outline: 'none', maxHeight: 120, fieldSizing: 'content' } as any}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'background 100ms linear',
                background: input.trim() ? colors.accent.orange : colors.bg.cardAlt,
                color: input.trim() ? '#ffffff' : colors.text.dim,
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
          <button
            onClick={handleManualCreate}
            className="w-full text-center"
            style={{ marginTop: 8, fontSize: 12, color: colors.text.muted, padding: '4px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Skip AI, create manually
          </button>
        </div>
      )}
      {/* Toast */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50"
          style={{ bottom: 96, padding: '8px 16px', background: colors.text.primary, color: colors.bg.card, fontSize: 13, fontWeight: 500, borderRadius: 4 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
