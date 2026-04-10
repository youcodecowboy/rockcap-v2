# Contacts Address Book — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Shared contacts UI components, mobile `/m-contacts` page, desktop `/rolodex` rework. No schema changes.

---

## Overview

Build a clean address book for contacts (people) associated with clients (companies). Search-first, filterable by client, browsable A-Z. Consistent mobile/desktop pattern (bottom sheet + side panel) matching the task system. Simple form-based contact creation with smart client autocomplete. No AI agent needed — contacts are structured data.

---

## Section 1: Data Model — What We Use, What We Ignore

**No schema changes.** The existing `contacts` table has everything we need.

### Fields used by the address book

| Field | Usage |
|---|---|
| `name` | Primary display, search, A-Z grouping |
| `email` | Display, search, click-to-email |
| `phone` | Display, search, click-to-call |
| `role` | Display, optional filter |
| `notes` | Display, editable in detail sheet |
| `clientId` | Links contact to a client (the "company" association) |
| `createdAt` | Sort fallback |

### Fields ignored (stay in schema, not surfaced in UI)

`company` (deprecated), `linkedCompanyIds`, `hubspotContactId`, `hubspotUrl`, `hubspotLifecycleStage`, `hubspotLifecycleStageName`, `hubspotOwnerId`, `hubspotCompanyIds`, `linkedDealIds`, `hubspotDealIds`, `lastContactedDate`, `lastActivityDate`, `lastHubSpotSync`, `metadata`, `sourceDocumentId`, `projectId`.

### Queries

**Existing queries used as-is:**
- `contacts.getAll()` — returns all non-deleted contacts
- `contacts.get(id)` — returns single contact with linked companies/deals
- `clients.list()` — for client chip labels and name resolution

**Filtering and search:** Done client-side. The dataset is small (~40 clients, a few hundred contacts) — no need for a server-side search query. `getAll` loads everything, then the UI filters by search text (name/email/phone match) and selected clientId.

**A-Z grouping:** Done client-side by sorting contacts by name and grouping by first letter.

---

## Section 2: Shared Components

All components live in `src/components/contacts/`. Consumed by both mobile and desktop.

### `ContactSearchBar`

- Text input with Lucide `Search` icon
- Filters contacts live as user types
- Matches against name, email, phone (case-insensitive substring)
- Props: `value: string`, `onChange: (value: string) => void`

### `ContactClientChips`

- Horizontal scrollable row of client name chips
- "All" chip selected by default (accent background)
- Tapping a client chip filters the list; tapping again deselects (back to all)
- Only shows clients that have at least one contact
- Props: `clients: { _id, name }[]`, `contacts: { clientId? }[]`, `selectedClientId: string | null`, `onSelectClient: (id: string | null) => void`

### `ContactListItem`

- Avatar circle with initials (deterministic color based on name hash)
- Name (bold), role/company subtitle, client name on far right
- Company display logic: if `clientId` exists, show the resolved client name. If not, fall back to the deprecated `company` text field. If neither, show nothing.
- Tap opens detail sheet
- Props: `contact: Contact`, `clientName?: string`, `onTap: () => void`

### `ContactDetailSheet`

- `variant: "sheet" | "panel"` (same pattern as `TaskDetailSheet`)
- **Top section:** centered avatar (larger, 56px) + name + role + client name
- **Quick actions row:** three buttons using Lucide icons — Phone (`tel:` link), Mail (`mailto:` link), Copy (copies all info to clipboard). No emoji.
- **Structured fields:** Phone, Email, Role, Company (from contact's company field or inferred), Client (linked, tappable)
- **Notes section:** editable inline (same pattern as task detail)
- **Action buttons:** Edit / Delete
- **Edit mode:** fields become inline-editable. Save/Cancel replaces Edit button. Client field becomes a dropdown with search.
- **Sheet mode (mobile):** slides up from bottom, ~70vh, with drag handle
- **Panel mode (desktop):** renders inline in right side panel (400px), no drag handle

### `ContactCreateForm`

- Simple form, no AI
- Fields: Name (required), Email, Phone, Role (text input), Client (dropdown with fuzzy search across ~40 clients), Notes
- Client dropdown: searchable, shows client names, selects `clientId`
- On submit: calls `contacts.create` mutation
- On mobile: full page with back arrow header (same pattern as TaskCreationFlow)
- On desktop: centered modal (500px wide)
- Props: `onCreated: () => void`, `onClose: () => void`

### `groupContactsByLetter`

- Utility function (not a component)
- Takes sorted contact array, returns `{ letter: string, contacts: Contact[] }[]`
- Groups by first letter of name, uppercase
- Contacts without a name (shouldn't happen) go to "#"

---

## Section 3: Mobile `/m-contacts` Page

### Screen structure (top to bottom)

1. Standard mobile header (from MobileShell)
2. `ContactSearchBar`
3. `ContactClientChips`
4. Divider
5. A-Z grouped contact list (letter headers + `ContactListItem` rows)
6. "New Contact" pill button (bottom-right, same style as tasks FAB)

### Interaction flows

- **Search typing** → live-filters name/email/phone, A-Z grouping updates
- **Client chip tap** → filters to that client's contacts, A-Z updates
- **Search + chip combine** — e.g. searching "alex" while filtered to "Bayfield Homes"
- **Contact tap** → `ContactDetailSheet` opens as bottom sheet
- **"New Contact" tap** → navigates to `ContactCreateForm` (full page)
- **Form submit** → creates contact, returns to list, new contact visible

### Data loading

- `contacts.getAll()` via `useQuery` — real-time
- `clients.list()` via `useQuery` — for chips and name resolution
- All filtering, search, and grouping done client-side

### Empty states

- No contacts: centered "No contacts yet" + "Add your first contact" button
- No matches: "No contacts found" with link to clear filters

---

## Section 4: Desktop `/rolodex` Page Rework

Replace the existing Rolodex page with the new shared components. Two-panel layout matching tasks.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Contacts" + [New Contact] button                  │
├─────────────────────────────────────────────────────────────┤
│  ContactSearchBar (full width)                              │
│  ContactClientChips (full width, no scroll needed)          │
├──────────────────────────────────┬──────────────────────────┤
│  A-Z Contact List (left, ~60%)   │  ContactDetailSheet      │
│  Letter headers + ContactListItem│  (variant: "panel")      │
│                                  │  Or: "Select a contact"  │
├──────────────────────────────────┴──────────────────────────┤
└─────────────────────────────────────────────────────────────┘
```

### Key differences from mobile

| Element | Mobile | Desktop |
|---|---|---|
| Detail view | Bottom sheet (70vh) | Right side panel (400px) |
| Create form | Full page navigation | Centered modal (500px) |
| Client chips | Horizontal scroll | Full row, no scroll |
| New Contact | Floating pill button | Button in header |

### Route

Rewrite `src/app/(desktop)/rolodex/page.tsx` with new components. Keep the route as `/rolodex` — renaming is out of scope.

---

## Implementation Order

1. **Shared utility** — `groupContactsByLetter` helper
2. **Shared components** — `ContactSearchBar`, `ContactClientChips`, `ContactListItem`
3. **ContactDetailSheet** — sheet/panel detail view with quick actions
4. **ContactCreateForm** — simple form with client autocomplete
5. **Mobile `/m-contacts`** — wire up full mobile experience
6. **Desktop `/rolodex` rework** — rebuild with shared components + two-panel layout
