import type { AtomicTool } from "../types";

export const INTELLIGENCE_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getClientIntelligence",
    domain: "intelligence",
    action: "read",
    description:
      "Get the structured intelligence profile for a client. Contains identity, contacts, addresses, banking, key people, lender/borrower profile, AI summary, and project summaries.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: {
      type: "query",
      path: "intelligence.getClientIntelligence",
    },
    contextRelevance: ["intelligence", "client"],
  },
  {
    name: "getProjectIntelligence",
    domain: "intelligence",
    action: "read",
    description:
      "Get the structured intelligence profile for a project. Contains overview, location, financials, timeline, development details, key parties, and AI summary.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The ID of the project" },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: {
      type: "query",
      path: "intelligence.getProjectIntelligence",
    },
    contextRelevance: ["intelligence", "project"],
  },
  {
    name: "searchLenders",
    domain: "intelligence",
    action: "read",
    description:
      "Search for lender clients that match deal criteria. Filters by deal size, property type, loan type, and geographic region. Returns matching lender intelligence profiles.",
    parameters: {
      type: "object",
      properties: {
        dealSize: {
          type: "number",
          description: "Deal size in GBP to match against lender min/max range",
        },
        propertyType: {
          type: "string",
          description:
            "Property type (e.g. residential, commercial, mixed-use, student, industrial)",
        },
        loanType: {
          type: "string",
          description:
            "Loan type (e.g. development, bridging, term, mezzanine, refurbishment)",
        },
        region: {
          type: "string",
          description:
            "Geographic region (e.g. London, South East, North West, National)",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: {
      type: "query",
      path: "intelligence.searchLenders",
    },
    contextRelevance: ["intelligence", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "updateClientIntelligence",
    domain: "intelligence",
    action: "write",
    description:
      "Update a client's intelligence profile. Supports partial updates — only the fields you provide will be updated, existing data is preserved. Use this to enrich client data with identity, contact, address, banking, key people, lender profile, or borrower profile information.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client (required)" },
        identity: {
          type: "object",
          description:
            "Company identity: legalName, tradingName, companyNumber, vatNumber, incorporationDate",
        },
        primaryContact: {
          type: "object",
          description: "Primary contact: name, email, phone, role",
        },
        addresses: {
          type: "object",
          description:
            "Addresses: registered, trading, correspondence (each is a string)",
        },
        banking: {
          type: "object",
          description:
            "Banking details: bankName, accountName, accountNumber, sortCode, iban, swift",
        },
        keyPeople: {
          type: "array",
          description:
            "Array of key people. Each: { name (required), role?, email?, phone?, isDecisionMaker?, notes? }",
        },
        lenderProfile: {
          type: "object",
          description:
            "Lender profile: dealSizeMin, dealSizeMax, preferredDealSize (numbers in GBP), propertyTypes (string[]), loanTypes (string[]), geographicRegions (string[]), typicalLTV (number), decisionSpeed, relationshipNotes, specializations (string[]), restrictions (string[])",
        },
        borrowerProfile: {
          type: "object",
          description:
            "Borrower profile: experienceLevel, completedProjects (number), totalDevelopmentValue (number in GBP), preferredPropertyTypes (string[]), preferredRegions (string[]), netWorth (number), liquidAssets (number)",
        },
        aiSummary: {
          type: "object",
          description:
            "AI summary: executiveSummary (string), keyFacts (string[])",
        },
        customFields: {
          type: "object",
          description: "Any custom key-value fields to store",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "intelligence.updateClientIntelligence",
    },
    contextRelevance: ["intelligence", "client"],
  },
  {
    name: "updateProjectIntelligence",
    domain: "intelligence",
    action: "write",
    description:
      "Update a project's intelligence profile. Supports partial updates — only the fields you provide will be updated. Use this to enrich project data with overview, location, financials, timeline, development details, or key parties.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project (required)",
        },
        overview: {
          type: "object",
          description:
            "Project overview: projectType, assetClass, description, currentPhase",
        },
        location: {
          type: "object",
          description:
            "Location: siteAddress, postcode, localAuthority, region",
        },
        financials: {
          type: "object",
          description:
            "Financials: purchasePrice, totalDevelopmentCost, grossDevelopmentValue, profit, profitMargin, loanAmount, ltv, ltgdv, interestRate, arrangementFee, exitFee (all numbers, monetary values in GBP)",
        },
        timeline: {
          type: "object",
          description:
            "Timeline dates (ISO strings): acquisitionDate, planningSubmissionDate, planningApprovalDate, constructionStartDate, practicalCompletionDate, salesCompletionDate, loanMaturityDate",
        },
        development: {
          type: "object",
          description:
            "Development details: totalUnits (number), totalSqFt (number), siteArea (number), planningReference, planningStatus, unitBreakdown (array of {type, count, avgSize?, avgValue?})",
        },
        keyParties: {
          type: "object",
          description:
            "Key parties: borrower {clientId?, name?, contactName?, contactEmail?}, lender {same}, solicitor {firm?, contactName?, contactEmail?}, valuer {firm?, contactName?}, architect {firm?, contactName?}, contractor {firm?, contactName?, contractValue?}, monitoringSurveyor {firm?, contactName?}",
        },
        aiSummary: {
          type: "object",
          description:
            "AI summary: executiveSummary, keyFacts (string[]), risks (string[])",
        },
        customFields: {
          type: "object",
          description: "Any custom key-value fields to store",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "intelligence.updateProjectIntelligence",
    },
    contextRelevance: ["intelligence", "project"],
  },
  {
    name: "addClientUpdate",
    domain: "intelligence",
    action: "write",
    description:
      "Add a text update to a client's intelligence profile. Appends to the recent updates list (max 10 kept). Use this to record findings, insights, or notes from conversations about the client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        update: {
          type: "string",
          description: "The update text to add (e.g. 'Client confirmed net worth of £5M in meeting on 24 Feb')",
        },
      },
      required: ["clientId", "update"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "intelligence.addClientUpdate",
    },
    contextRelevance: ["intelligence", "client"],
  },
  {
    name: "addProjectUpdate",
    domain: "intelligence",
    action: "write",
    description:
      "Add a text update to a project's intelligence profile. Appends to the recent updates list (max 10 kept). Use this to record findings, insights, or notes from conversations about the project.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The ID of the project" },
        update: {
          type: "string",
          description: "The update text to add (e.g. 'Planning approval received, construction starting Q2 2026')",
        },
      },
      required: ["projectId", "update"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "intelligence.addProjectUpdate",
    },
    contextRelevance: ["intelligence", "project"],
  },
  {
    name: "addKnowledgeItem",
    domain: "intelligence",
    action: "write",
    description:
      "Add a structured knowledge item to a client or project. Knowledge items have a field path (e.g. 'financials.propertyValue'), a typed value, confidence score, and source tracking. Supersedes existing items with the same field path if confidence is higher.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID (provide clientId or projectId)" },
        projectId: { type: "string", description: "Project ID (provide clientId or projectId)" },
        fieldPath: {
          type: "string",
          description: "Dot-notation field path (e.g. 'financials.propertyValue', 'identity.companyNumber')",
        },
        category: {
          type: "string",
          description: "Category of the knowledge item (e.g. 'identity', 'financials', 'timeline', 'legal')",
        },
        label: {
          type: "string",
          description: "Human-readable label (e.g. 'Property Value', 'Company Number')",
        },
        value: {
          type: "string",
          description: "The value (will be stored as-is)",
        },
        valueType: {
          type: "string",
          description: "Type of value: string, number, currency, date, percentage, array, text, boolean",
        },
        sourceText: {
          type: "string",
          description: "Optional source text where this data was found",
        },
      },
      required: ["fieldPath", "category", "label", "value", "valueType"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "knowledgeLibrary.addKnowledgeItem",
    },
    contextRelevance: ["intelligence", "client", "project"],
  },
];
