/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chatActions from "../chatActions.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatSessions from "../chatSessions.js";
import type * as clients from "../clients.js";
import type * as companies from "../companies.js";
import type * as contacts from "../contacts.js";
import type * as dealHelpers from "../dealHelpers.js";
import type * as deals from "../deals.js";
import type * as documents from "../documents.js";
import type * as emails from "../emails.js";
import type * as enrichment from "../enrichment.js";
import type * as fileQueue from "../fileQueue.js";
import type * as files from "../files.js";
import type * as funnels from "../funnels.js";
import type * as hubspotSync from "../hubspotSync.js";
import type * as hubspotSync_activities from "../hubspotSync/activities.js";
import type * as hubspotSync_companies from "../hubspotSync/companies.js";
import type * as hubspotSync_config from "../hubspotSync/config.js";
import type * as hubspotSync_contacts from "../hubspotSync/contacts.js";
import type * as hubspotSync_deals from "../hubspotSync/deals.js";
import type * as hubspotSync_index from "../hubspotSync/index.js";
import type * as hubspotSync_linking from "../hubspotSync/linking.js";
import type * as hubspotSync_pipelines from "../hubspotSync/pipelines.js";
import type * as hubspotSync_utils from "../hubspotSync/utils.js";
import type * as knowledgeBank from "../knowledgeBank.js";
import type * as leads from "../leads.js";
import type * as noteTemplates from "../noteTemplates.js";
import type * as notes from "../notes.js";
import type * as projects from "../projects.js";
import type * as prospecting from "../prospecting.js";
import type * as search from "../search.js";
import type * as templates from "../templates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chatActions: typeof chatActions;
  chatMessages: typeof chatMessages;
  chatSessions: typeof chatSessions;
  clients: typeof clients;
  companies: typeof companies;
  contacts: typeof contacts;
  dealHelpers: typeof dealHelpers;
  deals: typeof deals;
  documents: typeof documents;
  emails: typeof emails;
  enrichment: typeof enrichment;
  fileQueue: typeof fileQueue;
  files: typeof files;
  funnels: typeof funnels;
  hubspotSync: typeof hubspotSync;
  "hubspotSync/activities": typeof hubspotSync_activities;
  "hubspotSync/companies": typeof hubspotSync_companies;
  "hubspotSync/config": typeof hubspotSync_config;
  "hubspotSync/contacts": typeof hubspotSync_contacts;
  "hubspotSync/deals": typeof hubspotSync_deals;
  "hubspotSync/index": typeof hubspotSync_index;
  "hubspotSync/linking": typeof hubspotSync_linking;
  "hubspotSync/pipelines": typeof hubspotSync_pipelines;
  "hubspotSync/utils": typeof hubspotSync_utils;
  knowledgeBank: typeof knowledgeBank;
  leads: typeof leads;
  noteTemplates: typeof noteTemplates;
  notes: typeof notes;
  projects: typeof projects;
  prospecting: typeof prospecting;
  search: typeof search;
  templates: typeof templates;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
