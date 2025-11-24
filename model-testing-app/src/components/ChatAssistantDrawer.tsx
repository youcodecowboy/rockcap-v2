'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Settings2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import ChatHistory from './ChatHistory';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ContextSelector from './ContextSelector';
import ActionConfirmationModal from './ActionConfirmationModal';
import BulkActionConfirmationModal from './BulkActionConfirmationModal';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';

// Context Badge Component
function ContextBadge({
  contextType,
  clientId,
  projectId,
}: {
  contextType: 'global' | 'client' | 'project';
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}) {
  const client = useQuery(api.clients.get, clientId ? { id: clientId } : 'skip');
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : 'skip');
  // Cache query is completely optional - don't block UI, don't wait for it
  // Use a try-catch pattern to handle errors gracefully
  let cache: any = undefined;
  try {
    // Only try to get cache if we have the data, but don't block on it
    if ((contextType === 'client' && clientId) || (contextType === 'project' && projectId)) {
      // We'll fetch this lazily, not blocking the render
    }
  } catch (e) {
    // Ignore cache errors
  }

  if (contextType === 'client' && client) {
    // Don't show counts for now - they can be added later if needed
    return (
      <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
        <div className="text-xs text-blue-700 font-medium">
          Chatting about <span className="font-semibold">{client.name}</span>
        </div>
      </div>
    );
  }

  if (contextType === 'project' && project) {
    return (
      <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
        <div className="text-xs text-blue-700 font-medium">
          Chatting about <span className="font-semibold">{project.name}</span>
        </div>
      </div>
    );
  }

  return null;
}

export default function ChatAssistantDrawer() {
  const router = useRouter();
  const { isOpen, setIsOpen } = useChatDrawer();
  
  const onClose = () => setIsOpen(false);
  const [currentSessionId, setCurrentSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [contextType, setContextType] = useState<'global' | 'client' | 'project'>('global');
  const [contextClientId, setContextClientId] = useState<Id<"clients"> | undefined>();
  const [contextProjectId, setContextProjectId] = useState<Id<"projects"> | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isGatheringContext, setIsGatheringContext] = useState(false);
  const [contextProgress, setContextProgress] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [pendingBulkActions, setPendingBulkActions] = useState<Array<{ id: string; type: string; data: any }>>([]);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [activityMessages, setActivityMessages] = useState<Array<{ activity: string; id: string }>>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Convex mutations
  const createSession = useMutation(api.chatSessions.create);
  const addMessage = useMutation(api.chatMessages.add);
  const createAction = useMutation(api.chatActions.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const deleteSession = useMutation(api.chatSessions.remove);

  // Get sessions to find the most recent one
  const sessions = useQuery(api.chatSessions.list, {
    contextType,
    clientId: contextClientId,
    projectId: contextProjectId,
  });

  // Get messages for current session
  const messages = useQuery(
    api.chatMessages.list,
    currentSessionId ? { sessionId: currentSessionId } : 'skip'
  );

  // Get pending actions
  const pendingActions = useQuery(
    api.chatActions.listPending,
    currentSessionId ? { sessionId: currentSessionId } : 'skip'
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get current session details to restore context
  const currentSession = useQuery(
    api.chatSessions.get,
    currentSessionId ? { id: currentSessionId } : 'skip'
  );

  // Restore context from session when it loads
  useEffect(() => {
    if (currentSession) {
      setContextType(currentSession.contextType);
      setContextClientId(currentSession.clientId);
      setContextProjectId(currentSession.projectId);
    }
  }, [currentSession]);

  // Open most recent session when drawer opens (instead of creating new one)
  useEffect(() => {
    if (isOpen && !currentSessionId && sessions && sessions.length > 0) {
      // Select the most recent session (first in the list since they're ordered desc)
      setCurrentSessionId(sessions[0]._id);
    }
  }, [isOpen, sessions, currentSessionId]);

  const handleNewChat = async () => {
    try {
      const sessionId = await createSession({
        contextType,
        clientId: contextClientId,
        projectId: contextProjectId,
      });
      setCurrentSessionId(sessionId);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleSelectSession = (sessionId: Id<"chatSessions">) => {
    setCurrentSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: Id<"chatSessions">) => {
    try {
      await deleteSession({ id: sessionId });
      // If we deleted the current session, select the most recent one or clear selection
      if (currentSessionId === sessionId) {
        const remainingSessions = sessions?.filter(s => s._id !== sessionId) || [];
        if (remainingSessions.length > 0) {
          setCurrentSessionId(remainingSessions[0]._id);
        } else {
          setCurrentSessionId(null);
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Failed to delete chat. Please try again.');
    }
  };

  const handleFileUpload = async (file: File): Promise<{ storageId: string }> => {
    // Generate upload URL
    const uploadUrl = await generateUploadUrl();
    
    if (!uploadUrl || typeof uploadUrl !== 'string') {
      throw new Error('Invalid upload URL received from Convex');
    }
    
    // Upload file to Convex storage
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      const statusText = uploadResponse.statusText || 'Unknown error';
      const errorText = await uploadResponse.text().catch(() => 'Could not read error response');
      const errorMessage = `Failed to upload file: HTTP ${uploadResponse.status} ${statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`;
      console.error('[ChatAssistantDrawer] Upload failed:', {
        status: uploadResponse.status,
        statusText,
        errorText: errorText.substring(0, 500),
      });
      throw new Error(errorMessage);
    }

    const responseText = await uploadResponse.text();
    let fileStorageId: Id<"_storage">;
    try {
      const responseData = JSON.parse(responseText);
      fileStorageId = responseData.storageId as Id<"_storage">;
    } catch {
      fileStorageId = responseText.trim() as Id<"_storage">;
    }

    return { storageId: fileStorageId };
  };

  const handleSendMessage = async (
    content: string,
    fileMetadata?: { fileName: string; fileStorageId: string; fileSize: number; fileType: string }
  ) => {
    // Create session if it doesn't exist
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
      try {
        sessionIdToUse = await createSession({
          contextType,
          clientId: contextClientId,
          projectId: contextProjectId,
        });
        setCurrentSessionId(sessionIdToUse);
      } catch (error) {
        console.error('Error creating session:', error);
        alert('Failed to create chat session. Please try again.');
        return;
      }
    }
    
    if (!sessionIdToUse) return;

    // Check if this is the first message and we have a context - might need to gather context
    const isFirstMessage = !messages || messages.length === 0;
    const hasContext = contextClientId || contextProjectId;
    
    if (isFirstMessage && hasContext) {
      setIsGatheringContext(true);
      setContextProgress('Checking cache...');
    }

    setIsLoading(true);
    setActivityMessages([]); // Clear previous activity messages

    try {
      // Add user message to database
      await addMessage({
        sessionId: sessionIdToUse,
        role: 'user',
        content,
      });

      // Build conversation history
      const conversationHistory = messages?.map(msg => ({
        role: msg.role,
        content: msg.content,
      })) || [];

      // Update progress
      if (isFirstMessage && hasContext) {
        setContextProgress('Gathering context data...');
      }

      // Call AI assistant API
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionIdToUse,
          message: content,
          clientId: contextClientId,
          projectId: contextProjectId,
          conversationHistory,
          fileMetadata, // Include file metadata if present
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to get AI response: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
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

      // Context gathering is complete
      if (isGatheringContext) {
        setIsGatheringContext(false);
        setContextProgress('');
      }

      // Show activity messages if any
      if (data.activityLog && data.activityLog.length > 0) {
        const activities = data.activityLog.map((log: any, i: number) => ({
          activity: log.activity,
          id: `activity_${Date.now()}_${i}`,
        }));
        setActivityMessages(activities);
        
        // Clear activity messages after a short delay
        setTimeout(() => {
          setActivityMessages([]);
        }, 1000);
      }

      // Add assistant response to database
      const assistantMessageId = await addMessage({
        sessionId: sessionIdToUse,
        role: 'assistant',
        content: data.content,
        toolCalls: data.toolCalls,
        metadata: { tokensUsed: data.tokensUsed },
      });

      // Handle pending actions that require confirmation
      if (data.pendingActions && data.pendingActions.length > 0) {
        const confirmedActions = data.pendingActions.filter((a) => a.requiresConfirmation);
        
        if (confirmedActions.length === 0) {
          // No actions requiring confirmation
          return;
        }

        // If we have multiple actions, treat as bulk operation
        if (confirmedActions.length > 1) {
          const bulkActionIds: Array<{ id: string; type: string; data: any }> = [];
          
          // Create all actions and group them for bulk confirmation
          for (const action of confirmedActions) {
            const actionId = await createAction({
              sessionId: sessionIdToUse,
              messageId: assistantMessageId,
              actionType: action.toolName,
              actionData: action.parameters,
            });
            bulkActionIds.push({
              id: actionId,
              type: action.toolName,
              data: action.parameters,
            });
          }
          
          // Show bulk confirmation modal
          setPendingBulkActions(bulkActionIds);
        } else {
          // Single action - use regular confirmation modal
          const firstAction = confirmedActions[0];
          const actionId = await createAction({
            sessionId: sessionIdToUse,
            messageId: assistantMessageId,
            actionType: firstAction.toolName,
            actionData: firstAction.parameters,
          });
          setPendingAction({
            id: actionId,
            type: firstAction.toolName,
            data: firstAction.parameters,
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      if (sessionIdToUse) {
        await addMessage({
          sessionId: sessionIdToUse,
          role: 'system',
          content: 'Sorry, there was an error processing your request. Please try again.',
        });
      }
    } finally {
      setIsLoading(false);
      setIsGatheringContext(false);
      setContextProgress('');
      setActivityMessages([]); // Clear activity messages
    }
  };

  const handleActionConfirm = async () => {
    if (!pendingAction || !currentSessionId) return;

    setIsLoading(true);

    try {
      // Execute the action via API
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          executeAction: true,
          actionId: pendingAction.id,
        }),
      });

      if (!response.ok) {
        // Try to read the error message from the response
        let errorMessage = 'Failed to execute action';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use the status text
          errorMessage = `${errorMessage}: ${response.statusText}`;
        }
        console.error('Action execution failed:', errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Build success message with link if item ID is provided
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

      // Add success message
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: successMessage,
        metadata: itemLink ? { itemLink, itemId: data.itemId, itemType: data.itemType } : undefined,
      });

      // If item link exists, navigate and close chat
      if (itemLink && data.itemId) {
        setTimeout(() => {
          router.push(itemLink!.url);
          onClose();
        }, 500); // Small delay to show the message
      }

      setPendingAction(null);
    } catch (error) {
      console.error('Error executing action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute action. Please try again.';
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
      const results: Array<{ success: boolean; message: string; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Execute all actions sequentially
      for (const action of pendingBulkActions) {
        try {
          const response = await fetch('/api/chat-assistant', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId: currentSessionId,
              executeAction: true,
              actionId: action.id,
            }),
          });

          if (!response.ok) {
            let errorMessage = 'Failed to execute action';
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch (e) {
              errorMessage = `${errorMessage}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
          }

          const data = await response.json();
          results.push({ success: true, message: data.message || 'Action completed successfully.' });
          successCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to execute action';
          results.push({ success: false, message: errorMessage, error: errorMessage });
          failureCount++;
        }
      }

      // Build summary message
      const actionType = pendingBulkActions[0]?.type || 'actions';
      const actionTypeName = actionType.replace('create', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'items';
      
      let summaryMessage = '';
      if (successCount > 0 && failureCount === 0) {
        summaryMessage = `Successfully created ${successCount} ${actionTypeName}${successCount > 1 ? 's' : ''}.`;
      } else if (successCount > 0 && failureCount > 0) {
        summaryMessage = `Created ${successCount} ${actionTypeName}${successCount > 1 ? 's' : ''}, but ${failureCount} failed.`;
      } else {
        summaryMessage = `Failed to create ${actionTypeName}${pendingBulkActions.length > 1 ? 's' : ''}.`;
      }

      // Add summary message
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: summaryMessage,
      });

      setPendingBulkActions([]);
    } catch (error) {
      console.error('Error executing bulk actions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute bulk actions. Please try again.';
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkActionCancel = () => {
    setPendingBulkActions([]);
  };

  const handleActionCancel = () => {
    setPendingAction(null);
  };

  const handleContextChange = async (
    type: 'global' | 'client' | 'project',
    clientId?: Id<"clients">,
    projectId?: Id<"projects">
  ) => {
    setContextType(type);
    setContextClientId(clientId);
    setContextProjectId(projectId);
    setShowContextSelector(false);
    
    // Create a new session with the new context to persist it
    try {
      const newSessionId = await createSession({
        contextType: type,
        clientId: clientId,
        projectId: projectId,
      });
      setCurrentSessionId(newSessionId);
    } catch (error) {
      console.error('Error creating session with new context:', error);
      // If session creation fails, still allow user to continue
      setCurrentSessionId(null);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[50%] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full relative">
          {/* Chat History Sidebar */}
          {!isSidebarCollapsed && (
            <ChatHistory
              currentSessionId={currentSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
              contextType={contextType}
              clientId={contextClientId}
              projectId={contextProjectId}
            />
          )}

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`absolute top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50 transition-all z-20 shadow-md ${
              isSidebarCollapsed 
                ? 'left-2' 
                : 'left-[248px]'
            }`}
            title={isSidebarCollapsed ? 'Show chat history' : 'Hide chat history'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            )}
          </button>

          {/* Main Chat Interface */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
                <button
                  onClick={() => setShowContextSelector(!showContextSelector)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Change context"
                >
                  <Settings2 className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Context Selector */}
            {showContextSelector && (
              <div className="border-b border-gray-200 p-4 bg-gray-50">
                <ContextSelector
                  currentType={contextType}
                  currentClientId={contextClientId}
                  currentProjectId={contextProjectId}
                  onChange={handleContextChange}
                />
              </div>
            )}

            {/* Context Badge */}
            {(contextType !== 'global' || contextClientId || contextProjectId) && (
              <ContextBadge
                contextType={contextType}
                clientId={contextClientId}
                projectId={contextProjectId}
              />
            )}

            {/* Context Gathering Progress */}
            {isGatheringContext && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-900">
                      Preparing AI context...
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                      {contextProgress || 'Gathering knowledge bank entries, documents, notes, and related data...'}
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      This may take a few moments. You can start typing your message below.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
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
                  {/* Activity Messages */}
                  {activityMessages.map((activity) => (
                    <ChatMessage
                      key={activity.id}
                      role="tool-activity"
                      content={activity.activity}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Welcome to AI Assistant
                    </h3>
                    <p className="text-sm text-gray-500 max-w-md">
                      I can help you manage clients, projects, documents, and more. Just ask me anything!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              onFileSelect={handleFileUpload}
              disabled={isLoading}
              placeholder={
                isLoading 
                  ? 'AI is thinking...' 
                  : isGatheringContext
                  ? 'Preparing context... (you can still type)'
                  : 'Ask me anything...'
              }
            />
          </div>
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
    </>
  );
}

