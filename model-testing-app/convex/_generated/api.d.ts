/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as apollo from "../apollo.js";
import type * as appetiteSignals from "../appetiteSignals.js";
import type * as approvals from "../approvals.js";
import type * as authHelpers from "../authHelpers.js";
import type * as bulkBackgroundProcessor from "../bulkBackgroundProcessor.js";
import type * as bulkUpload from "../bulkUpload.js";
import type * as cadenceDispatcher from "../cadenceDispatcher.js";
import type * as cadences from "../cadences.js";
import type * as categorySettings from "../categorySettings.js";
import type * as changelog from "../changelog.js";
import type * as chatActions from "../chatActions.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatSessions from "../chatSessions.js";
import type * as clients from "../clients.js";
import type * as codifiedExtractions from "../codifiedExtractions.js";
import type * as comments from "../comments.js";
import type * as companies from "../companies.js";
import type * as companiesHouse from "../companiesHouse.js";
import type * as contacts from "../contacts.js";
import type * as contextCache from "../contextCache.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as dailyBriefs from "../dailyBriefs.js";
import type * as dataLibrarySnapshots from "../dataLibrarySnapshots.js";
import type * as dealHelpers from "../dealHelpers.js";
import type * as deals from "../deals.js";
import type * as directMessages from "../directMessages.js";
import type * as directUpload from "../directUpload.js";
import type * as documentExtractions from "../documentExtractions.js";
import type * as documentGen from "../documentGen.js";
import type * as documentNotes from "../documentNotes.js";
import type * as documentPublish from "../documentPublish.js";
import type * as documents from "../documents.js";
import type * as driveHydration from "../driveHydration.js";
import type * as driveMirrorPlacement from "../driveMirrorPlacement.js";
import type * as driveSync from "../driveSync.js";
import type * as driveTokens from "../driveTokens.js";
import type * as driveWriteback from "../driveWriteback.js";
import type * as emails from "../emails.js";
import type * as enrichment from "../enrichment.js";
import type * as events from "../events.js";
import type * as excelTemplates from "../excelTemplates.js";
import type * as extractedItemCodes from "../extractedItemCodes.js";
import type * as extractionJobs from "../extractionJobs.js";
import type * as fileQueue from "../fileQueue.js";
import type * as fileTypeDefinitions from "../fileTypeDefinitions.js";
import type * as files from "../files.js";
import type * as filingFeedback from "../filingFeedback.js";
import type * as fireflies from "../fireflies.js";
import type * as firefliesSync from "../firefliesSync.js";
import type * as flags from "../flags.js";
import type * as folderStructure from "../folderStructure.js";
import type * as folderTemplates from "../folderTemplates.js";
import type * as funnels from "../funnels.js";
import type * as gmailInbound from "../gmailInbound.js";
import type * as gmailSend from "../gmailSend.js";
import type * as gmailTokens from "../gmailTokens.js";
import type * as gmailWatch from "../gmailWatch.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as googleCalendarLog from "../googleCalendarLog.js";
import type * as googleCalendarSync from "../googleCalendarSync.js";
import type * as http from "../http.js";
import type * as hubspotSync from "../hubspotSync.js";
import type * as hubspotSync__debug from "../hubspotSync/_debug.js";
import type * as hubspotSync_activities from "../hubspotSync/activities.js";
import type * as hubspotSync_archive from "../hubspotSync/archive.js";
import type * as hubspotSync_backlink from "../hubspotSync/backlink.js";
import type * as hubspotSync_companies from "../hubspotSync/companies.js";
import type * as hubspotSync_config from "../hubspotSync/config.js";
import type * as hubspotSync_contacts from "../hubspotSync/contacts.js";
import type * as hubspotSync_deals from "../hubspotSync/deals.js";
import type * as hubspotSync_index from "../hubspotSync/index.js";
import type * as hubspotSync_linking from "../hubspotSync/linking.js";
import type * as hubspotSync_migrations from "../hubspotSync/migrations.js";
import type * as hubspotSync_pipelines from "../hubspotSync/pipelines.js";
import type * as hubspotSync_recurringSync from "../hubspotSync/recurringSync.js";
import type * as hubspotSync_utils from "../hubspotSync/utils.js";
import type * as hubspotSync_webhook from "../hubspotSync/webhook.js";
import type * as intelRevalidate from "../intelRevalidate.js";
import type * as intelligence from "../intelligence.js";
import type * as intelligenceHelpers from "../intelligenceHelpers.js";
import type * as internalDocuments from "../internalDocuments.js";
import type * as internalFolders from "../internalFolders.js";
import type * as itemCategories from "../itemCategories.js";
import type * as itemCodeAliases from "../itemCodeAliases.js";
import type * as keywordLearning from "../keywordLearning.js";
import type * as knowledge_atomizerLane from "../knowledge/atomizerLane.js";
import type * as knowledge_atomsCore from "../knowledge/atomsCore.js";
import type * as knowledge_candidates from "../knowledge/candidates.js";
import type * as knowledge_chunkDedupe from "../knowledge/chunkDedupe.js";
import type * as knowledge_chunker from "../knowledge/chunker.js";
import type * as knowledge_chunks from "../knowledge/chunks.js";
import type * as knowledge_coverageAudit from "../knowledge/coverageAudit.js";
import type * as knowledge_docDedupe from "../knowledge/docDedupe.js";
import type * as knowledge_embeddings from "../knowledge/embeddings.js";
import type * as knowledge_facilities from "../knowledge/facilities.js";
import type * as knowledge_graphOverview from "../knowledge/graphOverview.js";
import type * as knowledge_graphQueries from "../knowledge/graphQueries.js";
import type * as knowledge_harnessClassify from "../knowledge/harnessClassify.js";
import type * as knowledge_ingestUpload from "../knowledge/ingestUpload.js";
import type * as knowledge_integritySweep from "../knowledge/integritySweep.js";
import type * as knowledge_lenderMatch from "../knowledge/lenderMatch.js";
import type * as knowledge_md5 from "../knowledge/md5.js";
import type * as knowledge_noteAtomizer from "../knowledge/noteAtomizer.js";
import type * as knowledge_rosterAssembly from "../knowledge/rosterAssembly.js";
import type * as knowledge_salience from "../knowledge/salience.js";
import type * as knowledge_sourceAtomizer from "../knowledge/sourceAtomizer.js";
import type * as knowledge_versionPrecedence from "../knowledge/versionPrecedence.js";
import type * as knowledge_vocabulary from "../knowledge/vocabulary.js";
import type * as knowledgeBank from "../knowledgeBank.js";
import type * as knowledgeLibrary from "../knowledgeLibrary.js";
import type * as leads from "../leads.js";
import type * as lib_buildGeneratedDocRow from "../lib/buildGeneratedDocRow.js";
import type * as lib_cadenceGating from "../lib/cadenceGating.js";
import type * as lib_dealSizeParse from "../lib/dealSizeParse.js";
import type * as lib_lenderTiers from "../lib/lenderTiers.js";
import type * as lib_markdownToTipTap from "../lib/markdownToTipTap.js";
import type * as lib_meetingStatus from "../lib/meetingStatus.js";
import type * as lib_pipelineStages from "../lib/pipelineStages.js";
import type * as lib_schemeGrouping from "../lib/schemeGrouping.js";
import type * as mcp from "../mcp.js";
import type * as mcpTokens from "../mcpTokens.js";
import type * as meetingExtractionJobs from "../meetingExtractionJobs.js";
import type * as meetings from "../meetings.js";
import type * as migrations from "../migrations.js";
import type * as migrations_addDocumentCodes from "../migrations/addDocumentCodes.js";
import type * as migrations_addFileTypeTargetFolders from "../migrations/addFileTypeTargetFolders.js";
import type * as migrations_backfillIntelFreshness from "../migrations/backfillIntelFreshness.js";
import type * as migrations_clearFileQueue from "../migrations/clearFileQueue.js";
import type * as migrations_clearLegacyData from "../migrations/clearLegacyData.js";
import type * as migrations_fixChatSessionsUserId from "../migrations/fixChatSessionsUserId.js";
import type * as migrations_fixClientRolesIds from "../migrations/fixClientRolesIds.js";
import type * as migrations_flagSubtotals from "../migrations/flagSubtotals.js";
import type * as migrations_mergeDuplicateClients from "../migrations/mergeDuplicateClients.js";
import type * as migrations_migrateToKnowledgeItems from "../migrations/migrateToKnowledgeItems.js";
import type * as migrations_resyncIntelligence from "../migrations/resyncIntelligence.js";
import type * as migrations_seedAppraisalTemplate from "../migrations/seedAppraisalTemplate.js";
import type * as migrations_seedCodeMappings from "../migrations/seedCodeMappings.js";
import type * as migrations_seedFileTypeDefinitions from "../migrations/seedFileTypeDefinitions.js";
import type * as migrations_seedFolderTemplates from "../migrations/seedFolderTemplates.js";
import type * as migrations_seedFolderTemplatesV2 from "../migrations/seedFolderTemplatesV2.js";
import type * as migrations_seedInternalFolders from "../migrations/seedInternalFolders.js";
import type * as migrations_seedKnowledgeTemplates from "../migrations/seedKnowledgeTemplates.js";
import type * as migrations_setDefaultDocumentScope from "../migrations/setDefaultDocumentScope.js";
import type * as modelExports from "../modelExports.js";
import type * as modelRuns from "../modelRuns.js";
import type * as modelingCodeMappings from "../modelingCodeMappings.js";
import type * as modelingTemplates from "../modelingTemplates.js";
import type * as noteTemplates from "../noteTemplates.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as orgBrief from "../orgBrief.js";
import type * as personalFolders from "../personalFolders.js";
import type * as planning from "../planning.js";
import type * as projectDataLibrary from "../projectDataLibrary.js";
import type * as projects from "../projects.js";
import type * as property from "../property.js";
import type * as prospectStages from "../prospectStages.js";
import type * as prospecting from "../prospecting.js";
import type * as prospects from "../prospects.js";
import type * as pushTokens from "../pushTokens.js";
import type * as reminders from "../reminders.js";
import type * as replyEventProcessor from "../replyEventProcessor.js";
import type * as replyEvents from "../replyEvents.js";
import type * as scenarioResults from "../scenarioResults.js";
import type * as scenarios from "../scenarios.js";
import type * as search from "../search.js";
import type * as skillRuns from "../skillRuns.js";
import type * as sourcing from "../sourcing.js";
import type * as structureGen from "../structureGen.js";
import type * as tasks from "../tasks.js";
import type * as templateDefinitions from "../templateDefinitions.js";
import type * as templateSheets from "../templateSheets.js";
import type * as templates from "../templates.js";
import type * as touchpoints from "../touchpoints.js";
import type * as userTags from "../userTags.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  apollo: typeof apollo;
  appetiteSignals: typeof appetiteSignals;
  approvals: typeof approvals;
  authHelpers: typeof authHelpers;
  bulkBackgroundProcessor: typeof bulkBackgroundProcessor;
  bulkUpload: typeof bulkUpload;
  cadenceDispatcher: typeof cadenceDispatcher;
  cadences: typeof cadences;
  categorySettings: typeof categorySettings;
  changelog: typeof changelog;
  chatActions: typeof chatActions;
  chatMessages: typeof chatMessages;
  chatSessions: typeof chatSessions;
  clients: typeof clients;
  codifiedExtractions: typeof codifiedExtractions;
  comments: typeof comments;
  companies: typeof companies;
  companiesHouse: typeof companiesHouse;
  contacts: typeof contacts;
  contextCache: typeof contextCache;
  conversations: typeof conversations;
  crons: typeof crons;
  dailyBriefs: typeof dailyBriefs;
  dataLibrarySnapshots: typeof dataLibrarySnapshots;
  dealHelpers: typeof dealHelpers;
  deals: typeof deals;
  directMessages: typeof directMessages;
  directUpload: typeof directUpload;
  documentExtractions: typeof documentExtractions;
  documentGen: typeof documentGen;
  documentNotes: typeof documentNotes;
  documentPublish: typeof documentPublish;
  documents: typeof documents;
  driveHydration: typeof driveHydration;
  driveMirrorPlacement: typeof driveMirrorPlacement;
  driveSync: typeof driveSync;
  driveTokens: typeof driveTokens;
  driveWriteback: typeof driveWriteback;
  emails: typeof emails;
  enrichment: typeof enrichment;
  events: typeof events;
  excelTemplates: typeof excelTemplates;
  extractedItemCodes: typeof extractedItemCodes;
  extractionJobs: typeof extractionJobs;
  fileQueue: typeof fileQueue;
  fileTypeDefinitions: typeof fileTypeDefinitions;
  files: typeof files;
  filingFeedback: typeof filingFeedback;
  fireflies: typeof fireflies;
  firefliesSync: typeof firefliesSync;
  flags: typeof flags;
  folderStructure: typeof folderStructure;
  folderTemplates: typeof folderTemplates;
  funnels: typeof funnels;
  gmailInbound: typeof gmailInbound;
  gmailSend: typeof gmailSend;
  gmailTokens: typeof gmailTokens;
  gmailWatch: typeof gmailWatch;
  googleCalendar: typeof googleCalendar;
  googleCalendarLog: typeof googleCalendarLog;
  googleCalendarSync: typeof googleCalendarSync;
  http: typeof http;
  hubspotSync: typeof hubspotSync;
  "hubspotSync/_debug": typeof hubspotSync__debug;
  "hubspotSync/activities": typeof hubspotSync_activities;
  "hubspotSync/archive": typeof hubspotSync_archive;
  "hubspotSync/backlink": typeof hubspotSync_backlink;
  "hubspotSync/companies": typeof hubspotSync_companies;
  "hubspotSync/config": typeof hubspotSync_config;
  "hubspotSync/contacts": typeof hubspotSync_contacts;
  "hubspotSync/deals": typeof hubspotSync_deals;
  "hubspotSync/index": typeof hubspotSync_index;
  "hubspotSync/linking": typeof hubspotSync_linking;
  "hubspotSync/migrations": typeof hubspotSync_migrations;
  "hubspotSync/pipelines": typeof hubspotSync_pipelines;
  "hubspotSync/recurringSync": typeof hubspotSync_recurringSync;
  "hubspotSync/utils": typeof hubspotSync_utils;
  "hubspotSync/webhook": typeof hubspotSync_webhook;
  intelRevalidate: typeof intelRevalidate;
  intelligence: typeof intelligence;
  intelligenceHelpers: typeof intelligenceHelpers;
  internalDocuments: typeof internalDocuments;
  internalFolders: typeof internalFolders;
  itemCategories: typeof itemCategories;
  itemCodeAliases: typeof itemCodeAliases;
  keywordLearning: typeof keywordLearning;
  "knowledge/atomizerLane": typeof knowledge_atomizerLane;
  "knowledge/atomsCore": typeof knowledge_atomsCore;
  "knowledge/candidates": typeof knowledge_candidates;
  "knowledge/chunkDedupe": typeof knowledge_chunkDedupe;
  "knowledge/chunker": typeof knowledge_chunker;
  "knowledge/chunks": typeof knowledge_chunks;
  "knowledge/coverageAudit": typeof knowledge_coverageAudit;
  "knowledge/docDedupe": typeof knowledge_docDedupe;
  "knowledge/embeddings": typeof knowledge_embeddings;
  "knowledge/facilities": typeof knowledge_facilities;
  "knowledge/graphOverview": typeof knowledge_graphOverview;
  "knowledge/graphQueries": typeof knowledge_graphQueries;
  "knowledge/harnessClassify": typeof knowledge_harnessClassify;
  "knowledge/ingestUpload": typeof knowledge_ingestUpload;
  "knowledge/integritySweep": typeof knowledge_integritySweep;
  "knowledge/lenderMatch": typeof knowledge_lenderMatch;
  "knowledge/md5": typeof knowledge_md5;
  "knowledge/noteAtomizer": typeof knowledge_noteAtomizer;
  "knowledge/rosterAssembly": typeof knowledge_rosterAssembly;
  "knowledge/salience": typeof knowledge_salience;
  "knowledge/sourceAtomizer": typeof knowledge_sourceAtomizer;
  "knowledge/versionPrecedence": typeof knowledge_versionPrecedence;
  "knowledge/vocabulary": typeof knowledge_vocabulary;
  knowledgeBank: typeof knowledgeBank;
  knowledgeLibrary: typeof knowledgeLibrary;
  leads: typeof leads;
  "lib/buildGeneratedDocRow": typeof lib_buildGeneratedDocRow;
  "lib/cadenceGating": typeof lib_cadenceGating;
  "lib/dealSizeParse": typeof lib_dealSizeParse;
  "lib/lenderTiers": typeof lib_lenderTiers;
  "lib/markdownToTipTap": typeof lib_markdownToTipTap;
  "lib/meetingStatus": typeof lib_meetingStatus;
  "lib/pipelineStages": typeof lib_pipelineStages;
  "lib/schemeGrouping": typeof lib_schemeGrouping;
  mcp: typeof mcp;
  mcpTokens: typeof mcpTokens;
  meetingExtractionJobs: typeof meetingExtractionJobs;
  meetings: typeof meetings;
  migrations: typeof migrations;
  "migrations/addDocumentCodes": typeof migrations_addDocumentCodes;
  "migrations/addFileTypeTargetFolders": typeof migrations_addFileTypeTargetFolders;
  "migrations/backfillIntelFreshness": typeof migrations_backfillIntelFreshness;
  "migrations/clearFileQueue": typeof migrations_clearFileQueue;
  "migrations/clearLegacyData": typeof migrations_clearLegacyData;
  "migrations/fixChatSessionsUserId": typeof migrations_fixChatSessionsUserId;
  "migrations/fixClientRolesIds": typeof migrations_fixClientRolesIds;
  "migrations/flagSubtotals": typeof migrations_flagSubtotals;
  "migrations/mergeDuplicateClients": typeof migrations_mergeDuplicateClients;
  "migrations/migrateToKnowledgeItems": typeof migrations_migrateToKnowledgeItems;
  "migrations/resyncIntelligence": typeof migrations_resyncIntelligence;
  "migrations/seedAppraisalTemplate": typeof migrations_seedAppraisalTemplate;
  "migrations/seedCodeMappings": typeof migrations_seedCodeMappings;
  "migrations/seedFileTypeDefinitions": typeof migrations_seedFileTypeDefinitions;
  "migrations/seedFolderTemplates": typeof migrations_seedFolderTemplates;
  "migrations/seedFolderTemplatesV2": typeof migrations_seedFolderTemplatesV2;
  "migrations/seedInternalFolders": typeof migrations_seedInternalFolders;
  "migrations/seedKnowledgeTemplates": typeof migrations_seedKnowledgeTemplates;
  "migrations/setDefaultDocumentScope": typeof migrations_setDefaultDocumentScope;
  modelExports: typeof modelExports;
  modelRuns: typeof modelRuns;
  modelingCodeMappings: typeof modelingCodeMappings;
  modelingTemplates: typeof modelingTemplates;
  noteTemplates: typeof noteTemplates;
  notes: typeof notes;
  notifications: typeof notifications;
  orgBrief: typeof orgBrief;
  personalFolders: typeof personalFolders;
  planning: typeof planning;
  projectDataLibrary: typeof projectDataLibrary;
  projects: typeof projects;
  property: typeof property;
  prospectStages: typeof prospectStages;
  prospecting: typeof prospecting;
  prospects: typeof prospects;
  pushTokens: typeof pushTokens;
  reminders: typeof reminders;
  replyEventProcessor: typeof replyEventProcessor;
  replyEvents: typeof replyEvents;
  scenarioResults: typeof scenarioResults;
  scenarios: typeof scenarios;
  search: typeof search;
  skillRuns: typeof skillRuns;
  sourcing: typeof sourcing;
  structureGen: typeof structureGen;
  tasks: typeof tasks;
  templateDefinitions: typeof templateDefinitions;
  templateSheets: typeof templateSheets;
  templates: typeof templates;
  touchpoints: typeof touchpoints;
  userTags: typeof userTags;
  users: typeof users;
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
