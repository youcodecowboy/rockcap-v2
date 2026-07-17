import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

// Entity-candidate lifecycle — Spec 2 Phase 2b (§3.5).
// (docs/spec-2-knowledge-layer.md)
//
// Atomization waves keep hitting unresolvable mentions (borrower SPVs,
// advisory firms, landowners, secondary lenders). Before this module the
// repair path was "re-anchor to the client or drop the fact", which produced
// island graphs — facts flattened into attributes with names buried in
// statements, zero edges. Now the skill mints a PROVISIONAL entity
// (entityCandidates row), anchors the atom to it (subjectType/objectEntityType
// "candidate" — already accepted by atomsCore's ENTITY_TABLES), and the
// enrichment worker below resolves candidates in the background:
//   companies → Companies House name search (exact-normalized-name matches
//     only) → syncOneCompanyFromCHInternal → companiesHouseCompanies row;
//   people → contacts-by-name within the client scope, else Apollo person
//     match (conservative: requires a client scope + a returned email).
// On resolution, atomsCore.repointCandidateAtoms re-points every referencing
// atom to the real entity THROUGH the identity machinery (duplicates merge,
// observations move, corroboration bumps), and the candidate keeps
// resolvedTo* as a tombstone so re-extraction resolves instantly.
//
// ── Scope-hint convention (schema is FROZEN this phase) ──
// entityCandidates has no clientId column and none may be added. A caller's
// clientId scope hint is folded into contextSnippet as
//   "client:<clientsRowId>|<original snippet>"
// parseScopeHint() reads it back. The hint is what lets the person path scan
// the right client's contacts and hand Apollo an organization_name.
//
// ── Attempts policy ──
// enrichmentAttempts counts FAILED resolution attempts (no-match/ambiguous).
// After MAX_ATTEMPTS the sweep skips the candidate but it STAYS pending —
// never auto-dismissed; the operator dismisses via atoms.dismissCandidate.
// Infrastructure errors (CH/Apollo key missing, rate limits, network) do NOT
// consume attempts — they aren't evidence the mention is unresolvable.

export const MAX_ATTEMPTS = 3;
export const SWEEP_CAP = 10;

// ── Normalization (shared by create + the CH match test) ──

/** Lowercase, strip punctuation, collapse whitespace. "Land at Willersey
 * SPV Ltd." → "land at willersey spv ltd". */
export function normalizeMention(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SCOPE_HINT_RE = /^client:([a-z0-9]+)\|([\s\S]*)$/;

function parseScopeHint(contextSnippet: string | undefined): {
  clientId: string | null;
  snippet: string | undefined;
} {
  if (!contextSnippet) return { clientId: null, snippet: undefined };
  const m = contextSnippet.match(SCOPE_HINT_RE);
  if (!m) return { clientId: null, snippet: contextSnippet };
  return { clientId: m[1], snippet: m[2] || undefined };
}

function packScopeHint(
  clientId: string | undefined,
  snippet: string | undefined,
): string | undefined {
  if (!clientId) return snippet;
  return `client:${clientId}|${snippet ?? ""}`;
}

// ── createCandidate — mint (or reuse) a provisional entity ──

export const createCandidate = internalMutation({
  args: {
    mentionText: v.string(),
    guessedType: v.union(v.literal("person"), v.literal("company")),
    contextSnippet: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("documents")),
    clientId: v.optional(v.id("clients")), // scope hint — packed into contextSnippet (schema frozen)
  },
  handler: async (ctx, args) => {
    const mentionText = args.mentionText.trim();
    const normalizedName = normalizeMention(mentionText);
    if (!normalizedName) {
      throw new Error("empty_mention: mentionText normalizes to nothing");
    }

    // Same normalized mention (per guessedType) across documents reuses ONE
    // candidate — "this unknown entity keeps appearing" is itself a signal.
    const rows = await ctx.db
      .query("entityCandidates")
      .withIndex("by_normalized_name", (q) =>
        q.eq("normalizedName", normalizedName),
      )
      .collect();
    const existing = rows.find((r) => r.guessedType === args.guessedType);

    if (existing) {
      // Resolved tombstone → hand the caller the REAL entity so it can anchor
      // the atom directly (no candidate hop for facts arriving post-resolution).
      if (
        existing.status === "resolved" &&
        existing.resolvedToType &&
        existing.resolvedToId
      ) {
        return {
          reused: true as const,
          status: "resolved" as const,
          candidateId: existing._id,
          resolvedType: existing.resolvedToType,
          resolvedId: existing.resolvedToId,
        };
      }
      // Pending (or operator-dismissed — reusing keeps the dedup signal and
      // never resurrects a dismissed mention as fresh noise). Backfill the
      // context snippet / scope hint if the prior row had none.
      const packed = packScopeHint(args.clientId, args.contextSnippet);
      if (!existing.contextSnippet && packed) {
        await ctx.db.patch(existing._id, { contextSnippet: packed });
      }
      return {
        reused: true as const,
        status: existing.status,
        candidateId: existing._id,
      };
    }

    const candidateId = await ctx.db.insert("entityCandidates", {
      mentionText,
      normalizedName,
      guessedType: args.guessedType,
      contextSnippet: packScopeHint(args.clientId, args.contextSnippet),
      sourceDocumentId: args.sourceDocumentId,
      status: "pending",
      enrichmentAttempts: 0,
    });
    return {
      reused: false as const,
      status: "pending" as const,
      candidateId,
    };
  },
});

// ── listCandidates — rows + referencing-atom counts (operator surface) ──

export const listCandidates = internalQuery({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("resolved"),
        v.literal("dismissed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("entityCandidates")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("entityCandidates").collect();

    const out = [];
    for (const row of rows) {
      const key = String(row._id);
      const asSubject = await ctx.db
        .query("atoms")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "candidate").eq("subjectId", key),
        )
        .collect();
      const asObject = await ctx.db
        .query("atoms")
        .withIndex("by_object", (q) =>
          q.eq("objectEntityType", "candidate").eq("objectEntityId", key),
        )
        .collect();
      const { clientId, snippet } = parseScopeHint(row.contextSnippet);
      out.push({
        ...row,
        contextSnippet: snippet,
        scopeClientId: clientId,
        referencingAtoms: {
          asSubject: asSubject.length,
          asObject: asObject.length,
          total: asSubject.length + asObject.length,
        },
      });
    }
    return out;
  },
});

// ── dismissCandidate — operator says "not a real entity / don't chase" ──

export const dismissCandidate = internalMutation({
  args: { candidateId: v.id("entityCandidates") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.candidateId);
    if (!row) throw new Error("candidate_not_found");
    if (row.status === "resolved") {
      throw new Error(
        "already_resolved: this candidate resolved to a real entity; dismissing would orphan the tombstone",
      );
    }
    await ctx.db.patch(args.candidateId, { status: "dismissed" });
    return { ok: true as const, candidateId: args.candidateId };
  },
});

// ── Sweep support queries / mutations ──

/** Pending candidates still inside the attempts budget, oldest first. */
export const pendingForSweep = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("entityCandidates")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending
      .filter((r) => r.enrichmentAttempts < MAX_ATTEMPTS)
      .slice(0, SWEEP_CAP);
  },
});

/** A FAILED resolution attempt (no-match / ambiguous). Infra errors never
 * call this — they aren't evidence the mention is unresolvable. */
export const bumpAttempts = internalMutation({
  args: { candidateId: v.id("entityCandidates") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.candidateId);
    if (!row || row.status !== "pending") return { ok: false as const };
    await ctx.db.patch(args.candidateId, {
      enrichmentAttempts: row.enrichmentAttempts + 1,
    });
    return { ok: true as const, attempts: row.enrichmentAttempts + 1 };
  },
});

export const getCompanyByNumber = internalQuery({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const num = args.companyNumber.trim().toUpperCase();
    return await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_company_number", (q) => q.eq("companyNumber", num))
      .first();
  },
});

/** Case-insensitive exact-name contact match within a client's roster. */
export const findContactByNameForClient = internalQuery({
  args: { name: v.string(), clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const target = normalizeMention(args.name);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    return (
      contacts.find(
        (c) =>
          c.isDeleted !== true &&
          !c.archivedAt &&
          normalizeMention(c.name) === target,
      ) ?? null
    );
  },
});

export const getClientMeta = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;
    const c = client as any;
    return {
      name: (c.name ?? null) as string | null,
      companyName: (c.companyName ?? null) as string | null,
    };
  },
});

// ── The enrichment worker — 2-hour cron, cap 10/tick ──

type SweepCounts = {
  scanned: number;
  resolvedCompanies: number;
  resolvedPersons: number;
  attemptsBumped: number;
  infraErrors: number;
};

/** Apollo error strings that mean "infrastructure", not "no such person". */
const APOLLO_INFRA_ERRORS = new Set([
  "APOLLO_API_KEY not set in Convex env",
  "apollo_auth_error",
  "apollo_rate_limit",
  "network_error",
  "apollo_parse_error",
]);

export const enrichmentSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<SweepCounts> => {
    const pending = await ctx.runQuery(
      internal.knowledge.candidates.pendingForSweep,
      {},
    );
    const counts: SweepCounts = {
      scanned: pending.length,
      resolvedCompanies: 0,
      resolvedPersons: 0,
      attemptsBumped: 0,
      infraErrors: 0,
    };
    if (pending.length === 0) return counts;

    const bump = async (candidateId: Id<"entityCandidates">, why: string) => {
      console.log(`[candidate-enrichment] attempt failed (${why}) — ${candidateId}`);
      await ctx.runMutation(internal.knowledge.candidates.bumpAttempts, {
        candidateId,
      });
      counts.attemptsBumped++;
    };

    const resolve = async (
      cand: Doc<"entityCandidates">,
      toType: "company" | "contact",
      toId: string,
      via: string,
    ) => {
      const result = await ctx.runMutation(
        internal.knowledge.atomsCore.repointCandidateAtoms,
        { candidateId: cand._id, toType, toId },
      );
      console.log(
        `[candidate-enrichment] RESOLVED "${cand.mentionText}" (${cand.guessedType}) → ${toType}:${toId} via ${via}; ` +
          `atoms repointed=${result.repointed} merged=${result.merged} contested=${result.contested}`,
      );
      if (toType === "company") counts.resolvedCompanies++;
      else counts.resolvedPersons++;
    };

    for (const cand of pending) {
      try {
        if (cand.guessedType === "company") {
          // ── Company path: CH name search, high-confidence matches only ──
          const search: any = await ctx.runAction(
            internal.companiesHouse.searchCompaniesHouseInternal,
            { query: cand.mentionText, limit: 20 },
          );
          if (!search?.ok) {
            await bump(cand._id, `ch_search_not_ok:${search?.reason ?? "unknown"}`);
            continue;
          }
          const results: any[] = search.results ?? [];
          const mentionNorm = normalizeMention(cand.mentionText);
          const exact = results.filter(
            (r) => normalizeMention(r.title ?? "") === mentionNorm,
          );
          let match: any = null;
          if (exact.length === 1) {
            match = exact[0];
          } else if (exact.length > 1) {
            // Exact-name ties happen when dissolved companies shared the
            // name; a single ACTIVE exact match is still high-confidence.
            const active = exact.filter((r) => r.company_status === "active");
            if (active.length === 1) match = active[0];
          } else if (
            results.length === 1 &&
            normalizeMention(results[0].title ?? "").includes(mentionNorm)
          ) {
            // Single result whose normalized name CONTAINS the full mention
            // (e.g. mention "Willersey SPV" → sole hit "Land at Willersey
            // SPV Ltd" fails; sole hit "Willersey SPV Limited" passes via
            // the exact branch after suffix-stripping-free normalize —
            // this branch covers the mention-as-substring case).
            match = results[0];
          }
          if (!match?.company_number) {
            await bump(
              cand._id,
              exact.length > 1 ? "ch_ambiguous" : "ch_no_confident_match",
            );
            continue;
          }
          // Sync via the existing machinery: profile + charges + officers + PSCs.
          const sync: any = await ctx.runAction(
            internal.companiesHouse.syncOneCompanyFromCHInternal,
            { companyNumber: match.company_number },
          );
          if (!sync?.ok) {
            await bump(cand._id, `ch_sync_failed:${sync?.reason ?? "unknown"}`);
            continue;
          }
          const row = await ctx.runQuery(
            internal.knowledge.candidates.getCompanyByNumber,
            { companyNumber: match.company_number },
          );
          if (!row) {
            // Sync said ok but the row isn't readable — infra-flavoured; retry
            // next tick without burning an attempt.
            console.error(
              `[candidate-enrichment] synced ${match.company_number} but no companiesHouseCompanies row found`,
            );
            counts.infraErrors++;
            continue;
          }
          await resolve(cand, "company", String(row._id), `CH exact match ${match.company_number}`);
        } else {
          // ── Person path: contacts first, Apollo second — conservative ──
          const { clientId } = parseScopeHint(cand.contextSnippet);
          if (clientId) {
            const contact = await ctx.runQuery(
              internal.knowledge.candidates.findContactByNameForClient,
              { name: cand.mentionText, clientId: clientId as Id<"clients"> },
            );
            if (contact) {
              await resolve(cand, "contact", String(contact._id), "existing contact (name match)");
              continue;
            }
          }
          // Apollo needs first+last AND a company context to match with any
          // confidence. Without a client scope hint we stay conservative:
          // record a failed attempt rather than accept a name-only match.
          const parts = cand.mentionText.trim().split(/\s+/);
          if (parts.length < 2 || !clientId) {
            await bump(
              cand._id,
              parts.length < 2 ? "person_single_token_name" : "person_no_scope_hint",
            );
            continue;
          }
          const client = await ctx.runQuery(
            internal.knowledge.candidates.getClientMeta,
            { clientId: clientId as Id<"clients"> },
          );
          const companyName = client?.companyName ?? client?.name ?? undefined;
          if (!companyName) {
            await bump(cand._id, "person_scope_client_missing");
            continue;
          }
          const apollo: any = await ctx.runAction(
            internal.apollo.findPersonInternal,
            {
              firstName: parts[0],
              lastName: parts.slice(1).join(" "),
              companyName,
            },
          );
          if (apollo?.ok === false) {
            if (
              APOLLO_INFRA_ERRORS.has(apollo.error) ||
              String(apollo.error ?? "").startsWith("apollo_http_")
            ) {
              console.error(
                `[candidate-enrichment] Apollo infra error for "${cand.mentionText}": ${apollo.error}`,
              );
              counts.infraErrors++; // no attempt burned
            } else {
              await bump(cand._id, `apollo_error:${apollo.error}`);
            }
            continue;
          }
          // Accept only a found person WITH an email — the concrete identity
          // anchor. found-without-email is too weak to mint a contact from.
          if (!apollo?.found || !apollo.email) {
            await bump(cand._id, apollo?.found ? "apollo_no_email" : "apollo_no_match");
            continue;
          }
          const contactId = await ctx.runMutation(api.contacts.create, {
            name: cand.mentionText.trim(),
            role: apollo.title,
            email: apollo.email,
            emailStatus: apollo.emailStatus,
            emailSource: "apollo",
            linkedinUrl: apollo.linkedinUrl,
            clientId: clientId as Id<"clients">,
            sourceDocumentId: cand.sourceDocumentId,
          });
          await resolve(
            cand,
            "contact",
            String(contactId),
            `Apollo match (${apollo.emailStatus ?? "unverified"} email)`,
          );
        }
      } catch (e: any) {
        // Thrown errors are infra (CH key missing, network) — log loudly,
        // never burn an attempt, move on to the next candidate.
        console.error(
          `[candidate-enrichment] error on "${cand.mentionText}" (${cand._id}): ${e?.message ?? e}`,
        );
        counts.infraErrors++;
      }
    }

    console.log(
      `[candidate-enrichment] sweep done: scanned=${counts.scanned} ` +
        `resolvedCompanies=${counts.resolvedCompanies} resolvedPersons=${counts.resolvedPersons} ` +
        `attemptsBumped=${counts.attemptsBumped} infraErrors=${counts.infraErrors}`,
    );
    return counts;
  },
});
