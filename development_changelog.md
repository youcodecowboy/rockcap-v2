## 2025-11-08 12:33:17 EST
- Initialized `model-testing-app` using `create-next-app@16.0.1` with default configuration (App Router, Tailwind CSS, TypeScript) to serve as a playground for Together.ai SLM experimentation.

## 2025-11-08 12:45:19 EST
- Built complete filing agent MVP with drag-and-drop file upload functionality
- Integrated Together.ai GPT-OSS-20B model for file analysis and categorization
- Created file processing utilities supporting PDF, DOCX, and text files (pdf-parse, mammoth)
- Implemented API route (/api/analyze-file) for server-side file analysis
- Built FileUpload component with drag-and-drop zone and file status tracking
- Built ClientManager component for adding/deleting clients with localStorage persistence
- Built OutputWindow component displaying model reasoning and analysis results in terminal-style format
- Created TypeScript types for FileMetadata, Client, and AnalysisResult
- Set up client storage system with mock initial data (5 sample clients)
- Implemented two-column responsive layout: file upload/client management on left, analysis output on right
- Added comprehensive error handling and loading states throughout the application

## 2025-11-08 12:47:12 EST
- Fixed PDF parsing compatibility issue by replacing pdf-parse with pdfjs-dist (legacy build) for Next.js serverless environment compatibility
- Resolved build errors related to CommonJS module imports and native dependencies

## 2025-11-08 12:57:39 EST
- Fixed pdfjs-dist worker console errors by suppressing worker-related error messages in server-side environment
- Added console.error override to filter out "fake worker" errors that occur during PDF parsing initialization
- Configured pdfjs-dist to run in main thread (without worker) for serverless compatibility

## 2025-11-08 12:59:59 EST
- Switched back to pdf-parse library for more reliable PDF parsing (replacing pdfjs-dist which had worker issues)
- Configured Next.js to use webpack instead of Turbopack for better compatibility with native modules (pdf-parse dependencies)
- Added webpack externals configuration to handle canvas dependencies
- Installed canvas package to support pdf-parse runtime requirements
- Updated package.json scripts to use --webpack flag by default
- Improved PDF parsing error handling with better error messages

## 2025-11-08 13:05:21 EST
- FINAL FIX: Removed pdf-parse library (which internally uses pdfjs-dist and requires workers) and switched to pdfjs-dist 3.11.174 directly
- Used pdfjs-dist legacy build (pdfjs-dist/legacy/build/pdf.js) which doesn't require worker files
- Configured GlobalWorkerOptions.workerSrc = false to completely disable worker functionality
- Implemented direct PDF text extraction using pdfjs-dist getDocument() and getTextContent() APIs
- Added proper PDF cleanup with destroy() method
- This solution works reliably in Next.js serverless environments without worker dependencies

## 2025-11-09 11:40:06 EST
- Created file type definitions library system (`src/lib/fileTypeDefinitions.ts`) for scalable file type identification
- Implemented dynamic file type hint system that only injects relevant file type guidance into prompts based on content keywords
- Added RedBook Valuation as the first file type definition with comprehensive identification rules
- Updated file analysis prompt to use file type guidance when relevant content is detected
- System now provides specific guidance for RICS RedBook valuations, improving accuracy for professional appraisal documents
- Architecture supports easy addition of 10-15+ file types without bloating system prompts

## 2025-11-09 11:43:45 EST
- Added Initial Monitoring Report file type definition to the definitions library
- Added Interim Monitoring Report file type definition to the definitions library
- Both monitoring report types categorized under "Inspections" category
- Initial Monitoring Reports: Pre-funding due diligence reports assessing construction costs and timelines
- Interim Monitoring Reports: Monthly progress reports during construction to authorize funding releases
- Implemented clear distinguishing rules between Initial (one-time pre-funding) and Interim (ongoing monthly) reports
- System can now accurately identify and differentiate between the two monitoring report types based on content analysis

## 2025-11-09 11:46:32 EST
- Enhanced Initial Monitoring Report keyword matching with additional variations: "initial report", "monitoring surveyor", "lender monitoring"
- Updated file type hint system to also check filenames for keyword matches (not just content)
- Strengthened prompt guidance to enforce strict adherence to file type definitions when matched
- Added explicit instructions that FILE TYPE GUIDANCE takes absolute precedence over general file type assumptions
- Fixed issue where Initial Monitoring Reports were incorrectly classified as "Appraisal Report" - now correctly identifies as "Initial Monitoring Report" with category "Inspections"
- System now properly enforces exact file type names from definitions library (e.g., "Initial Monitoring Report" not "Appraisal Report")

## 2025-11-09 11:49:05 EST
- Relaxed RedBook Valuation identification criteria to be less stringent
- Made RICS branding the PRIMARY indicator for RedBook Valuations (moved to top of keywords)
- Added "valuation methodology" as a keyword to catch formal valuation reports
- Updated description to note that most RICS valuations follow RedBook standards even if "RedBook" is not explicitly mentioned
- Added CRITICAL rule: If RICS branding AND formal valuation methodology are present, classify as RedBook Valuation even without explicit "RedBook" mention
- Changed RedBook reference rule from requirement to confirmation (presence confirms, absence doesn't exclude)
- System now correctly identifies RICS valuation reports as "RedBook Valuation" even when document doesn't explicitly mention "RedBook"

## 2025-11-09 11:55:29 EST
- Added Plans file type definition to the definitions library
- Plans categorized under "Property Documents" category
- Comprehensive keyword coverage: site location plan, blueprint, architectural plans, engineering plans, technical drawings, floor plans, elevations, sections
- Identification rules account for visual technical drawings with metadata blocks (architectural firm details, project info, sheet numbers, scales, revision tables)
- System can identify architectural and engineering plans based on content patterns and metadata structures
- Added Plans to prompt guidance examples for proper file type enforcement

## 2025-11-09 12:03:19 EST
- Added Legal Documents file type definition to the definitions library with subcategory support
- Legal Documents categorized under "Legal Documents" category
- Comprehensive keyword coverage: contracts, resolutions, facility letters, requests, board minutes, shareholder agreements, banking details, mandates, sale and purchase agreements, notices, evictions, terms and conditions, amendments, offer letters, guarantees
- Implemented subcategory system: Model can identify specific legal document types using format "Legal Documents - [Subcategory]"
- Available subcategories: Contracts, Resolutions, Facility Letters, Requests, Board Minutes, Shareholder Agreements, Banking Details, Mandates, Sale and Purchase Agreements, Notices, Evictions, Terms and Conditions, Amendments, Offer Letters, Guarantees
- Identification rules account for formal legal language, legal document structure, signatures, legal terminology, and legal firm details
- System can identify legal documents and optionally specify subcategory when document type is clear
- Added Legal Documents to prompt guidance examples for proper file type enforcement

## 2025-11-09 12:27:34 EST
- Added new "Loan Terms" category to the file categorization system
- Added Indicative Terms file type definition to the definitions library
- Indicative Terms categorized under "Loan Terms" category (new category)
- Comprehensive keyword coverage: indicative terms, development finance, bridging loan, facility terms, LTGDV, LGDV, arrangement fees, broker fees, exit fees, interest rates, loan structure breakdowns
- Identification rules account for preliminary loan offers with facility amounts, interest rates, fee structures, loan-to-value ratios, and "in principle" language
- System can identify development finance indicative terms documents based on loan structure patterns and terminology
- Added Indicative Terms to prompt guidance examples for proper file type enforcement
- Distinguishes Indicative Terms from formal loan agreements (preliminary offers vs. binding documents)

## 2025-11-09 14:01:35 EST
- Added intelligent spreadsheet classification system to prevent unnecessary extraction on non-appraisal spreadsheets
- Created `spreadsheetClassifier.ts` with keyword-based classification logic
- System now distinguishes between appraisal/construction cost spreadsheets (require extraction) and loan info/accounting spreadsheets (summarize only)
- Extraction keywords include: construction costs, build costs, site costs, plot costs, professional fees, square feet, price per square foot, development costs, cost breakdowns
- Non-extraction keywords include: lender, loan comparison, loan terms, interest rate, arrangement fee, LTV, LTGDV, accounting, financial statements
- Classification uses pattern matching: loan comparison tables (lender + LTV + fees) vs cost breakdown tables (costs + plots + square feet)
- Spreadsheets are classified before extraction gauntlet runs - only construction/appraisal spreadsheets trigger full extraction
- Regular spreadsheets (loan comparisons, accounting, data tables) are now summarized and filed like PDFs without expensive extraction
- Classification provides reason and confidence score for debugging
- Significantly reduces token usage and processing time for non-appraisal spreadsheets

## 2025-11-09 13:28:38 EST
- Fixed critical issue where cost names were being simplified to category names (e.g., "Purchase" instead of "Site Purchase Price")
- Updated extraction prompt to explicitly preserve ACTUAL cost names from spreadsheet in "type" field
- Clarified that "category" field is SEPARATE from "type" field - category does NOT replace the cost name
- Added explicit instructions in extraction: "type (the ACTUAL cost name/description from the spreadsheet - preserve the exact name)"
- Updated normalization to preserve all cost names and not replace them with category names
- Updated verification to preserve cost names when re-categorizing items
- Added examples throughout prompts showing correct format: "Site Purchase Price" NOT "Purchase", "Engineers" NOT "Professional"
- System now correctly preserves original cost names while properly categorizing them

## 2025-01-XX XX:XX:XX EST
- Enhanced enrichment extraction system to prioritize contact information extraction
- Updated file analysis prompt to ALWAYS extract contact information (emails, phone numbers, contact names, addresses, websites) when found in documents
- Added automatic profile updating for high-confidence contact information (confidence >= 0.85) - email and phone fields are now auto-accepted and applied to client profiles
- Enhanced prospecting context extraction to include contact information for decision makers
- Enrichment suggestions now include contact names with roles/titles (e.g., "John Smith - CEO")
- System now extracts ALL contact information found in documents, not just single instances
- Field mapping added for client profile updates: email → client.email, phone → client.phone, address → client.address, website → client.website
- Contact information extraction prioritized in both file analysis and prospecting context extraction prompts

## 2025-01-XX XX:XX:XX EST
- Built comprehensive Prospecting CRM system (Phase 1) integrating document enrichment with email outreach
- Extended Client and Project types with lifecycleStage ('prospect', 'perspective', 'current', 'past', 'archived') and tags fields
- Created Prospect, EmailTemplate, and ProspectingEmail interfaces for prospecting workflow
- Implemented prospect storage system with mock data (15+ real estate prospects across various stages)
- Created email template system with 4 base templates (cold outreach, follow-up, check-in, referral introduction)
- Built prospects list page with table view, filters (status, industry, source), search functionality, and enrichment score visualization
- Created prospect detail page with tabbed interface: Overview, Enrichment Intelligence, Email Outreach, Activity
- Implemented email composer with template selection, enrichment loading, merge field population, and suggestion sidebar
- Built enrichment aggregator to combine ProspectingContext from multiple documents into unified intelligence
- Added prospecting tab to client detail page showing email history, original prospect record, and available enrichment data
- Updated client detail page with lifecycle stage badges and tags display
- Added "Prospects" link to navigation bar
- Implemented prospect-to-client conversion workflow maintaining history and linking records
- Created smart merge field system for email templates ({{firstName}}, {{companyName}}, {{keyPoint}}, {{painPoint}}, etc.)
- All prospecting data stored in localStorage with mock API integrations ready for future HubSpot/Gmail connections
- System demonstrates complete workflow: Upload file → Extract enrichment → View prospect/client → Create personalized email using enrichment data

## 2025-11-08 13:13:17 EST
- Added comprehensive file categorization system for real estate financing company with 12 categories: Loan Applications, Property Documents, Financial Statements, Legal Documents, Appraisals, Inspections, Closing Documents, Communications, Contracts, Insurance, Tax Documents, General
- Implemented Project system: clients can own multiple projects (properties/loans), files can be associated with both client and project
- Updated types to include Project interface and enhanced AnalysisResult with summary, suggestedClientName, suggestedProjectName, and tokensUsed
- Enhanced Together.ai prompt to include real estate financing context, available categories, client/project matching, and client/project suggestions
- Updated ClientManager component to show expandable client list with nested projects, add/delete projects functionality
- Enhanced OutputWindow to display unified output format: summary, file type, category, client, project, confidence, tokens used, and reasoning
- Updated API route to handle projects, match projects to clients, and return complete unified output with all fields
- Updated FileUpload component to display suggested clients/projects when no exact match is found
- Mock data updated with real estate-focused clients (ABC Property Group, Metro Real Estate Holdings, etc.) and sample projects

## 2025-01-XX XX:XX:XX EST
- Implemented background file processing queue system allowing users to upload up to 15 documents simultaneously
- Created FileQueueProcessor class to manage sequential processing of files in the background with retry logic and exponential backoff
- Added fileUploadQueue table to Convex schema to track background file processing jobs with statuses: pending, uploading, analyzing, completed, error, needs_confirmation
- Built NotificationDropdown component integrated into NavigationBar showing real-time upload status and unread count
- Created /uploads/[jobId] page displaying detailed upload summary with analysis results, filing details, and extracted information
- Implemented FileAssignmentCard component for manual client/project assignment after file analysis
- Added automatic filing logic with confidence thresholds - files auto-file when confidence is high, require confirmation when low
- Integrated retry mechanism with exponential backoff (2s, 4s, 8s delays) for transient API errors (500, 502, 503, 504)
- Created useFileQueue hook providing queue operations and real-time state updates via Convex queries
- Updated FileUpload component to use queue system instead of direct processing, displaying queue status and limits
- Users can now continue using the application while files process in the background, receiving notifications upon completion

## 2025-01-XX XX:XX:XX EST
- Created /docs/queue page showing all documents requiring review (needs_confirmation status) with pending and completed sections
- Built EnrichmentReviewCard component for reviewing and applying data extraction suggestions to client/project profiles
- Added Accept/Decline/Skip actions for enrichment suggestions with batch processing support
- Updated upload summary page to show enrichment review card after document is filed
- Added queue link and badge to docs page header showing count of pending documents
- Extended enrichment schema with "skipped" status for enrichment suggestions that are skipped during review
- Created skip mutation in Convex enrichment module to persist skipped enrichment status
- Enrichment review workflow: File → Assign Client/Project → Review Enrichments → Apply to Profiles
- Queue page displays cards for pending documents with analysis preview and quick navigation to full review

## 2025-01-XX XX:XX:XX EST
- Implemented comprehensive Knowledge Bank and Notes system to consolidate all client information
- Added three new Convex tables: knowledgeBankEntries (stores consolidated knowledge per client), notes (user-created notes with rich text), and noteTemplates (templates for generating notes from knowledge bank entries)
- Created knowledgeBank.ts Convex module with functions: createFromDocument, createFromEmail, createManual, getByClient, getByProject, aggregateClientSummary, search, update, remove
- Created notes.ts Convex module with functions: create, update, remove, get, getByClient, getByProject, getAll, applyTemplate (generates notes from templates using knowledge bank entries)
- Created noteTemplates.ts Convex module with functions: create, update, remove, get, list
- Integrated automatic knowledge bank entry creation in document processing pipeline - documents linked to clients automatically generate knowledge bank entries with extracted metadata
- Built Notes page (/notes) with three-panel layout: notes list sidebar, rich text editor, and knowledge bank panel
- Implemented Notion-like rich text editor using TipTap with formatting toolbar, headings, lists, and auto-save functionality
- Created KnowledgeBankView component with filtering, search, and entry type filtering capabilities
- Built KnowledgeBankEntryCard and KnowledgeBankSummary components for displaying consolidated client information
- Created template system UI: TemplateSelector component for applying templates, TemplateEditor component for creating/editing templates, and /notes/templates page for template management
- Added Knowledge Bank tabs to client and project detail pages showing all related knowledge bank entries
- Added Notes section to sidebar navigation
- Knowledge bank entries automatically categorize by type (deal_update, call_transcript, email, document_summary, project_status, general) based on document content
- System extracts key points, metadata (loan amounts, interest rates, etc.), and tags from documents into knowledge bank entries
- Template system allows creating notes from knowledge bank entries with field mapping and data merging
- All knowledge bank data structured for LLM-friendly querying with both structured (metadata) and unstructured (content) formats

## 2025-11-13 XX:XX:XX EST
- Overhauled Notes page filtering system with comprehensive multi-criteria filtering
- Implemented master collapsible filter section with single-click expand/collapse functionality
- Removed redundant "All Notes" and "Internal Notes" quick filter buttons - moved into Type filter section
- Added powerful filter sections: Type (all/internal/drafts/from template), Tags (multi-select), Client (multi-select), Project (multi-select), Date Range (from/to dates)
- Created collapsible "Filters" button showing active filter count badge when filters are applied
- Entire filter section collapses to single button row, freeing up space for notes list
- Individual filter sections remain collapsible within expanded master filter section
- Added "Clear All Filters" button that appears when any filters are active (inside filter section)
- Enhanced notes list to display emoji icons, draft badges, client/project names (resolved from IDs), and tag overflow indicators
- Widened sidebar from 80 to 96 units for better filter visibility and reduced text truncation
- Search functionality remains fully functional and works in combination with all other filters
- Filter logic supports AND/OR combinations: multiple tags use OR logic, other filters use AND logic
- Empty state messages now distinguish between "no notes exist" vs "no notes match filters"
- All filters use useMemo for performance optimization with proper dependency tracking
- Filter state persists across note selections - filters remain active while viewing/editing notes
- Date range filter includes entire end date (sets time to 23:59:59.999) for intuitive date selection
- Enhanced note cards show client and project names instead of IDs using resolved lookups
- Added truncation and "+X more" indicators for notes with many tags to prevent UI overflow
- Collapsible sections remember expansion state within session for better UX
- UI defaults to filters collapsed, maximizing notes list visibility while keeping filters easily accessible
- Added File Type column to Document Library table showing actual file format (PDF, XLSX, DOCX, etc.)
- Renamed previous "Type" column to "Document Type" to distinguish between file format and detected document type
- File Type column displays clean format names (PDF, XLSX, DOCX, PPTX) extracted from MIME types
- Document Type column continues to show AI-detected document classification (RedBook Valuation, Indicative Terms, etc.)
- Table now displays both technical file format and intelligent document categorization for better document organization
- Implemented color-coded File Type badges for quick visual identification: PDF (red), Excel (green), Word (blue), PowerPoint (orange), CSV (teal), Text (gray), Other (purple)
- Increased Document Type column width from 140px to 180px to prevent text overlap with longer document type names like "Initial Monitoring Report"
- Added horizontal scroll indicator in table header ("Scroll horizontally for more" with icon) for better UX when table exceeds viewport width
- File Type badges now use outline variant with colored backgrounds and borders for better visual distinction
- Document Type changed from badge to plain text for cleaner appearance and better space utilization
- Completely redesigned Knowledge Bank interface as Wikipedia-style editable wiki
- Replaced navigation-based client pages with seamless in-page client selection - clicking clients stays within same view with sidebar visible
- Created Wikipedia-inspired article layout with serif fonts, clean typography, and article-style sections
- Added comprehensive client summary box showing Total Entries, Last Updated date, Topics count, and Latest Entry title
- Implemented inline editing for all knowledge entries - click Edit button to edit title, content, and key points directly in Wikipedia style
- All entry content is now editable text fields (title input, content textarea) instead of hard-coded displays
- Added "View File" buttons to each entry that link to the source document when available
- Knowledge entries display as Wikipedia article sections with proper heading hierarchy and formatting
- Project-based entries show in distinct blue-bordered sections within client wiki for better organization
- Entry headers show update timestamps, entry type badges, and action buttons (View File, Edit)
- Key points display as bulleted lists with blue bullet points for visual distinction
- Tags display as badges below each entry for categorization
- Editable entries have Save/Cancel buttons that appear when editing, with inline edit mode
- Empty states guide users to add their first entry with clear CTAs
- Sidebar maintains search, filters, and sort options while showing client list with entry counts
- Client selection highlights in sidebar without navigating away - seamless single-page experience
- "Add Entry" button positioned in Wikipedia-style header next to client name
- All knowledge entries feel like living, breathing Wiki pages that can be edited and updated inline
- Proper whitespace, typography, and layout create professional Wikipedia-like reading experience
- Content is presented in article format with proper prose styling and readable line lengths (max-w-4xl)
- Added document type badges (fileTypeDetected and category) to all knowledge entries sourced from documents
- Document type badges display alongside entry type badges showing document classification (e.g., "Indicative Terms", "RedBook Valuation") and category (e.g., "Loan Terms", "Appraisals")
- Implemented collapsible extracted data accordion for Excel/spreadsheet documents showing structured data breakdowns
- Extracted data display includes: total costs, cost categories with items and subtotals, financing information (loan amounts, interest rates), plots breakdown, and units information
- Added project-level navigation - clicking project headers navigates to project-only view showing just that project's entries
- Project view includes breadcrumb navigation back to client view (Client Name > Project Name)
- Project view maintains client overview summary box while filtering entries to selected project only
- "Add Entry" button works at both client and project levels, automatically associating entries with correct project when in project view
- Project headers in client view are clickable with hover effects and chevron indicator showing they're interactive
- Extracted data accordion uses expandable section with "View Extracted Data" button and chevron icons
- Document information fetched efficiently using documents map created from client/project document queries
- All document type information and extracted data properly linked to knowledge entries via sourceId

## 2025-11-13 21:45:00 EST
- Implemented AI Chat Assistant - a powerful conversational interface for managing the entire application through natural language
- Added floating chat button in bottom-right corner with toggle functionality and visual feedback
- Integrated meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8 via Together AI API for intelligent conversation handling
- Created comprehensive chat system with three new Convex tables: chatSessions (context-aware chat history), chatMessages (conversation messages), and chatActions (pending user confirmations)
- Built full-featured drawer interface (40-50% screen width) with chat history sidebar and main conversation area
- Implemented context-aware chat sessions - supports global chats, client-specific chats, and project-specific chats
- Created context selector allowing users to switch between global, client, or project contexts for targeted assistance
- Added chat history organization by time (Today, Yesterday, Older) with message count tracking
- Implemented function calling system with 15+ tools covering all major application features: searchClients, getClient, createClient, updateClient, searchProjects, getProject, createProject, updateProject, searchDocuments, getKnowledgeBank, getNotes, createKnowledgeBankEntry, createNote, getFileSummary
- Built action confirmation modal for all write operations - AI proposes actions, user must explicitly confirm before execution
- Implemented automatic context gathering for chat sessions - pulls relevant client data, knowledge bank entries, and project information based on session context
- Added tool execution engine in chatTools.ts connecting AI requests to actual Convex mutations and queries
- Created tool definitions with detailed parameters and descriptions for LLM function calling
- Built chat API route at /api/chat-assistant handling AI completions, tool calls, and action execution
- Implemented non-streaming chat responses with complete messages arriving at once for simpler UX
- Added keyboard shortcuts: Cmd/Ctrl + K to open/close assistant, ESC to close when open
- Created beautiful chat message UI with user/assistant avatars, message bubbles, and timestamps
- Built chat input component with auto-growing textarea, Enter to send, Shift+Enter for new line
- Added system messages for action confirmations and error handling
- Implemented conversation history management - passes last 20-30 messages to AI for context
- Added loading states with spinning indicators during AI thinking and action execution
- Created session management with auto-title generation based on context (e.g., "Chat with [Client Name]", "Chat about [Project Name]")
- All chat data persists in Convex with real-time updates via Convex queries
- Integrated chat assistant with existing tools: can create clients/projects, search documents, view knowledge bank, create notes, and more
- Added smooth animations for drawer slide-in/out and button interactions
- Built comprehensive error handling with user-friendly messages for API failures
- Chat assistant can answer questions, provide information, and execute actions across the entire application
- Users can now interact with the entire system through conversational AI instead of navigating pages manually
- Token usage tracking displayed in chat metadata for transparency
- Ready for future enhancements: file upload support, email sending, advanced data analysis

## 2025-11-14 22:30:00 EST
- Enhanced AI Chat Assistant with visual activity indicators showing real-time tool execution
- Added background task visibility: users now see messages like "🔍 Searching for projects...", "📄 Searching documents...", "🧠 Retrieving knowledge bank entries..." while AI works
- Implemented multi-turn tool calling system: AI can chain multiple tool calls together (e.g., search projects → find Lonnen Road → get documents → calculate expenses → provide answer)
- Tool execution now happens in background with results processed by AI before presenting to user (no raw JSON shown)
- Added token usage display next to message timestamps showing exact tokens consumed per response
- Activity messages appear as animated blue badges with spinner icons during tool execution
- Messages now display: timestamp • token count for complete transparency
- AI provides clean, human-readable final answers after processing all tool results internally
- Enhanced prompt engineering with XML-style tool call tags and multiple examples for better model adherence
- System messages distinguish between user messages, assistant responses, system notifications, and tool activity
- Activity indicators auto-clear after displaying to keep chat clean
- Token counts formatted with commas for readability (e.g., "1,234 tokens")
- Improved UX: users understand what's happening behind the scenes without seeing technical details

## 2025-11-14 23:00:00 EST
- Added rich markdown rendering to AI Chat Assistant messages using react-markdown and remark-gfm
- Chat messages now properly display formatted text instead of raw markdown syntax
- Supported markdown features: **bold**, *italic*, headings (H1-H3), bullet/numbered lists, code blocks, tables, blockquotes, horizontal rules, links
- Custom styled components for each markdown element with proper spacing and typography
- Tables render with borders and proper cell padding for structured data display
- Code blocks support both inline `code` and multi-line code blocks with syntax highlighting-ready styling
- Blockquotes styled with left border for visual distinction
- Links open in new tabs with proper security attributes
- Markdown styling adapts to message bubble color (user messages in blue theme, assistant in gray theme)
- Headings use appropriate font sizes and weights (H1: xl, H2: lg, H3: base)
- Lists properly indented with disc/decimal markers
- All markdown elements maintain proper spacing and readability within chat bubbles
- GitHub-flavored markdown support for tables, strikethrough, and task lists