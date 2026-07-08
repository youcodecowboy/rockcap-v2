// Typed reference to the org-wide overview query being built in parallel as
// `convex/knowledge/graphOverview.ts` `overview`. Hand-rolled via
// makeFunctionReference (the codebase idiom for cross-module refs — see
// convex/approvals.ts) instead of `api.knowledge.graphOverview.overview` so
// this bundle compiles before that module's codegen lands. Once it does, the
// generated path can replace this ref with no other changes.

import { makeFunctionReference } from "convex/server";
import type { AtlasOverview } from "./atlasTypes";

export const atlasOverviewRef = makeFunctionReference<
  "query",
  Record<string, never>,
  AtlasOverview
>("knowledge/graphOverview:overview");
