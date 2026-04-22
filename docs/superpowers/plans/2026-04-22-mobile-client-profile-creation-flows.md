# Mobile Client Profile — Rich Creation Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four rudimentary creation flows (Notes, Tasks, Projects, Flags) on the mobile client profile with richer experiences — two by wiring existing components, two by building new slide-up sheets.

**Architecture:** Two shipping batches. Batch A deletes two inline forms in `app/(tabs)/clients/[clientId]/index.tsx` and re-points the buttons at existing components (`/notes/editor` route and `TaskCreationFlow` modal). Batch B adds two new components (`FlagCreationSheet`, `ProjectCreationSheet`) and one pure-logic utility (`shortcodeUtils.ts`), then wires them into the remaining two tabs. Both batches use React Native's stock `Modal` with `presentationStyle="pageSheet"` — no new dependencies.

**Tech Stack:** Expo Router, React Native 0.81, NativeWind (Tailwind), Convex, TypeScript. `@/components/RichTextEditor` (Tiptap WebView), `@/components/TaskCreationFlow`, `@/components/PeoplePicker`.

**Related spec:** [docs/superpowers/specs/2026-04-22-mobile-client-profile-rich-creation-flows-design.md](../specs/2026-04-22-mobile-client-profile-rich-creation-flows-design.md)

**Testing note:** `mobile-app/` has no Jest/RNTL configured today. Each task uses `npx tsc --noEmit` (from `mobile-app/`) as the static check and explicit manual-verification steps. Adding test infrastructure is explicitly out of scope.

---

## BATCH A — Notes + Tasks wiring (PR 1)

Three tasks. Deletes ~120 lines of inline-form code, adds ~30 lines of navigation/component wiring. One new URL param on an existing route.

### Task A1: Add `clientId` URL param support to `/notes/editor`

The editor already has full `selectedClientId` state and passes `clientId` to `notes.create` (see [mobile-app/app/notes/editor.tsx:97](../../mobile-app/app/notes/editor.tsx) and 206-210). It just doesn't read the value from the URL — so opening `/notes/editor?clientId=xxx` currently ignores the param. Fix: accept `clientId` from `useLocalSearchParams` and initialize `selectedClientId` from it.

**Files:**
- Modify: `mobile-app/app/notes/editor.tsx`

- [ ] **Step 1: Update `useLocalSearchParams` destructure to include `clientId`**

In [mobile-app/app/notes/editor.tsx:87](../../mobile-app/app/notes/editor.tsx), replace:

```tsx
const { noteId } = useLocalSearchParams<{ noteId?: string }>();
```

with:

```tsx
const { noteId, clientId: preselectedClientId } = useLocalSearchParams<{ noteId?: string; clientId?: string }>();
```

We rename the destructured variable to `preselectedClientId` to avoid colliding with any existing `clientId` variable in scope. (`selectedClientId` is the mutable state we'll seed from it.)

- [ ] **Step 2: Seed `selectedClientId` from the URL param**

At [mobile-app/app/notes/editor.tsx:97](../../mobile-app/app/notes/editor.tsx), replace:

```tsx
const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
```

with:

```tsx
const [selectedClientId, setSelectedClientId] = useState<string | null>(preselectedClientId ?? null);
```

This preloads the client scope for *new* notes arriving with `?clientId=xxx`. For existing-note edits (noteId present), the existing `useEffect` at line 152 already overwrites `selectedClientId` from the loaded note — unchanged behavior.

- [ ] **Step 3: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. The file currently has a few `as any` casts; the change above doesn't introduce any new ones.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/app/notes/editor.tsx
git commit -m "feat(mobile): note editor accepts clientId URL param for pre-scoping

Adds preselectedClientId from useLocalSearchParams, seeds the
selectedClientId state from it. Enables deep-linking into a new-note
editor already scoped to a specific client — used by the client
profile Notes tab to open a full-screen editor instead of the inline
TextInput it had before."
```

---

### Task A2: Replace inline Notes form with navigation to `/notes/editor`

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Delete the inline-form state declarations**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1425-1428](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete:

```tsx
  // Notes form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
```

- [ ] **Step 2: Delete the `handleSaveNote` handler**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1697-1711](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete the entire function:

```tsx
  const handleSaveNote = async () => {
    if (!noteTitle.trim()) return;
    try {
      await createNote({
        title: noteTitle.trim(),
        content: noteBody.trim(),
        clientId: clientId as any,
      });
      setNoteTitle('');
      setNoteBody('');
      setShowNoteForm(false);
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  };
```

After this step, `createNote` (a `useMutation(api.notes.create)` binding elsewhere in the file) may become unused. Grep to confirm — if it's also used by other handlers, keep it; if not, delete its declaration. If TypeScript complains of unused variable in Step 5, that's the trigger.

- [ ] **Step 3: Replace the Notes tab JSX**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:2730-2835](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), find the block starting with `{activeTab === 'Notes' && (` and replace its contents with:

```tsx
        {activeTab === 'Notes' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/notes/editor', params: { clientId: clientId as string } })}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">Add Note</Text>
            </TouchableOpacity>

            {notes && notes.length > 0 ? (
              notes.map((n: any) => {
                const preview = extractPlainText(n.content);
                const truncatedPreview = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
                const noteDate = n.updatedAt ?? n.createdAt ?? n._creationTime;

                return (
                  <TouchableOpacity
                    key={n._id}
                    onPress={() => router.push({ pathname: '/notes/editor', params: { noteId: n._id } })}
                    activeOpacity={0.7}
                  >
                    <Card>
                      <View className="flex-row items-start gap-2">
                        {n.emoji ? (
                          <Text className="text-lg">{n.emoji}</Text>
                        ) : null}
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-m-text-primary">
                            {n.title || 'Untitled'}
                          </Text>
                          {truncatedPreview ? (
                            <Text className="text-xs text-m-text-secondary mt-1" numberOfLines={2}>
                              {truncatedPreview}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Tags */}
                      {n.tags && n.tags.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1 mt-2">
                          {n.tags.map((tag: string, i: number) => (
                            <View key={i} className="bg-m-accent/15 px-2 py-0.5 rounded-full">
                              <Text className="text-[10px] font-medium text-m-accent">{tag}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {/* Footer: date and word count */}
                      <View className="flex-row items-center justify-between mt-2">
                        {noteDate ? (
                          <Text className="text-[10px] text-m-text-tertiary">
                            {new Date(noteDate).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                        ) : <View />}
                        {n.wordCount ? (
                          <Text className="text-[10px] text-m-text-tertiary">
                            {n.wordCount} words
                          </Text>
                        ) : null}
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })
            ) : (
              <EmptyState message="No notes yet" />
            )}
          </View>
        )}
```

Key differences from the previous JSX:
- `Add Note` button navigates to the full editor route with the current `clientId` param, instead of toggling an inline form.
- Each note card is now wrapped in a `TouchableOpacity` that opens the editor in edit mode for that note (`params: { noteId: n._id }`).
- The inline form `<Card>` block is gone.
- The `!showNoteForm` conditional guard around the empty state is gone (the state no longer exists).

- [ ] **Step 4: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. If TS complains that `createNote` (or any other deleted state variable) is now unused, delete the offending declaration and re-run.

- [ ] **Step 5: Commit**

```bash
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): client profile Notes tab uses full editor

Delete the inline TextInput note form and its state/handler. Add Note
button now navigates to /notes/editor with clientId prefilled. Each
existing note card is tappable — opens the editor in edit mode.
Matches the 'real Notion-style editor' experience the task file calls
for."
```

---

### Task A3: Replace inline Tasks form with `TaskCreationFlow` modal

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Delete the inline-form state declarations**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1430-1433](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete:

```tsx
  // Tasks form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
```

- [ ] **Step 2: Add replacement state for the modal**

In the same block (right where the old three lines were), add:

```tsx
  // Tasks creation modal
  const [showTaskCreation, setShowTaskCreation] = useState(false);
```

- [ ] **Step 3: Delete the `handleSaveTask` handler**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1713-1727](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete the entire function:

```tsx
  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await createTask({
        title: taskTitle.trim(),
        clientId: clientId as any,
        dueDate: taskDueDate || undefined,
      });
      setTaskTitle('');
      setTaskDueDate('');
      setShowTaskForm(false);
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  };
```

As with `createNote` in Task A2, the `createTask` (`useMutation(api.tasks.create)`) declaration may now be unused. If TS flags it in Step 7, delete it.

- [ ] **Step 4: Import `TaskCreationFlow`**

At the top of [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), add to the imports:

```tsx
import TaskCreationFlow from '@/components/TaskCreationFlow';
```

Check the existing imports — if `TaskCreationFlow` is already imported (unlikely but possible), skip this step. Order the import alongside other `@/components/` imports.

- [ ] **Step 5: Replace the Tasks tab JSX**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:2840-2957](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), find the block starting with `{activeTab === 'Tasks' && (` and replace ONLY the top button + inline form (lines 2842-2881). The task-grouping code that follows (overdue, today, upcoming, no-due, completed) stays exactly as-is. The full new block:

```tsx
        {activeTab === 'Tasks' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowTaskCreation(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Task</Text>
            </TouchableOpacity>

            {taskGroups.overdue.length > 0 && (
              <>
                <View className="flex-row items-center gap-2 mt-1">
                  <AlertTriangle size={12} color={colors.error} />
                  <Text className="text-xs font-semibold text-m-error uppercase tracking-wide">
                    Overdue ({taskGroups.overdue.length})
                  </Text>
                </View>
                {taskGroups.overdue.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.today.length > 0 && (
              <>
                <View className="flex-row items-center gap-2 mt-1">
                  <Clock size={12} color={colors.warning} />
                  <Text className="text-xs font-semibold text-m-warning uppercase tracking-wide">
                    Due Today ({taskGroups.today.length})
                  </Text>
                </View>
                {taskGroups.today.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.upcoming.length > 0 && (
              <>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mt-1">
                  Upcoming ({taskGroups.upcoming.length})
                </Text>
                {taskGroups.upcoming.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.noDue.length > 0 && (
              <>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mt-1">
                  No Due Date ({taskGroups.noDue.length})
                </Text>
                {taskGroups.noDue.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.completed.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowCompletedTasks(!showCompletedTasks)}
                  className="flex-row items-center gap-2 mt-2"
                >
                  {showCompletedTasks ? (
                    <ChevronDown size={14} color={colors.textTertiary} />
                  ) : (
                    <ChevronRight size={14} color={colors.textTertiary} />
                  )}
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                    Completed ({taskGroups.completed.length})
                  </Text>
                </TouchableOpacity>
                {showCompletedTasks &&
                  taskGroups.completed.slice(0, 5).map((t: any) => (
                    <TaskItem key={t._id} task={t} onToggle={() => {}} />
                  ))}
              </>
            )}

            {tasks && tasks.length === 0 && <EmptyState message="No tasks" />}
          </View>
        )}
```

Key differences:
- `onPress={setShowTaskCreation(true)}` instead of toggling `showTaskForm`.
- The inline-form `<Card>` block is gone entirely.
- Empty-state guard is simplified: `tasks && tasks.length === 0` (no `!showTaskForm` since that state no longer exists).

- [ ] **Step 6: Render `<TaskCreationFlow>` at the bottom of the component's JSX tree**

Find the closing JSX of the main component (near the end of the component's return). Other modal-style components like `ContactDetailModal` or `LinkContactModal` are likely already rendered there — add `TaskCreationFlow` alongside them. Example insertion:

```tsx
        <TaskCreationFlow
          visible={showTaskCreation}
          onClose={() => setShowTaskCreation(false)}
          prefilledClientId={clientId as any}
          onCreated={() => setShowTaskCreation(false)}
        />
```

Verify the props match `TaskCreationFlow`'s interface — see [mobile-app/components/TaskCreationFlow.tsx:23-40](../../mobile-app/components/TaskCreationFlow.tsx). `visible`, `onClose`, `prefilledClientId` are required for our use. If the component's actual prop name differs (e.g., `prefilledClient` or `clientId`), use the real name.

- [ ] **Step 7: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. If TS flags unused `createTask` declaration, delete it.

- [ ] **Step 8: Commit**

```bash
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): client profile Tasks tab uses full TaskCreationFlow

Delete the inline title + YYYY-MM-DD string-typed form and its
state/handler. New Task button opens TaskCreationFlow with
prefilledClientId, giving users the full AI-assist + priority +
assignees + attachments flow that lives on the global /tasks screen."
```

---

### Task A4: Final verification & push

- [ ] **Step 1: Full TypeScript check across mobile app**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. If any remain, fix before proceeding.

- [ ] **Step 2: Web app build check (defensive — we didn't touch web code, but verify)**

```bash
cd model-testing-app && npx next build
```

Expected: build succeeds. If it fails with errors unrelated to this change, fix separately or ask.

- [ ] **Step 3: Manual verification on device/simulator**

Run the Expo dev server and verify:

```bash
cd mobile-app && npx expo start
```

Steps to verify:
1. Open the app → navigate to any client profile → Notes tab.
2. Tap "Add Note" → full editor opens, client name should be pre-selected in the client chip at the top of the editor.
3. Type a title + some content → Save → back on the Notes tab, new note appears.
4. Tap the new note card → editor opens in edit mode with the title and content populated.
5. Switch to Tasks tab.
6. Tap "New Task" → TaskCreationFlow modal slides up.
7. Confirm the client chip inside TaskCreationFlow is pre-selected.
8. Type a task title (or use AI-assist) → Create → modal closes, task appears in the list.

If any step fails, return to the relevant task and fix.

- [ ] **Step 4: Push Batch A**

```bash
git push
```

Batch A is now on `main`. Proceed to Batch B.

---

## BATCH B — Flags + Projects sheets (PR 2)

Five tasks. One new pure-logic utility, two new sheet components, two client-profile wiring changes.

### Task B1: Port `shortcodeUtils` to mobile

Pure logic, no dependencies. Verbatim copy of [model-testing-app/src/lib/shortcodeUtils.ts](../../model-testing-app/src/lib/shortcodeUtils.ts).

**Files:**
- Create: `mobile-app/lib/shortcodeUtils.ts`

- [ ] **Step 1: Create the file**

Create `mobile-app/lib/shortcodeUtils.ts` with exactly:

```tsx
/**
 * Generate a shortcode suggestion from a project name.
 * Replicates the logic from convex/projects.ts:generateShortcodeSuggestion
 * and mirrors model-testing-app/src/lib/shortcodeUtils.ts.
 */
export function generateShortcodeSuggestion(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';

  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');

  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }

  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }

  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }

  return shortcode.slice(0, 10).toUpperCase();
}
```

- [ ] **Step 2: Smoke-test manually**

Create a tiny scratch file or use `node -e` to verify common inputs match what the web version produces:

```bash
cd mobile-app && npx ts-node --transpile-only -e "import('./lib/shortcodeUtils.ts').then(m => {
  console.log(m.generateShortcodeSuggestion('Wimbledon Development Phase 2'));  // expect WIMBD2
  console.log(m.generateShortcodeSuggestion('Halo Living'));                     // expect HALOL
  console.log(m.generateShortcodeSuggestion(''));                                // expect ''
  console.log(m.generateShortcodeSuggestion('One Kensington Gardens 3'));        // expect ONEKG3
})"
```

If `ts-node` isn't available, skip this step — the function is verbatim and will be exercised in Task B3. If the verification values differ slightly from the expected (the algorithm has some quirks around word-count thresholds), accept them as the canonical output of `generateShortcodeSuggestion` — the point is parity with the web version.

- [ ] **Step 3: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/lib/shortcodeUtils.ts
git commit -m "feat(mobile): port generateShortcodeSuggestion utility

Verbatim copy of model-testing-app/src/lib/shortcodeUtils.ts. Used by
the upcoming ProjectCreationSheet to auto-suggest a shortcode from the
project name as the user types. 28 lines, pure logic, no runtime deps;
duplication accepted since a shared workspace package isn't set up."
```

---

### Task B2: Build `FlagCreationSheet`

Slide-up modal using the same `<Modal animationType="slide" presentationStyle="pageSheet">` pattern as `TaskCreationFlow`. Composes existing `PeoplePicker` for assignee selection.

**Files:**
- Create: `mobile-app/components/FlagCreationSheet.tsx`

- [ ] **Step 1: Create the component file**

Create `mobile-app/components/FlagCreationSheet.tsx` with:

```tsx
import {
  View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { X, Flag } from 'lucide-react-native';
import { api } from '../../model-testing-app/convex/_generated/api';
import type { Id } from '../../model-testing-app/convex/_generated/dataModel';
import { colors } from '@/lib/theme';
import PeoplePicker, { type PersonOption } from '@/components/PeoplePicker';

interface FlagCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (flagId: Id<'flags'>) => void;
}

export default function FlagCreationSheet({ visible, onClose, clientId, onCreated }: FlagCreationSheetProps) {
  const { isAuthenticated } = useConvexAuth();
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [assignee, setAssignee] = useState<PersonOption | null>(null);
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<Id<'projects'> | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientProjects = useQuery(
    api.projects.getByClient,
    isAuthenticated && visible ? { clientId } : 'skip'
  );

  const allUsers = useQuery(api.users.getAll, isAuthenticated && visible ? {} : 'skip');

  const createFlag = useMutation(api.flags.create);

  const peoplePickerItems = useMemo<PersonOption[]>(() => {
    if (!allUsers) return [];
    return (allUsers as any[]).map((u: any) => ({
      id: u._id,
      name: u.name || u.email || 'User',
      email: u.email,
      source: 'user' as const,
    }));
  }, [allUsers]);

  const linkedProjectName = useMemo(() => {
    if (!linkedProjectId || !clientProjects) return null;
    const project = (clientProjects as any[]).find((p: any) => p._id === linkedProjectId);
    return project?.name ?? null;
  }, [linkedProjectId, clientProjects]);

  const reset = () => {
    setNote('');
    setPriority('normal');
    setAssignee(null);
    setLinkedProjectId(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const flagId = await createFlag({
        entityType: 'client',
        entityId: clientId,
        clientId,
        note: note.trim(),
        priority,
        assignedTo: (assignee?.id as Id<'users'> | undefined) || undefined,
        projectId: linkedProjectId || undefined,
      });
      reset();
      onClose();
      onCreated?.(flagId as Id<'flags'>);
    } catch (e: any) {
      console.error('Failed to create flag:', e);
      setError(e?.message || 'Could not create flag. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 bg-m-bg">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
              <View className="flex-row items-center gap-2">
                <Flag size={18} color={colors.textOnBrand} />
                <Text className="text-lg font-medium text-m-text-on-brand">New Flag</Text>
              </View>
              <TouchableOpacity onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={colors.textOnBrand} />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
              {/* Note body */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Note
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Describe what needs attention…"
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3"
                  style={{ minHeight: 160 }}
                />
              </View>

              {/* Priority */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Priority
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setPriority('normal')}
                    className={`flex-1 py-2 rounded-lg items-center ${priority === 'normal' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
                    accessibilityRole="button"
                  >
                    <Text className={`text-sm font-medium ${priority === 'normal' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                      Normal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPriority('urgent')}
                    className={`flex-1 py-2 rounded-lg items-center ${priority === 'urgent' ? 'bg-m-error' : 'bg-m-bg-subtle'}`}
                    accessibilityRole="button"
                  >
                    <Text className={`text-sm font-medium ${priority === 'urgent' ? 'text-white' : 'text-m-text-secondary'}`}>
                      Urgent
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Assignee */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Assigned to
                </Text>
                <TouchableOpacity
                  onPress={() => setShowPeoplePicker(true)}
                  className="bg-m-bg-subtle rounded-lg px-3 py-3 flex-row items-center justify-between"
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-m-text-primary">
                    {assignee ? assignee.name : 'Me (default)'}
                  </Text>
                  {assignee && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); setAssignee(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {/* Linked project (optional) */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Linked project (optional)
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!clientProjects || (clientProjects as any[]).length === 0) {
                      Alert.alert('No projects', 'This client has no projects yet.');
                      return;
                    }
                    setShowProjectPicker(true);
                  }}
                  className="bg-m-bg-subtle rounded-lg px-3 py-3 flex-row items-center justify-between"
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-m-text-primary">
                    {linkedProjectName ?? 'None'}
                  </Text>
                  {linkedProjectId && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); setLinkedProjectId(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {error && (
                <View className="bg-m-error/10 rounded-lg px-3 py-2">
                  <Text className="text-xs text-m-error">{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View className="flex-row gap-2 px-4 py-3 border-t border-m-border-subtle">
              <TouchableOpacity
                onPress={handleClose}
                disabled={submitting}
                className="bg-m-bg-subtle rounded-lg py-3 px-4 items-center"
                accessibilityRole="button"
              >
                <Text className="text-sm text-m-text-secondary">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!note.trim() || submitting}
                className={`flex-1 rounded-lg py-3 items-center ${(!note.trim() || submitting) ? 'bg-m-accent/50' : 'bg-m-accent'}`}
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium text-m-text-on-brand">
                  {submitting ? 'Creating…' : 'Create Flag'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assignee picker */}
      <PeoplePicker
        visible={showPeoplePicker}
        onClose={() => setShowPeoplePicker(false)}
        items={peoplePickerItems}
        selectedIds={assignee ? [assignee.id] : []}
        onSelectionChange={(ids) => {
          if (ids.length === 0) {
            setAssignee(null);
          } else {
            const picked = peoplePickerItems.find((p) => p.id === ids[0]);
            setAssignee(picked ?? null);
          }
          setShowPeoplePicker(false);
        }}
        maxSelection={1}
        title="Assign to"
      />

      {/* Project picker — simple inline picker modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View className="flex-1 bg-m-bg">
          <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
            <Text className="text-lg font-medium text-m-text-on-brand">Link project</Text>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)} accessibilityRole="button">
              <X size={20} color={colors.textOnBrand} />
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
            {(clientProjects as any[] | undefined)?.map((p: any) => (
              <TouchableOpacity
                key={p._id}
                onPress={() => {
                  setLinkedProjectId(p._id);
                  setShowProjectPicker(false);
                }}
                className="bg-m-bg-subtle rounded-lg px-3 py-3 mb-2"
                accessibilityRole="button"
              >
                <Text className="text-sm text-m-text-primary">{p.name}</Text>
                {p.projectShortcode && (
                  <Text className="text-xs text-m-text-tertiary font-mono mt-1">{p.projectShortcode}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
```

Notes on the component:
- `PeoplePicker` prop names (`items`, `selectedIds`, `onSelectionChange`, `maxSelection`, `title`) are assumed — verify against [mobile-app/components/PeoplePicker.tsx](../../mobile-app/components/PeoplePicker.tsx) before Step 2. If the real prop names differ, adjust.
- The inline project picker is intentionally simple (no search, since most clients have ≤10 projects). If a client's project count grows, extract and add search later.
- `Id<'clients'>`, `Id<'flags'>`, etc. types come from `model-testing-app/convex/_generated/dataModel`. The relative import path mirrors what [mobile-app/app/notes/editor.tsx:8](../../mobile-app/app/notes/editor.tsx) uses.

- [ ] **Step 2: Verify `PeoplePicker` prop names match the import**

Read [mobile-app/components/PeoplePicker.tsx](../../mobile-app/components/PeoplePicker.tsx) to confirm the exact prop names used above (`items`, `selectedIds`, `onSelectionChange`, `maxSelection`, `title`). If any differ, update the `<PeoplePicker ... />` usage inside `FlagCreationSheet.tsx` accordingly. Also confirm `PersonOption` is exported with `id`/`name`/`email`/`source` fields.

- [ ] **Step 3: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. If `api.projects.getByClient`, `api.users.getAll`, `api.flags.create` don't exist, TS will flag them — check the generated API at `model-testing-app/convex/_generated/api.d.ts` and adjust query/mutation names.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/components/FlagCreationSheet.tsx
git commit -m "feat(mobile): FlagCreationSheet slide-up modal component

New component matching the TaskCreationFlow modal pattern
(presentationStyle=pageSheet + animationType=slide). Provides a large
note TextInput, priority segmented control, single-select assignee
via PeoplePicker, optional linked-project selector. Calls
flags.create with entityType='client' and defaults assignedTo to the
creator when left blank."
```

---

### Task B3: Build `ProjectCreationSheet`

Similar structure to `FlagCreationSheet` — slide-up modal, two input fields, auto-suggested shortcode.

**Files:**
- Create: `mobile-app/components/ProjectCreationSheet.tsx`

- [ ] **Step 1: Create the component file**

Create `mobile-app/components/ProjectCreationSheet.tsx` with:

```tsx
import {
  View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { X, FolderPlus } from 'lucide-react-native';
import { api } from '../../model-testing-app/convex/_generated/api';
import type { Id } from '../../model-testing-app/convex/_generated/dataModel';
import { colors } from '@/lib/theme';
import { generateShortcodeSuggestion } from '@/lib/shortcodeUtils';

interface ProjectCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (projectId: Id<'projects'>) => void;
}

export default function ProjectCreationSheet({ visible, onClose, clientId, onCreated }: ProjectCreationSheetProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [userEditedShortcode, setUserEditedShortcode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useMutation(api.projects.create);

  // Auto-suggest shortcode from name until the user manually edits the shortcode field.
  useEffect(() => {
    if (!userEditedShortcode) {
      setShortcode(generateShortcodeSuggestion(name));
    }
  }, [name, userEditedShortcode]);

  const reset = () => {
    setName('');
    setShortcode('');
    setUserEditedShortcode(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleShortcodeChange = (value: string) => {
    setUserEditedShortcode(true);
    setShortcode(value.toUpperCase().slice(0, 10));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const projectId = await createProject({
        name: name.trim(),
        projectShortcode: shortcode.trim() || undefined,
        clientRoles: [{ clientId, role: 'primary' }],
      });
      reset();
      onClose();
      onCreated?.(projectId as Id<'projects'>);
      router.push(`/(tabs)/clients/${clientId}/projects/${projectId}` as any);
    } catch (e: any) {
      console.error('Failed to create project:', e);
      const message = e?.message || '';
      if (message.toLowerCase().includes('shortcode') && message.toLowerCase().includes('use')) {
        setError('This shortcode is taken — try another.');
      } else {
        setError(message || 'Could not create project. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 bg-m-bg">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
            <View className="flex-row items-center gap-2">
              <FolderPlus size={18} color={colors.textOnBrand} />
              <Text className="text-lg font-medium text-m-text-on-brand">New Project</Text>
            </View>
            <TouchableOpacity onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.textOnBrand} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Name */}
            <View>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Project name <Text className="text-m-error">*</Text>
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Wimbledon Development Phase 2"
                placeholderTextColor={colors.textPlaceholder}
                autoFocus
                className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3"
              />
            </View>

            {/* Shortcode */}
            <View>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Project shortcode
              </Text>
              <TextInput
                value={shortcode}
                onChangeText={handleShortcodeChange}
                placeholder="e.g., WIMBDEV2"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={10}
                autoCapitalize="characters"
                className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3 font-mono"
              />
              <Text className="text-xs text-m-text-tertiary mt-1">
                Max 10 characters. Used for document naming.
              </Text>
            </View>

            {error && (
              <View className="bg-m-error/10 rounded-lg px-3 py-2">
                <Text className="text-xs text-m-error">{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View className="flex-row gap-2 px-4 py-3 border-t border-m-border-subtle">
            <TouchableOpacity
              onPress={handleClose}
              disabled={submitting}
              className="bg-m-bg-subtle rounded-lg py-3 px-4 items-center"
              accessibilityRole="button"
            >
              <Text className="text-sm text-m-text-secondary">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!name.trim() || submitting}
              className={`flex-1 rounded-lg py-3 items-center ${(!name.trim() || submitting) ? 'bg-m-accent/50' : 'bg-m-accent'}`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-m-text-on-brand">
                {submitting ? 'Creating…' : 'Create Project'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
```

Notes:
- Navigation after create uses `router.push(`/(tabs)/clients/${clientId}/projects/${projectId}` as any)` — matches the exact path the client profile already uses at [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:2479](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx).
- Shortcode collision detection uses substring matching on the thrown error message (the convex mutation throws `"Project shortcode \"${shortcode}\" is already in use"` — see [model-testing-app/convex/projects.ts:153](../../model-testing-app/convex/projects.ts)). If the message changes upstream, update the match.

- [ ] **Step 2: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile-app/components/ProjectCreationSheet.tsx
git commit -m "feat(mobile): ProjectCreationSheet slide-up modal component

Slide-up modal matching FlagCreationSheet. Two fields: project name
(required, autofocused) and project shortcode (optional, max 10
chars, force-uppercase). Shortcode auto-suggests from the name until
the user manually edits it. On create calls projects.create with
clientRoles=[{clientId, role:'primary'}] matching desktop, then
navigates to the project detail screen. Surfaces shortcode-collision
errors inline; keeps the sheet open on failure."
```

---

### Task B4: Wire Flags tab to `FlagCreationSheet`

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Import the new component**

Add to imports near the top of the file:

```tsx
import FlagCreationSheet from '@/components/FlagCreationSheet';
```

- [ ] **Step 2: Delete the inline-form state declarations**

At [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1435-1438](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete:

```tsx
  // Flags form
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [flagPriority, setFlagPriority] = useState<'normal' | 'urgent'>('normal');
```

Add in their place:

```tsx
  // Flags creation sheet
  const [showFlagSheet, setShowFlagSheet] = useState(false);
```

- [ ] **Step 3: Delete the `handleCreateFlag` handler**

At [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:1751-1767](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), delete the entire `handleCreateFlag` function. The `createFlag` mutation binding may also become unused — if TS flags it in Step 6, delete.

- [ ] **Step 4: Replace the Flags tab JSX**

In [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:3109-3203](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx), find the block starting with `{activeTab === 'Flags' && (` and replace with:

```tsx
        {activeTab === 'Flags' && (
          <View className="gap-2">
            {/* Filter pills */}
            <View className="flex-row gap-2 mb-1">
              <TouchableOpacity
                onPress={() => setFlagFilter('open')}
                className={`px-4 py-1.5 rounded-full ${flagFilter === 'open' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
              >
                <Text className={`text-xs font-medium ${flagFilter === 'open' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                  Open
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFlagFilter('resolved')}
                className={`px-4 py-1.5 rounded-full ${flagFilter === 'resolved' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
              >
                <Text className={`text-xs font-medium ${flagFilter === 'resolved' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                  Resolved
                </Text>
              </TouchableOpacity>
            </View>

            {/* New Flag button */}
            <TouchableOpacity
              onPress={() => setShowFlagSheet(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Flag size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Flag</Text>
            </TouchableOpacity>

            {clientFlags && clientFlags.length > 0 ? (
              clientFlags.map((f: any) => (
                <FlagCard
                  key={f._id}
                  flag={f}
                  isExpanded={expandedFlags.has(f._id)}
                  onToggle={() => toggleFlagExpanded(f._id)}
                  thread={expandedFlags.has(f._id) && expandedFlagId === f._id ? flagThread : undefined}
                  onReply={(content) => handleReplyToFlag(f._id, content)}
                />
              ))
            ) : (
              <EmptyState message={flagFilter === 'open' ? 'No open flags' : 'No resolved flags'} />
            )}
          </View>
        )}
```

Key differences:
- Button `onPress` → `setShowFlagSheet(true)`.
- The inline `<Card>` form block is gone.

- [ ] **Step 5: Render `<FlagCreationSheet>` at the bottom of the component's JSX**

Alongside the `TaskCreationFlow` rendered in Task A3 Step 6, add:

```tsx
        <FlagCreationSheet
          visible={showFlagSheet}
          onClose={() => setShowFlagSheet(false)}
          clientId={clientId as any}
        />
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): client profile Flags tab uses FlagCreationSheet

Replace the inline tiny TextInput + priority toggle with the new
slide-up sheet. Delete showFlagForm/flagNote/flagPriority state and
handleCreateFlag handler. New Flag button now opens the full sheet
(note + priority + assignee + optional linked project)."
```

---

### Task B5: Wire Projects tab to `ProjectCreationSheet`

**Files:**
- Modify: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`

- [ ] **Step 1: Import the new component**

Add to imports:

```tsx
import ProjectCreationSheet from '@/components/ProjectCreationSheet';
```

- [ ] **Step 2: Add state for the sheet**

Near the other `showXSheet` state declarations (from Tasks A3 and B4):

```tsx
  // Project creation sheet
  const [showProjectSheet, setShowProjectSheet] = useState(false);
```

- [ ] **Step 3: Add a "New Project" button above `<ProjectsList>`**

Replace the Projects tab JSX at [mobile-app/app/(tabs)/clients/[clientId]/index.tsx:2471-2482](../../mobile-app/app/(tabs)/clients/[clientId]/index.tsx) with:

```tsx
        {activeTab === 'Projects' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowProjectSheet(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Project</Text>
            </TouchableOpacity>

            <ProjectsList
              clientId={clientId as string}
              projects={sortedProjects}
              folderCounts={folderCounts}
              projectSearch={projectSearch}
              setProjectSearch={setProjectSearch}
              onOpenProject={(pid) =>
                router.push(`/(tabs)/clients/${clientId}/projects/${pid}` as any)
              }
            />
          </View>
        )}
```

Note: the empty-state "Create first project" CTA lives inside `ProjectsList` itself, not here. If `ProjectsList` does NOT already show a CTA when `projects.length === 0`, that's a follow-up — the top "New Project" button is sufficient for this plan's success criteria since it's always visible.

- [ ] **Step 4: Render `<ProjectCreationSheet>` at the bottom of the component's JSX**

Alongside `TaskCreationFlow` and `FlagCreationSheet`:

```tsx
        <ProjectCreationSheet
          visible={showProjectSheet}
          onClose={() => setShowProjectSheet(false)}
          clientId={clientId as any}
        />
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile-app/app/\(tabs\)/clients/\[clientId\]/index.tsx
git commit -m "feat(mobile): client profile Projects tab adds creation entry point

Add 'New Project' button above ProjectsList that opens
ProjectCreationSheet (name + auto-suggested shortcode). Matches the
minimal desktop create dialog. On create navigates to the new
project's detail screen."
```

---

### Task B6: Final verification & push

- [ ] **Step 1: Full TypeScript check across mobile app**

```bash
cd mobile-app && npx tsc --noEmit
```

Expected: no errors. If any remain, fix before proceeding.

- [ ] **Step 2: Web app build check**

```bash
cd model-testing-app && npx next build
```

Expected: build succeeds. If it fails with errors unrelated to this change, fix separately.

- [ ] **Step 3: Manual verification on device/simulator**

```bash
cd mobile-app && npx expo start
```

Steps to verify:

**Flags tab:**
1. Open the app → any client profile → Flags tab.
2. Tap "New Flag" → sheet slides up from the bottom.
3. Verify the note TextInput has focus automatically.
4. Type a multi-line description (several paragraphs — confirm there's "room to write").
5. Tap "Urgent" priority → segmented control highlights correctly.
6. Tap the "Assigned to" row → PeoplePicker modal opens. Pick a teammate. Confirm their name appears on the row.
7. Tap X on the assignee chip → reverts to "Me (default)".
8. Tap the "Linked project (optional)" row — if the client has projects, pick one; if not, confirm the "No projects" alert shows.
9. Tap "Create Flag" → sheet closes, new flag appears in the Flags tab list.
10. Tap "New Flag" again → sheet state is clean (no leftover note text).

**Projects tab:**
1. Switch to Projects tab → "New Project" button is visible above the list.
2. Tap it → sheet slides up.
3. Type "Wimbledon Development Phase 2" in name → shortcode field auto-fills with `WIMBDEV2` (or similar — match desktop output).
4. Tap the shortcode field, delete everything, type "WDEV2" → confirm auto-suggest has stopped (typing more in the name field no longer overwrites shortcode).
5. Tap "Create Project" → sheet closes, navigates to the new project detail screen.
6. Go back to the client → Projects tab shows the new project.
7. Tap "New Project" again, enter a name whose auto-generated shortcode already exists → confirm the inline error "This shortcode is taken — try another" appears; sheet stays open.

If any step fails, return to the relevant task and fix.

- [ ] **Step 4: Push Batch B**

```bash
git push
```

Feature complete.

- [ ] **Step 5: Move the logbook task to done**

Update the logbook:

```bash
mv .logbook/queued/2026-04-18_mobile-client-profile-rich-creation-flows.md .logbook/done/2026-04-22_mobile-client-profile-rich-creation-flows.md
```

Update [.logbook/index.md](../../.logbook/index.md) — change the `queued` row for this task to a `done` row dated today, and update the "Last updated" date at the top.

```bash
git add .logbook/
git commit -m "chore(logbook): mark client profile rich creation flows done"
git push
```

---

## Appendix — Files touched

**Created:**
- `mobile-app/lib/shortcodeUtils.ts` (Task B1)
- `mobile-app/components/FlagCreationSheet.tsx` (Task B2)
- `mobile-app/components/ProjectCreationSheet.tsx` (Task B3)

**Modified:**
- `mobile-app/app/notes/editor.tsx` (Task A1 — 2 lines)
- `mobile-app/app/(tabs)/clients/[clientId]/index.tsx` (Tasks A2, A3, B4, B5)
- `.logbook/index.md` and the queued task file (Task B6 Step 5)

No schema changes. No new package dependencies. No new Expo Router routes.

## Appendix — Risks / things the executor should watch for

- **`PeoplePicker` prop API mismatch.** I guessed the prop names based on conventions; real names are in [mobile-app/components/PeoplePicker.tsx](../../mobile-app/components/PeoplePicker.tsx). If they differ, adjust `FlagCreationSheet.tsx`'s `<PeoplePicker ... />` usage in Task B2 Step 2.
- **Convex API name mismatch.** `api.users.getAll`, `api.projects.getByClient`, `api.flags.create`, `api.projects.create`, `api.notes.create` are all assumed. Check [model-testing-app/convex/_generated/api.d.ts](../../model-testing-app/convex/_generated/api.d.ts) (or the Convex dev dashboard) if any TS errors surface.
- **Unused-mutation cleanup.** Deleting the inline handlers may orphan `createNote`, `createTask`, `createFlag` `useMutation` bindings in the client profile. The mobile app doesn't run a strict `noUnusedLocals` TS check (I believe), so these won't fail the build — but we should still delete them for cleanliness when we spot them.
- **`KeyboardAvoidingView` behavior on Android.** The sheets use `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. If Android keyboard coverage becomes an issue, switch to `"height"` or add `adjustResize` windowing — iOS is the primary target per the 2-user TestFlight plan.
- **`role: 'primary'` vs. `'borrower'`.** The desktop create dialog uses `'primary'`. The `projects.create` backend treats the *first* client in `clientRoles` as the primary regardless of role string (to determine folder template via `primaryClient.type`). So the role string is arbitrary display metadata — `'primary'` matches desktop convention.
- **Shortcode collision detection message matching.** If the error message format changes in `model-testing-app/convex/projects.ts`, the inline error banner won't catch it and will fall back to the raw message. Acceptable fallback behavior; still usable.
