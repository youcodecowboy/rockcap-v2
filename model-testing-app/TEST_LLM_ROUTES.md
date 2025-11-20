# LLM Routes Test Script

This script tests all LLM-related API routes to ensure Clerk authentication is working.

## Routes to Test:

### 1. ✅ `/api/analyze-file` - Already tested and working!

### 2. `/api/chat-assistant` - Chat with AI assistant
**Test:** Open the chat assistant (bottom right icon) and send a message

### 3. `/api/ai-assistant` - AI note generation  
**Test:** Create/edit a note and use AI features

### 4. `/api/extract-prospecting-context` - Extract prospecting data
**Test:** Upload a file that contains prospecting information

## Quick Test Commands:

You can test these routes directly from the browser console or using curl:

```javascript
// Test chat-assistant
fetch('/api/chat-assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'test-session',
    message: 'Hello, test message',
    conversationHistory: []
  })
}).then(r => r.json()).then(console.log);

// Test ai-assistant  
fetch('/api/ai-assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Test prompt',
    noteId: null,
    clientId: null,
    projectId: null
  })
}).then(r => r.json()).then(console.log);
```

## Expected Results:
- All routes should return 200 OK (not 401 Unauthenticated)
- Responses should contain valid data
- No "Unauthenticated" errors in console

