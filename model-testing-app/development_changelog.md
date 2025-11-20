# Development Changelog

## [Latest] - 2025-01-27

### Dashboard Landing Page & Auth Routes Verification

**Overview**: Created a comprehensive dashboard landing page at the home route (`/`) and moved the filing agent to `/filing`. Verified and ensured all authentication routes are working properly.

**New Features:**
- **Dashboard Landing Page** (`/`):
  - Personalized welcome message with user's first name from Clerk
  - Recent Files table showing last 10 uploaded documents with client links
  - Recent Messages table (placeholder for upcoming email integration)
  - Quick Links section with 3-4 recent clients as clickable cards
  - Metrics Cards:
    - Recent Prospects count (from prospects table + clients with status="prospect")
    - Pipeline Total £ (sum of all deal amounts, formatted as currency)
  - Calendar component (placeholder for Google Calendar integration)

- **Filing Agent Page** (`/filing`):
  - Moved from home route to dedicated `/filing` route
  - Maintains all existing functionality (file upload, client management, output window)

**New Convex Queries:**
- `documents.getRecent`: Get recent documents (last N, sorted by uploadedAt)
- `emails.getRecent`: Get recent emails/messages (last N, sorted by createdAt)
- `clients.getRecent`: Get recent clients (last N, sorted by createdAt)
- `deals.getPipelineTotal`: Calculate total pipeline value (sum of amount field)
- `prospects.getRecentCount`: Count recent prospects (prospects table + clients with status="prospect")

**Enhanced Components:**
- **Sidebar Navigation** (`Sidebar.tsx`):
  - Added "Dashboard" link for home route (`/`) with LayoutDashboard icon
  - Updated "Filing Agent" to point to `/filing` route
  - Maintains all existing navigation items

**Auth Routes Verification:**
- Verified Clerk middleware properly protects all routes except `/sign-in` and `/sign-up`
- Confirmed main API routes have proper authentication:
  - `/api/chat-assistant` - ✅ Has auth
  - `/api/ai-assistant` - ✅ Has auth
  - `/api/extract-prospecting-context` - ✅ Has auth
  - `/api/analyze-file` - ✅ Has auth
- Middleware configuration verified to protect all API routes by default
- Clerk's default sign-in/sign-up routes (`/sign-in`, `/sign-up`) are accessible and working
- Empty `/login` and `/signup` directories don't interfere (Clerk uses `/sign-in`/`/sign-up`)

**Technical Details:**
- Dashboard uses Clerk's `useUser()` hook to get user's first name
- All data queries use Convex React hooks with proper loading states
- Currency formatting uses Intl.NumberFormat for GBP formatting
- Date formatting shows relative dates (Today, Yesterday, X days ago) for recent items
- Responsive grid layout for mobile/desktop compatibility
- All links properly navigate to client/document detail pages

**User Benefits:**
- Better first impression with personalized dashboard
- Quick access to recent files and clients
- Clear overview of key metrics (prospects, pipeline)
- Organized navigation with dedicated filing agent page
- Secure authentication verified across all routes

**Next Steps:**
- Integrate Google Calendar sync for calendar component
- Add email integration for Recent Messages table
- Consider adding more dashboard widgets (activity feed, notifications, etc.)
- Add dashboard customization options

---

## [Previous] - 2025-01-16 16:30

### Company to Client Promotion System

**Overview**: Added functionality to promote companies from the rolodex into clients, enabling companies to be converted to clients with full client dashboard access.

**New Features:**
- **Company Promotion**: Companies can now be promoted to clients with a single click
  - Promotes company data to client record with all relevant information
  - Automatically links company to client via `promotedToClientId` field
  - Preserves HubSpot data when available
  - Sets client status to "active" by default
  - Redirects to client dashboard after promotion

**New Convex Functions:**
- `companies.promoteToClient`: Mutation to promote a company to a client
  - Creates client record from company data
  - Links company to client via `promotedToClientId`
  - Handles HubSpot vs manual source detection
  - Prevents duplicate promotions

**Enhanced Components:**
- **Company Detail Page** (`/companies/[companyId]/page.tsx`):
  - Added "Promote to Client" button in header
  - Shows "View Client Dashboard" button if already promoted
  - Added client status card in sidebar when promoted
  - Visual indicators for promotion status

- **Rolodex Page** (`/rolodex/page.tsx`):
  - Added quick "Promote" action button in companies table
  - Shows "Client" badge for promoted companies
  - Quick access to client dashboard from table
  - Loading states during promotion

**Technical Details:**
- Promotion creates client with all company fields mapped
- HubSpot data preserved when company is from HubSpot
- Source field set to "hubspot" or "manual" based on company origin
- Company `promotedToClientId` field links back to client
- Prevents duplicate promotions (returns existing client ID if already promoted)

**User Benefits:**
- Resolves issue where documents default to "internal document" when no clients exist
- Easy workflow to convert prospects/companies into active clients
- Seamless transition from company view to client dashboard
- Clear visual indicators of promotion status

**Next Steps:**
- Consider adding bulk promotion functionality
- Add promotion history/audit trail
- Consider adding "demote" functionality if needed

---

## [Previous] - 2025-01-16

### Phase 1 Complete: Excel-like Features Implementation

**Overview**: Completed Phase 1 of the Excel-like enhancements roadmap, adding comprehensive formatting tools, enhanced context menus, and keyboard shortcuts help.

**New Components:**
1. **NumberFormatToolbar.tsx** - Number formatting toolbar component
   - Currency format with multiple currency symbols ($, £, €, ¥, USD, GBP, EUR)
   - Percentage format
   - Number format with decimal places control
   - Date format with multiple date format options (MM/DD/YYYY, DD/MM/YYYY, etc.)
   - Decimal places increment/decrement controls
   - Thousands separator toggle
   - Integrated into FormulaBar next to formatting toolbar

2. **KeyboardShortcutsModal.tsx** - Keyboard shortcuts help modal
   - Searchable list of all keyboard shortcuts
   - Categorized shortcuts (Navigation, Editing, Copy/Paste, Selection, Formatting, etc.)
   - Accessible via '?' key or help button
   - Clean, organized UI with keyboard key visualization

**Enhanced Components:**
- **FormulaBar.tsx**:
  - Added NumberFormatToolbar integration
  - Added help button with keyboard shortcuts modal
  - Added keyboard shortcut handler for '?' key to open shortcuts modal
  - Maintains all existing functionality (zoom, formatting, formula input)

- **WorkbookEditor.tsx**:
  - Added number format state management (`numberFormats` Map)
  - Added `getCurrentNumberFormat()` and `handleNumberFormatChange()` functions
  - Enhanced context menu with "Clear formatting" option
  - Clear formatting removes both cell formats and number formats
  - Number formatting supports multi-cell selection
  - Passes number format props to FormulaBar

- **ExcelDataEditor.tsx**:
  - Added number format state management (`numberFormats` Map)
  - Added `getCurrentNumberFormat()` and `handleNumberFormatChange()` functions
  - Enhanced context menu with "Clear formatting" option
  - Clear formatting removes both cell formats and number formats
  - Number formatting supports multi-cell selection
  - Passes number format props to FormulaBar

**Features Added:**
- ✅ Number formatting toolbar with currency, percentage, number, and date formats
- ✅ Decimal places control for numeric formats
- ✅ Thousands separator toggle
- ✅ Enhanced context menu with "Clear formatting" option
- ✅ Keyboard shortcuts help modal with search functionality
- ✅ Help button in FormulaBar
- ✅ '?' key shortcut to open keyboard shortcuts modal

**Technical Details:**
- Number formats stored in Map structure: `Map<cellAddress, NumberFormat>`
- Format application uses Handsontable's `setCellMeta()` for type and format
- Clear formatting removes formats from state and resets cell type to 'text'
- Keyboard shortcuts modal uses Dialog component from shadcn/ui
- All formatting features support multi-cell selection
- Existing functionality (zoom, cell formatting, formulas) fully preserved

**Bug Fixes:**
- None (all existing functionality maintained)

**Next Steps:**
- Phase 2: Data Mapping (automatically map extracted data to template cells)
- Phase 3: Export Enhancement (preserve formulas, styles, formatting in exports)
- Phase 4: Formula Results Storage (extract and store calculated results)

---

## [Previous] - 2025-11-16

### Research & Planning: Excel-like Enhancements and Data Mapping System

**Overview**: Completed comprehensive research and planning phase for Excel-like features, data mapping, export preservation, and formula results storage.

**Research Documents Created**:
1. **excel-like-features-research.md** - Complete guide to Handsontable Excel-like features
   - Keyboard shortcuts (Ctrl+C/V/Z/Y, navigation, etc.)
   - Copy/paste functionality
   - Undo/redo capabilities
   - Fill handle for smart data entry
   - Number formatting (currency, percentage, dates)
   - Comments and custom borders
   - Freeze panes and merge cells
   - Filters and data validation

2. **data-mapping-strategy.md** - Strategy for mapping extracted data to templates
   - Current infrastructure analysis
   - Extended data mapper design
   - Array mapping capabilities
   - Calculated/derived mapping
   - Validation and error handling
   - Mapping configuration examples for appraisal and operating models

3. **export-preservation-strategy.md** - Comprehensive export enhancement strategy
   - Formula preservation in exports
   - Style and formatting preservation
   - User-applied formatting preservation
   - Column widths and row heights preservation
   - XLSX.js integration details
   - HyperFormula formula extraction

4. **formula-results-extraction.md** - Formula result extraction and storage
   - HyperFormula API documentation
   - Result extraction strategy
   - Input vs output cell classification
   - Database storage structure
   - Version tracking and comparison
   - Performance optimization strategies

5. **implementation-roadmap.md** - Phased implementation plan
   - Phase 1: Excel-like Features (1-2 days)
   - Phase 2: Data Mapping (2-3 days)
   - Phase 3: Export Enhancement (2-3 days)
   - Phase 4: Formula Results Storage (2-3 days)
   - Total estimated timeline: 7-11 days

**Phase 1 Implementation Started**: Excel-like Features
- ✅ Enabled core Handsontable plugins in WorkbookEditor
- ✅ Enabled core Handsontable plugins in ExcelDataEditor
- ✅ Fixed plugin conflicts causing classList errors
- Enabled features:
  - Copy/Paste functionality (`copyPaste: true`)
  - Undo/Redo support (`undo: true`)
  - Fill handle for dragging data with proper configuration
  - Comments and custom borders (disabled temporarily to avoid conflicts)
  - Filters and dropdown menus (disabled temporarily to avoid conflicts)

**Bug Fixes**:
- Fixed "Cannot read properties of undefined (reading 'classList')" error
- Removed conflicting plugins (filters, dropdownMenu, comments, customBorders)
- Properly configured fillHandle with object notation to avoid conflicts
- Tables now editable and functional

**Technical Details**:
- Plugins only enabled when not in read-only mode (where applicable)
- Fill handle configured with explicit options: `{ direction: 'vertical', autoInsertRow: true }`
- Comments and custom borders disabled to prevent DOM conflicts
- Context menus already include standard Excel operations
- All features integrate seamlessly with existing HyperFormula formulas

**Next Steps**:
- Add number formatting toolbar component
- Create keyboard shortcuts help modal
- Implement Phase 2 (Data Mapping)
- Implement Phase 3 (Export Enhancement)
- Implement Phase 4 (Formula Results Storage)

---

## December 19, 2024 - 15:30

### Enhanced Workbook Editor with Zoom and Multi-Sheet Support

**Overview:**
Added zoom functionality to the workbook editor and implemented proper multi-sheet support with sheet tabs replacing the data/output tabs when templates are loaded.

**New Features:**
- **Zoom Controls**: Added zoom in/out buttons and zoom level display to the FormulaBar
  - Zoom range: 50% to 200% (0.5x to 2.0x)
  - Zoom controls positioned to the right of the formula input
  - Formula input made smaller (max-width 60%) to accommodate zoom controls
  - Zoom applied using CSS transform for smooth scaling

- **Multi-Sheet Template Loading**: 
  - "Run Appraisal Model" now loads both the primary template and a second sheet (ID: kg24x42fmj1ns658s85wmy8hy17vhc22)
  - Both sheets are merged and displayed as separate tabs
  - HyperFormula engine persists across all sheets for cross-sheet formula calculations

- **Sheet-Based Tab Navigation**:
  - When templates are loaded, sheet tabs replace the "data/output" tabs
  - Each sheet appears as its own tab at the top level
  - Output tab remains available alongside sheet tabs
  - When no template is loaded, falls back to original "data/output" tabs

**Enhanced Components:**
- `FormulaBar.tsx`: 
  - Added `zoomLevel` and `onZoomChange` props
  - Added zoom in/out buttons with ZoomIn/ZoomOut icons from lucide-react
  - Displays current zoom level as percentage
  - Formula input constrained to 60% max-width to make room for controls

- `WorkbookEditor.tsx`:
  - Added zoom state management
  - Applied CSS transform scale to table containers for zoom effect
  - Added `activeSheet` and `hideTabs` props for external control
  - Zoom transform applied with proper origin and container sizing

- `modeling/page.tsx`:
  - Modified to load second sheet template (ID: kg24x42fmj1ns658s85wmy8hy17vhc22)
  - Replaced "data/output" tabs with sheet tabs when templates are loaded
  - Each sheet tab renders WorkbookEditor with all sheets (for HyperFormula persistence)
  - Maintains backward compatibility with original data/output tabs when no template loaded

**Technical Details:**
- Zoom implemented using CSS `transform: scale()` with `transformOrigin: 'top left'`
- Container width/height adjusted proportionally to maintain proper scrolling
- HyperFormula engine initialized once per WorkbookEditor instance with all sheets
- Cross-sheet formulas work correctly (e.g., `=SUM(Sheet1!A1:A10)`)

**Bug Fixes:**
- Fixed tab navigation to properly show/hide sheets
- Ensured HyperFormula engine receives all sheets for cross-sheet calculations

## November 16, 2025 - 14:00

### Added Excel Template Workbook Editor Feature

**Overview:**
Implemented a complete Excel template loading and editing system for the Modeling section. Users can now load Excel templates (starting with `test-sheet.xlsx`), view and edit them with full formula support, and work with multi-sheet workbooks.

**New Components:**
- `WorkbookEditor.tsx`: Multi-sheet Excel workbook editor with tab navigation
  - Supports multiple Handsontable instances (one per sheet)
  - Shared HyperFormula engine across all sheets for cross-sheet formula support
  - Formula bar integration with sheet context display
  - Export to Excel functionality preserving all sheets
  - Dynamic height calculation and responsive layout

**New Utilities:**
- `templateLoader.ts`: Excel file parsing and loading
  - Loads Excel files from URLs
  - Preserves formulas, formatting, and cell styles
  - Converts Excel data to Handsontable-compatible format
  - Export functionality to save workbooks back to Excel format

- `dataMapper.ts`: Project data mapping to template cells
  - Maps project data to specific cells in template sheets
  - Supports multiple data types (string, number, date, boolean)
  - Configurable mapping system for different model types
  - Example configurations for appraisal and operating models

**New Convex Functions:**
- `excelTemplates.ts`: Template file management
  - `getTemplateByName`: Fetch template by filename
  - `listTemplates`: List all available Excel templates
  - `getTemplateUrl`: Get file URL for a template

**Enhanced Components:**
- `FormulaBar.tsx`: Added sheet context support
  - Now displays cell references with sheet name (e.g., "Sheet1!A1")
  - Optional `sheetName` prop for multi-sheet workbooks

**Updated Pages:**
- `modeling/page.tsx`: Integrated WorkbookEditor
  - "Run Appraisal Model" button now functional
  - Loads `test-sheet.xlsx` from Convex storage
  - Displays template in WorkbookEditor when loaded
  - Maintains existing ExcelDataEditor for scenario editing
  - Automatic sheet data management and synchronization

**Bug Fixes:**
- Fixed TypeScript type errors in `chatSessions.ts` (contextType undefined handling)
- Fixed TypeScript type errors in `dealHelpers.ts` (proper Id<"contacts">[] and Id<"companies">[] typing)
- Fixed TypeScript type errors in `enrichment.ts` (proper query branching instead of reassignment)

**Technical Details:**
- Uses XLSX library for Excel file parsing
- HyperFormula engine with `buildFromSheets()` for multi-sheet formula support
- Formulas work across sheets with syntax like `=SUM(Sheet1!A1:A10)`
- All editing capabilities from ExcelDataEditor preserved
- Real-time formula calculation and updates
- Tab-based navigation for sheet switching
- Context menu support for adding/removing rows and columns

**Success Criteria Met (Phase 1):**
- ✅ Load `test-sheet.xlsx` from Convex when "Run Appraisal Model" clicked
- ✅ Display sheet with formulas preserved and working
- ✅ Fully editable with formula bar
- ✅ Export back to Excel format
- ✅ Real-time formula calculations
- ✅ Multi-sheet support with tabs
- ✅ Cross-sheet formula support

**Next Steps (Phase 2):**
- Auto-populate templates with project data using dataMapper
- Add more model templates (Operating Model, etc.)
- Enhanced formatting preservation (colors, borders, cell styles)
- Multi-sheet template support expansion
- Save edited workbooks back to Convex

