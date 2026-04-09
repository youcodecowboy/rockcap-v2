'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, BotMessageSquare, Loader2, History, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useTabs } from '@/contexts/TabContext';
import { useMessenger } from '@/contexts/MessengerContext';
import ModeToggle from '@/components/chat/ModeToggle';
import MessengerPanel from '@/components/chat/MessengerPanel';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import ActionConfirmationModal from '@/components/ActionConfirmationModal';
import BulkActionConfirmationModal from '@/components/BulkActionConfirmationModal';
import { parseMentions } from '@/lib/chat/mentionParser';

export default function ChatOverlay() {
  const router = useRouter();
  const { tabs, activeTabId } = useTabs();
  const { mode, isChatOpen, setChatOpen } = useMessenger();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isOpen = isChatOpen;
  const onClose = () => setChatOpen(false);

  // ── Core state ──
  const [currentSessionId, setCurrentSessionId] = useState<Id<'chatSessions'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [pendingBulkActions, setPendingBulkActions] = useState<
    Array<{ id: string; type: string; data: any }>
  >([]);
  const [activityMessages, setActivityMessages] = useState<
    Array<{ activity: string; id: string }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // ── Convex mutations ──
  const createSession = useMutation(api.chatSessions.create);
  const addMessage = useMutation(api.chatMessages.add);
  const createAction = useMutation(api.chatActions.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const deleteSession = useMutation(api.chatSessions.remove);

  // ── Convex queries ──
  const unreadMessages = useQuery(api.conversations.getUnreadCount, {});

  const sessions = useQuery(api.chatSessions.list, {
    contextType: 'global' as const,
  });

  const messages = useQuery(
    api.chatMessages.list,
    currentSessionId ? { sessionId: currentSessionId } : 'skip'
  );

  // ── Lock body scroll when open ──
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ── Auto-load most recent session on open ──
  useEffect(() => {
    if (isOpen && !currentSessionId && sessions && sessions.length > 0) {
      setCurrentSessionId(sessions[0]._id);
    }
  }, [isOpen, sessions, currentSessionId]);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activityMessages, isLoading]);

  // ── Close history dropdown on outside click ──
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  // ── Handlers ──

  const handleNewChat = async () => {
    try {
      const sessionId = await createSession({ contextType: 'global' });
      setCurrentSessionId(sessionId);
      setShowHistory(false);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleSelectSession = (sessionId: Id<'chatSessions'>) => {
    setCurrentSessionId(sessionId);
    setShowHistory(false);
  };

  const handleDeleteSession = async (sessionId: Id<'chatSessions'>) => {
    try {
      await deleteSession({ id: sessionId });
      if (currentSessionId === sessionId) {
        const remaining = sessions?.filter((s) => s._id !== sessionId) || [];
        setCurrentSessionId(remaining.length > 0 ? remaining[0]._id : null);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleFileUpload = async (file: File): Promise<{ storageId: string }> => {
    const uploadUrl = await generateUploadUrl();
    if (!uploadUrl || typeof uploadUrl !== 'string') {
      throw new Error('Invalid upload URL received');
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: HTTP ${uploadResponse.status}`);
    }

    const responseText = await uploadResponse.text();
    let fileStorageId: string;
    try {
      const responseData = JSON.parse(responseText);
      fileStorageId = responseData.storageId;
    } catch {
      fileStorageId = responseText.trim();
    }

    return { storageId: fileStorageId };
  };

  const handleSendMessage = async (
    content: string,
    fileMetadata?: { fileName: string; fileStorageId: string; fileSize: number; fileType: string }
  ) => {
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
      try {
        sessionIdToUse = await createSession({ contextType: 'global' });
        setCurrentSessionId(sessionIdToUse);
      } catch (error) {
        console.error('Error creating session:', error);
        return;
      }
    }
    if (!sessionIdToUse) return;

    setIsLoading(true);
    setActivityMessages([]);

    try {
      // Store user message
      await addMessage({
        sessionId: sessionIdToUse,
        role: 'user',
        content,
      });

      // Build conversation history (exclude system messages)
      const conversationHistory =
        messages
          ?.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg) => ({ role: msg.role, content: msg.content })) || [];

      // Call assistant API
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdToUse,
          message: content,
          conversationHistory,
          fileMetadata,
          mentions: parseMentions(content),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to get AI response: ${response.status}`);
      }

      const data = (await response.json()) as {
        content: string;
        toolCalls?: any[];
        tokensUsed?: number;
        activityLog?: Array<{ activity: string; timestamp: string }>;
        pendingActions?: Array<{
          toolName: string;
          parameters: any;
          requiresConfirmation: boolean;
        }>;
      };

      // Show activity messages
      if (data.activityLog && data.activityLog.length > 0) {
        const activities = data.activityLog.map((log, i) => ({
          activity: log.activity,
          id: `activity_${Date.now()}_${i}`,
        }));
        setActivityMessages(activities);
        setTimeout(() => setActivityMessages([]), 1000);
      }

      // Store assistant response
      const formattedToolCalls = data.toolCalls?.map((tc: any, i: number) => ({
        id: `tool_${Date.now()}_${i}`,
        name: tc.name,
        arguments: JSON.stringify(tc.input || {}),
      }));
      const assistantMessageId = await addMessage({
        sessionId: sessionIdToUse,
        role: 'assistant',
        content: data.content,
        toolCalls: formattedToolCalls,
        metadata: { tokensUsed: data.tokensUsed },
      });

      // Handle pending actions
      if (data.pendingActions && data.pendingActions.length > 0) {
        const confirmedActions = data.pendingActions.filter((a) => a.requiresConfirmation);

        if (confirmedActions.length > 1) {
          const bulkActionIds: Array<{ id: string; type: string; data: any }> = [];
          for (const action of confirmedActions) {
            const actionId = await createAction({
              sessionId: sessionIdToUse,
              messageId: assistantMessageId,
              actionType: action.toolName,
              actionData: action.parameters,
            });
            bulkActionIds.push({ id: actionId, type: action.toolName, data: action.parameters });
          }
          setPendingBulkActions(bulkActionIds);
        } else if (confirmedActions.length === 1) {
          const firstAction = confirmedActions[0];
          const actionId = await createAction({
            sessionId: sessionIdToUse,
            messageId: assistantMessageId,
            actionType: firstAction.toolName,
            actionData: firstAction.parameters,
          });
          setPendingAction({ id: actionId, type: firstAction.toolName, data: firstAction.parameters });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (sessionIdToUse) {
        await addMessage({
          sessionId: sessionIdToUse,
          role: 'system',
          content: 'Sorry, there was an error processing your request. Please try again.',
        });
      }
    } finally {
      setIsLoading(false);
      setActivityMessages([]);
    }
  };

  const handleActionConfirm = async () => {
    if (!pendingAction || !currentSessionId) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          executeAction: true,
          actionId: pendingAction.id,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to execute action';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `${errorMessage}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      let successMessage = data.message || 'Action completed successfully.';
      let itemLink: { url: string; text: string } | null = null;

      if (data.itemId && data.itemType) {
        switch (data.itemType) {
          case 'note':
            itemLink = { url: `/notes?note=${data.itemId}`, text: 'View Note' };
            break;
          case 'client':
            itemLink = { url: `/clients/${data.itemId}`, text: 'View Client' };
            break;
          case 'project':
            itemLink = { url: `/projects/${data.itemId}`, text: 'View Project' };
            break;
          case 'contact':
            itemLink = { url: `/rolodex?contact=${data.itemId}`, text: 'View Contact' };
            break;
          case 'document':
            itemLink = { url: `/docs/${data.itemId}`, text: 'View Document' };
            break;
          case 'knowledgeBankEntry':
            if (data.clientId) {
              itemLink = { url: `/knowledge-bank/${data.clientId}`, text: 'View Knowledge Bank Entry' };
            }
            break;
        }
      }

      if (itemLink) {
        successMessage += ` [${itemLink.text}](${itemLink.url})`;
      }

      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: successMessage,
        metadata: itemLink ? { itemLink, itemId: data.itemId, itemType: data.itemType } : undefined,
      });

      if (itemLink && data.itemId) {
        setTimeout(() => {
          router.push(itemLink!.url);
          onClose();
        }, 500);
      }

      setPendingAction(null);
    } catch (error) {
      console.error('Error executing action:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to execute action. Please try again.';
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkActionConfirm = async () => {
    if (!pendingBulkActions || pendingBulkActions.length === 0 || !currentSessionId) return;
    setIsLoading(true);

    try {
      let successCount = 0;
      let failureCount = 0;

      for (const action of pendingBulkActions) {
        try {
          const response = await fetch('/api/chat-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: currentSessionId,
              executeAction: true,
              actionId: action.id,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed');
          }
          successCount++;
        } catch {
          failureCount++;
        }
      }

      const actionType = pendingBulkActions[0]?.type || 'actions';
      const actionTypeName =
        actionType
          .replace('create', '')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase() || 'items';

      let summaryMessage = '';
      if (successCount > 0 && failureCount === 0) {
        summaryMessage = `Successfully created ${successCount} ${actionTypeName}${successCount > 1 ? 's' : ''}.`;
      } else if (successCount > 0 && failureCount > 0) {
        summaryMessage = `Created ${successCount} ${actionTypeName}${successCount > 1 ? 's' : ''}, but ${failureCount} failed.`;
      } else {
        summaryMessage = `Failed to create ${actionTypeName}${pendingBulkActions.length > 1 ? 's' : ''}.`;
      }

      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: summaryMessage,
      });

      setPendingBulkActions([]);
    } catch (error) {
      console.error('Error executing bulk actions:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to execute bulk actions.';
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionCancel = () => setPendingAction(null);
  const handleBulkActionCancel = () => setPendingBulkActions([]);

  // ── Render ──

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />

        {/* Bottom-sheet panel */}
        <div className="relative mt-auto h-[85vh] bg-[var(--m-bg)] rounded-t-xl flex flex-col z-10 shadow-2xl">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
          </div>

          {/* Header with mode toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--m-border)]">
            <ModeToggle unreadMessageCount={unreadMessages ?? 0} variant="mobile" />
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── ASSISTANT MODE ── */}
          {mode === 'assistant' && (
            <>
              {/* Sub-header: title + history + new chat */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--m-border-subtle)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-[var(--m-accent)] rounded-md flex items-center justify-center">
                    <BotMessageSquare className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[var(--m-text-primary)]">
                      Assistant
                    </div>
                    {activeTab && activeTab.type !== 'dashboard' && (
                      <div className="text-[11px] text-[var(--m-text-tertiary)]">
                        {activeTab.title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 relative" ref={historyRef}>
                  <button
                    onClick={handleNewChat}
                    className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
                    title="New chat"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
                    title="Chat history"
                  >
                    <History className="w-4 h-4" />
                  </button>

                  {/* History dropdown */}
                  {showHistory && sessions && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--m-bg)] border border-[var(--m-border)] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                      {sessions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">
                          No previous chats
                        </div>
                      ) : (
                        sessions.map((session) => (
                          <div
                            key={session._id}
                            className={`flex items-center justify-between px-3 py-2.5 border-b border-[var(--m-border-subtle)] last:border-b-0 ${
                              currentSessionId === session._id
                                ? 'bg-[var(--m-accent)]/10'
                                : ''
                            }`}
                          >
                            <button
                              onClick={() => handleSelectSession(session._id)}
                              className="flex-1 text-left min-w-0"
                            >
                              <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">
                                {session.title || 'New Chat'}
                              </div>
                              <div className="text-[10px] text-[var(--m-text-tertiary)]">
                                {new Date(session.createdAt).toLocaleDateString()}
                              </div>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(session._id);
                              }}
                              className="p-1 text-[var(--m-text-tertiary)] active:text-red-500 ml-2 flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages area */}
              <div
                className="flex-1 overflow-y-auto px-4 py-4"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {messages && messages.length > 0 ? (
                  <>
                    {messages.map((message) => (
                      <ChatMessage
                        key={message._id}
                        role={message.role}
                        content={message.content}
                        timestamp={message.createdAt}
                        tokensUsed={message.metadata?.tokensUsed}
                        metadata={message.metadata}
                      />
                    ))}
                    {/* Activity messages */}
                    {activityMessages.map((activity) => (
                      <ChatMessage
                        key={activity.id}
                        role="tool-activity"
                        content={activity.activity}
                      />
                    ))}
                    {/* Thinking indicator */}
                    {isLoading && <ChatMessage role="assistant" content="" isThinking={true} />}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="flex flex-col h-full">
                    {!isLoading && (
                      <div className="flex items-center justify-center flex-1">
                        <div className="text-center">
                          <div className="text-[13px] font-medium text-[var(--m-text-primary)] mb-1">
                            AI Assistant
                          </div>
                          <div className="text-[var(--m-text-tertiary)] text-[12px] max-w-[240px]">
                            I can help you manage clients, projects, documents, and more. Just ask!
                          </div>
                        </div>
                      </div>
                    )}
                    {isLoading && (
                      <div className="pt-4">
                        <ChatMessage role="assistant" content="" isThinking={true} />
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="border-t border-[var(--m-border)] pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <ChatInput
                  onSend={handleSendMessage}
                  onFileSelect={handleFileUpload}
                  disabled={isLoading}
                  placeholder={isLoading ? 'AI is thinking...' : 'Ask me anything...'}
                />
              </div>
            </>
          )}

          {/* ── MESSENGER MODE ── */}
          {mode === 'messenger' && <MessengerPanel variant="mobile" />}
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {pendingAction && (
        <ActionConfirmationModal
          action={pendingAction}
          onConfirm={handleActionConfirm}
          onCancel={handleActionCancel}
          isExecuting={isLoading}
        />
      )}

      {/* Bulk Action Confirmation Modal */}
      {pendingBulkActions.length > 0 && (
        <BulkActionConfirmationModal
          actions={pendingBulkActions}
          onConfirm={handleBulkActionConfirm}
          onCancel={handleBulkActionCancel}
          isExecuting={isLoading}
        />
      )}
    </>
  );
}
