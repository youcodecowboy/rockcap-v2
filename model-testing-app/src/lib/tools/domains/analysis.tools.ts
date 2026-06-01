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
];
