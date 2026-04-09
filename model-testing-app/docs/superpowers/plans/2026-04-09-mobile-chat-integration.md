# Mobile Chat Assistant Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the full chat assistant from the desktop `ChatAssistantDrawer` into the mobile `ChatOverlay`, including session management, message send/receive, tool call confirmations, file upload, @ mentions, context gathering, and activity logging.

**Architecture:** Replace the current stub `ChatOverlay.tsx` with a full-featured chat panel that reuses existing shared components (`ChatInput`, `ChatMessage`, `ActionConfirmationModal`, `BulkActionConfirmationModal`) and mirrors the desktop drawer's logic flow (session create → message send → API call → response store → action confirm → execute). Mobile-specific adaptations: bottom-sheet layout, `--m-` design tokens, no sidebar history (session management via a dropdown or later addition).

**Tech Stack:** Next.js 16, React, Convex (`useQuery`/`useMutation`), existing `/api/chat-assistant` route (unchanged), Anthropic Claude Haiku 4.5.

**Reference Implementation:** `src/components/ChatAssistantDrawer.tsx` (870 lines)

---

## File Structure

```
src/components/mobile/ChatOverlay.tsx    ← REWRITE: full chat assistant + messenger toggle
```

**Shared components reused as-is (no modifications):**
- `src/components/ChatInput.tsx` — message input with file upload + @ mentions
- `src/components/ChatMessage.tsx` — message rendering with markdown
- `src/components/ActionConfirmationModal.tsx` — single action confirmation
- `src/components/BulkActionConfirmationModal.tsx` — bulk action confirmation

**Convex mutations/queries used (all existing, no new backend work):**
- `api.chatSessions.create` — create new session
- `api.chatSessions.list` — list sessions for context
- `api.chatSessions.get` — get session by ID  
- `api.chatSessions.delete` — delete session
- `api.chatMessages.list` — list messages for session
- `api.chatMessages.add` — add message to session
- `api.chatActions.create` — create pending action
- `api.chatActions.listPending` — list pending actions for session
- `api.storage.generateUploadUrl` — file upload URL

**API route used (existing, no changes):**
- `POST /api/chat-assistant` — send message, receive response + tool calls

---

### Task 1: Core Chat State + Message Display

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 1: Replace the stub with chat session state management**

The ChatOverlay component needs these state variables (mirroring ChatAssistantDrawer):

```typescript
// Session
const [currentSessionId, setCurrentSessionId] = useState<Id<"chatSessions"> | null>(null);
const [contextType, setContextType] = useState<'global' | 'client' | 'project'>('global');

// Loading states
const [isLoading, setIsLoading] = useState(false);
const [isGatheringContext, setIsGatheringContext] = useState(false);
const [contextProgress, setContextProgress] = useState('');

// Actions
const [pendingAction, setPendingAction] = useState<any>(null);
const [pendingBulkActions, setPendingBulkActions] = useState<any[]>([]);
const [activityMessages, setActivityMessages] = useState<Array<{ activity: string; id: string }>>([]);

// Refs
const messagesEndRef = useRef<HTMLDivElement>(null);
const messagesContainerRef = useRef<HTMLDivElement>(null);
```

Convex queries/mutations to hook up:
```typescript
const messages = useQuery(api.chatMessages.list, 
  currentSessionId ? { sessionId: currentSessionId } : 'skip'
);
const createSession = useMutation(api.chatSessions.create);
const addMessage = useMutation(api.chatMessages.add);
const createAction = useMutation(api.chatActions.create);
const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
```

- [ ] **Step 2: Build the message display area**

Layout (bottom-sheet, full height):
```
┌─────────────────────────────┐
│ Assistant    [history] [X]  │ ← header with mode toggle, close
├─────────────────────────────┤
│                             │
│  Message bubbles            │ ← scrollable, auto-scroll to bottom
│  (ChatMessage components)   │
│                             │
│  [Activity indicators]      │ ← ephemeral tool-activity messages
│  [Context gathering msg]    │ ← shown during isGatheringContext
│                             │
├─────────────────────────────┤
│ [ChatInput component]       │ ← fixed at bottom, above safe area
└─────────────────────────────┘
```

Messages area: map over `messages` array, render `<ChatMessage>` for each. Include activity messages at the bottom when present. Auto-scroll via `messagesEndRef.scrollIntoView()` on new messages.

Adapt ChatMessage styling for mobile: the component already uses generic classes, but wrap it in a container that constrains max-width to the mobile viewport.

- [ ] **Step 3: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): chat overlay — session state + message display"
```

---

### Task 2: Send Message Flow

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 1: Implement handleSendMessage**

Port the send flow from ChatAssistantDrawer lines 243-432. The flow:

1. If no session exists, create one via `createSession({ contextType, clientId?, projectId? })`
2. Store user message via `addMessage({ sessionId, role: 'user', content: message })`
3. If file metadata exists, include in the API call
4. Set `isLoading = true`
5. POST to `/api/chat-assistant`:
   ```typescript
   const response = await fetch('/api/chat-assistant', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       sessionId: currentSessionId,
       message,
       clientId: contextClientId,
       projectId: contextProjectId,
       conversationHistory: messages
         .filter(m => m.role === 'user' || m.role === 'assistant')
         .map(m => ({ role: m.role, content: m.content })),
       fileMetadata,
       mentions,
     }),
   });
   ```
6. Parse response JSON
7. Store assistant response via `addMessage({ sessionId, role: 'assistant', content: data.content, toolCalls: data.toolCalls, metadata: { tokensUsed: data.tokensUsed } })`
8. If `data.activityLog` exists, show activity messages (ephemeral, clear after 1s)
9. If `data.pendingActions` exists:
   - Single action: `createAction()`, set `pendingAction`
   - Multiple: create all, set `pendingBulkActions`
10. Set `isLoading = false`

- [ ] **Step 2: Wire ChatInput's onSend to handleSendMessage**

```tsx
<ChatInput
  onSend={handleSendMessage}
  disabled={isLoading}
  placeholder="Message assistant..."
  onFileSelect={handleFileUpload}
/>
```

- [ ] **Step 3: Implement handleFileUpload**

```typescript
const handleFileUpload = async (file: File) => {
  const uploadUrl = await generateUploadUrl();
  const result = await fetch(uploadUrl, { method: 'POST', body: file });
  const { storageId } = await result.json();
  return { storageId, fileName: file.name, fileSize: file.size, fileType: file.type };
};
```

- [ ] **Step 4: Build and verify, commit**

```bash
git commit -m "feat(mobile): chat overlay — send message + file upload"
```

---

### Task 3: Action Confirmation Flow

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 1: Implement action confirmation handling**

When the API returns `pendingActions`, show the confirmation modal. Port from ChatAssistantDrawer lines 434-530.

```typescript
const handleActionConfirm = async (actionId: string) => {
  setIsLoading(true);
  try {
    const response = await fetch('/api/chat-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        executeAction: true,
        actionId,
      }),
    });
    const data = await response.json();
    // Store success message
    await addMessage({
      sessionId: currentSessionId!,
      role: 'system',
      content: data.message || 'Action completed successfully',
      metadata: data.itemId ? { itemId: data.itemId, itemType: data.itemType } : undefined,
    });
  } catch (error) {
    await addMessage({
      sessionId: currentSessionId!,
      role: 'system',
      content: `Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  } finally {
    setPendingAction(null);
    setPendingBulkActions([]);
    setIsLoading(false);
  }
};

const handleActionCancel = () => {
  setPendingAction(null);
  setPendingBulkActions([]);
};
```

- [ ] **Step 2: Render confirmation modals**

```tsx
{pendingAction && (
  <ActionConfirmationModal
    action={pendingAction}
    onConfirm={() => handleActionConfirm(pendingAction.id)}
    onCancel={handleActionCancel}
    isExecuting={isLoading}
  />
)}
{pendingBulkActions.length > 0 && (
  <BulkActionConfirmationModal
    actions={pendingBulkActions}
    onConfirm={(actionId) => handleActionConfirm(actionId)}
    onCancel={handleActionCancel}
    isExecuting={isLoading}
  />
)}
```

- [ ] **Step 3: Build and verify, commit**

```bash
git commit -m "feat(mobile): chat overlay — action confirmation flow"
```

---

### Task 4: Session Management + New Chat

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 1: Implement session loading and new chat**

On open, load the most recent session for the current context:
```typescript
const sessions = useQuery(api.chatSessions.list, { contextType });

useEffect(() => {
  if (sessions && sessions.length > 0 && !currentSessionId) {
    setCurrentSessionId(sessions[0]._id);
  }
}, [sessions, currentSessionId]);
```

New chat button in the header:
```typescript
const handleNewChat = () => {
  setCurrentSessionId(null);
  // Session will be created on first message send
};
```

- [ ] **Step 2: Add a minimal session picker**

Instead of the full ChatHistory sidebar, add a simple dropdown or bottom-sheet session list. When tapped, show recent sessions (last 10) with title + date. Tapping one switches `currentSessionId`.

This can be a simple `useState<boolean>(false)` for showing/hiding the session list, rendered as an overlay inside the chat panel.

- [ ] **Step 3: Build and verify, commit**

```bash
git commit -m "feat(mobile): chat overlay — session management + new chat"
```

---

### Task 5: Context Gathering + Activity Messages + Polish

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 1: Context gathering UI**

When `isGatheringContext` is true, show a progress indicator at the bottom of the messages area:
```tsx
{isGatheringContext && (
  <div className="flex items-center gap-2 px-4 py-2">
    <Loader2 className="w-4 h-4 animate-spin text-[var(--m-accent-indicator)]" />
    <span className="text-[12px] text-[var(--m-text-tertiary)]">{contextProgress || 'Gathering context...'}</span>
  </div>
)}
```

- [ ] **Step 2: Activity messages (ephemeral tool-activity indicators)**

When the API returns `activityLog`, show each activity as a temporary message:
```typescript
if (data.activityLog?.length > 0) {
  const activities = data.activityLog.map((a: any) => ({
    activity: a.activity,
    id: `activity-${Date.now()}-${Math.random()}`,
  }));
  setActivityMessages(activities);
  // Clear after response is fully processed
  setTimeout(() => setActivityMessages([]), 1500);
}
```

Render activity messages at the bottom of the message list:
```tsx
{activityMessages.map(msg => (
  <ChatMessage key={msg.id} role="tool-activity" content={msg.activity} />
))}
```

- [ ] **Step 3: Auto-scroll on new messages**

```typescript
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, activityMessages, isLoading]);
```

- [ ] **Step 4: Mobile styling polish**

Ensure the chat overlay:
- Takes up the full viewport (below the header)
- Has proper safe-area padding at the bottom for iOS
- Messages area is scrollable with momentum scrolling
- Input is fixed at the bottom, never pushed off screen by keyboard
- Close button works and resets state appropriately
- Mode toggle (assistant/messenger) preserved from current implementation

- [ ] **Step 5: Final build and commit**

```bash
npx next build 2>&1 | tail -5
git commit -m "feat(mobile): chat overlay — context gathering + activity + polish"
```

---

## Task Summary

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | Core chat state + message display | Medium — state setup + render |
| 2 | Send message flow + file upload | High — API integration + error handling |
| 3 | Action confirmation flow | Medium — modal integration |
| 4 | Session management + new chat | Medium — Convex queries + session picker |
| 5 | Context gathering + activity + polish | Medium — UI polish + ephemeral messages |

**Total: 5 tasks, sequential** (each builds on the previous). No parallelization — this is a single component being built up incrementally.

**Key principle:** We are porting working logic from `ChatAssistantDrawer.tsx`, not inventing new patterns. Every API call, mutation, and state transition should match the desktop implementation. The only changes are: (1) layout adapted to mobile bottom-sheet, (2) styling uses `--m-` tokens, (3) no sidebar history (replaced with minimal session picker).
