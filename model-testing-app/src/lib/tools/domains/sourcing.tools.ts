/**
 * Sourcing domain tools.
 *
 * Prospect SOURCING from the charges service: from a lender RockCap already
 * knows, surface the companies it has charged as bulk candidates, enrich each
 * with one Companies House profile call, and let the operator promote the few
 * that fit into the prospect pipeline. Candidates live in `sourcedCompanies`
 * (NOT clients) until promoted.
 */

import { AtomicTool } from "../types";

export const SOURCING_TOOLS: AtomicTool[] = [
  {
    name: "searchChargeholders",
    domain: "sourcing",
    action: "read",
    description:
      "Disambiguate a lender name against the charges dataset. Returns distinct canonical lenders matching the query with charge/company counts (e.g. 'PARAGON' resolves to PARAGON BANK PLC vs PARAGON DEVELOPMENT FINANCE LIMITED). Call this FIRST to get the exact canonical name for sourceFromLender.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Fuzzy lender name, e.g. 'paragon dev finance'" },
        limit: { type: "number", description: "Max lenders to return (default 25)" },
      },
      required: ["query"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "action", path: "sourcing.searchLenders" },
    contextRelevance: ["sourcing", "client"],
  },
  {
    name: "sourceFromLender",
    domain: "sourcing",
    action: "write",
    description:
      "Source prospect CANDIDATES from a known lender: pull the companies that lender has charged, enrich each with one Companies House profile call (name/status/SIC/town), dedup against the existing client book, and store them as sourcing candidates (NOT prospects yet). Pass the EXACT canonical lender name from searchChargeholders. Filters: status (all|outstanding|satisfied), registeredSince/registeredUntil (YYYY-MM-DD), jurisdiction (ew|sc|ni), entityType (company|llp), propertyContains. Capped at 500 — narrow big lenders with registeredSince.",
    parameters: {
      type: "object",
      properties: {
        lender: { type: "string", description: "Exact canonical lender name (from searchChargeholders)" },
        status: { type: "string", enum: ["all", "outstanding", "satisfied"], description: "Charge status filter (default all)" },
        registeredSince: { type: "string", description: "YYYY-MM-DD lower bound on charge date" },
        registeredUntil: { type: "string", description: "YYYY-MM-DD upper bound on charge date" },
        jurisdiction: { type: "string", enum: ["ew", "sc", "ni"], description: "Jurisdiction filter" },
        entityType: { type: "string", enum: ["company", "llp"], description: "Entity type filter" },
        propertyContains: { type: "string", description: "Free-text scheme/location filter" },
        limit: { type: "number", description: "Max companies (<=500, default 500)" },
      },
      required: ["lender"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "action", path: "sourcing.sourceFromLender" },
    contextRelevance: ["sourcing", "client"],
  },
  {
    name: "listSourcedCompanies",
    domain: "sourcing",
    action: "read",
    description:
      "List sourced prospect candidates. Filter by state (new|reviewed|promoted|dismissed), lender (canonical name), or batch. Set includeInBook=false to hide companies already in the client book. Newest charge first.",
    parameters: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["new", "reviewed", "promoted", "dismissed"], description: "Sourcing state filter" },
        lender: { type: "string", description: "Canonical lender name" },
        batch: { type: "string", description: "Sourcing batch id" },
        includeInBook: { type: "boolean", description: "Include companies already in the book (default true)" },
        limit: { type: "number", description: "Max rows" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "sourcing.list" },
    contextRelevance: ["sourcing", "client"],
  },
  {
    name: "promoteSourcedCompany",
    domain: "sourcing",
    action: "write",
    description:
      "Promote a sourced candidate into the prospect pipeline: creates a borrower client (status=prospect) linked to the CH number and schedules the full Companies House sync. Apollo / deep intel is a separate step after this. Returns the new client id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "sourcedCompanies row id" },
      },
      required: ["id"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "sourcing.promote" },
    contextRelevance: ["sourcing", "client"],
  },
  {
    name: "setSourcedCompanyState",
    domain: "sourcing",
    action: "write",
    description:
      "Triage a sourced candidate: set its state to reviewed or dismissed (or back to new), with optional notes — without promoting it.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "sourcedCompanies row id" },
        state: { type: "string", enum: ["new", "reviewed", "dismissed"], description: "New state" },
        notes: { type: "string", description: "Optional triage notes" },
      },
      required: ["id", "state"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "mutation", path: "sourcing.setState" },
    contextRelevance: ["sourcing", "client"],
  },
];
