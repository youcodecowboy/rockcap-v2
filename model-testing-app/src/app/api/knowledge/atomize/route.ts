// =============================================================================
// KNOWLEDGE ATOMIZER ROUTE (Next.js App Router) — Spec 2 §11 API lane
// =============================================================================
// POST /api/knowledge/atomize
//
// Stateless atomization worker for the incremental (API) lane. Convex's
// knowledge-atomize-sweep cron selects a changed document, assembles the
// roster (§4) from the operational tables, and POSTs {documentId,
// contentChecksum, textContent?, meta} here with the shared cron secret.
//
// This route runs ONE Anthropic call (Sonnet-class, spec §11) applying the
// §6.1 extraction instruction block against the document text + roster, and
// returns candidate atoms as JSON. It deliberately does NOT write to Convex:
// persistence happens in the internal mutation knowledge.atomsCore.
// reatomizeDiff (a Next route cannot call internal mutations), which runs the
// same three persistence gates the harness lane hits. Mirrors
// /api/drive/ingest (cron-secret gate + maxDuration + Anthropic instantiation).

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Sonnet-class default per spec §11 (atomization is a judgment task). Current
// Sonnet model id (verified via the claude-api skill 2026-07-06).
const ATOMIZER_MODEL = 'claude-sonnet-5';
const MAX_TEXT_CHARS = 50_000; // v4 textContent cap (spec §11 input)

// ── The §6.1 extraction instruction block (copied VERBATIM from the spec) ──
// Kept byte-identical with skills/skills/atomize-document/SKILL.md so both
// lanes extract to the same standard.
const EXTRACTION_BLOCK = `Extract atomic facts from this document. An atomic fact is ONE self-contained sentence that would remain true and meaningful if read with no surrounding context, attached to ONE subject entity from the roster above (or a new person/company you can identify precisely).

EXTRACT a fact only if ALL three hold:
1. Anchored — it is about a specific rostered or precisely-identifiable entity. Never about "the market," "the borrower generally," or an unnamed party.
2. Discriminating — it would help distinguish this entity from a typical UK property-finance peer. If the statement would be true of most developers, most lenders, or most schemes, do not extract it.
3. Material — it is an amount, term, party/role, date/milestone, obligation, security interest, ownership/control fact, status change, or stated appetite/preference.

EXTRACT (examples):
- "Hampshire Trust Bank provides a £3.2M senior facility to Bayfield Homes (Wellington) Ltd at SONIA + 4.25%, maturing 2027-09-30." (facility letter)
- "The Wellington Road scheme has a GDV of £4.2M across 6 units." (appraisal)
- "James Carter is a director of both Bayfield Homes Ltd and Marlow Property Group Ltd." (KYC — cross-entity control fact)
- "Planning consent 23/01847/FUL for 6 dwellings was granted by Test Valley BC on 2026-03-14 subject to a s106 contribution of £48,000." (planning)
- "Bayfield Homes (Wellington) Ltd granted a debenture and first legal charge over the Wellington Road site to Hampshire Trust Bank on 2026-04-02." (security)
- "The facility includes a personal guarantee from James Carter capped at £500,000." (obligation)

DO NOT EXTRACT (examples):
- "Bayfield Homes is a UK-based property developer." (true of nearly every client — fails discrimination)
- "The property market has experienced volatility in recent months." (unanchored commentary)
- "The valuation was prepared in accordance with RICS Red Book standards." (boilerplate)
- "The borrower must comply with all applicable laws." (standard clause, no deviation)
- "The scheme is subject to obtaining planning permission." (generic; extract only the specific application, decision, or condition)
- "The directors are experienced in residential development." (marketing prose)

When a number appears in multiple places with different values, extract each with its exact source location — do not reconcile them yourself.`;

// Authority tiers — MUST match convex/knowledge/atomsCore.ts AUTHORITY_TIERS
// (executed_legal 5 > facility_letter 4 > valuation 3 > internal_brief 2 >
// email 1). The persistence layer resolves cross-document conflicts on this
// scale, so the atomizer must stamp observations consistently with it.
const AUTHORITY_TIER_GUIDANCE = `Set observation.authorityTier by document type, matching this scale exactly:
- 5 — executed legal documents (debentures, executed legal charges, deeds)
- 4 — facility letters / term sheets / loan agreements
- 3 — valuations / appraisals
- 2 — internal briefs / memos
- 1 — emails and everything else`;

const OUTPUT_INSTRUCTIONS = `Return ONLY a JSON object of the form {"candidates": [ ... ]} — no prose, no markdown fences. Each candidate is:
{
  "statement": string,                       // the one self-contained sentence
  "subjectType": "client"|"project"|"contact"|"company"|"facility",
  "subjectId": string,                       // a Convex id FROM THE ROSTER
  "predicate": string,                       // FROM THE VOCABULARY below
  // exactly ONE of the next two:
  "objectEntityType": "client"|"project"|"contact"|"company"|"facility",  // edge only
  "objectEntityId": string,                  // edge: another ROSTER id
  "objectLiteral": { "value": any, "valueType": "currency"|"number"|"percentage"|"date"|"string"|"range", "currency"?: string, "unit"?: string },  // attribute only
  "qualifier"?: string,                      // e.g. "Senior" / "Mezzanine"
  "clientId"?: string,                       // owning client scope (roster client id)
  "projectId"?: string,                      // owning project scope
  "asOf"?: string,                           // ISO date the fact was true in the world
  "confidence": number,                      // 0..1
  "observation": {
    "sourceType": "document",
    "authorityTier": number,                 // per the tier scale above
    "locator"?: { "page"?: number, "sheet"?: string, "row"?: number, "section"?: string },
    "sourceText"?: string                    // verbatim snippet — the audit anchor
  }
}

Rules:
- subjectId / objectEntityId MUST be ids that appear in the roster. If you cannot resolve a mention to a roster id, DROP the fact (the incremental lane does not mint provisional entities).
- Use an edge predicate with objectEntityId, or an attribute predicate with objectLiteral — never both.
- Canonicalize values: ISO dates (YYYY-MM-DD), raw numbers for amounts/rates (no currency symbols in value; put the code in objectLiteral.currency).
- Always include observation.sourceText (a short verbatim snippet) and a locator when the position is knowable.
- If no facts pass all three gates, return {"candidates": []}.`;

// Legal predicates the atomizer may use (store atom/both only — native
// predicates like officer_of / funds_project(native side) are rejected at the
// persistence gate). Kept in sync with convex/knowledge/vocabulary.ts.
const VOCABULARY = `Edge predicates: lends_to (lender→company), holds_charge_over (chargeholder→company), guarantees (person/company→facility), granted_security_over (company→asset/scheme), refinanced_by (project/facility→lender), advises (person/firm→client/project, capacity qualifier), introduced (person→client/deal), formerly_at (person→company), parent_of (company→company), renamed_from (company→prior name), owns_site (company→scheme/address), acquired_site_from (company→company), funds_project (lender→project, tranche qualifier).
Attribute predicates: has_gdv, has_loan_amount, has_interest_rate, matures_on, has_unit_count, has_registration_number, has_registered_office, planning_status, has_valuation, has_construction_cost, has_construction_programme, has_price_psf.
Do NOT invent predicates. If a fact fits none of these, drop it.`;

function rosterToText(roster: any): string {
  if (!roster) return '(no roster provided)';
  const lines: string[] = [];
  if (roster.client) {
    lines.push(
      `CLIENT (subjectType "client"): id=${roster.client.id} name="${roster.client.name ?? ''}"` +
        (roster.client.companiesHouseNumber
          ? ` CH=${roster.client.companiesHouseNumber}`
          : ''),
    );
  }
  if (Array.isArray(roster.projects) && roster.projects.length) {
    lines.push('PROJECTS (subjectType "project"):');
    for (const p of roster.projects) {
      lines.push(
        `  id=${p.id} name="${p.name ?? ''}"${p.shortcode ? ` shortcode=${p.shortcode}` : ''}`,
      );
    }
  }
  if (Array.isArray(roster.contacts) && roster.contacts.length) {
    lines.push('CONTACTS (subjectType "contact"):');
    for (const c of roster.contacts) {
      lines.push(
        `  id=${c.id} name="${c.name ?? ''}"${c.role ? ` role=${c.role}` : ''}${c.email ? ` email=${c.email}` : ''}`,
      );
    }
  }
  if (Array.isArray(roster.lenders) && roster.lenders.length) {
    lines.push('LENDERS (global — subjectType "client"):');
    for (const l of roster.lenders) {
      lines.push(`  id=${l.id} name="${l.name ?? ''}"`);
    }
  }
  return lines.join('\n');
}

const ENTITY_TYPES = new Set([
  'client',
  'project',
  'contact',
  'company',
  'facility',
  'candidate',
]);
const VALUE_TYPES = new Set([
  'currency',
  'number',
  'percentage',
  'date',
  'string',
  'range',
]);

// Structural sanitizer. reatomizeDiff's Convex arg validator hard-throws on a
// malformed candidate (which would lose the whole document's batch), so we
// drop structurally-invalid candidates here and normalize the observation.
// Semantic checks (unresolved subject/object, unknown predicate, edge-vs-
// literal) still run per-candidate server-side and surface as soft rejects.
function sanitizeCandidates(raw: any[]): any[] {
  const out: any[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    if (typeof c.statement !== 'string' || !c.statement.trim()) continue;
    if (!ENTITY_TYPES.has(c.subjectType)) continue;
    if (typeof c.subjectId !== 'string' || !c.subjectId) continue;
    if (typeof c.predicate !== 'string' || !c.predicate) continue;
    if (typeof c.confidence !== 'number' || !Number.isFinite(c.confidence)) {
      continue;
    }
    const obs = c.observation;
    if (!obs || typeof obs !== 'object') continue;

    const clean: any = {
      statement: c.statement,
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      predicate: c.predicate,
      confidence: Math.max(0, Math.min(1, c.confidence)),
      observation: {
        sourceType: 'document', // reatomizeDiff overrides anyway; keep valid
        authorityTier:
          typeof obs.authorityTier === 'number' &&
          Number.isFinite(obs.authorityTier)
            ? obs.authorityTier
            : 1,
      },
    };
    if (obs.sourceText && typeof obs.sourceText === 'string') {
      clean.observation.sourceText = obs.sourceText;
    }
    if (obs.locator && typeof obs.locator === 'object') {
      clean.observation.locator = obs.locator;
    }
    if (typeof c.qualifier === 'string') clean.qualifier = c.qualifier;
    if (typeof c.clientId === 'string') clean.clientId = c.clientId;
    if (typeof c.projectId === 'string') clean.projectId = c.projectId;
    if (typeof c.asOf === 'string') clean.asOf = c.asOf;

    // Exactly one of edge / literal — keep whichever is well-formed.
    if (ENTITY_TYPES.has(c.objectEntityType) && typeof c.objectEntityId === 'string') {
      clean.objectEntityType = c.objectEntityType;
      clean.objectEntityId = c.objectEntityId;
    } else if (
      c.objectLiteral &&
      typeof c.objectLiteral === 'object' &&
      VALUE_TYPES.has(c.objectLiteral.valueType) &&
      c.objectLiteral.value !== undefined
    ) {
      const lit: any = {
        value: c.objectLiteral.value,
        valueType: c.objectLiteral.valueType,
      };
      if (typeof c.objectLiteral.currency === 'string') {
        lit.currency = c.objectLiteral.currency;
      }
      if (typeof c.objectLiteral.unit === 'string') {
        lit.unit = c.objectLiteral.unit;
      }
      clean.objectLiteral = lit;
    } else {
      // Neither well-formed → the engine would reject it anyway; drop early.
      continue;
    }
    out.push(clean);
  }
  return out;
}

function extractJson(text: string): { candidates: any[] } | null {
  // Tolerate stray prose / code fences around the JSON object.
  const fenceStripped = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = fenceStripped.indexOf('{');
  const end = fenceStripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(fenceStripped.slice(start, end + 1));
    if (parsed && Array.isArray(parsed.candidates)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Shared-secret gate — identical pattern to /api/drive/ingest. Cron-only.
    const cronSecret = request.headers.get('x-cron-secret');
    const isAuthorisedCron =
      !!cronSecret &&
      !!process.env.CRON_SECRET &&
      cronSecret === process.env.CRON_SECRET;
    if (!isAuthorisedCron) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      documentId?: string;
      noteId?: string; // note lane (knowledge/noteAtomizer) — same extraction, note-anchored persistence
      contentChecksum?: string;
      textContent?: string | null;
      meta?: any;
    } | null;
    const { documentId, noteId, contentChecksum, textContent, meta } = body ?? {};
    const sourceId = documentId ?? noteId;
    if (!sourceId || !contentChecksum) {
      return NextResponse.json(
        { ok: false, error: 'documentId (or noteId) and contentChecksum are required' },
        { status: 400 },
      );
    }

    const text = (textContent ?? '').slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) {
      // Nothing to atomize (e.g. fact-dense spreadsheet with no parsed text).
      return NextResponse.json({ ok: true, isMock: false, candidates: [] });
    }

    const rosterText = rosterToText(meta?.roster);
    const system =
      `You are the RockCap knowledge atomizer. You read a single document and emit atomic facts as candidate atoms, resolved against a roster of known entities.\n\n` +
      `ROSTER (resolve every mention to one of these ids):\n${rosterText}\n\n` +
      `${EXTRACTION_BLOCK}\n\n${AUTHORITY_TIER_GUIDANCE}\n\nVOCABULARY:\n${VOCABULARY}\n\n${OUTPUT_INSTRUCTIONS}`;

    const docHeader =
      `Document: ${meta?.fileName ?? '(unnamed)'}` +
      (meta?.category ? ` | category: ${meta.category}` : '') +
      (meta?.fileTypeDetected ? ` | type: ${meta.fileTypeDetected}` : '');

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!anthropicApiKey) {
      // Mock mode — mirror /api/drive/ingest's mock behaviour. No atoms.
      console.log(
        `[knowledge-atomize] MOCK (no ANTHROPIC_API_KEY) for ${sourceId}`,
      );
      return NextResponse.json({ ok: true, isMock: true, candidates: [] });
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: ATOMIZER_MODEL,
      max_tokens: 8000,
      // Disabled thinking keeps the incremental pass cheap; extraction is a
      // grounded, non-open-ended task. (Sonnet 5 accepts an explicit disable.)
      thinking: { type: 'disabled' },
      system,
      messages: [
        {
          role: 'user',
          content: `${docHeader}\n\n----- DOCUMENT TEXT -----\n${text}`,
        },
      ],
    } as any);

    const outText = ((response as any).content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const parsed = extractJson(outText);
    if (!parsed) {
      console.warn(
        `[knowledge-atomize] ${sourceId}: model output did not parse as candidate JSON`,
      );
      return NextResponse.json({ ok: true, isMock: false, candidates: [] });
    }

    const candidates = sanitizeCandidates(parsed.candidates);
    console.log(
      `[knowledge-atomize] ${sourceId} (checksum ${contentChecksum.slice(0, 8)}): ` +
        `${parsed.candidates.length} raw → ${candidates.length} well-formed candidates`,
    );
    return NextResponse.json({ ok: true, isMock: false, candidates });
  } catch (error) {
    console.error('[knowledge-atomize] failed:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'atomization failed' },
      { status: 500 },
    );
  }
}
