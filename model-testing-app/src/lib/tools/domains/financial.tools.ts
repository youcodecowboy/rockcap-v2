import type { AtomicTool } from "../types";

export const FINANCIAL_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ — Aggregate financial snapshot for a project
  // -------------------------------------------------------------------------
  {
    name: "getFinancialSummary",
    domain: "financial",
    action: "read",
    description:
      "Get a structured financial summary for a project. Aggregates all financial knowledge items into sections: Deal Economics (GDV, TDC, purchase price, profit margin), Loan Terms (facility amount, LTV, LTGDV, interest rate, fees), Valuation (market value, day-one value, valuer), Construction (contract sum, progress), and Exit (strategy, units sold, revenue). Each value includes confidence score and source document. Shows 'no data yet' for empty sections so you know what's missing.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The project ID to summarize financials for",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getKnowledgeItemsByProject" },
    contextRelevance: ["financial", "project"],
  },

  // -------------------------------------------------------------------------
  // READ — Assess key deal metrics against UK dev finance norms
  // -------------------------------------------------------------------------
  {
    name: "assessDealMetrics",
    domain: "financial",
    action: "read",
    description:
      "Calculate and assess key deal metrics for a project against UK property development finance norms. Computes LTV, LTGDV, LTC, Profit on Cost, Profit on GDV, and Build Cost per sq ft where data is available. Flags metrics outside typical ranges (e.g. LTV > 70%, profit margin < 15%). Reports what data is missing for metrics that cannot be calculated. Use this to give the user a quick health check on deal economics.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The project ID to assess",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getKnowledgeItemsByProject" },
    contextRelevance: ["financial", "project"],
  },

  // -------------------------------------------------------------------------
  // READ — Cross-reference a financial metric across source documents
  // -------------------------------------------------------------------------
  {
    name: "compareDocumentValues",
    domain: "financial",
    action: "read",
    description:
      "Compare values for a specific financial field across all source documents that mention it. Shows the value from each document with confidence scores and source dates. Calculates variance and flags discrepancies above 5%. Use this when the user asks whether figures match across documents (e.g. 'does the valuation GDV match the facility agreement?') or when you spot a potential inconsistency.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The project ID to compare across",
        },
        fieldPath: {
          type: "string",
          description: "Exact canonical field path to compare (e.g. 'financials.gdv', 'loanTerms.facilityAmount', 'valuation.marketValue'). Use getFinancialSummary first if unsure of the field path.",
        },
        fieldName: {
          type: "string",
          description: "Optional fuzzy search term if exact field path is unknown (e.g. 'GDV', 'interest rate'). Used as fallback if fieldPath matches nothing.",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getKnowledgeItemsByProject" },
    contextRelevance: ["financial", "project"],
  },
];
