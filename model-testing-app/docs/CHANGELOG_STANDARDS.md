# Changelog Standards & Template

This document outlines the standards and process for adding entries to the application changelog.

## Quick Start

To add a changelog entry, run:

```bash
npx convex run changelog:add '{
  "title": "Brief Title of the Change",
  "description": "Detailed description of what changed and why.",
  "pagesAffected": ["Page Name 1", "Page Name 2"],
  "featuresAffected": ["Feature Name 1", "Feature Name 2"]
}'
```

## Entry Structure

### Required Fields

- **`title`** (string): Brief, descriptive title (50-80 characters)
  - Use present tense: "Add new feature" not "Added new feature"
  - Be specific: "Add user management page" not "Updates"
  - Capitalize first letter

- **`description`** (string): Detailed explanation (2-4 sentences)
  - Explain what changed and why
  - Include user-facing impact
  - Be clear and concise

### Optional Fields

- **`pagesAffected`** (array of strings): List of page names that were modified
  - Use exact page names from the app
  - Examples: "Settings", "Changelog", "Clients", "Projects", "Dashboard"

- **`featuresAffected`** (array of strings): List of features that were modified
  - Use feature names consistently
  - Examples: "Changelog", "Chat", "Documents", "Notifications", "HubSpot Integration"

## Change Type Categories

The system automatically detects change types based on keywords in the title/description:

### New Feature
- Keywords: "new", "add", "introduce", "create"
- Color: Purple
- Icon: Sparkles
- Use for: New functionality, new pages, new integrations

### Bug Fix
- Keywords: "fix", "bug", "error", "resolve", "correct"
- Color: Orange
- Icon: Zap
- Use for: Fixing broken functionality, error corrections

### UI Improvement
- Keywords: "ui", "design", "styling", "redesign", "layout"
- Color: Blue
- Icon: Layout
- Use for: Visual improvements, UX enhancements, design updates

### Security
- Keywords: "security", "authentication", "authorization", "permissions"
- Color: Red
- Icon: Shield
- Use for: Security fixes, access control, authentication changes

### Performance
- Keywords: "performance", "speed", "faster", "optimize", "optimization"
- Color: Green
- Icon: Zap
- Use for: Speed improvements, optimization work

### General Update
- Default category when none match
- Color: Gray
- Icon: FileText
- Use for: Maintenance, refactoring, documentation updates

## Page Names Reference

Use these exact names when listing pages:

- Dashboard
- Clients
- Projects
- Prospects
- Rolodex
- Documents
- Tasks
- Calendar
- Inbox
- Settings
- Changelog
- Category Settings
- HubSpot Integration
- File Summary Agent
- Knowledge Bank
- Modeling
- Notes
- Templates
- Filing Agent

## Feature Names Reference

Use these exact names when listing features:

- Changelog
- Chat
- Documents
- Notifications
- User Management
- HubSpot Integration
- File Summary Agent
- Category Settings
- Knowledge Bank
- Modeling
- Tasks
- Reminders
- Calendar
- Email
- File Upload
- Search
- Authentication

## Style Guidelines

### Title Style
- ✅ **Good**: "Add user management page with role-based access"
- ✅ **Good**: "Fix chat sessions user isolation for secure multi-user support"
- ✅ **Good**: "Redesign changelog UI with enhanced visuals"
- ❌ **Bad**: "Updates" (too vague)
- ❌ **Bad**: "Fixed some bugs" (not descriptive)
- ❌ **Bad**: "Added new feature" (what feature?)

### Description Style
- ✅ **Good**: "Added comprehensive in-app changelog system accessible from Settings page. Users can now track all application updates with detailed version history, change types, and affected features. Fixed chat sessions user isolation to ensure secure multi-user support where each user only sees their own sessions."
- ❌ **Bad**: "Made changes to the app" (too vague)
- ❌ **Bad**: "Fixed bugs and added features" (not specific)

### When to Add Entries

Add changelog entries for:
- ✅ New features or pages
- ✅ Major UI/UX improvements
- ✅ Significant bug fixes
- ✅ Security updates
- ✅ Performance improvements
- ✅ Breaking changes
- ✅ New integrations

Don't add entries for:
- ❌ Minor typo fixes
- ❌ Internal refactoring with no user impact
- ❌ Test changes
- ❌ Documentation-only updates (unless significant)

## Examples

### Example 1: New Feature

```json
{
  "title": "Add user management page with role-based access",
  "description": "Created new user management page accessible from Settings. Administrators can now view all users, assign roles, and manage permissions. Includes role-based access control with three levels: Admin, Manager, and User.",
  "pagesAffected": ["Settings"],
  "featuresAffected": ["User Management"]
}
```

### Example 2: Bug Fix

```json
{
  "title": "Fix chat sessions user isolation for secure multi-user support",
  "description": "Resolved issue where users could potentially see other users' chat sessions. Implemented proper user isolation checks in all chat session queries and mutations. Each user now only sees and can access their own chat sessions.",
  "pagesAffected": [],
  "featuresAffected": ["Chat"]
}
```

### Example 3: UI Improvement

```json
{
  "title": "Redesign changelog UI with enhanced visuals",
  "description": "Completely redesigned changelog page with modern card-based layout. Added change type badges, visual feature/page grids with icons, and improved typography. Cards now display with colored borders based on change type for better visual categorization.",
  "pagesAffected": ["Changelog"],
  "featuresAffected": ["Changelog"]
}
```

### Example 4: Multiple Pages/Features

```json
{
  "title": "Add comprehensive notification system",
  "description": "Implemented new notification system with in-app notifications and email alerts. Users receive notifications for tasks, reminders, and changelog updates. Added notification bell icon in header with unread count badge. Notifications are stored in database and can be marked as read.",
  "pagesAffected": ["Dashboard", "Settings"],
  "featuresAffected": ["Notifications", "Tasks", "Reminders", "Changelog"]
}
```

## Version Numbering

- Entries are automatically numbered starting from `2.1.1`
- Most recent entry gets the highest version number
- Version numbers are sequential and cannot be changed manually
- Format: `2.1.X` where X increments with each entry

## Best Practices

1. **Be Specific**: Include enough detail for users to understand what changed
2. **User-Focused**: Focus on user-facing changes, not internal implementation
3. **Consistent Naming**: Use exact page and feature names from the reference lists
4. **Complete Information**: Include pages and features affected when relevant
5. **Timely**: Add entries soon after changes are made
6. **Clear Titles**: Titles should be understandable without reading the description

## Troubleshooting

### Entry not showing up?
- Check that Convex dev server is running (`npx convex dev`)
- Verify the entry was created: Check Convex Dashboard → Data → changelog table
- Refresh the changelog page

### Wrong change type detected?
- Adjust keywords in title or description
- Change types are auto-detected based on keywords
- Most common: "new"/"add" = New Feature, "fix" = Bug Fix

### Need to delete an entry?
```bash
npx convex run changelog:remove '{"id":"ENTRY_ID_HERE"}'
```

## Questions?

If you're unsure about:
- Whether to add an entry → Ask: "Does this change affect users?"
- What to include → Include: What changed, why it matters, what's affected
- How to categorize → Let auto-detection work, or adjust keywords if needed











