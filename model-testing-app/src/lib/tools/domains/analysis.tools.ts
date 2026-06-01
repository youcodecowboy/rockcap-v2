import type { AtomicTool } from "../types";

export const ANALYSIS_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ — Analyze uploaded document via V4 pipeline
  // -------------------------------------------------------------------------
  {
    name: "analyzeUploadedDocument",
    domain: "document",
    action: "read",
    description:
      "Analyze an uploaded document using the V4 classification pipeline. Returns classification (type, category, confidence), summary, extracted intelligence, suggested folder placement, and checklist matches. Use this when the user uploads a file and wants it analyzed or filed.",
    parameters: {
      type: "object",
      properties: {
        storageId: {
          type: "string",
          description: "The Convex storage ID of the uploaded file",
        },
        fileName: {
          type: "string",
          description: "Original filename of the uploaded document",
        },
        fileType: {
          type: "string",
          description: "MIME type of the file (e.g., application/pdf)",
        },
        clientId: {
          type: "string",
          description: "Client ID for context-aware analysis (optional)",
        },
        projectId: {
          type: "string",
          description: "Project ID for context-aware analysis (optional)",
        },
        instructions: {
          type: "string",
          description:
            "User-provided instructions to guide the analysis (optional)",
        },
      },
      required: ["storageId", "fileName", "fileType"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "fileQueue.getFileUrl" },
    contextRelevance: ["document", "fileQueue", "client", "project"],
  },

  // -------------------------------------------------------------------------
  // WRITE — Save/file an analyzed document from chat
  // -------------------------------------------------------------------------
  {
    name: "saveChatDocument",
    domain: "document",
    action: "write",
    description:
      "File an analyzed document into the system. Creates a document record with classification, summary, and extracted data. Use this after analyzeUploadedDocument to save the results. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        storageId: {
          type: "string",
          description: "The Convex storage ID of the uploaded file",
        },
        fileName: {
          type: "string",
          description: "Original filename",
        },
        fileSize: {
          type: "number",
          description: "File size in bytes",
        },
        fileType: {
          type: "string",
          description: "MIME type of the file",
        },
        summary: {
          type: "string",
          description: "Document summary from analysis",
        },
        fileTypeDetected: {
          type: "string",
          description: "Detected document type (e.g., 'Planning Approval')",
        },
        category: {
          type: "string",
          description: "Document category (e.g., 'Plans', 'Financial Documents')",
        },
        confidence: {
          type: "number",
          description: "Classification confidence score (0-1)",
        },
        clientId: {
          type: "string",
          description: "Client ID to file the document under",
        },
        projectId: {
          type: "string",
          description: "Project ID to file the document under (optional)",
        },
        folderId: {
          type: "string",
          description: "Target folder key (e.g., 'background', 'financials')",
        },
        folderType: {
          type: "string",
          description: "Folder scope: 'client' or 'project'",
          enum: ["client", "project"],
        },
        classificationReasoning: {
          type: "string",
          description: "Reasoning for the classification",
        },
      },
      required: ["storageId", "fileName", "fileSize", "fileType", "summary", "fileTypeDetected", "category", "clientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documents.create" },
    contextRelevance: ["document", "client", "project"],
  },
  // -------------------------------------------------------------------------
  // READ — Re-analyze an existing filed document
  // -------------------------------------------------------------------------
  {
    name: "reanalyzeDocument",
    domain: "document",
    action: "read",
    description:
      "Re-analyze an existing filed document using the V4 classification pipeline. Fetches the document from storage, runs full analysis, and updates the document's classification, summary, and metadata. Use when a user wants to re-classify or re-extract data from an already-filed document.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the existing document to re-analyze",
        },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.get" },
    contextRelevance: ["document", "client", "project"],
  },
  // -------------------------------------------------------------------------
  // WRITE — Generate a formatted document from composed HTML and stage for approval
  // -------------------------------------------------------------------------
  {
    name: "generateDocument",
    domain: "document",
    action: "write",
    description:
      "Generate a formatted document (PDF + DOCX) from composed HTML content and stage it for operator approval. Use this for ad-hoc document requests like 'generate a one-pager on {company}'. YOU compose the document body as semantic HTML (headings, paragraphs, tables) grounded in real data — do NOT include <html>/<head>/<style>; house styling is applied automatically. On approval the document is filed to the client's library. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        contentHtml: {
          type: "string",
          description:
            "The document body as semantic HTML (e.g. <h1>, <h2>, <p>, <table>). No <html>/<head>/<style> wrappers — house-style CSS is applied by the renderer. Ground every figure in real data; never fabricate.",
        },
        title: {
          type: "string",
          description: "Document title, e.g. 'Mackenzie Miller Homes — Company One-Pager'. Used in the file and as the file name stem.",
        },
        docType: {
          type: "string",
          description: "The kind of document, e.g. 'Company One-Pager', 'Lender Submission Pack'. Stored as the document's detected type.",
        },
        category: {
          type: "string",
          description: "Filing category. Defaults to 'Generated' if omitted.",
        },
        summary: {
          type: "string",
          description: "One-line operator-facing description shown in the approvals queue. Defaults to the title.",
        },
        formats: {
          type: "array",
          description: "Output formats. Defaults to both ['pdf','docx'].",
          items: { type: "string", description: "pdf or docx" },
        },
        clientId: {
          type: "string",
          description: "Client to file the document under on approval.",
        },
        projectId: {
          type: "string",
          description: "Project to associate (optional).",
        },
      },
      required: ["contentHtml", "title", "docType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentPublish.requestPublish" },
    contextRelevance: ["document", "client", "project"],
  },
  // -------------------------------------------------------------------------
  // WRITE — Generate a branded multi-page BRIEF (structured briefData) for approval
  // -------------------------------------------------------------------------
  {
    name: "generateBrief",
    domain: "document",
    action: "write",
    description:
      "Generate a branded RockCap multi-page BRIEF (PDF + DOCX) and stage it for operator approval. Use this for requests like 'make me a client brief for {scheme}' or 'draft a lender brief on {borrower}'. Two layouts: 'lender-brief' sells a borrower's deal TO a lender (track-record depth from Companies House charges); 'client-brief' advises the BORROWER on the indicative lender landscape, leverage scenarios and expected pricing BEFORE going to market. YOU compose the structured briefData (title, key facts, numbered sections whose bodies are semantic HTML, sign-off), grounded in real data — read the deal's documents + intel first; never fabricate figures. Section bodyHtml is semantic HTML only (no <html>/<head>/<style> wrappers; use <table> with class=\"num\" on numeric cells, class=\"caption\" for source/footnote lines). On approval the files are filed to the client's library. Follow the doc-type-lender-brief / doc-type-client-brief references for the section set. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        layout: {
          type: "string",
          enum: ["lender-brief", "client-brief"],
          description: "Which brief to render: 'lender-brief' (to a lender) or 'client-brief' (to the borrower).",
        },
        briefData: {
          type: "object",
          description:
            "The full structured brief. Compose every section grounded in real data; never fabricate figures. The section set differs per layout — see the doc-type reference.",
          properties: {
            variant: {
              type: "string",
              description:
                "lender-brief: 'senior-dev' | 'dev-exit' | 'jv'. client-brief: 'new-facility' | 'refinance' | 'multi-scenario'.",
            },
            confidentiality: {
              type: "string",
              enum: ["INTERNAL", "EXTERNAL"],
              description: "Client briefs are EXTERNAL (sent to the borrower). Lender briefs default INTERNAL unless the operator says otherwise.",
            },
            title: {
              type: "object",
              description: "Title block.",
              properties: {
                location: { type: "string", description: "Scheme/location headline, e.g. 'THE OLD DAIRY' (rendered uppercase)." },
                descriptor: { type: "string", description: "One-line descriptor, e.g. 'Indicative Lender Landscape and Expected Pricing'." },
              },
              required: ["location", "descriptor"],
            },
            meta: {
              type: "object",
              description: "Meta line beneath the title.",
              properties: {
                borrower: { type: "string", description: "Borrower / group name." },
                preparedBy: { type: "string", description: "Usually 'RockCap Ltd'." },
                date: { type: "string", description: "e.g. 'April 2026' or '22 April 2026'." },
              },
              required: ["borrower", "preparedBy", "date"],
            },
            keyFacts: {
              type: "array",
              description: "The branded key-facts block — short label + value rows.",
              items: {
                type: "object",
                description: "One key fact.",
                properties: {
                  label: { type: "string", description: "Short label, e.g. 'GDV'." },
                  value: { type: "string", description: "The value, e.g. '£5,111,000 (blended £475 psf)'." },
                },
                required: ["label", "value"],
              },
            },
            sections: {
              type: "array",
              description:
                "Numbered sections. Each bodyHtml is injected raw — emit clean semantic HTML (<p>, <table> with class=\"num\" on numeric cells, class=\"caption\" on source/footnote lines). NO <html>/<head>/<style> wrappers. Follow the doc-type reference's section set.",
              items: {
                type: "object",
                description: "One section.",
                properties: {
                  n: { type: "number", description: "Section number (1, 2, 3 …)." },
                  title: { type: "string", description: "Section heading, e.g. 'Market Overview and Leverage Structure'." },
                  bodyHtml: { type: "string", description: "Section body as semantic HTML (prose + tables)." },
                },
                required: ["n", "title", "bodyHtml"],
              },
            },
            signOff: {
              type: "object",
              description: "Relationship Manager sign-off.",
              properties: {
                name: { type: "string", description: "RM name." },
                role: { type: "string", description: "e.g. 'Director, RockCap'." },
                email: { type: "string", description: "RM email." },
                phone: { type: "string", description: "RM phone." },
              },
              required: ["name", "role", "email", "phone"],
            },
          },
          required: ["variant", "confidentiality", "title", "meta", "keyFacts", "sections", "signOff"],
        },
        title: {
          type: "string",
          description: "Document title / file-name stem, e.g. 'The Old Dairy — Client Brief'.",
        },
        docType: {
          type: "string",
          description: "Stored document type. Defaults to 'Client Brief' / 'Lender Brief' derived from the layout.",
        },
        category: { type: "string", description: "Filing category. Defaults to 'Generated'." },
        summary: { type: "string", description: "One-line operator-facing summary for the approvals queue. Defaults to the title." },
        formats: {
          type: "array",
          description: "Output formats. Defaults to both ['pdf','docx'].",
          items: { type: "string", description: "pdf or docx" },
        },
        clientId: { type: "string", description: "Client to file the document under on approval." },
        projectId: { type: "string", description: "Project to associate (optional)." },
      },
      required: ["layout", "briefData", "title"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentPublish.requestPublish" },
    contextRelevance: ["document", "client", "project"],
  },
  // -------------------------------------------------------------------------
  // WRITE — Generate a comps appendix (Master Comparable Schedule) for approval
  // -------------------------------------------------------------------------
  {
    name: "generateComps",
    domain: "document",
    action: "write",
    description:
      "Generate a RockCap 'Appendix A — Master Comparable Schedule' (comps) as a spreadsheet (XLSX, default) or Word table (DOCX), and stage it for operator approval. Use for 'make me a comps appendix / comparable schedule for {scheme}'. A comps appendix is the comparable-evidence table attached to a lender credit pack / client brief to justify a scheme's GDV pricing. YOU compose the structured compsData: one or more sheets (tabs), each with configurable columns and tier/section groups of comparable rows (address, scheme, date, price, sqft, £psf, type, beds, notes, evidence link). Set column roles ('price','sqft','psf') and leave £psf blank to have it auto-computed (price ÷ sqft). Tiers can carry an auto-average row. Ground every comp in real evidence (Land Registry / agent listings); never fabricate prices or sqft. On approval the file is filed to the client's library. See the doc-type-comps-appendix reference for structure. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title / file-name stem, e.g. 'Horton — Master Comparable Appendix'." },
        compsData: {
          type: "object",
          description: "The structured comps appendix. One workbook; one sheet per entry in sheets[].",
          properties: {
            title: { type: "string", description: "Heading at the top of the sheet, e.g. 'Horton — Master Comparable Appendix'." },
            subtitle: { type: "string", description: "Scheme address + purpose, e.g. 'Land at …, GL5 2TG. Comparable evidence for lender credit pack.'" },
            preparedBy: { type: "string", description: "e.g. 'Prepared by RockCap Ltd | May 2026 | All comps are materially older stock'." },
            sheets: {
              type: "array",
              description: "One or more tabs. A single tiered schedule is one sheet; a hero/second-hand/new-build pack is several.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Tab name, e.g. 'Appendix A', 'Hero Comps', 'New Build'." },
                  intro: {
                    type: "array",
                    description: "Optional framing bullets above the table.",
                    items: { type: "string", description: "One bullet." },
                  },
                  columns: {
                    type: "array",
                    description: "Column definitions, left to right. Typical: Scheme, Unit/Address, Date, Price (£), SqFt, £/psf, Type, Beds, Notes, Evidence.",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string", description: "Stable key referenced by each row's cells, e.g. 'price'." },
                        label: { type: "string", description: "Header text, e.g. 'Price (£)'." },
                        type: { type: "string", enum: ["text", "price", "psf", "number", "date", "link"], description: "Formatting. 'price'/'psf' format as £; 'link' is a hyperlink cell." },
                        role: { type: "string", enum: ["price", "sqft", "psf"], description: "Set on the price, sqft and £psf columns to enable £psf auto-compute." },
                        width: { type: "number", description: "Optional Excel column width." },
                        align: { type: "string", enum: ["left", "center", "right"], description: "Optional cell alignment." },
                      },
                      required: ["key", "label"],
                    },
                  },
                  tiers: {
                    type: "array",
                    description: "Grouped sections. Each tier has a banded heading + its rows. For a flat schedule use a single tier with no heading.",
                    items: {
                      type: "object",
                      properties: {
                        heading: { type: "string", description: "Full-width band, e.g. 'TIER 1: WALL HALL (WD25) — Tier 1 Benchmark'. Omit for a flat sheet." },
                        rows: {
                          type: "array",
                          description: "Comparable rows.",
                          items: {
                            type: "object",
                            properties: {
                              cells: {
                                type: "object",
                                description: "Values keyed by column key. Numeric columns (price/sqft/psf/number) take numbers; a 'link' column takes { text, url }. Leave the £psf cell empty/absent to auto-compute it.",
                              },
                              excludeFromAverage: { type: "boolean", description: "True for asking/marketing evidence so it is left out of the tier average." },
                              isSummary: { type: "boolean", description: "Render as an emphasised summary row." },
                            },
                            required: ["cells"],
                          },
                        },
                        average: {
                          type: "object",
                          description: "Optional per-tier average row.",
                          properties: {
                            label: { type: "string", description: "Row label, e.g. 'Average (3-bed)'." },
                            auto: { type: "array", description: "Column keys to mean-average across non-excluded rows.", items: { type: "string", description: "A column key." } },
                          },
                        },
                      },
                      required: ["rows"],
                    },
                  },
                },
                required: ["name", "columns", "tiers"],
              },
            },
          },
          required: ["title", "sheets"],
        },
        docType: { type: "string", description: "Stored document type. Defaults to 'Comparable Schedule'." },
        category: { type: "string", description: "Filing category. Defaults to 'Generated'." },
        summary: { type: "string", description: "One-line operator-facing summary for the approvals queue. Defaults to the title." },
        formats: {
          type: "array",
          description: "Output formats — 'xlsx' (default) and/or 'docx'. PDF is not supported for comps.",
          items: { type: "string", description: "xlsx or docx" },
        },
        clientId: { type: "string", description: "Client to file the document under on approval." },
        projectId: { type: "string", description: "Project to associate (optional)." },
      },
      required: ["title", "compsData"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentPublish.requestPublish" },
    contextRelevance: ["document", "client", "project"],
  },
];
