# RockCap Design System
## Enterprise Dashboard Aesthetic

### Design Principles
- **Clean & Minimal**: Uncluttered interfaces with purposeful whitespace
- **Professional**: Financial services-grade polish and precision
- **Data-Dense**: Efficient use of space without feeling cramped
- **Consistent**: Unified patterns across all dashboard pages

### Color Palette

#### Primary Colors
- **Primary Blue**: `#2563eb` (blue-600) - Primary actions, links, active states
- **Primary Dark**: `#1e40af` (blue-700) - Hover states
- **Primary Light**: `#dbeafe` (blue-50) - Backgrounds, subtle highlights

#### Neutral Colors
- **Text Primary**: `#111827` (gray-900) - Main text
- **Text Secondary**: `#6b7280` (gray-500) - Secondary text, labels
- **Text Tertiary**: `#9ca3af` (gray-400) - Placeholders, disabled
- **Background**: `#f9fafb` (gray-50) - Page backgrounds
- **Card Background**: `#ffffff` (white) - Card backgrounds
- **Border**: `#e5e7eb` (gray-200) - Borders, dividers

#### Status Colors
- **Success**: `#10b981` (green-600) - Positive trends, success states
- **Warning**: `#f59e0b` (yellow-600) - Warnings, pending states
- **Error**: `#ef4444` (red-600) - Errors, negative trends
- **Info**: `#3b82f6` (blue-600) - Information, neutral states

### Typography

#### Headings
- **H1**: `text-3xl font-bold text-gray-900` - Page titles
- **H2**: `text-2xl font-semibold text-gray-900` - Section titles
- **H3**: `text-xl font-semibold text-gray-900` - Subsection titles

#### Body Text
- **Body Large**: `text-base text-gray-900` - Primary body text
- **Body**: `text-sm text-gray-900` - Standard body text
- **Body Small**: `text-xs text-gray-500` - Secondary information, metadata

#### Labels
- **Label**: `text-sm font-medium text-gray-700` - Form labels, table headers
- **Label Small**: `text-xs font-medium text-gray-600` - Small labels

### Spacing System

#### Page Layout
- **Page Padding**: `px-4 sm:px-6 lg:px-8 py-8`
- **Section Spacing**: `mb-8` between major sections
- **Card Spacing**: `p-6` standard card padding
- **Table Padding**: `px-6 py-4` for table cells

#### Grid System
- **Metric Cards**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- **Content Grid**: `grid grid-cols-1 lg:grid-cols-2 gap-6`

### Component Patterns

#### Metric Cards
- **Size**: Minimum height of 120px
- **Layout**: Icon on right, value prominent, label above
- **Trend Indicators**: Show percentage change with arrow (↑/↓)
- **Spacing**: Consistent padding `p-6`
- **Border**: Subtle border `border border-gray-200`
- **Shadow**: Light shadow `shadow-sm`

#### Tables
- **Header**: Bold, uppercase labels with `text-xs font-semibold text-gray-700`
- **Rows**: Hover state `hover:bg-gray-50`
- **Cells**: Adequate padding `px-6 py-4`
- **Empty State**: Centered, helpful message with `py-12`
- **Actions**: Right-aligned action buttons

#### Page Headers
- **Title**: Large, bold with description below
- **Actions**: Right-aligned buttons (Add, Export, etc.)
- **Metadata**: "Last updated" timestamp in gray text
- **Spacing**: `mb-8` below header

#### Filter Bars
- **Container**: White card with `p-6`
- **Layout**: Horizontal flex with gaps
- **Search**: Full-width input with icon
- **Filters**: Dropdown selects, consistent width
- **Clear**: Ghost button to reset filters

### Empty States
- **Container**: White card with `p-12`
- **Message**: Centered, helpful text
- **Action**: Optional CTA button
- **Icon**: Optional illustration or icon

### Interactive Elements

#### Buttons
- **Primary**: `bg-blue-600 text-white hover:bg-blue-700`
- **Secondary**: `bg-white border border-gray-300 hover:bg-gray-50`
- **Ghost**: `text-gray-600 hover:bg-gray-100`
- **Size**: Standard `px-4 py-2`, Small `px-3 py-1.5`

#### Badges
- **Status**: Colored backgrounds with white text
- **Secondary**: Gray background `bg-gray-100 text-gray-800`
- **Outline**: Border only `border border-gray-300`

### Data Visualization

#### Trend Indicators
- **Positive**: Green `text-green-600` with ↑ arrow
- **Negative**: Red `text-red-600` with ↓ arrow
- **Neutral**: Gray `text-gray-600` with — or 0.0%

#### Progress Indicators
- **Bar**: Subtle gray background with colored fill
- **Percentage**: Displayed prominently

### Responsive Breakpoints
- **Mobile**: `< 640px` - Single column, stacked layout
- **Tablet**: `640px - 1024px` - 2-column grids
- **Desktop**: `> 1024px` - 4-column grids, full layouts

### Accessibility
- **Contrast**: Minimum 4.5:1 for text
- **Focus States**: Visible focus rings
- **Keyboard Navigation**: All interactive elements accessible
- **ARIA Labels**: Descriptive labels for icons and actions

