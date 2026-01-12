# Development Changelog

## [Latest] - 2026-01-12 16:00

### Document Library Redesign - Google Drive-Inspired Interface

**Major Feature**: Complete redesign of the Document Library with a modern 3-pane file browser interface inspired by Google Drive and Apple Finder. Designed to scale to thousands of files across hundreds of clients.

**New UI Components** (`src/app/docs/components/`):
- `DocsSidebar.tsx` - Left sidebar with client list
  - Global search across clients
  - "Inbox" section for unfiled documents with count
  - Filter tabs (All / Borrower / Lender)
  - Virtualized client list for performance (@tanstack/react-virtual)
  - Document count per client
- `FolderBrowser.tsx` - Middle pane folder navigation
  - Client-level folders with nested structure
  - Expandable project list with folders
  - Project shortcode display
  - Document counts per folder (including empty folders)
- `FileList.tsx` - Right pane file display
  - Grid/list view toggle
  - Sort options (date, name, size)
  - Upload button
- `FileCard.tsx` - Individual file card
  - File type icon based on MIME type
  - Generated document name (primary) + original filename (secondary)
  - Document type and category badges
  - Quick actions dropdown (View, Download, Move, Delete)
- `FileDetailPanel.tsx` - Slide-out detail drawer
  - PDF/image preview with iframe
  - Document metadata (type, category, size, upload date, version)
  - Full document summary
  - Download and delete actions
- `BreadcrumbNav.tsx` - Path breadcrumb navigation

**New Convex Queries** (`convex/documents.ts`):
- `getUnfiled` - Get documents without a client association
- `getUnfiledCount` - Count of unfiled documents for Inbox badge
- `getByFolder` - Get documents by folder type and level (client/project)
- `getClientDocumentCounts` - Document counts per client for sidebar
- `getFolderCounts` - Document counts per folder for a client
- `getProjectFolderCounts` - Document counts per project folder

**Page Rewrite** (`src/app/docs/page.tsx`):
- Full-height 3-pane layout
- Header with breadcrumbs and Review Queue link
- Integrated all new components
- State management for client, folder, and document selection
- File detail panel slide-out

**Performance Optimizations**:
- Virtualized client list using @tanstack/react-virtual
- Supports hundreds of clients without DOM performance issues
- Efficient folder count queries

**Deprecated Components** (marked with @deprecated):
- `src/components/DocumentsTable.tsx`
- `src/components/InternalDocumentsTable.tsx`
- `src/components/UnclassifiedDocumentsTable.tsx`

**Key Design Changes**:
- Removed "Internal Documents" concept - all documents under clients
- Unfiled documents shown in "Inbox" instead of "Unclassified" tab
- Folders always visible (even when empty)
- Download functionality with proper file handling
- File preview for PDFs and images

---

## 2026-01-12 12:00

### Bulk Upload Feature - High Volume Document Processing

**Major Feature**: Added a comprehensive bulk upload system to the File Organization Agent, enabling users to upload up to 100 documents at once with simplified analysis, client/project pre-selection, and standardized document naming.

**New Schema Tables** (`convex/schema.ts`):
- `bulkUploadBatches` - Groups files uploaded together
  - Required client association, optional project association
  - Status tracking: uploading, processing, review, completed, partial
  - Internal/external classification at batch level
  - File counts and progress tracking
- `bulkUploadItems` - Individual files within a batch
  - Per-file status, analysis results, and version control
  - Duplicate detection and resolution tracking
  - Extraction toggle per file
- `clientFolders` - Standard folder structure for clients
  - Background (with KYC and Background subfolders)
  - Miscellaneous folder for unclassified files
- `projectFolders` - 8 standard folders per project
  - Background, Terms comparison, Terms request, Credit submission
  - Post-completion documents, Appraisals, Notes, Operational Model

**Schema Modifications**:
- `projects` table - Added `projectShortcode` field (max 10 chars) for document naming
- `documents` table - Added `folderId`, `folderType`, `isInternal`, `version`, `uploaderInitials`, `previousVersionId` fields

**New Convex Files**:
- `convex/bulkUpload.ts` - Batch and item CRUD operations
  - createBatch, addItemToBatch, updateItemStatus, updateItemAnalysis
  - checkForDuplicates, setVersionType, fileItem, fileBatch
  - getBatch, getBatchItems, getBatchStats, getPendingBatches
- `convex/folderStructure.ts` - Folder management utilities
  - Category-to-folder mapping, folder creation, type abbreviations

**New API Endpoints**:
- `/api/bulk-analyze` - Summary-only analysis endpoint
  - Faster processing (skips extraction gauntlet)
  - Returns summary, file type, category, confidence, suggested folder

**New Client-Side Files**:
- `src/lib/bulkQueueProcessor.ts` - Sequential file processing
- `src/lib/documentNaming.ts` - New naming convention utilities
  - Format: `<ProjectShortcode>-<Type>-<INT/EXT>-<Initials>-<Version>-<Date>`
  - Example: `WIMBPARK28-APPRAISAL-EXT-JS-V1.0-2026-01-12`
  - Version control: V1.0 (new), V1.1 (minor), V2.0 (significant)

**New UI Components**:
- `src/components/BulkUpload.tsx` - Main bulk upload interface
  - Step-by-step client/project selection
  - Internal/external toggle
  - Instructions input
  - Drop zone for up to 100 files
- `src/components/BulkReviewTable.tsx` - Table-based review
  - Inline editing for type, category, folder, internal/external
  - Version control for duplicates
  - Extraction toggle per file

**New Pages**:
- `/docs/bulk/[batchId]` - Bulk review page
  - Full batch overview and statistics
  - File all documents button
  - Link to document library after filing

**Modified Files**:
- `src/app/filing/page.tsx` - Added "Bulk Upload" tab
- `src/components/NotificationDropdown.tsx` - Added bulk upload batches section
- `convex/clients.ts` - Auto-creates client folders on client creation
- `convex/projects.ts` - Added projectShortcode, auto-creates 8 project folders

---

## 2025-12-05 18:15

### Computed Category Totals with Override Support

**Feature**: Auto-computed category totals that are exportable to models, with manual override capability.

**Schema Updates** (`convex/schema.ts`):
- Added `isComputed` and `computedFromCategory` fields to `projectDataItems` table

**Backend Changes** (`convex/projectDataLibrary.ts`):
- Updated `getProjectLibrary` query to automatically compute category totals
  - Groups items by category and sums currency values
  - Returns virtual computed items with codes like `<total.construction.costs>`
  - Checks for manual overrides and uses those instead if present
- Added `overrideCategoryTotal` mutation for manual total overrides
- Added `clearCategoryTotalOverride` mutation to revert to computed value
- Added `getCategoryTotalCodeQuery` helper query

**UI Updates** (`src/components/DataLibrary.tsx`):
- Redesigned `ProjectDataCategoryGroup` component:
  - Separates regular items from computed totals
  - Displays computed totals in distinct blue gradient row
  - Shows "Auto" badge for computed, "Override" badge for manual values
  - Edit icon opens override modal
- Added override modal with:
  - Value input for manual override
  - "Use Computed" button to revert overrides
  - Clear feedback on computed vs override state

**Documentation** (`src/app/settings/modeling-codes/page.tsx`):
- Added new "Instructions" tab to Modeling Code Mappings page
- Comprehensive documentation covering:
  - Codification system overview
  - Item codes explanation with examples
  - Category totals feature with auto-generated codes
  - Override functionality documentation
  - Alias dictionary (Fast Pass) explanation
  - Categories explanation
  - Tips for better extraction

---

## 2025-12-05 10:30

### Unified Project Data Library - Multi-Document Data Aggregation

**Major Feature**: Transformed the modeling section from per-document data viewing to a project-level data aggregator with full provenance tracking, revision history, and audit capabilities.

**New Schema Tables** (`convex/schema.ts`):
- `projectDataItems` - Unified data library per project (one row per item code)
  - Full value history with source tracking
  - Multi-source detection with variance calculation
  - Manual override tracking with user stamps
  - Soft delete support for recovery
- `dataLibrarySnapshots` - Point-in-time snapshots for model runs and revert
  - Created automatically on model runs
  - Supports manual saves and pre-revert backups
  - Links to model runs for traceability
- `modelExports` - Track all exports with bill of materials
  - Source document tracking
  - Manual override audit trail
  - Export type classification

**Updated Schema Tables**:
- `modelRuns` - Added sourceDocumentIds, dataLibrarySnapshotId, billOfMaterials
- `codifiedExtractions` - Added mergedToProjectLibrary, mergedAt, soft delete fields

**New Convex Files**:
- `convex/projectDataLibrary.ts` - Core library mutations and queries
  - mergeExtractionToLibrary, revertDocumentAddition, revertItemToVersion
  - manualOverrideItem, addManualItem, deleteItem, restoreItem
  - getProjectLibrary, getChangedItems, getItemHistory, getLibraryStats
- `convex/dataLibrarySnapshots.ts` - Snapshot management
  - createSnapshot, revertToSnapshot, compareSnapshots, cleanupOldSnapshots
- `convex/modelExports.ts` - Export tracking
  - recordExport, recordExportWithBOM, getExportsByProject

**Updated Convex Files**:
- `convex/codifiedExtractions.ts` - Added mergeToProjectLibrary, softDelete, getDeleteImpact
- `convex/modelRuns.ts` - Added saveModelWithSnapshot for full provenance tracking

**New UI Components**:
- `src/components/DataLibraryHistoryModal.tsx` - Revision timeline with revert capability
- `src/components/DocumentContributionsPanel.tsx` - Batch revert for document data
- `src/components/DeleteExtractionModal.tsx` - Multi-step deletion with impact preview

**Updated UI Components**:
- `src/components/DataLibrary.tsx` - Complete overhaul with three view modes:
  - **All Data**: Unified projectDataItems view with source column
  - **By Document**: Existing per-document codifiedExtractions view
  - **Changes**: Filter to items with multiple sources/values
  - "Add to Library" button for confirmed extractions
  - Library stats banner showing items, documents, overrides
  - Expandable value history per item

**SmartPass Enhancement** (`src/lib/smartPassCodification.ts`):
- Added projectLibraryItems parameter for consistency checking
- SmartPass now considers existing project library codes
- Prefers reusing existing codes over creating new ones

**Key Features**:
1. Data aggregates across all project documents (100+ items supported)
2. Every value knows its source document
3. Value history tracks all changes with timestamps
4. Document-level and item-level revert capability
5. Automatic snapshots on model runs
6. Bill of materials for every export
7. Manual override tracking with notes
8. Soft delete with recovery option

---

## [Previous] - 2025-12-05 00:15

### Extraction Pipeline Upgrade - Maverick 4 & Force Extraction Toggle

**Model Upgrade**: Upgraded all extraction routes to use Llama 4 Maverick (meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8):
- 17B active parameters, 128 experts, 400B total params
- 1M token context window - handles large workbooks without truncation
- Superior reasoning for complex financial documents

**New File**: `src/lib/modelConfig.ts`
- Centralized model configuration for all AI operations
- Configurable maxTokens per use case:
  - Extraction/Normalization/Verification: 65,000 tokens
  - Analysis: 8,000 tokens
  - Codification: 32,000 tokens
  - Chat: 4,000 tokens

**Updated Files** (model imports):
- `src/lib/dataExtraction.ts`
- `src/lib/dataNormalization.ts`
- `src/lib/dataVerification.ts`
- `src/lib/smartPassCodification.ts`
- `src/lib/togetherAI.ts`
- `src/app/api/ai-assistant/route.ts`
- `src/app/api/codify-extraction/route.ts`

**New Feature**: "Extract Financial Data" Toggle
- Added toggle in FileUpload.tsx next to "Add Instructions"
- When enabled, forces extraction on ANY file type (not just spreadsheets)
- Bypasses automatic classification checks
- New `forceExtraction` field in fileUploadQueue schema

**Updated Files** (extraction toggle):
- `convex/schema.ts` - Added forceExtraction field
- `convex/fileQueue.ts` - Handle forceExtraction in createJob
- `src/lib/useFileQueue.ts` - Pass forceExtraction to processor
- `src/lib/fileQueueProcessor.ts` - Include forceExtraction in API calls
- `src/components/FileUpload.tsx` - New toggle UI with Database icon
- `src/app/api/analyze-file/route.ts` - Respect forceExtraction flag

**Enhanced Spreadsheet Classifier** (`src/lib/spreadsheetClassifier.ts`):
- Added complexity detection (simple/moderate/complex)
- Sheet count detection for multi-sheet workbooks
- Summary sheet detection (looks for "Summary", "Appraisal", etc.)
- New extraction keywords: revenue, profit, stamp duty, residual valuation
- Complex workbooks with summary sheets auto-trigger extraction

---

## [Previous] - 2025-12-04 23:45

### Quick Export Enhancements - Currency Formatting & Cleanup

**Currency Formatting** (`src/lib/xlsmPopulator.ts`):
- Currency values now display with £ symbol when inserted
- Applied Excel number format `£#,##0.00` to currency cells
- Percentage values get `0.00%` format
- Formatting applied in both specific code matches and category fallbacks

**Placeholder Cleanup** (`src/lib/xlsmPopulator.ts`):
- Added PASS 3: Comprehensive cleanup of all remaining placeholders
- Scans all sheets after population and clears any `<...>` patterns
- Handles both specific code placeholders and category fallbacks that weren't filled
- New stat: `placeholdersCleared` tracks how many were cleaned up

**Rich Text Cell Support** (`src/lib/xlsmPopulator.ts`):
- Fixed issue where cells with Rich Text formatting weren't being read
- Extracts text content from RichText objects (used for cells with fonts/colors/hyperlinks)
- Enables `.name` placeholders with formatting to be properly detected and replaced

**Typo Tolerance** (`src/lib/xlsmPopulator.ts`):
- Added common typo variations for category names
- "profesional.fees" and "professioal.fees" now map to "professional.fees"
- Template categories are normalized before lookup to handle spelling variations

---

## [Previous] - 2025-12-04 22:30

### Quick Export Feature - Server-Side Template Population

**New Feature**: Quick Export mode allows populating XLSM templates with codified data on the server and downloading directly, bypassing the web visualization layer while preserving all macros, styles, images, and charts.

**New Package**:
- Added `xlsx-populate` for XLSM file manipulation that preserves macros and formatting

**New Files**:
- `src/lib/xlsmPopulator.ts`: Server-side XLSM population utility
  - Scans for placeholders (`<item.code>` patterns) in all sheets
  - Matches codified items by code with case-insensitive fallback
  - Handles category fallbacks (`<all.category.name>`, `<all.category.value>`)
  - Preserves all non-data elements (macros, styles, images, charts)
  - Returns population statistics

- `src/app/api/quick-export/route.ts`: API endpoint for quick export
  - Accepts templateId and codifiedItems
  - Fetches template from Convex storage
  - Populates and returns populated XLSM file

**UI Changes**:
- `src/components/DataLibrary.tsx`: Added Quick Export toggle in toolbar
  - Toggle shows lightning bolt icon and switch
  - Appears only when items are fully confirmed
  - Passes mode to Run Model button

- `src/components/ModelLibraryDropdown.tsx`: Updated for quick export mode
  - Button changes from "Run Model" to "Quick Export" with amber styling
  - Dropdown header shows "Quick Export to Excel" with macro preservation note
  - Template items show "Quick" badge when in quick export mode

- `src/app/modeling/page.tsx`: Added quick export flow handling
  - New state: `isQuickExportMode`, `isQuickExporting`
  - `handleRunModel` now handles quick export path
  - Calls API, triggers file download, skips WorkbookEditor

**Bug Fix** (`src/components/SheetClassificationModal.tsx`):
- Fixed nested button hydration error where TooltipTrigger was inside a button
- Changed outer button to div with role="button" and proper keyboard handling

**Bug Fix** (`src/components/TemplateUploadModal.tsx`):
- Fixed "Object has too many fields (1379 > maximum 1024)" error when uploading large templates
- Now uploads sheets in chunks of 3 to avoid Convex field limit
- Aggregates results from all chunks to maintain same API behavior

---

## [Previous] - 2025-12-04 20:45

### Move Optimized Templates to Modeling Settings

**UX Improvement** (`src/components/ModelingSettings.tsx`):
- Moved the new Optimized Templates feature from global settings to the Modeling Settings panel
- Added sub-tabs within Templates tab: "Optimized Templates" and "Legacy Templates"
- Users can now upload optimized templates directly from the Modeling section
- Added template list view with dynamic group badges and sheet counts
- Added delete confirmation dialog with proper cleanup
- Legacy templates still work with amber color scheme to distinguish from new system
- Info banners explain the difference between optimized and legacy templates

**Bug Fix** (`src/components/AssignToClientModal.tsx`):
- Fixed TypeScript error where `useQuery(api.clients.list)` needed empty object argument

---

## [Previous] - 2025-12-04 20:15

### Template System Refactor - Dynamic Sheet Generation

**New Convex Schema** (`convex/schema.ts`):
- Added `templateDefinitions` table for template metadata with core/dynamic sheet classification
- Added `templateSheets` table for individual sheet storage (JSON format, lazy loading support)
- Supports dynamic groups with min/max/default counts and placeholder patterns

**New Convex APIs**:
- `convex/templateDefinitions.ts`: CRUD operations for template definitions
  - `listActive`, `listAll`, `getById`, `getByName`
  - `create`, `update`, `updateSheetConfiguration`, `incrementVersion`
  - `activate`, `deactivate`, `deleteTemplate`
- `convex/templateSheets.ts`: Individual sheet operations
  - `listByTemplate`, `getById`, `getSheetData`, `getMultipleSheetsData`
  - `create`, `batchCreate`, `updateMetadata`, `updateData`
  - `deleteSheet`, `cloneSheet` (with placeholder replacement)

**New UI Components**:
- `SheetClassificationModal.tsx`: Classify sheets as core vs dynamic during upload
  - Group configuration: min/max count, placeholder pattern (e.g., `{N}`)
  - Visual preview of sheet assignments
- `TemplateUploadModal.tsx`: Enhanced upload flow
  - Parse Excel → Classify Sheets → Create template with JSON storage
  - Progress indicators and validation
- `ConfigureModelModal.tsx`: Configure model generation
  - Select count for each dynamic group
  - Preview generated sheet names
  - Generate button with total count
- Added `ui/scroll-area.tsx` and `ui/progress.tsx` components

**Template Loading** (`src/lib/templateLoader.ts`):
- Added `loadSheetFromStorageUrl()` for lazy loading large sheets
- Added `convertOptimizedToSheetData()` for JSON → SheetData conversion
- Added `loadOptimizedSheets()` for parallel loading
- Added `generateDynamicSheets()` for multi-site template generation
- Added `validateDynamicTemplate()` for configuration validation

**Dynamic Sheet Generator** (`src/lib/dynamicSheetGenerator.ts`):
- `generateModelSheets()`: Core generation function
- `cloneSheetWithReplacement()`: Deep clone with placeholder replacement
- `validateDynamicConfig()`: Pre-generation validation
- `previewGeneratedSheets()`: UI preview helper
- `getOptimalSheetOrder()`: Optimal sheet ordering

**Settings Page Update** (`src/app/settings/modeling-templates/page.tsx`):
- Added tabs: "Optimized Templates" vs "Legacy Templates"
- Optimized templates use new JSON storage with dynamic support
- Legacy templates continue using Excel file storage

---

## [Previous] - 2025-12-04 18:30

### Workbook Editor Performance Improvements

**Phase 1 - Pre-computed Cell Metadata** (`src/components/WorkbookEditor.tsx`):
- Added `precomputedStyleMeta` useMemo that pre-builds renderers for cells with Excel styles
- Reduced `cells()` callback from O(n) style computation to O(1) Map lookup
- Style renderers are created once when sheets load, not on every cell render

**Phase 2 - HyperFormula Batch Operations** (`src/lib/hyperFormulaService.ts`):
- Added `runWithSuspendedEvaluation()` helper method for bulk operations
- Lowered batch threshold from 50 to 10 for earlier optimization in `syncCellChanges()`
- Prevents unnecessary recalculations during bulk cell updates

**Phase 3 - Optimized HyperFormula Configuration** (`src/lib/hyperFormulaService.ts`):
- Enabled `smartRounding: true` for faster financial calculations

**Phase 4 - Reduced Viewport Rendering** (`src/components/WorkbookEditor.tsx`):
- Reduced `viewportRowRenderingOffset` from 100 to 50
- Reduced `viewportColumnRenderingOffset` from 15 to 10
- Decreases initial render load and memory usage

**Phase 5 - Sheet Switch Optimization** (`src/components/WorkbookEditor.tsx`):
- Added effect to clear editing state on sheet switch
- Clears `editingCellRef`, formula bar, and selection when changing sheets
- Uses `batch()` for grouped operations on sheet switch
- Preserves formula bar and formatting functionality on current sheet

**Preservation Notes**:
- All formula bar functionality preserved (Enter commits, Escape cancels)
- Formula mode cell reference insertion still works
- Formatting toolbar buttons apply correctly
- Cross-sheet formulas calculate correctly (all sheets loaded into HyperFormula)

---

## [Previous] - 2025-12-04 17:00

### Three-Level Sidebar Navigation

**Navigation Hierarchy** (`src/app/modeling/page.tsx`):
- **Level 1 - Clients**: Lists all clients with extracted data, shows project count
- **Level 2 - Projects**: Lists projects for selected client, back to "All Clients"
- **Level 3 - Models**: Lists saved model versions, back to client name

**UI Improvements**:
- Each level has smooth slide animation on transition
- Arrow indicators on client/project cards
- Settings cog available on all levels
- "Data Library" button in Level 3 header for quick access
- Compact headers - removed "Modeling" title from Level 2/3

**Data Structure**:
- Added `clientsWithProjects` computed array grouping projects by client
- Added `projectsForSelectedClient` for filtered project list
- Added `selectedClientName` state for client selection

---

## [Previous] - 2025-12-04 16:15

### Multi-Stage Sidebar Navigation (2-Level)

**Drill-Down Navigation Pattern** (`src/app/modeling/page.tsx`):
- Level 1 (Projects): Shows all projects with extracted data
- Level 2 (Versions): Click project → shows all saved model versions for that project
- Back button "← All Projects" to return to Level 1
- Project header shows name and client in Level 2

**Level 2 - Saved Versions View**:
- Lists all saved model runs for the project
- Each item shows: template name, version badge, date saved
- Version name displayed in monospace (e.g., `v1-appraisal-2025-12-04`)
- Click to load saved version directly into the editor

**UI Improvements**:
- Filters (client, project) only shown in Level 1
- Level 2 header shows "Saved model versions" hint
- "View saved models →" indicator on each project card
- Clean separation between navigation levels

---

## [Previous] - 2025-12-04 15:30

### Fix Scenario Saving with Auto-Versioning

**Schema Update** (`convex/schema.ts`):
- Added `fileStorageId` field to `modelRuns` for Excel file storage in Convex
- Added `projectId` field for easier version queries per project
- Added new indexes: `by_project`, `by_project_modelType`

**Auto-Versioning System** (`convex/modelRuns.ts`):
- New `getNextVersion` query: auto-calculates next version number per project + model type
- New `getProjectVersions` query: gets all versions for a project
- New `saveModelVersion` mutation: saves with auto-versioning (`v{N}-{modelType}-{date}`)
- New `generateModelUploadUrl` mutation: generates upload URL for Excel files
- New `attachFileToModelRun` mutation: links uploaded file to model run
- New `getModelFileUrl` query: gets download URL for saved Excel files

**Save Model Modal** (`src/components/SaveModelModal.tsx` - NEW):
- Proper "Save Model" flow with auto-generated version names
- Shows version info: number, type, auto-generated name (e.g., `v1-appraisal-2025-12-04`)
- Optional description for notes
- Checkbox to save Excel file to Convex cloud storage
- Saves full workbook structure (all sheets, column widths, data)

**Excel File Storage** (`src/lib/templateLoader.ts`):
- New `exportToExcelBlob` function: exports workbook to Blob for upload
- Files stored in Convex storage with linked `fileStorageId`

**Version Naming Convention**:
- Format: `v{N}-{model-type}-{YYYY-MM-DD}`
- Auto-increments per project + model type
- Examples: `v1-appraisal-2025-12-04`, `v15-appraisal-2025-12-10`

---

## [Previous] - 2025-12-04 14:30

### Modeling Page UI Polish

**Unified Action Toolbar** (`src/components/DataLibrary.tsx`):
- Reorganized header with all action buttons on one line: Run Model, Reset, Add Item, Export
- Moved Run Model dropdown from main toolbar into DataLibrary header
- Reset button now part of the main toolbar row instead of floating in status banner
- Cleaner layout with left/center/right alignment

**Compact Version History Selector** (`src/components/DocumentTabs.tsx`):
- Replaced full-width tabs with compact dropdown selector
- Shows current file name, version badge, and date in a single button
- Popover opens to show all versions with search capability
- "Version History" label in dropdown for clarity
- Single document shows simple inline indicator (no dropdown)

**Fixed Scenario Click Behavior** (`src/app/modeling/page.tsx`):
- Clicking a scenario in sidebar now sets `viewMode: 'scenario'` 
- Direct access to workbook/sheet view instead of going to data library
- Client click still goes to data library (expected behavior)
- Added ExcelDataEditor view for scenarios without template sheets

**Scenarios Management Modal** (`src/components/ScenariosListModal.tsx` - NEW):
- New modal for viewing all scenarios when project has many (3+ shown in sidebar)
- Search functionality to filter scenarios by name or description
- Shows version, creation date, and update date for each scenario
- Sorted by most recently updated
- "View all X scenarios" link in sidebar opens modal

---

## [Previous] - 2025-12-03 18:45

### Excel Clone Fixes - Formula Bar, Formatting Toolbar & Zoom

**Fixed Formula Bar Not Displaying Cell Values** (`src/components/WorkbookEditor.tsx`):
- Root cause: Stale closure in `afterSelection` callback was capturing outdated refs
- Fix: Now gets cell values directly from `hotTableRefs.current.get(sheet.name).hotInstance`
- Formula detection still works via HyperFormula service
- No more `setTimeout` delay - immediate value display

**Fixed Formatting Toolbar (Bold, Italic, Colors)** (`src/components/WorkbookEditor.tsx`, `src/app/globals.css`):
- Root cause: Custom renderers in `cells` callback were applying inline styles that overrode CSS classes
- Fix: Removed inline style application from custom renderers
- `handleFormatChange` now only uses `setCellMeta(row, col, 'className', ...)` 
- Added CSS classes: `.cell-bold`, `.cell-italic`, `.cell-underline`, `.cell-color-*`, `.cell-bg-*`
- Handsontable now automatically applies className from metadata (no custom renderer interference)
- Number formatting (currency, percentage, date) still uses custom renderer but ONLY for textContent modification

**Fixed Zoom Using Native Handsontable Properties** (`src/components/WorkbookEditor.tsx`, `src/app/globals.css`):
- Replaced CSS `transform: scale()` with native Handsontable approach
- Added `rowHeights={Math.round(23 * zoomLevel)}` for scaled row heights
- Added `colWidths` function that scales with zoomLevel
- Added `.zoom-level-*` CSS classes for font-size scaling
- Container maintains 100% dimensions at all zoom levels

**Fixed Formula Autocomplete Selection** (`src/components/FormulaEditor.tsx`):
- Added `mousedown` event prevention on autocomplete container
- Prevents editor from losing focus when clicking on formula suggestions
- Reordered operations in `selectFunction()` for reliable insertion

**New CSS Classes** (`src/app/globals.css`):
- `.cell-bold`, `.cell-italic`, `.cell-underline` - text formatting
- `.cell-color-*` (black, white, red, orange, yellow, green, blue, purple, pink, gray) - text colors
- `.cell-bg-*` (same colors) - background colors  
- `.zoom-level-50` through `.zoom-level-100` - font size scaling
- `.formula-cell-highlight` - formula cell styling

---

## [Previous] - 2025-12-03 16:30

### Excel Clone Overhaul - Phase 1: UI, Formatting & Performance

**Major UI Consolidation** (`src/app/modeling/page.tsx`):
- Unified toolbar: Removed separate "Run Model" dropdown and "New Scenario" button when viewing a model
- Renamed "Save Scenario" → "Save Model" for clarity
- Moved sheet dropdown to right side of unified toolbar
- Removed Input/Output tabs - streamlined to single model view
- Added model name display when a template is loaded
- Toolbar uses flex layout with proper overflow handling to prevent page-level horizontal scroll

**FormulaBar Improvements** (`src/components/FormulaBar.tsx`):
- Made formula input responsive: `flex: 1` with `min-width: 120px` and `max-width: 400px`
- Container uses `overflow: hidden` to prevent toolbar overflow
- All child elements properly use `flex-shrink-0` or `min-width: 0` for responsive behavior
- Improved formula autocomplete trigger - now shows for any formula query

**Enhanced Formula Autocomplete** (`src/components/FormulaAutocomplete.tsx`):
- Expanded from 9 to 100+ formulas covering: Math, Statistical, Logical, Text, Date/Time, Lookup, Financial, Information
- Added category tabs for easy filtering (All, Math, Statistical, Logical, Text, Date, Lookup, Financial)
- Improved search: exact match priority, then starts-with, then includes
- Added keyboard navigation hints in footer
- Tab key cycles through categories
- Viewport-aware positioning to prevent overflow
- Shows up to 20 results with "+X more" indicator

**Formatting Toolbar Compactness** (`src/components/FormattingToolbar.tsx`, `src/components/NumberFormatToolbar.tsx`):
- Reduced button sizes: `h-7 w-7` with `w-3.5 h-3.5` icons
- Removed text labels - icons only with tooltips
- Color pickers positioned to right to prevent overflow
- Higher z-index for dropdowns to avoid clipping

**Fixed Number Formatting Persistence** (`src/components/WorkbookEditor.tsx`):
- Fixed closure issue in cell renderers - formats now stored directly in cell metadata via `cellProperties.numberFormat`
- Added Excel serial date conversion helper `excelSerialToDate()`
- Improved currency formatting with proper negative number handling (shows in red)
- Fixed percentage formatting (value × 100)
- Added proper thousands separator handling with decimal support

**Performance Optimizations**:
- Increased viewport offsets: `viewportRowRenderingOffset: 100`, `viewportColumnRenderingOffset: 15`
- Added `renderAllRows: false`, `renderAllColumns: false` for virtualization
- Enhanced `HyperFormulaService.syncCellChanges()` - suspends evaluation for batches > 50 changes
- Added `bulkSetCells()` method for efficient initial data loading
- Data change handler already has 200ms throttling per sheet

---

## [Previous] - 2025-12-04 00:15

### Advanced Placeholder Priority Rules & Multi-Sheet Support

**Three Distinct Placeholder Behaviors** (`src/lib/codifiedTemplatePopulator.ts`):

1. **Specific Codes** - Fill ALL occurrences everywhere, unlimited
   - `<stamp.duty>` can appear 100 times across all sheets
   - Every occurrence gets the same value

2. **Default Category Fallbacks** - Per-sheet deduplication
   - `<all.plots.name>` excludes items matched to specific placeholders ON THE SAME SHEET
   - Same item CAN appear in fallbacks on different sheets

3. **Numbered Sets** - Full copy, no deduplication
   - `<all.plots.name.1>` gets ALL items regardless of specific placements
   - Use for summary sections that need complete lists even when items appear elsewhere

**Per-Sheet Tracking**:
- Changed from global `matchedItemIds` Set to per-sheet `Map<sheetIndex, Set<string>>`
- Track which items are matched on each specific sheet
- Enable items to appear on multiple sheets via both specific and fallback placeholders

**New Regex Patterns**:
- `CATEGORY_FALLBACK_PATTERN`: Matches default fallbacks `<all.category.name>` (excludes numbered)
- `NUMBERED_SET_PATTERN`: Matches numbered sets `<all.category.name.1>`

**Updated Instructions Tab** (`src/components/ModelingSettings.tsx`):
- Added "Section 5: Advanced Multi-Sheet & Numbered Sets"
- Clear documentation of three placeholder types with examples
- Example table showing specific + default + numbered behavior on same sheet
- When to use numbered sets guidance

**Example Scenario**:
```
Sheet 1:
  <plot.1>                    → Plot 1 (specific)
  <plot.2>                    → Plot 2 (specific)
  <all.plots.name>            → Plot 3, Unit Count (excludes 1 & 2)
  <all.plots.name.1>          → Plot 1, 2, 3, Unit Count (full copy)

Sheet 2:
  <all.plots.name>            → Plot 1, 2, 3, Unit Count (ALL items - no specifics on Sheet 2)
```

---

## [Previous] - 2025-12-03 23:00

### End-to-End System Health Check & Category Fixes

**Expanded Category Normalizations** (`src/lib/codifiedTemplatePopulator.ts`):
- Added comprehensive category mapping for all variations:
  - Site Costs: site costs, purchase costs, land costs, land acquisition, etc.
  - Professional Fees: professional fees, consultants, consultant fees, etc.
  - Construction Costs: build costs, building costs, construction, etc.
  - Financing Costs: finance, finance costs, loan costs, interest, etc.
  - Disposal Costs: sales costs, selling costs, marketing, etc.
  - **Plots/Units**: plots, units, houses, homes, properties, dwellings, development
  - Revenue: sales, income, gross development value, gdv
  - Profit: profits, margin, returns
  - Other: uncategorized, miscellaneous, misc, general

**Detailed Population Summary Logging**:
- Added comprehensive logging at start of template population
- Shows items by status (matched, confirmed, suggested, pending_review, unmatched)
- Shows items by raw category with their normalized form
- Shows usable items ready for category fallback by normalized category
- Helps diagnose why categories aren't populating

**Auto Fast Pass on Document Save**:
- Fast Pass codification now automatically triggered when documents are saved
- Added to `src/app/uploads/[jobId]/page.tsx` after document creation
- Added to `src/components/FileAssignmentCard.tsx` after document creation
- Creates `codifiedExtractions` record in database immediately (not just preview)
- Non-blocking - doesn't slow down document save flow

**Debug Codification Endpoint** (`src/app/api/debug-codification/route.ts`):
- New endpoint: GET `/api/debug-codification?documentId=xxx`
- Returns detailed diagnostic information:
  - Current extraction items with categories and statuses
  - Category normalization mappings
  - Usable items by normalized category
  - Items grouped by status
  - Supported fallback patterns
  - Troubleshooting tips

**Refresh Population Button** (`src/app/modeling/page.tsx`):
- Replaced legacy "Refresh Data" button with green refresh icon
- Uses new codified data system (not legacy placeholder mapping)
- Re-runs `populateTemplateWithCodifiedData()` from original template
- Shows amber color when not all items are confirmed
- Works with confirmed and matched items only

**Categories Tab UX Improvement** (`src/components/ModelingSettings.tsx`):
- Each category card now shows the fallback placeholder codes clearly
- Shows `<all.{category}.name>` and `<all.{category}.value>` patterns
- Highlighted in amber for visibility

---

## [Previous] - 2025-12-03 22:00

### Simplified Category Fallback Placeholders

**New Simplified Format** (`src/lib/codifiedTemplatePopulator.ts`):
- Changed from numbered format `<all.category.1.name>` to simplified `<all.category.name>`
- Same placeholder can be used on multiple rows - system fills them sequentially (FIFO)
- Rows are detected by scanning all sheets for paired name/value placeholders on the same row
- Top-to-bottom filling: first row gets first unmatched item, second row gets second, etc.

**Manual Cleanup Button** (`src/app/modeling/page.tsx`):
- Added "Clear Unused" button in the Population Status bar
- Shows count of remaining unfilled placeholders
- User can see what's missing before manually clearing
- Clicking clears all remaining `<...>` placeholders from the template

**New Utility Functions**:
- `clearUnusedPlaceholders()` - Removes all unfilled placeholder patterns from sheets
- `countRemainingPlaceholders()` - Returns count and breakdown of unfilled placeholders

**Updated Instructions** (`src/components/ModelingSettings.tsx`):
- Instructions tab now documents the simplified format
- Example shows identical placeholders on consecutive rows
- FIFO row filling explained clearly

**Example Template Setup**:
```
Row 5: <all.professional.fees.name>  | <all.professional.fees.value>
Row 6: <all.professional.fees.name>  | <all.professional.fees.value>
Row 7: <all.professional.fees.name>  | <all.professional.fees.value>
```
When populated with 2 items (Architect £5000, Surveyor £3000):
```
Row 5: Architect Fees              | 5000
Row 6: Surveyor Fees               | 3000
Row 7: <all.professional.fees.name>| <all.professional.fees.value>  <- unfilled, click "Clear Unused"
```

---

## [Previous] - 2025-12-03 21:30

### HyperFormula Integration Refactor & Fortification

**New HyperFormulaService** (`src/lib/hyperFormulaService.ts`):
- Created centralized service class for HyperFormula engine management
- Synchronous engine initialization (critical for proper Handsontable integration)
- Proper lifecycle management with safe destruction to prevent "Cannot read properties of undefined" errors
- Built-in sheetId lookups for multi-sheet workbooks
- Bidirectional data synchronization methods (`syncSheetData`, `syncCellChanges`)
- Formula value change subscription via `onValuesUpdated` listener
- Batch operations support with `suspendEvaluation`/`resumeEvaluation`
- Proper `licenseKey: 'gpl-v3'` configuration

**WorkbookEditor Refactor** (`src/components/WorkbookEditor.tsx`):
- Migrated from direct HyperFormula usage to HyperFormulaService
- Added `sheetId` to formulas plugin config (critical fix - was missing before)
- Added `afterChange` hook to sync user edits to HyperFormula engine
- Added `onValuesUpdated` listener for formula result propagation back to Handsontable
- Removed row truncation limit (was 2000 rows) - formulas now work on full sheets
- Conditional rendering: HotTable only renders when engine is fully ready
- Proper cleanup on unmount - clears Formulas plugin engine reference before destroying
- Fixed formula bar display for formula cells

**Key Fixes**:
1. **Missing `sheetId`**: Each HotTable now correctly references its sheet in the shared engine
2. **Async init race condition**: Engine now initializes synchronously before render
3. **No bidirectional sync**: User edits are now synced to HyperFormula via `setCellContents`
4. **Data copy mismatch**: When sheets change, engine is re-initialized with new data
5. **Formula display**: Formula bar correctly shows formula text for formula cells

**Technical Details**:
- HyperFormula maintains its OWN internal copy of data
- When `populateTemplateWithCodifiedData` modifies sheet.data, WorkbookEditor detects the change and re-initializes the engine
- Formulas starting with `=` are automatically recognized by `buildFromSheets`
- Each `HotTable` gets formulas config with `{ engine, sheetId, sheetName }`

---

## [Previous] - 2025-12-03 19:00

### Category Fallback System & Dynamic Categories

**Dynamic Categories System** (`convex/itemCategories.ts`, `convex/schema.ts`):
- Added new `itemCategories` table to schema for user-configurable categories
- Categories include: name, normalizedName, description, examples, isSystem flag
- System default categories seeded on first use (Site Costs, Professional Fees, Construction Costs, Financing Costs, Disposal Costs, Plots, Revenue, Other)
- Full CRUD operations for categories with protection for system defaults
- Categories improve LLM codification accuracy by providing context and examples

**Settings UI - Categories Tab** (`src/app/settings/modeling-codes/page.tsx`):
- New "Categories" tab alongside Item Codes and Alias Dictionary
- Card-based display of all categories with description and examples
- Add/Edit category modal with name, description, and comma-separated examples
- System categories marked with lock icon and cannot be deleted
- Description helps train the LLM to categorize items correctly

**Move Item Codes Between Categories**:
- Added "Move to..." dropdown on each item code in settings
- `changeCategory` and `bulkChangeCategory` mutations in `convex/extractedItemCodes.ts`
- Easy reorganization of misplaced codes without delete/recreate

**Smart Pass Dynamic Categories** (`src/lib/smartPassCodification.ts`, `src/app/api/codify-extraction/route.ts`):
- Smart Pass now fetches dynamic categories from database
- LLM prompt includes category descriptions and examples for better accuracy
- Falls back to hardcoded categories if none in database

**Category Fallback Placeholder System** (`src/lib/codifiedTemplatePopulator.ts`):
- New placeholder format: `<all.{category}.{n}.name>` and `<all.{category}.{n}.value>`
- Paired placeholders for inserting unmatched items by category
- FIFO population: items fill slots 1, 2, 3... in order
- Unfilled slots are cleared (empty string)
- Supports category normalization (e.g., "Professional Fees" → "professional.fees")

**Population Logic (Three-Pass)**:
1. **Pass 1**: Match specific codes (`<engineers>` → value)
2. **Pass 2**: Collect unmatched items grouped by category
3. **Pass 3**: Fill category fallback slots sequentially (FIFO)

**Overflow Warning Display** (`src/app/modeling/page.tsx`):
- Tracks items that couldn't fit in category fallback slots
- Displays amber warning banner when overflow occurs
- Lists affected categories and item names
- Suggests adding more fallback rows to template

**Template Example**:
```
| Professional Fees                      |                                         |
| Engineers                              | <engineers>                             |
| Solicitors                             | <solicitors>                            |
| <all.professional.fees.1.name>         | <all.professional.fees.1.value>         |
| <all.professional.fees.2.name>         | <all.professional.fees.2.value>         |
```

**Files Created:**
- `convex/itemCategories.ts` - Category CRUD operations

**Files Modified:**
- `convex/schema.ts` - Added itemCategories table
- `convex/extractedItemCodes.ts` - Added changeCategory mutations
- `src/app/settings/modeling-codes/page.tsx` - Added Categories tab, move functionality
- `src/lib/smartPassCodification.ts` - Dynamic category support in prompts
- `src/lib/codifiedTemplatePopulator.ts` - Category fallback detection and FIFO population
- `src/app/api/codify-extraction/route.ts` - Fetch categories for Smart Pass
- `src/app/modeling/page.tsx` - Overflow warning display

**Pages Affected:**
- Modeling
- Settings (Modeling Codes)

**Features Affected:**
- Data Library
- Financial Modeling
- Code Management

---

## [Previous] - 2025-12-03 16:00

### Data Library UX Improvements

**Enhanced Normalization Layer** (`src/lib/fastPassCodification.ts`):
- Added `STRIP_PATTERNS` to remove noise from item names during matching:
  - Percentages: "Contingency 7.5%" matches as "contingency"
  - Bed counts: "Plot 2 - 5 bed" matches as "plot 2"
  - Parenthetical info: "Fees (x2)" matches as "fees"
  - Property types: strips "detached", "semi", "terraced", etc.
- Added `PLURAL_TO_SINGULAR` mapping for 20+ common variations
- New `isCompoundItem()` function to detect combined categories

**Compound Item Warning** (`src/components/DataLibrary.tsx`):
- Items containing `&`, `,`, `/` or "and" now show a "Combined" badge
- Tooltip explains: "This item contains multiple categories. The full value will be used."

**Manual Item Entry** (`src/components/AddDataLibraryItemModal.tsx`):
- New "Add Item" button in Data Library header
- Enter name, value, category, data type
- AI-powered code suggestion via "Get AI Suggestion" button
- Can accept suggestion, search for existing codes, or create new
- Creates alias on confirmation for future matching

**New API Actions** (`src/app/api/codify-extraction/route.ts`):
- `suggest-single`: Get LLM code suggestion for a single item name
- `add-item`: Add a manual item to the extraction with proper codification

**New Convex Mutation** (`convex/codifiedExtractions.ts`):
- `addItem`: Add a manually created item to an existing extraction

**New UI Component** (`src/components/ui/tooltip.tsx`):
- Standard Radix UI tooltip component for consistent hover tooltips

---

## [Previous] - 2025-12-03 14:30

### Template Population with Codified Data & Settings Update

**New Codified Template Populator** (`src/lib/codifiedTemplatePopulator.ts`):
- Created new population function that uses codified extraction data directly
- Maps itemCode → value (e.g., `<build.cost>` → `1204000`)
- Scans templates for placeholder patterns (`<...>`)
- Supports case-insensitive matching as fallback
- Provides detailed console logging for debugging
- Returns population result with matched/unmatched stats

**Modeling Page Integration** (`src/app/modeling/page.tsx`):
- Template loading now prioritizes codified data over legacy extractedData
- Falls back to legacy path-based system if no codified data exists
- Added `codifiedExtraction` to effect dependency array for reactivity

**Updated Modeling Settings** (`src/components/ModelingSettings.tsx`):
- Replaced old `modelingCodeMappings` tab with new **Item Codes** tab
- Shows all codes from `extractedItemCodes` table organized by category
- Full CRUD capabilities: Add, Edit (fix typos), Delete item codes
- Category filtering and search functionality
- New **Alias Dictionary** tab showing all aliases from `itemCodeAliases`
- Visual confidence indicator for each alias
- Source tracking (system_seed, llm_suggested, user_confirmed, manual)

---

## [Previous] - 2025-12-02 16:00

### Modeling System Overhaul - Two-Pass Codification System

**Overview**: Implemented a comprehensive two-pass codification system for the modeling section. This system bridges the gap between extracted financial data and template placeholders, enabling intelligent mapping of varied Excel terminology to normalized canonical codes.

**Architecture:**
The system uses a two-pass approach:
1. **Fast Pass** (Instant): Alias dictionary lookup during extraction - no LLM, ~50ms
2. **Smart Pass** (On-Demand): LLM-powered codification using OSS-120B when Data Library opens

**New Database Tables** (`convex/schema.ts`):
1. **extractedItemCodes**: Canonical code library (normalized, clean codes only)
   - Fields: code, displayName, category, dataType, isSystemDefault, isActive
   - Example: `<stamp.duty>` → "Stamp Duty" in "Purchase Costs" category
   
2. **itemCodeAliases**: Normalization layer (learning system)
   - Maps varied input terms to canonical codes
   - Fields: alias, aliasNormalized, canonicalCodeId, canonicalCode, confidence, source
   - Sources: system_seed, llm_suggested, user_confirmed, manual
   - Tracks usageCount for learning analytics
   
3. **codifiedExtractions**: Per-document codified data
   - Stores items with mappingStatus: matched, suggested, pending_review, confirmed, unmatched
   - Tracks fastPassCompleted, smartPassCompleted, isFullyConfirmed
   - Contains mappingStats for dashboard display

**New Convex Functions Created**:
- `convex/extractedItemCodes.ts`: CRUD operations for code library
- `convex/itemCodeAliases.ts`: CRUD operations for alias dictionary with bulk lookup
- `convex/codifiedExtractions.ts`: Codified data management with confirmation workflows

**New Codification Engines**:
- `src/lib/fastPassCodification.ts`: Fast alias lookup with fuzzy matching (Levenshtein)
- `src/lib/smartPassCodification.ts`: LLM-powered codification using Together.ai OSS-120B

**New API Route**:
- `/api/codify-extraction`: Handles fast-pass, smart-pass, confirm, and confirm-all actions
  - Fast Pass called after extraction to instantly match known aliases
  - Smart Pass called when Data Library opens with pending items
  - Confirm creates new aliases in dictionary (learning system)

**Enhanced Extraction Pipeline** (`src/app/api/analyze-file/route.ts`):
- Added Fast Pass preview after extraction
- Returns codificationPreview with stats (matched vs pending)
- Integrates with alias dictionary for instant matching

**New UI Components**:
1. **MappingConfirmationModal.tsx**: Review and confirm code mappings
   - Shows items needing review grouped by category
   - Options: Accept suggestion, Map to different code, Create new code, Skip
   - Creates aliases on confirmation (system learns)
   - "Accept All Suggested" button for bulk confirmation
   
2. **Overhauled DataLibrary.tsx**: 
   - Displays codified items grouped by category
   - Status indicators: matched (green), suggested (amber), pending (red), confirmed (blue)
   - Smart Pass trigger on load when items need review
   - Review banner with item count needing attention
   - "Ready to run model" indicator when fully confirmed

3. **Updated Item Code Management UI** (`/settings/modeling-codes`):
   - Two tabs: Item Codes and Alias Dictionary
   - Item Codes: Grouped by category, create/edit/delete
   - Alias Dictionary: Grouped by canonical code, view usage stats
   - Search and filter functionality

**Updated Modeling Page** (`src/app/modeling/page.tsx`):
- Added confirmation check before running models
- Queries codifiedExtraction for active document
- Blocks model run if items need confirmation
- Shows pending count in alert message

**User Experience Flow**:
1. Upload Excel → Extraction → Fast Pass (instant alias lookup)
2. Open Data Library → Smart Pass runs if items pending (30s LLM)
3. Review banner appears → Open MappingConfirmationModal
4. Confirm/map/create codes → Aliases saved (system learns)
5. All confirmed → "Ready to run model" indicator
6. Click Run Model → Template populated with codified data

**Learning System**:
- Month 1: 0% auto-matched (cold start), 100% needs LLM
- Month 2: 60% auto-matched as aliases accumulate
- Month 6: 95%+ auto-matched (only novel terms need LLM)

**Technical Details**:
- Fuzzy matching uses Levenshtein distance with 0.85 threshold
- OSS-120B model via Together.ai for smart codification
- Confidence scores tracked (0-1) for all mappings
- Alias usageCount incremented on each match

**Pages Affected**:
- Modeling
- Settings (Modeling Codes)

**Features Affected**:
- Data Library
- Financial Modeling
- File Upload/Extraction
- Code Management

---

## [Previous] - 2025-11-24 14:00

### Add Archive and Delete Functionality for Clients

**Overview**: Added comprehensive archive and delete functionality for clients, allowing users to manage client lifecycle from both the clients table and individual client detail pages.

**New Features:**
1. **Client Archive Functionality** (`src/app/clients/page.tsx`, `src/app/clients/[clientId]/page.tsx`):
   - Added Archive toggle button next to filters to show/hide archived clients
   - When Archive toggle is ON, displays only archived clients
   - When Archive toggle is OFF, excludes archived clients from view
   - Archive action sets client status to "archived" (reversible)
   - Archive button available in both table action menu and client detail page

2. **Client Delete Functionality**:
   - Added Delete option in action menu dropdown (three-dot menu) in clients table
   - Added Delete button on client detail page
   - Permanently removes client from database with strong confirmation warning
   - Includes confirmation dialogs to prevent accidental deletions

3. **Action Menu Dropdown** (`src/app/clients/page.tsx`):
   - Added Popover-based action menu with Archive and Delete options
   - Menu appears as three-dot icon next to View button in table
   - Properly handles click events to prevent row navigation when using menu

**UI Improvements:**
1. **Archive Toggle Button**:
   - Visual indicator when active (default variant) vs inactive (outline variant)
   - Positioned next to filter controls for easy access
   - Clear Archive icon for visual recognition

2. **Confirmation Dialogs**:
   - Archive confirmation explains that action is reversible
   - Delete confirmation includes strong warning about permanent deletion
   - Uses AlertDialog component for consistent UI

**Technical Details:**
- Updated filtering logic to properly handle archived client visibility
- Fixed naming conflict with existing `handleDelete` function (renamed to `handleDeleteClient`)
- Proper state management for popover menus and confirmation dialogs
- Error handling with user-friendly messages
- Redirects to clients list page after archive/delete on detail page

**Pages Affected:**
- Clients (table view)
- Client Detail Page

**Features Affected:**
- Clients

## [Previous] - 2025-01-27

### Improved File Upload Error Handling and Diagnostics

**Overview**: Enhanced error handling across all file upload components to provide better diagnostics for HTTP errors, particularly the HTTP 405 "Method Not Allowed" error that was occurring during document uploads.

**Bug Fixes:**
1. **Enhanced Error Handling** (`src/lib/fileQueueProcessor.ts`, `src/components/DirectUploadButton.tsx`, `src/components/ChatAssistantDrawer.tsx`, `src/components/FileTypeDefinitionDrawer.tsx`, `src/components/FileTypeDefinitionModal.tsx`):
   - Added detailed error messages that include HTTP status codes (e.g., "HTTP 405 Method Not Allowed")
   - Capture and display error response body text for better debugging
   - Added validation for upload URL format before attempting upload
   - Enhanced console logging with detailed error information including status, statusText, and error response
   - Error messages now show: `Failed to upload file: HTTP {status} {statusText} - {error details}`

**Improvements:**
1. **Better Diagnostics**:
   - Upload URL validation before fetch request
   - Detailed logging of upload attempts (fileName, fileSize, fileType, uploadUrlLength)
   - Error response text capture for troubleshooting
   - Console error logging with structured data for easier debugging

**Pages Affected:**
- File Upload Queue
- Document Upload
- Chat Assistant File Uploads
- File Type Definition Uploads

**Technical Details:**
- All upload locations now validate upload URL format
- Error handling captures full HTTP response details
- Console logging helps identify root causes of upload failures
- Error messages are user-friendly while maintaining technical details for debugging

## [Previous] - 2025-11-21 17:49

### Fixed Document Table Display and Enhanced File Naming Configuration

**Overview**: Fixed critical table display issues where long document names caused horizontal overflow, making controls unusable. Enhanced the Configure File Names modal with auto-population and automatic code generation capabilities for legacy documents.

**Bug Fixes:**
1. **Table Display Fix** (`src/components/DocumentsTable.tsx`, `DocumentCodeEditor.tsx`, `InternalDocumentsTable.tsx`, `UnclassifiedDocumentsTable.tsx`):
   - Added `max-w-[300px]` constraint to document name columns
   - Applied `truncate` class for text overflow with ellipsis
   - Added `title` attributes for full name display on hover
   - Prevents long file names from stretching tables horizontally

**New Features:**
1. **Enhanced Configure File Names Modal** (`src/components/ConfigureFileNamesModal.tsx`):
   - Auto-population of client code from `clientName` using `abbreviateText()`
   - Auto-population of project code from `projectName` (when available)
   - Auto-population of type code from most common category
   - Statistics banner showing documents needing codes

2. **Auto-Generate Functionality**:
   - New "Auto-Generate Codes" button with sparkle icon
   - Automatically generates document codes using client/project names and document categories
   - Uses each document's own category for accurate type codes
   - Server-side uniqueness checking

3. **Bulk Update Capability**:
   - Radio button options: "Only documents without codes" vs "All documents (regenerate existing codes)"
   - Shows count of documents that will be affected
   - Error handling with retry logic for uniqueness conflicts
   - Success/error messages with detailed counts

**UI Improvements:**
1. **Missing Code Indicator** (`src/components/DocumentsTable.tsx`):
   - Orange badge on "Configure File Names" button showing count of documents needing codes
   - Works for project, baseDocuments, and client views
   - Only displays when count > 0

2. **Scrollable Modal**:
   - Made modal content scrollable with `max-h-[90vh]`
   - Fixed header and footer remain visible
   - Content area scrolls independently
   - Prevents modal from extending beyond viewport

**Pages Affected:**
- Document Library
- Documents (client/project views)

**Features Affected:**
- Document Management
- File Naming

## [Previous] - 2025-01-29 14:00

### In-App Changelog Feature with GitHub Integration

**Overview**: Implemented a comprehensive in-app changelog system accessible from Settings, with automatic updates via GitHub webhooks on every push. Changelog entries are displayed as cards with server timestamps and can be manually added or automatically populated from commit messages.

**New Features:**
1. **Changelog Database Schema** (`convex/schema.ts`):
   - Added `changelog` table with `description` and `createdAt` fields
   - Indexed by `createdAt` for efficient chronological queries
   - Server-side timestamps ensure accurate date/time tracking

2. **Changelog Convex Functions** (`convex/changelog.ts`):
   - `add`: Create new changelog entry with description
   - `getAll`: Retrieve all entries ordered by most recent first
   - `getRecent`: Get last N entries (default: 10)

3. **Changelog Settings Page** (`/settings/changelog`):
   - New settings section accessible from main settings page
   - Card-based display of changelog entries
   - Each card shows description and formatted timestamp
   - Chronological display (newest first)
   - Empty state handling for no entries

4. **GitHub Webhook Integration** (`/api/changelog/github-webhook`):
   - POST endpoint for GitHub push events
   - Webhook signature verification using `GITHUB_WEBHOOK_SECRET`
   - Automatically creates changelog entry for each commit
   - Format: `[branch] commit message`
   - PUT endpoint for manual entry creation

5. **GitHub Actions Workflow** (`.github/workflows/update-changelog.yml`):
   - Alternative to webhook (runs on push to main/master)
   - Extracts commit messages and sends to API
   - Configurable via `CHANGELOG_API_URL` secret

6. **Cursor Rules Documentation** (`.cursorrules`):
   - Added changelog management guidelines
   - Instructions for manual entries
   - Best practices for commit messages
   - GitHub webhook setup instructions

**Settings Menu Integration:**
- Added "Changelog" section to settings page with History icon
- Positioned between Category Settings and Profile
- Follows existing settings card pattern

**Technical Details:**
- Changelog entries use ISO timestamp strings for server-side accuracy
- Webhook endpoint verifies GitHub signature for security
- Supports both webhook and GitHub Actions workflows
- Manual entries can be added via Convex mutation or API PUT endpoint
- Real-time updates via Convex subscriptions

**User Benefits:**
- Centralized view of all application changes
- Automatic tracking of code changes via GitHub
- Clear timeline of updates and improvements
- Easy access from Settings page
- Server timestamps ensure accurate date/time

**Setup Instructions:**
1. **GitHub Webhook** (Recommended):
   - Add `GITHUB_WEBHOOK_SECRET` to environment variables
   - Configure webhook in GitHub repository settings:
     - URL: `https://your-domain.com/api/changelog/github-webhook`
     - Content type: `application/json`
     - Secret: (same as `GITHUB_WEBHOOK_SECRET`)
     - Events: Select "push" event only

2. **GitHub Actions** (Alternative):
   - Add `CHANGELOG_API_URL` secret to GitHub repository
   - Workflow automatically runs on push to main/master

**Files Created:**
- `convex/changelog.ts` - Changelog CRUD operations
- `src/app/settings/changelog/page.tsx` - Changelog settings page
- `src/app/api/changelog/github-webhook/route.ts` - GitHub webhook endpoint
- `.github/workflows/update-changelog.yml` - GitHub Actions workflow
- `.cursorrules` - Cursor IDE rules for changelog management

**Files Modified:**
- `convex/schema.ts` - Added changelog table
- `src/app/settings/page.tsx` - Added changelog settings section

**Next Steps:**
- Monitor webhook/actions to ensure automatic updates work
- Consider adding filtering/search functionality
- Add ability to categorize entries (feature, bug fix, etc.)
- Consider adding entry editing/deletion for admins

## [Previous] - 2025-01-29 13:00

### Deals Table Pagination & HubSpot Sync Fix

**Overview**: Fixed pagination on Prospects page deals table (changed from 15 to 25 items per page), enhanced HubSpot deals sync pagination with logging and duplicate detection, and updated sync buttons to sync 100 deals at a time.

**Changes Made:**

1. **Prospects Page Pagination Update**:
   - Changed `ITEMS_PER_PAGE` from 15 to 25 to match Rolodex page
   - Added item count display in table header showing current range (e.g., "Showing 1-25")
   - Pagination controls already existed and work correctly

2. **HubSpot Deals Sync Pagination Enhancement** (`src/lib/hubspot/deals.ts`):
   - Added comprehensive logging to track pagination progress (same as companies/contacts)
   - Added duplicate detection to identify when same deals are returned
   - Enhanced pagination token handling with better error detection
   - Added page count tracking and detailed logging for each page fetch
   - Logs show pagination tokens, record counts, and completion status

3. **Sync Limits Updated**:
   - Updated `sync-deals` route default from 20 to 100 records
   - Updated Prospects page sync button to request 100 deals (was incorrectly syncing leads with 1000 records)
   - Updated Settings page deals sync button to request 100 deals (was 20)

4. **Bug Fix**:
   - Fixed Prospects page "Sync Deals" button to use correct endpoint (`/api/hubspot/sync-deals` instead of `/api/hubspot/sync-leads`)

**Technical Details:**
- Deals pagination uses same pattern as companies/contacts
- Pagination token (`after`) properly advances through pages
- Duplicate detection warns if same deal IDs appear across pages
- Rate limiting: 100ms delay between pagination requests

**User Benefits:**
- Deals table displays 25 items per page (consistent with Rolodex)
- Can sync 100 deals at a time without pagination issues
- Better visibility into sync progress with detailed logging
- Early detection of pagination issues through duplicate warnings
- Correct sync endpoint ensures deals are actually synced

**Files Modified:**
- `src/app/prospects/page.tsx` - Updated pagination to 25 items, fixed sync endpoint
- `src/lib/hubspot/deals.ts` - Enhanced pagination logic and logging
- `src/app/api/hubspot/sync-deals/route.ts` - Increased default maxRecords to 100
- `src/app/settings/hubspot/page.tsx` - Updated deals sync to request 100 records

**Next Steps:**
- Monitor sync logs to verify deals pagination is working correctly
- Consider adding progress indicators in UI for large deal syncs

## [Previous] - 2025-01-29 12:30

### Rolodex Page Pagination - Display 25 Items Per Page

**Overview**: Added pagination to the Rolodex page tables to prevent performance issues when syncing 500+ companies and contacts. Both companies and contacts tables now display 25 items per page with pagination controls.

**Changes Made:**

1. **Pagination State Management**:
   - Added separate pagination state for companies (`companiesPage`) and contacts (`contactsPage`)
   - Set `ITEMS_PER_PAGE` constant to 25 items per page
   - Pages automatically reset to page 1 when filters or search query changes

2. **Pagination Logic**:
   - Calculate total pages based on filtered results
   - Slice filtered arrays to show only current page items
   - Display "Showing X-Y of Z" in table headers when pagination is active
   - Show pagination controls only when there are more than 25 items

3. **Pagination Controls UI**:
   - Added pagination controls below each table (companies and contacts)
   - Previous/Next buttons with proper disabled states
   - Page indicator showing "Page X of Y"
   - Item count display showing range and total (e.g., "Showing 1-25 of 500 companies")
   - Controls styled consistently with other pages (clients, projects, prospects)

**Technical Details:**
- Uses `useEffect` to reset page to 1 when filters change
- Pagination calculations use `useMemo` for performance
- Separate pagination state for each tab (companies/contacts) maintains independent page numbers
- Pagination controls only render when `filteredItems.length > ITEMS_PER_PAGE`

**User Benefits:**
- Tables no longer break with large datasets (500+ items)
- Better performance with only 25 items rendered at a time
- Easy navigation through large lists with Previous/Next buttons
- Clear indication of current position in dataset
- Filters automatically reset to page 1 for better UX

**Files Modified:**
- `src/app/rolodex/page.tsx` - Added pagination state, logic, and UI controls

**Next Steps:**
- Consider adding page number input for direct navigation
- Add "Go to first page" / "Go to last page" buttons for very large datasets
- Consider adding items per page selector (25, 50, 100)

## [Previous] - 2025-01-29 12:00

### HubSpot Sync Pagination Fix - Support for 500+ Records

**Overview**: Fixed HubSpot sync pagination issue where the same 50 companies were being synced repeatedly. Enhanced pagination logic with better logging and duplicate detection, and increased default sync limits to support syncing 500+ companies and contacts.

**Changes Made:**

1. **Pagination Logic Improvements** (`src/lib/hubspot/companies.ts` & `src/lib/hubspot/contacts.ts`):
   - Added comprehensive logging to track pagination progress
   - Added duplicate detection to identify when the same records are returned (indicates pagination issue)
   - Improved pagination token handling with better error detection
   - Added page count tracking and detailed logging for each page fetch
   - Enhanced logging shows pagination tokens, record counts, and completion status

2. **Default Sync Limits Increased**:
   - Updated `sync-companies` route default from 100 to 500 records
   - Updated `sync-contacts` route default from 100 to 500 records
   - Frontend sync buttons now explicitly request 500 records

3. **Frontend Updates**:
   - Updated HubSpot settings page to request 500 companies and 500 contacts
   - Updated rolodex page sync to explicitly request 500 records for both companies and contacts
   - All sync endpoints now support larger batch sizes

**Technical Details:**
- Pagination uses HubSpot's `after` parameter for cursor-based pagination
- Each page fetches up to 100 records (HubSpot's maximum per request)
- Pagination continues until `nextAfter` token is no longer provided or maxRecords is reached
- Duplicate detection warns if same company/contact IDs appear across pages
- Rate limiting: 100ms delay between pagination requests

**Debugging Features:**
- Console logs show page number, batch size, pagination token preview, and record counts
- Duplicate detection identifies pagination issues early
- Clear logging of when pagination stops and why (no more pages vs max records reached)

**User Benefits:**
- Can now sync 500+ companies and contacts in a single sync operation
- Better visibility into sync progress with detailed logging
- Early detection of pagination issues through duplicate warnings
- More efficient syncing with proper pagination token advancement

**Files Modified:**
- `src/lib/hubspot/companies.ts` - Enhanced pagination logic and logging
- `src/lib/hubspot/contacts.ts` - Enhanced pagination logic and logging
- `src/app/api/hubspot/sync-companies/route.ts` - Increased default maxRecords to 500
- `src/app/api/hubspot/sync-contacts/route.ts` - Increased default maxRecords to 500
- `src/app/settings/hubspot/page.tsx` - Updated sync buttons to request 500 records
- `src/app/rolodex/page.tsx` - Updated sync to request 500 records

**Next Steps:**
- Monitor sync logs to verify pagination is working correctly
- Consider adding progress indicators in UI for large syncs
- Add ability to resume interrupted syncs from last pagination token

## [Previous] - 2025-01-29 00:00

### Chat Sessions User Isolation - Multi-User Support

**Overview**: Fixed critical security issue where chat sessions were being shared across all users. Implemented proper user isolation so each user only sees and can access their own chat sessions.

**Changes Made:**

1. **Schema Updates** (`convex/schema.ts`):
   - Changed `chatSessions.userId` from `v.optional(v.string())` to `v.id("users")` (required)
   - Added `by_user` index for efficient user-based queries
   - Added `by_user_contextType` composite index for optimized filtering

2. **Chat Sessions Functions** (`convex/chatSessions.ts`):
   - **`list` query**: Now filters all sessions by authenticated user ID
   - **`get` query**: Verifies session belongs to current user before returning
   - **`create` mutation**: Automatically sets `userId` to current authenticated user
   - **`update` mutation**: Verifies session ownership before allowing updates
   - **`remove` mutation**: Verifies session ownership before deletion
   - **`incrementMessageCount` mutation**: Verifies session ownership before incrementing
   - All functions now use `getAuthenticatedUser()` helper for user verification

3. **Chat Messages Functions** (`convex/chatMessages.ts`):
   - **`list` query**: Verifies session belongs to user before returning messages
   - **`add` mutation**: Verifies session ownership before adding messages
   - **`remove` mutation**: Verifies session ownership before deleting messages
   - Added user authentication checks to all message operations

4. **Chat Actions Functions** (`convex/chatActions.ts`):
   - **`listPending` query**: Verifies session belongs to user before returning actions
   - **`create` mutation**: Verifies session ownership before creating actions
   - **`updateStatus` mutation**: Verifies session ownership before updating
   - **`confirm`, `cancel`, `markExecuted`, `markFailed` mutations**: All verify session ownership
   - Added helper function `verifyActionOwnership()` for consistent verification

**Security Improvements:**
- All chat operations now require authentication
- Users can only access their own chat sessions
- Prevents unauthorized access to other users' conversations
- Proper error messages for unauthorized access attempts

**Technical Details:**
- Uses `getAuthenticatedUser()` helper from `authHelpers.ts` for consistent user retrieval
- User ID stored as `Id<"users">` type for proper type safety
- Indexes optimized for user-based queries
- Backward compatibility: Old sessions without userId will be filtered out (not accessible)

**User Benefits:**
- Complete privacy - each user's chats are isolated
- Secure multi-user support
- No risk of seeing other users' conversations
- Proper access control for all chat operations

**Files Modified:**
- `convex/schema.ts` - Updated chatSessions table schema and indexes
- `convex/chatSessions.ts` - Added user filtering and ownership verification
- `convex/chatMessages.ts` - Added user verification for message operations
- `convex/chatActions.ts` - Added user verification for action operations

**Migration Notes:**
- Existing sessions without `userId` will not be accessible (as expected for security)
- New sessions automatically get `userId` set to creating user
- No data migration needed - old sessions will simply be filtered out

## [Previous] - 2025-01-28 23:30

### Task and Reminder Completion Functionality

**Overview**: Added the ability to complete tasks and reminders directly from the tasks page, along with a new "Completed" tab showing the most recent 20 completed items.

**New Features:**
1. **Task Completion**:
   - Added `complete` mutation in `convex/tasks.ts` to mark tasks as completed
   - Clickable circle icon in tasks table - clicking the empty circle completes the task
   - Completed tasks show a green checkmark icon instead of the circle
   - Only creator or assigned user can complete tasks

2. **Reminder Completion**:
   - Added "Complete" button in reminders table for each non-completed reminder
   - Button appears in new "Actions" column in reminders table
   - Uses existing `complete` mutation from `convex/reminders.ts`
   - Completed reminders show green checkmark icon

3. **Completed Tab**:
   - New "Completed" tab added to tasks page (alongside Tasks and Reminders tabs)
   - Shows most recent 20 completed tasks
   - Shows most recent 20 completed reminders
   - Both sections displayed together when tab is active
   - Tasks and reminders sorted by `updatedAt` descending (most recently completed first)
   - Completed reminders show "Completed At" timestamp instead of "Scheduled For"

**UI Improvements:**
- Tasks table: Circle icon is now clickable with hover effect and cursor pointer
- Reminders table: Added "Actions" column with Complete button
- Completed tab: Clean display of completed items with proper visual indicators
- Natural language input and create forms hidden on Completed tab
- Filters hidden on Completed tab (not applicable for completed items)

**Technical Details:**
- Task completion mutation validates user permissions (creator or assigned user)
- Reminder completion uses existing mutation with ownership verification
- Completed items filtered and sorted client-side for performance
- Proper loading states and empty states for all sections
- Real-time updates via Convex subscriptions

**Files Modified:**
- `convex/tasks.ts` - Added `complete` mutation
- `src/app/tasks/page.tsx` - Added completion handlers, Completed tab, and UI updates

**User Benefits:**
- Can now complete tasks and reminders directly from the table
- Clear visual feedback when items are completed
- Easy access to recently completed work via Completed tab
- Better task management workflow with completion tracking

**Next Steps:**
- Consider adding bulk completion actions
- Add completion statistics/metrics
- Consider adding undo completion functionality
- Add completion notifications/celebrations

## [Previous] - 2025-01-28 22:00

### File Summary Agent Settings - Modular File Type Management System

**Overview**: Implemented a comprehensive settings system for managing file type definitions used by the filing agent. Users can now add, edit, view, and manage custom file types with examples, descriptions, and identification rules without requiring code changes.

**New Features:**
1. **Database-Backed File Type Definitions**:
   - Created `fileTypeDefinitions` table in Convex schema
   - Stores user-defined file types with keywords, descriptions, identification rules, and example files
   - Supports parent types for subtypes (e.g., "Legal Documents - Facility Letter")
   - System defaults marked as read-only (cannot be edited/deleted)
   - Active/inactive status for soft deletion

2. **Settings Page UI** (`/settings/file-summary-agent`):
   - New settings section accessible from main settings page
   - Library view showing all file types grouped by category
   - Visual indicators for system defaults, subtypes, and inactive definitions
   - Quick actions: View, Edit (non-system), Delete (non-system)
   - Displays keyword count, identification rules count, and example file status

3. **File Type Definition Management**:
   - **Add Modal**: Create new file types with:
     - File type name and category
     - Parent type (for subtypes)
     - Description (minimum 100 words enforced)
     - Keywords array (multiple keywords for matching)
     - Identification rules array (specific rules for AI identification)
     - Category rules (optional explanation)
     - Example file upload (optional)
   - **Edit Modal**: Edit user-created definitions (system defaults protected)
   - **View Modal**: Detailed view showing all definition information
   - **Delete**: Soft delete (sets inactive) for user-created definitions

4. **Integration with Filing Agent**:
   - Modified `togetherAI.ts` to load file type definitions from database
   - Merges database definitions with hardcoded defaults
   - `getRelevantFileTypeHints()` function updated to accept database definitions
   - System prompt dynamically includes user-defined file types
   - Maintains backward compatibility with existing hardcoded definitions

5. **Migration Script**:
   - Created `seedFileTypeDefinitions.ts` migration to populate database with existing hardcoded definitions
   - Marks seeded definitions as system defaults
   - Prevents duplicate seeding

**New Convex Functions** (`convex/fileTypeDefinitions.ts`):
- `getAll`: Get all active file type definitions
- `getAllIncludingInactive`: Get all definitions including inactive
- `getById`: Get single definition by ID
- `getByCategory`: Get definitions filtered by category
- `create`: Create new file type definition (validates 100-word minimum)
- `update`: Update existing definition (prevents editing system defaults)
- `remove`: Soft delete (sets inactive, prevents deleting system defaults)
- `hardDelete`: Hard delete for non-system defaults
- `getFileUrl`: Get file URL for example files

**New Components**:
- `FileTypeDefinitionModal.tsx`: Add/Edit modal with form validation
- `FileTypeDefinitionView.tsx`: Detailed view modal with example file download
- `src/app/settings/file-summary-agent/page.tsx`: Main settings page

**Enhanced Components**:
- `src/app/settings/page.tsx`: Added File Summary Agent settings section
- `src/lib/togetherAI.ts`: Loads and merges database definitions
- `src/lib/fileTypeDefinitions.ts`: Updated to support database-backed definitions
- `src/lib/convexServer.ts`: Added `getFileTypeDefinitionsServer()` helper

**Schema Updates** (`convex/schema.ts`):
- Added `fileTypeDefinitions` table with fields:
  - Core: fileType, category, parentType, description, keywords, identificationRules, categoryRules
  - Files: exampleFileStorageId, exampleFileName
  - Metadata: isSystemDefault, isActive, createdBy, createdAt, updatedAt
  - Indexes: by_file_type, by_category, by_parent_type, by_active

**User Benefits**:
- No code changes required to add new file types
- Self-service file type management
- Better filing accuracy with more examples and rules
- Ability to customize file types for specific business needs
- Example files help AI learn file type patterns
- Subtype support for hierarchical organization

**Technical Details**:
- Database definitions merged with hardcoded defaults at runtime
- System defaults protected from editing/deletion
- File uploads use Convex storage with proper URL generation
- Word count validation ensures quality descriptions
- Real-time updates via Convex subscriptions
- Proper TypeScript types throughout

**Files Created**:
- `convex/fileTypeDefinitions.ts` - CRUD operations for file type definitions
- `convex/migrations/seedFileTypeDefinitions.ts` - Migration script for seeding defaults
- `src/app/settings/file-summary-agent/page.tsx` - Settings page UI
- `src/components/FileTypeDefinitionModal.tsx` - Add/Edit modal component
- `src/components/FileTypeDefinitionView.tsx` - View modal component

**Files Modified**:
- `convex/schema.ts` - Added fileTypeDefinitions table
- `src/app/settings/page.tsx` - Added File Summary Agent settings section
- `src/lib/togetherAI.ts` - Integrated database-backed definitions
- `src/lib/fileTypeDefinitions.ts` - Updated to merge database definitions
- `src/lib/convexServer.ts` - Added server helper function

**Next Steps**:
- Run migration script to seed existing definitions
- Monitor user adoption and file type additions
- Consider adding bulk import/export functionality
- Add analytics on file type usage and accuracy
- Consider adding file type templates for common patterns

## [Previous] - 2025-11-20 20:55

### Task Page UI Redesign - Card-Based Layout Matching Homepage Style

**Overview**: Completely restyled the Tasks page to match the homepage card design pattern, replacing table-based layout with modern card-based UI featuring blue banners, icons, and clickable links.

**Changes:**
1. **Task Cards Redesign**:
   - Converted table rows to individual cards with blue banner headers
   - Blue banner (`bg-blue-600`) with task type left-aligned and status right-aligned
   - Status indicators: "OVERDUE", "IN PROGRESS", "TODO", "COMPLETED", "CANCELLED"
   - Card layout: `grid grid-cols-1 lg:grid-cols-2` for responsive display
   - Consistent styling: `rounded-xl`, `overflow-hidden`, `p-0`, `gap-0`

2. **Content Structure**:
   - Bold title at top (`text-base font-bold`)
   - Description with `line-clamp-2` for truncation
   - Icons with labels for metadata:
     - Building2 icon + "Client:" with clickable link
     - FolderKanban icon + "Project:" (bold) with clickable link
     - Circle icon + "Assigned:" for assigned user
     - Tag icon + tags display
   - Proper spacing (`mb-3` between content sections)

3. **Bottom Row Layout**:
   - Border-top separator (`border-t border-gray-200`)
   - Left side: Clock icon + due date/status (red if overdue)
   - Right side: Priority badge + "View Task" button
   - Horizontal alignment with `flex items-center justify-between`

4. **Reminder Cards Redesign**:
   - Matching blue banner style with Bell icon
   - Status indicators: "OVERDUE", "PENDING", "COMPLETED", "DISMISSED"
   - Task link display (if reminder linked to task) with ListTodo icon
   - Client and Project links with icons
   - Scheduled time display with Clock icon

5. **Visual Consistency**:
   - All cards use same hover effects (`hover:shadow-lg transition-shadow`)
   - Consistent button styling (`bg-black hover:bg-gray-800`)
   - Matching padding (`px-4 pt-3 pb-3`)
   - Same icon sizes (`w-3 h-3` for metadata icons, `w-4 h-4` for banner icons)

**Files Modified**:
- `src/app/tasks/page.tsx` - Complete redesign from table to card-based layout

**UI Improvements**:
- More scannable and visually appealing task display
- Better use of space with card grid layout
- Consistent design language across homepage and tasks page
- Improved information hierarchy with icons and clear sections
- Enhanced clickability with styled links and buttons

## [Previous] - 2025-11-20 20:44

### Homepage UI Style Uniformity - Blue Banner Cards

**Overview**: Updated the Inbox and Upcoming Tasks sections on the homepage to match the uniform blue banner card style used in the center cards (Next Task, Next Reminder, Next Event), creating a more cohesive dashboard design.

**Changes:**
1. **Inbox Card Redesign**:
   - Added blue banner header (`bg-blue-600`) matching center card style
   - Title "Inbox" left-aligned with icon
   - Description "Notifications & Emails" right-aligned in banner
   - Added button panel below content with "View Inbox" button
   - Maintained existing "Coming soon" placeholder content

2. **Upcoming Tasks Card Redesign**:
   - Added blue banner header matching center card style
   - Title "Upcoming Tasks" left-aligned with icon
   - Dynamic task count right-aligned in banner (shows "X Tasks" or "No Tasks")
   - Compact table display with smaller text and spacing
   - Limited to 5 tasks with "+X more tasks" indicator if more exist
   - Added button panel below with "View All Tasks" or "Create Task" button

3. **Visual Consistency**:
   - Both cards now use `rounded-xl` corners
   - Matching `hover:shadow-lg` transition effects
   - Consistent padding and spacing (`px-4 pb-3`)
   - Uniform button styling (`bg-black hover:bg-gray-800`)
   - Border separator between content and button panel

**Files Modified**:
- `src/app/page.tsx` - Updated Inbox and Upcoming Tasks card components to match center card styling

**UI Improvements**:
- Dashboard now has uniform card styling throughout
- Better visual hierarchy with consistent blue banners
- Improved navigation with clear action buttons
- More compact and scannable task list display

## [Previous] - 2025-01-28 (Current Date/Time)

### Code Quality Improvement Plan Progress Tracking

**Overview**: Updated the `CODE_QUALITY_IMPROVEMENT_PLAN.md` document with comprehensive progress tracking, showing completion status for all phases and detailed notes on what has been accomplished.

**Changes:**
1. **Progress Summary Section Added**:
   - Added completion status for all phases (Phases 1-3 complete, Phase 4 in progress)
   - Documented completion dates and status for each phase
   - Clear visual indicators (✅ complete, 🟡 in progress, ⏳ pending)

2. **Detailed Progress Notes**:
   - Phase 1: Documented all 4 tasks with specific files changed and completion status
   - Phase 2: Documented all 4 refactoring tasks with created files and updated functions
   - Phase 3: Documented type safety improvements including React hooks fixes (9 components)
   - Phase 4: Documented authentication protection for 14 API routes, remaining tasks pending

3. **Success Metrics Updated**:
   - Updated checkboxes to reflect actual completion status
   - Marked completed items with [x] and pending items remain [ ]

**Files Modified**:
- `CODE_QUALITY_IMPROVEMENT_PLAN.md` - Added progress tracking section and detailed completion notes

**Current Status**:
- ✅ Phase 1: Quick Wins - COMPLETE
- ✅ Phase 2: Low-Risk Refactoring - COMPLETE  
- ✅ Phase 3: Type Safety - COMPLETE
- 🟡 Phase 4: Security - IN PROGRESS (1/4 tasks complete)
- ⏳ Phases 5-8: Not started

## [Previous] - 2025-01-28 14:30

### Inbox Placeholder Page Added

**Overview**: Added a placeholder Inbox page to the navigation bar in preparation for future Google Workspace mail integration.

**Changes:**
1. **New Inbox Page** (`/inbox`):
   - Created placeholder page with centered "Coming Soon" message
   - Displays Mail icon and description about Google Workspace integration
   - Clean, minimal design matching application theme

2. **Navigation Integration**:
   - Added "Inbox" nav item to sidebar (positioned after Calendar)
   - Uses Mail icon from lucide-react
   - Follows existing navigation pattern

**Files Created**:
- `src/app/inbox/page.tsx` - Inbox placeholder page

**Files Modified**:
- `src/components/Sidebar.tsx` - Added Inbox navigation item

**Future Enhancements**:
- Google Workspace OAuth integration for Gmail access
- Email inbox display and management
- Email composition and sending
- Email threading and conversation view
- Email search and filtering

## [Previous] - 2025-01-28 (Current Date/Time)

### Calendar Feature Implementation

**Overview**: Implemented a comprehensive calendar feature using React Big Calendar, with full backend support for events, Google Calendar integration preparation, dashboard integration, and AI assistant integration.

**Changes:**

1. **Backend - Events Schema & Functions**:
   - Added `events` table to schema with Google Calendar-compatible fields:
     - Core fields: title, description, location, startTime, endTime, allDay
     - Extended fields: attendees, recurrence (RRULE), colorId, visibility, status
     - Google sync fields: googleCalendarId, googleEventId, googleCalendarUrl, lastGoogleSync, syncStatus
     - Relations: clientId, projectId, createdBy, organizerId
     - Metadata: reminders, attachments, conferenceData, metadata
   - Created `convex/events.ts` with full CRUD operations:
     - Queries: list, get, getByDateRange, getByUser, getUpcoming, getNextEvent
     - Mutations: create, update, remove, updateGoogleSync
   - Created `convex/googleCalendar.ts` with stub functions for future OAuth integration:
     - syncFromGoogle, pushToGoogle, handleWebhook, getSyncStatus, disconnect
     - Includes comprehensive documentation for future implementation

2. **Frontend - Calendar Page**:
   - Created `/calendar` page with React Big Calendar integration
   - Supports month, week, day, and agenda views
   - Event rendering with color coding matching Google Calendar colors
   - Click to view event details, double-click to create new event
   - Select time slot to create event at specific time
   - Responsive design matching application theme

3. **Event Modal Component**:
   - Created `EventModal.tsx` for event creation and editing
   - Form fields: title, description, location, start/end date/time, all-day toggle
   - Client/project linking using existing ClientProjectSearch component
   - Advanced options section (prepared for future: recurrence, attendees, reminders)
   - Delete functionality for existing events

4. **Navigation Integration**:
   - Added Calendar nav item to sidebar (between Tasks and Filing Agent)
   - Uses Calendar icon from lucide-react

5. **Dashboard Integration**:
   - Updated "Next Event" card on dashboard to show real event data
   - Displays event title, description, location, time remaining
   - Shows linked client/project if applicable
   - "View Event" button navigates to calendar page
   - "Create Event" button when no upcoming events

6. **AI Assistant Integration**:
   - Added event tools to `chatTools.ts`:
     - `createEvent` - Create new calendar event (requires confirmation)
     - `getEvents` - Retrieve events with filters
     - `getNextEvent` - Get upcoming event
     - `updateEvent` - Modify event (requires confirmation)
     - `deleteEvent` - Remove event (requires confirmation)
   - AI assistant can now handle commands like:
     - "Create me a new event tomorrow at 2pm"
     - "What's on my calendar this week?"
     - "Move my 3pm meeting to 4pm"

7. **Dependencies**:
   - Installed `react-big-calendar` and `date-fns` for calendar functionality
   - Installed `moment` for React Big Calendar localizer
   - Installed `@types/react-big-calendar` for TypeScript support

**Files Created**:
- `convex/events.ts` - Event management functions
- `convex/googleCalendar.ts` - Google Calendar sync stubs
- `src/app/calendar/page.tsx` - Main calendar page
- `src/components/EventModal.tsx` - Event creation/editing modal

**Files Modified**:
- `convex/schema.ts` - Added events table
- `src/components/Sidebar.tsx` - Added calendar nav item
- `src/app/page.tsx` - Updated next event card
- `src/lib/chatTools.ts` - Added event tools

**Future Enhancements**:
- Google OAuth integration for two-way sync
- Recurring events support
- Attendees management
- Event reminders
- Drag-and-drop event rescheduling
- Event attachments

## [Previous] - 2025-01-28 00:05

### Simplified Metrics Cards - 4 Card Layout

**Overview**: Simplified the metrics cards from 5 cards to 4 more meaningful cards that fit better on one line.

**Changes:**
1. **Metrics Card Restructure**:
   - Removed "Total Tasks", "Upcoming (24h)", and "Completed (7d)" cards
   - Added "Active Tasks" - shows tasks that aren't completed or cancelled
   - Added "Active Reminders" - shows reminders with pending status
   - Kept "Up Next" and "Completed" cards
   
2. **Grid Layout**: Changed from 6-column to 4-column grid for better proportions

3. **New Convex Queries**:
   - Updated `tasks.getMetrics` to return `activeTasks` instead of `total`, `upcoming24h`, `completed7d`
   - Created `reminders.getMetrics` to return `activeReminders` count
   
4. **Final Card Layout**:
   - **Up Next** (1 column): Shows next task with time remaining or title if overdue
   - **Active Tasks** (1 column): Count of non-completed, non-cancelled tasks
   - **Active Reminders** (1 column): Count of pending reminders
   - **Completed** (1 column): Count of completed tasks

**Result**: All metric values are now fully visible with better spacing and more meaningful data.

## [Previous] - 2025-01-27 23:58

### Metric Cards Layout & Table Truncation Fixes

**Overview**: Fixed metric card visibility issues and added truncation to project columns to prevent horizontal scrolling.

**Changes:**
1. **Metric Cards Grid**: Reverted from 7-column to 6-column grid for better visibility of all metric values
2. **Project Column Truncation**: 
   - Added `max-w-[200px]` constraint to project links in tasks table
   - Added `truncate` class to project names
   - Made icon `flex-shrink-0` to prevent icon squishing
   - Applied same truncation to reminders table
3. **Improved Table UX**: Tables no longer require horizontal scrolling with long project names

## [Previous] - 2025-01-27 23:55

### Tasks & Reminders Natural Language Input Restructure

**Overview**: Restructured the Tasks & Reminders page to support natural language input for both tasks and reminders with intelligent parsing.

**Major Changes:**
1. **Grid Layout Fixed**:
   - Changed from 6-column to 7-column grid for better proportions
   - "Up Next" card now fits properly without eclipsing other metrics
   - All metric cards display on one line with proper spacing

2. **Tabs Repositioned**:
   - Moved Tasks/Reminders tabs above the natural language input section
   - Tabs now control what type of item is being created
   - More intuitive flow: select tab → describe item → see form

3. **Unified Natural Language Component**:
   - `TaskNaturalLanguageInput` now supports both tasks and reminders via `mode` prop
   - Component adapts placeholder text, button text, and API endpoint based on mode
   - Orange button color for reminders, blue for tasks

4. **Dual Mode Creation**:
   - Toggle between "Create a Task" and "Create a Reminder" based on active tab
   - Section header updates dynamically
   - Description text updates to guide user appropriately

5. **New API Endpoint**:
   - Created `/api/reminders/parse` endpoint using GPT-OSS-20B
   - Separate prompt optimized for reminder parsing
   - Handles client/project matching, time/date extraction
   - Fuzzy matching for client and project names

6. **Enhanced ReminderForm**:
   - Added `initialData` prop support for pre-filling parsed data
   - Can accept scheduledDate, scheduledTime, clientId, projectId from natural language
   - Seamless integration with natural language parsing flow

7. **Create Form Modal**:
   - Modal now adapts to active tab (tasks vs reminders)
   - Shows appropriate form (TaskFormCompact or ReminderForm)
   - Title updates dynamically based on context

**Technical Details:**
- `TaskNaturalLanguageInput.tsx`: Added `mode` prop (`'task' | 'reminder'`)
- `src/app/api/reminders/parse/route.ts`: New endpoint for reminder parsing
- `ReminderForm.tsx`: Added `initialData` interface prop
- Removed Tabs wrapper from table section (now conditional rendering)
- Both parsing endpoints share similar fuzzy matching logic

**User Experience:**
- Select Tasks or Reminders tab
- Type natural language description (e.g., "Call Kristian Hansen tomorrow at 3pm")
- AI parses and pre-fills form with title, description, time, client, project
- Review and submit or manually adjust

## [Previous] - 2025-01-27 23:45

### Up Next Card Layout Improvement

**Overview**: Improved the "Up Next" task card layout to better display task titles and handle overdue tasks.

**Changes:**
- **Stacked Layout**: Added `stacked` prop to `CompactMetricCard` component for vertical badge layout
- **Overdue Handling**: When a task is overdue, the title is shown as the value (no badge), and the icon turns red
- **Card Size**: "Up Next" card now spans 2 columns (`md:col-span-2`) to provide more space for longer task titles
- **Badge Positioning**: Badge now appears below the value in a stacked layout instead of awkwardly floating next to it
- **Text Truncation**: Added proper text truncation to prevent overflow within the card boundaries
- **Visual Hierarchy**: Improved spacing and alignment with `items-start` for better multi-line content display

**Technical Details:**
- Modified `CompactMetricCard` to support stacked layout mode
- Updated tasks page to detect overdue tasks and adjust display accordingly
- Grid layout adjusted to accommodate larger "Up Next" card (other cards remain same size)

## [Previous] - 2025-01-27 22:30

### Dynamic Cards Redesign - Card-Based UI Overhaul

**Overview**: Completely redesigned the dynamic cards section to match a modern card-based UI pattern with urgent banners, bold titles, clear time displays, and improved visual hierarchy.

**Major Changes:**
- **Action Buttons Repositioned**: Moved action buttons above the metrics cards for better visual flow
- **Card Layout**: Changed from 4 square cards to 3 rectangular cards (Next Task, Next Reminder, Next Event)
- **Removed Recent Email Card**: Removed since Inbox section is below
- **Rounded Corners**: All buttons and cards now use `rounded-lg` or `rounded-xl` for softer appearance

**New Card Design Features:**
- **Urgent Banners**: Red banner at top of cards when task/reminder is urgent (overdue or <24 hours)
- **Bold Titles**: Large, prominent titles (`text-xl font-bold`) for clear hierarchy
- **Descriptions**: Shows task/reminder description with `line-clamp-2` for truncation
- **Time Remaining Display**: Clear time remaining in footer (e.g., "2h remaining", "Overdue")
- **Context Information**: Shows client/project names below description
- **Priority Badges**: Color-coded priority indicators (high=red, medium=yellow, low=blue)
- **Action Buttons**: Full-width buttons at bottom of each card with clear CTAs
- **Visual Separation**: Border-top separator between content and footer section

**Card-Specific Details:**
1. **Next Task Card**:
   - Blue icon and button (`bg-blue-600`)
   - Shows task title, description, client/project context
   - Displays time remaining or "No due date"
   - Shows priority badge
   - "View Task" or "Create Task" button

2. **Next Reminder Card**:
   - Orange icon and button (`bg-orange-600`)
   - Shows reminder title, description, client/project context
   - Displays time remaining until scheduled time
   - "View Reminder" or "Create Reminder" button

3. **Next Event Card**:
   - Green icon
   - Placeholder for calendar integration
   - Disabled "View Calendar" button

**Styling Improvements:**
- Cards use `rounded-xl` for softer corners
- Hover effect: `hover:shadow-lg` for better interactivity
- Urgent items highlighted in red (`text-red-600`)
- Consistent spacing with `p-6` padding
- Flex layout with `mt-auto` for button positioning at bottom
- Border separators (`border-t border-gray-200`) for visual hierarchy

**Technical Details:**
- `isUrgent()` helper function checks if item is overdue or <24 hours away
- `formatTimeRemaining()` returns both text and urgent flag
- Cards maintain consistent height with flex layout
- All buttons use `rounded-lg` for consistency
- Action buttons grid uses `rounded-lg` on each button

**User Benefits:**
- Much clearer understanding of what each card represents
- Immediate visual feedback for urgent items
- Better readability with larger titles and descriptions
- Clear call-to-action buttons in each card
- More professional, polished appearance
- Better use of space with rectangular cards

---

## [Previous] - 2025-01-27 22:00

### Home Page Dashboard Improvements

**Overview**: Fixed readability issues, improved card layouts, enhanced action buttons styling, and corrected task filtering logic.

**Fixes:**
- **Card Layout Improvements**:
  - Changed from horizontal flex layout to vertical flex-col layout for better readability
  - Removed truncation issues - text now wraps properly with `line-clamp-2`
  - Added action buttons directly in cards ("View Task", "View Reminder", "Create Task", "Create Reminder")
  - Better spacing and visual hierarchy
  - Cards now have consistent height with flex-1 and mt-auto for button positioning

- **Task Filtering Fix**:
  - Updated upcoming tasks filter to include tasks without due dates (they're still upcoming)
  - Fixed "No upcoming tasks" showing when tasks exist - now properly includes all non-completed tasks
  - Tasks without due dates are sorted to the end, tasks with due dates sorted by date ascending

- **Action Buttons Enhancement**:
  - Changed to black buttons (`bg-black`) with colored icons
  - Full-width grid layout (6 columns on desktop, responsive)
  - Larger buttons (`h-12`, `size="lg"`)
  - Color-coded icons:
    - New Note: Blue (`text-blue-400`)
    - New Contact: Green (`text-green-400`)
    - New E-mail: Purple (`text-purple-400`)
    - New Task: Yellow (`text-yellow-400`)
    - New Reminder: Orange (`text-orange-400`)
    - New Upload: Red (`text-red-400`)

- **Inbox Section**:
  - Renamed "Recent Messages" to "Inbox"
  - Updated description to "App notifications and emails"
  - Changed icon from MessageSquare to Inbox
  - Shows "Coming soon" placeholder with helpful message

- **Subtitle Addition**:
  - Added subtitle below greeting: "Here is what you have to do today — {date}"
  - Date formatted as full date (e.g., "Monday, 27 January 2025")

**Technical Details:**
- Cards use flex-col layout with flex-1 for content and mt-auto for button positioning
- Task filtering now includes tasks without due dates in upcoming tasks table
- Action buttons use grid layout for full-width distribution
- All buttons maintain hover states and proper disabled states

---

## [Previous] - 2025-01-27 21:30

### Home Page Dashboard Overhaul

**Overview**: Completely redesigned the main dashboard home page with dynamic metrics cards, action buttons control panel, and data tables for recent messages and upcoming tasks.

**New Features:**
- **Enhanced Metrics Cards** (4 cards across top):
  - **Next Task Upcoming**: Shows next task title and due date/time, or "No tasks" if none
  - **Next Reminder**: Shows next reminder title and scheduled time, or "No active reminders" if none
  - **Recent E-mail**: Placeholder card showing "Coming soon"
  - **Next Event**: Placeholder card showing "Coming soon"
  - All cards are clickable and link to relevant pages
  - Dynamic content with formatted dates and relative time displays

- **Control Panel Section**:
  - Horizontal row of action buttons for quick access:
    - **New Note**: Navigates to notes page
    - **New Contact**: Opens CreateRolodexModal
    - **New E-mail**: Disabled placeholder (coming soon)
    - **New Task**: Opens TaskFormCompact modal
    - **New Reminder**: Navigates to tasks page
    - **New Upload**: Navigates to docs page
  - Compact button styling with icons
  - Responsive flex-wrap layout

- **Recent Messages Table**:
  - Displays recent chat sessions from global context
  - Shows session title, last message time (relative), and open action
  - Links to chat drawer for session access
  - Empty state with helpful messaging

- **Upcoming Tasks Table**:
  - Displays upcoming tasks (non-completed, with due dates in future)
  - Shows task title, client/project context, due date (relative), priority badge
  - Sorted by due date ascending (soonest first)
  - Limited to 10 most upcoming tasks
  - Links to tasks page for full task management

**Enhanced Components:**
- **page.tsx** (Home Dashboard):
  - Complete redesign with new layout structure
  - Personalized greeting "Hello {User}" at top
  - Metrics cards in responsive grid (4 columns desktop, responsive)
  - Control panel with action buttons
  - Two-column layout for tables (Recent Messages | Upcoming Tasks)
  - Integrated modals for contact and task creation
  - Proper loading states and empty states for all sections

**Data Queries Used:**
- `api.tasks.getMetrics` - For next task information
- `api.reminders.getUpcoming` - For next reminder (limit: 1)
- `api.chatSessions.list` - For recent messages (contextType: 'global', limit: 10)
- `api.tasks.getByUser` - For upcoming tasks table
- `api.clients.list` - For client name lookups
- `api.projects.list` - For project name lookups

**UI/UX Improvements:**
- More dynamic and actionable dashboard
- Quick access to common actions via control panel
- Clear visual hierarchy with metrics at top
- Detailed information in metric cards (not just numbers)
- Relative time formatting (e.g., "in 2h", "in 3d", "2h ago")
- Responsive design for mobile and desktop
- Proper empty states for all sections
- Clickable cards for navigation

**Technical Details:**
- Uses existing UI components (Card, Table, Button) from shadcn/ui
- Integrated with ChatDrawerContext for opening chat sessions
- Modal management for contact and task creation
- Proper TypeScript types throughout
- Convex real-time subscriptions for live updates
- Filtered and sorted task data client-side for performance

**User Benefits:**
- Better overview of upcoming work (tasks and reminders)
- Quick access to common actions
- Recent activity visibility (messages)
- Personalized greeting
- More actionable dashboard layout

**Next Steps:**
- Implement email integration for Recent E-mail card
- Implement calendar integration for Next Event card
- Add more dashboard widgets (activity feed, notifications)
- Consider adding dashboard customization options
- Add quick actions directly from tables (e.g., complete task from table)

---

## [Previous] - 2025-01-27 20:00

### Tasks and Reminders Management System

**Overview**: Implemented a comprehensive tasks and reminders management system with natural language input, tag management, search-based client/project selection, metrics dashboard, and tabbed interface for both tasks and reminders.

**New Features:**
- **Tasks and Reminders Page** (`/tasks`):
  - Tabbed interface with separate views for Tasks and Reminders
  - Natural language task creation with LLM parsing
  - Search-based client/project selection (replaces dropdowns)
  - Metrics cards showing: Up Next task, Total Tasks, Upcoming (24h), Completed, Completed (7d)
  - Tag management system with "Edit Tags" settings
  - Task assignment to other users with notifications
  - Reminder creation linked to tasks
  - Table views for both tasks and reminders with filtering

**New Components:**
1. **ClientProjectSearch.tsx** - Search-based client/project selector
   - Type-ahead search for clients and projects
   - Shows suggested client/project from LLM with "Accept" option
   - Dropdown results with client/project details
   - Disabled project search until client selected
   - Clear buttons for selected items

2. **TagManagementModal.tsx** - Tag library editor
   - Add/remove tags from user's tag library
   - Default tags: email, call, meeting, follow-up, review, send, prepare, update, check, schedule
   - Tags used by LLM to match natural language inputs
   - Persistent storage per user

3. **DatePickerCompact.tsx** - Improved date picker
   - Month and day dropdowns
   - Fixed year display (current year)
   - Starts from today's date
   - Prevents infinite loop with proper state management

**New Convex Functions:**
- **convex/userTags.ts**:
  - `get`: Get user's tag library
  - `update`: Update user's tag library

- **convex/tasks.ts**:
  - `getMetrics`: Get task metrics (total, upcoming, completed, up next)

**Enhanced Components:**
- **TaskFormCompact.tsx**:
  - Integrated ClientProjectSearch component
  - Reminder section with Switch component (replaces checkbox)
  - DatePickerCompact for reminder date selection
  - User assignment dropdown
  - All fields can be left blank except title

- **TaskNaturalLanguageInput.tsx**:
  - Added visible "Create Task" button
  - Shows "Parsing..." state during LLM processing
  - Button disabled when input is empty

- **tasks/page.tsx**:
  - Complete redesign with tabs for Tasks and Reminders
  - Metrics cards at top showing key statistics
  - Natural language input with search-based client/project selection
  - Tag management button in header
  - Separate table views for tasks and reminders
  - Task table shows: Status, Task, Assigned To, Priority, Due Date, Client, Project, Tags
  - Reminder table shows: Status, Reminder, Scheduled For, Client, Project
  - Filtering by status for both tabs

**LLM Integration:**
- **Updated `/api/tasks/parse/route.ts`**:
  - Now uses user's tag library for matching natural language inputs
  - LLM suggests client and project matches with confidence
  - Tags extracted from description matched against user's tag library
  - Returns suggested client/project IDs for highlighting

**Schema Updates:**
- **convex/schema.ts**:
  - Added `userTags` table for per-user tag libraries
  - Indexed by userId for fast lookups

**Bug Fixes:**
- Fixed DatePickerCompact infinite loop issue
- Fixed syntax errors in tasks page
- Fixed auth imports in userTags.ts

**Technical Details:**
- Tag library stored per user in `userTags` table
- LLM receives tag library in prompt for better matching
- Search inputs use debounced queries for performance
- Metrics calculated in real-time from user's tasks
- Up Next task shows hours/minutes until due date
- All components use Convex real-time subscriptions

**User Benefits:**
- Faster task creation with natural language input
- Better client/project selection with search (handles large lists)
- Customizable tag library for better LLM matching
- Clear metrics dashboard for task overview
- Unified interface for tasks and reminders
- Task assignment to team members with notifications

**Next Steps:**
- Add task detail page for editing tasks
- Add reminder detail page
- Add bulk actions for tasks/reminders
- Add calendar view for reminders
- Add email notifications for reminders
- Add task templates

---

## [Previous] - 2024-11-20 16:30

### Docs Section Enterprise Table Overhaul

**Overview**: Completely redesigned the docs section from a card-based layout to an enterprise-grade table interface with expandable hierarchies, advanced filtering, compact metrics, and a recent upload widget. This major UX improvement enables efficient browsing of large document volumes while keeping all interactions on a single page.

**New Components:**
1. **CompactMetricCard.tsx** - Streamlined metric display component
   - Single horizontal line layout with icon, title, and value
   - Minimal padding and height (1/3 of previous metric cards)
   - Optional badge support for status indicators
   - Click-through support for interactive metrics
   - Support for 7 color variants (blue, green, purple, orange, yellow, gray, red)

2. **RecentUploadCard.tsx** - Recent upload status widget
   - Shows most recent file from upload queue
   - Real-time status display with color-coded badges
   - Status types: "Needs Attention", "Complete", "Processing", "Error"
   - Click-through to document detail or queue page
   - Time-ago formatting (e.g., "5 mins ago", "2 hours ago")
   - Subtle highlight for files needing attention (orange background)
   - Falls back to "No recent uploads" when queue is empty

3. **DocumentsTable.tsx** - Advanced hierarchical document table
   - Three-level hierarchy: Client > Project > Document
   - Expandable/collapsible rows with chevron indicators
   - Sortable columns: Client, Project, Code, Category, Date
   - Column-based filtering with toggle controls
   - Visual hierarchy with indentation and color-coding:
     - Client rows: Blue background with Building2 icon
     - Project rows: Purple background with FolderKanban icon
     - Document rows: White background with FileText icon
   - Document count badges at each level
   - Action buttons: External link for clients/projects, View for documents
   - Sticky header for scrolling large datasets
   - Empty state with helpful messaging
   - Compact row height for high-density display

**Enhanced Pages:**
- **docs/page.tsx** - Major refactor for table-based UX
  - Replaced 4-column metric card grid with 5-column compact metrics row
  - RecentUploadCard as first metric (prominent position)
  - Replaced client tab cards with DocumentsTable component
  - Maintains three tabs: Client Documents, Internal Documents, Unclassified
  - Enhanced search functionality (filters table in real-time)
  - Internal and Unclassified tabs retain list view (simpler structure)
  - All navigation stays on same page (no routing to client/project folders)
  - Improved empty states with dashed borders and icons
  - Better visual hierarchy and spacing

**Key Features:**
- **Stay-on-Page Navigation**: Expand/collapse functionality keeps users in context
- **Advanced Filtering**: Column-specific filters with show/hide toggle
- **Smart Sorting**: Multi-level sorting maintains hierarchy
- **High-Density Display**: Compact design handles 100+ documents efficiently
- **Visual Hierarchy**: Clear client > project > document relationships
- **Quick Actions**: Direct links to client/project pages or document detail
- **Status Awareness**: Recent upload widget highlights files needing attention
- **Responsive Design**: Horizontal scroll on mobile, full table on desktop

**Data Flow:**
- Documents grouped by client first, then by project
- Filtered documents maintain grouping structure
- Sorting applied at each hierarchy level independently
- Expansion state managed per client and per project
- Real-time updates from Convex queries

**UX Improvements:**
- 70% reduction in metric card height (more space for content)
- No page navigation required for browsing documents
- One-click expand/collapse for quick exploration
- Multi-column filtering for precise document location
- Prominent recent upload status for quick action
- Clear document counts at every level

**Technical Details:**
- Uses shadcn/ui Table components as foundation
- State management with React hooks (useState, useMemo)
- Set-based tracking for expanded clients and projects
- Memoized grouping and filtering for performance
- Proper TypeScript types for all data structures
- Convex real-time subscriptions for live updates

**Breaking Changes:**
- None - all existing pages and functionality preserved
- Client folder pages (`/docs/client/[id]`) still functional but de-emphasized
- Project folder pages (`/docs/project/[id]`) still functional but de-emphasized

**User Benefits:**
- Enterprise-grade document management interface
- Faster document discovery and access
- Better suited for high-volume document workflows
- Clear organizational structure at a glance
- Immediate awareness of files needing attention
- More screen real estate for document content

**Performance:**
- Efficient rendering with memoized data processing
- Handles 1000+ documents without virtualization
- Can add react-window if needed for 10,000+ documents
- Minimal re-renders with proper state management

**Next Steps:**
- Monitor user feedback on table vs card preference
- Consider adding bulk actions (select multiple, batch operations)
- Add column width persistence (save user preferences)
- Consider adding saved filter presets
- Add export functionality (export filtered document list)

---

## [Previous] - 2025-01-27 18:00

### Fixed Vercel Deployment 404 Issue

**Overview**: Resolved 404 deployment errors on Vercel by updating middleware configuration and adding proper Vercel deployment configuration.

**Changes Made:**
- **Middleware Updates** (`src/middleware.ts`):
  - Added `/login` and `/signup` routes to public routes matcher (in addition to `/sign-in` and `/sign-up`)
  - Ensures Clerk authentication redirects work correctly for all authentication routes

- **Vercel Configuration** (`vercel.json`):
  - Created `vercel.json` with proper Next.js framework configuration
  - Ensures Vercel correctly detects and builds the Next.js application

- **Deployment Documentation** (`VERCEL_DEPLOYMENT.md`):
  - Created comprehensive deployment troubleshooting guide
  - Documented common 404 error causes and solutions
  - Added checklist for verifying Root Directory settings in Vercel
  - Included debugging steps and environment variable requirements

**Root Cause:**
The 404 error was caused by Vercel deploying from the parent directory instead of the `model-testing-app` subdirectory. This prevented Vercel from finding the Next.js application files.

**Solution:**
Updated Vercel project settings to set Root Directory to `model-testing-app`, ensuring Vercel builds and deploys from the correct directory.

**Technical Details:**
- Middleware now properly handles all Clerk authentication routes
- Vercel configuration ensures proper framework detection
- All environment variables verified (Clerk keys, Convex URL)

**Next Steps:**
- Monitor deployment to ensure 404 errors are resolved
- Verify authentication flow works correctly on production
- Test all routes after deployment completes

---

## [Previous] - 2025-01-27

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

