# UI Styling Guide

This document outlines the standard UI patterns used throughout the application for consistency.

## Page Titles

Page titles should be directly on the page, NOT wrapped in cards or blue banners.

### Implementation

```tsx
<div className="mb-8 flex items-center justify-between">
  <div>
    <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
      Page Title
    </h1>
    <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
      Page description or subtitle
    </p>
  </div>
  <Button className="bg-black text-white hover:bg-gray-800 flex items-center gap-2">
    <Icon className="w-4 h-4" />
    Action Button
  </Button>
</div>
```

### Key Characteristics

- **Font**: Helvetica Neue (matching RockCap logo)
- **Title Size**: `text-3xl`
- **Font Weight**: 700 for title, 400 for description
- **Layout**: Flexbox with space-between for title and action button
- **No Card Wrapper**: Titles are directly on the page background
- **Action Button**: Floating in top-right corner, black background

### Usage Examples

- All page titles
- Dashboard headers
- Section headers (when not part of a card)

### Example from Codebase

```tsx
<div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
          Client Database
        </h1>
        <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
          Manage and view all clients
        </p>
      </div>
      <Button className="bg-black text-white hover:bg-gray-800">
        New Client
      </Button>
    </div>
  </div>
</div>
```

---

## Blue Banner Pattern

The blue banner is used as a header for cards and sections, NOT for page titles.

### Implementation

```tsx
<div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Icon className="w-4 h-4 text-white" />
    <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
      Section Title
    </span>
  </div>
  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
    Additional Info
  </span>
</div>
```

### Key Characteristics

- **Background**: `bg-blue-600` (blue-600)
- **Text Color**: `text-white`
- **Padding**: `px-3 py-2`
- **Text Style**: Uppercase with tracking-wide, font-weight 600
- **Layout**: Flexbox with space-between for title and additional info
- **Icon**: Optional, typically 4x4 size, white color

### Usage Examples

- Card headers (NOT page titles)
- Table section headers
- Modal/drawer headers
- Section headers within cards

### Important Note

**DO NOT** use blue banners for page titles. Page titles should be directly on the page with Helvetica Neue font, as described in the Page Titles section above.

### Example from Codebase

```tsx
<Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
  <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-white" />
      <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
        Client Database
      </span>
    </div>
    <Button className="bg-black text-white hover:bg-gray-800">
      New Client
    </Button>
  </div>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

---

## Black Metric Cards

Compact metric cards with black background are used to display key statistics.

### Implementation

```tsx
<CompactMetricCard
  label="Metric Label"
  value={metricValue}
  icon={IconComponent}
  iconColor="blue"
  className="bg-black text-white"
/>
```

### Key Characteristics

- **Background**: `bg-black`
- **Text Color**: `text-white` (for value and label)
- **Component**: `CompactMetricCard` from `@/components/CompactMetricCard`
- **Icon Colors**: Use colored icons (blue, green, purple, orange, yellow, red, gray)
- **Layout**: Horizontal layout with icon on left, label and value on right

### Icon Colors

- `blue` - Primary metrics
- `green` - Positive/active metrics
- `purple` - Project-related metrics
- `orange` - Document-related metrics
- `yellow` - Warning metrics
- `red` - Urgent/error metrics
- `gray` - Neutral metrics

### Usage Examples

- Dashboard metrics
- Page-level statistics
- Summary information

### Example from Codebase

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
  <CompactMetricCard
    label="Total Clients"
    value={metrics.totalClients}
    icon={Building2}
    iconColor="blue"
    className="bg-black text-white"
  />
  <CompactMetricCard
    label="Active Clients"
    value={metrics.activeClients}
    icon={Building2}
    iconColor="green"
    className="bg-black text-white"
  />
</div>
```

---

## Table Structure

Tables follow a clean, modern design with proper spacing and badge-based tags.

### Implementation

```tsx
<Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
  <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
    {/* Blue banner header */}
  </div>
  <CardContent className="pt-0 pb-6">
    {/* Filter/Sort Controls */}
    <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
      {/* Search bar on left, filters/sort on right - use px-2 to align with table cells */}
    </div>
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-200">
          <TableHead className="text-xs font-semibold text-gray-700 uppercase">
            Column Name
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="cursor-pointer hover:bg-gray-50">
          <TableCell>
            {/* Cell content */}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

### Key Characteristics

- **No Avatar Photos**: Tables do not include avatar/profile photo columns
- **Badge-Based Tags**: Use Badge components for status and type indicators
- **Clean Spacing**: Proper padding and margins for readability
- **Hover Effects**: Row hover effects (`hover:bg-gray-50`)
- **Clickable Rows**: Entire rows are clickable (cursor-pointer)
- **Filter/Sort Controls**: Located in table header area, not top-right of page
- **Alignment**: Filter bars and search inputs must align with table cell content - use `px-2` padding to match table cell padding (`p-2`), ensuring the search bar left edge aligns perfectly with the first column header

### Table Headers

- **Style**: `text-xs font-semibold text-gray-700 uppercase`
- **Border**: `border-b border-gray-200`
- **Background**: Default white, or `bg-gray-50` for header row

### Badge Patterns

#### Status Badges

```tsx
// Active
<Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>

// Archived
<Badge className="bg-gray-100 text-gray-800 border-gray-200">Archived</Badge>

// Past
<Badge className="bg-gray-100 text-gray-800 border-gray-200">Past</Badge>

// Prospect
<Badge className="bg-blue-100 text-blue-800 border-blue-200">Prospect</Badge>
```

#### Type Badges

```tsx
// Lender
<Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Lender</Badge>

// Broker
<Badge className="bg-teal-100 text-teal-800 border-teal-200">Broker</Badge>

// Developer
<Badge className="bg-amber-100 text-amber-800 border-amber-200">Developer</Badge>

// Borrower
<Badge className="bg-purple-100 text-purple-800 border-purple-200">Borrower</Badge>
```

### Column Guidelines

- **Client Name**: Show name with creation date below
- **Projects**: Show count only (e.g., "3 projects"), not full project names
- **Last Activity**: Show full timestamp with date and time down to the hour (e.g., "Dec 15, 2024, 02:30 PM")
- **Tags**: Display status and type badges in a flex wrap layout
- **Actions**: Right-aligned action buttons

### Usage Examples

- Client database table
- Project listing table
- Task/reminder tables
- Document tables

### Example from Codebase

```tsx
<Table>
  <TableHeader>
    <TableRow className="border-b border-gray-200">
      <TableHead className="text-xs font-semibold text-gray-700 uppercase">
        Client Name
      </TableHead>
      <TableHead className="text-xs font-semibold text-gray-700 uppercase">
        Projects
      </TableHead>
      <TableHead className="text-xs font-semibold text-gray-700 uppercase">
        Last Activity
      </TableHead>
      <TableHead className="text-xs font-semibold text-gray-700 uppercase">
        Tags
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="cursor-pointer hover:bg-gray-50">
      <TableCell>
        <div className="text-sm font-medium text-gray-900">
          Client Name
        </div>
        <div className="text-xs text-gray-500">
          Created {date}
        </div>
      </TableCell>
      <TableCell>
        <span className="font-medium">3 projects</span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-gray-600">Dec 15, 2024, 02:30 PM</span>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {getStatusBadge(status)}
          {getTypeBadge(type)}
        </div>
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## General Design Principles

1. **Consistency**: Use these patterns consistently across all pages
2. **Alignment**: Alignment is key to making the style look good. Always ensure components align properly:
   - Search bars and filter controls should align with table cell content (use `px-2` to match table cell padding)
   - Icons inside inputs should be positioned absolutely with proper padding (`pl-10` for input with left icon)
   - Vertical alignment should create clean lines from top to bottom
   - When components share the same container, ensure their left edges align perfectly
3. **Spacing**: Maintain consistent padding and margins (typically `px-6 py-3` or `px-4 py-2`), but adjust for alignment when needed (e.g., `px-2` for filter bars to match table cells)
4. **Typography**: Use appropriate font sizes and weights
5. **Colors**: Stick to the defined color palette for badges and backgrounds
6. **Interactivity**: Provide clear hover states and clickable indicators
7. **Accessibility**: Ensure proper contrast ratios and semantic HTML

---

## Component References

- `CompactMetricCard` - `@/components/CompactMetricCard`
- `Card`, `CardContent` - `@/components/ui/card`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead` - `@/components/ui/table`
- `Badge` - `@/components/ui/badge`
- `Button` - `@/components/ui/button`

---

## Last Updated

December 2024

