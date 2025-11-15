'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Settings2 } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import ChatHistory from './ChatHistory';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ContextSelector from './ContextSelector';
import ActionConfirmationModal from './ActionConfirmationModal';

interface ChatAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatAssistantDrawer({ isOpen, onClose }: ChatAssistantDrawerProps) {
  const [currentSessionId, setCurrentSessionId] = useState<Id<"chatSessions"> | null>(null);
  const [contextType, setContextType] = useState<'global' | 'client' | 'project'>('global');
  const [contextClientId, setContextClientId] = useState<Id<"clients"> | undefined>();
  const [contextProjectId, setContextProjectId] = useState<Id<"projects"> | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [activityMessages, setActivityMessages] = useState<Array<{ activity: string; id: string }>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Convex mutations
  const createSession = useMutation(api.chatSessions.create);
  const addMessage = useMutation(api.chatMessages.add);
  const createAction = useMutation(api.chatActions.create);

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

  // Create initial session when drawer opens
  useEffect(() => {
    if (isOpen && !currentSessionId) {
      handleNewChat();
    }
  }, [isOpen]);

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

  const handleSendMessage = async (content: string) => {
    if (!currentSessionId) return;

    setIsLoading(true);
    setActivityMessages([]); // Clear previous activity messages

    try {
      // Add user message to database
      await addMessage({
        sessionId: currentSessionId,
        role: 'user',
        content,
      });

      // Build conversation history
      const conversationHistory = messages?.map(msg => ({
        role: msg.role,
        content: msg.content,
      })) || [];

      // Call AI assistant API
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message: content,
          clientId: contextClientId,
          projectId: contextProjectId,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to get AI response: ${response.status} ${errorText}`);
      }

      const data = await response.json();

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
        sessionId: currentSessionId,
        role: 'assistant',
        content: data.content,
        toolCalls: data.toolCalls,
        metadata: { tokensUsed: data.tokensUsed },
      });

      // Handle pending actions that require confirmation
      if (data.pendingActions && data.pendingActions.length > 0) {
        for (const action of data.pendingActions) {
          if (action.requiresConfirmation) {
            // Create pending action in database
            const actionId = await createAction({
              sessionId: currentSessionId,
              messageId: assistantMessageId,
              actionType: action.toolName,
              actionData: action.parameters,
            });

            // Show confirmation modal for the first action
            setPendingAction({
              id: actionId,
              type: action.toolName,
              data: action.parameters,
            });
            break; // Only show one at a time
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: 'Sorry, there was an error processing your request. Please try again.',
      });
    } finally {
      setIsLoading(false);
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
        throw new Error('Failed to execute action');
      }

      const data = await response.json();

      // Add success message
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: data.message || 'Action completed successfully.',
      });

      setPendingAction(null);
    } catch (error) {
      console.error('Error executing action:', error);
      await addMessage({
        sessionId: currentSessionId,
        role: 'system',
        content: 'Failed to execute action. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionCancel = () => {
    setPendingAction(null);
  };

  const handleContextChange = (
    type: 'global' | 'client' | 'project',
    clientId?: Id<"clients">,
    projectId?: Id<"projects">
  ) => {
    setContextType(type);
    setContextClientId(clientId);
    setContextProjectId(projectId);
    setCurrentSessionId(null); // Reset session when context changes
    setShowContextSelector(false);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${
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
        <div className="flex h-full">
          {/* Chat History Sidebar */}
          <ChatHistory
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            contextType={contextType}
            clientId={contextClientId}
            projectId={contextProjectId}
          />

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
              <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
                <div className="text-xs text-blue-700">
                  {contextType === 'client' && contextClientId && 'Chatting about a specific client'}
                  {contextType === 'project' && contextProjectId && 'Chatting about a specific project'}
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
              disabled={isLoading || !currentSessionId}
              placeholder={isLoading ? 'AI is thinking...' : 'Ask me anything...'}
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

