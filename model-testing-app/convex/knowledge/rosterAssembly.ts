import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

// Roster assembled from the operational tables (Spec 2 §4): the client, its
// projects + contacts, and ALL lenders (global, high-value). Mentions in the
// atomized text resolve against these ids. Shared by every non-document
// atomization lane (notes, meetings, emails); atomizerLane.sweep keeps its
// own inline copy (document lane, pre-dating this helper).
export async function assembleRoster(ctx: ActionCtx, clientId: Id<"clients">) {
  const [client, projects, contacts, lenders] = await Promise.all([
    ctx.runQuery(api.clients.get, { id: clientId }),
    ctx.runQuery(api.projects.getByClient, { clientId }),
    ctx.runQuery(api.contacts.getByClient, { clientId }),
    ctx.runQuery(api.appetiteSignals.listLenders, { limit: 200 }),
  ]);
  return {
    client: client
      ? {
          id: (client as any)._id,
          name: (client as any).name ?? null,
          companyName: (client as any).companyName ?? null,
          companiesHouseNumber: (client as any).companiesHouseNumber ?? null,
        }
      : null,
    projects: (projects as any[]).map((p) => ({
      id: p._id,
      name: p.name ?? null,
      shortcode: p.projectShortcode ?? null,
    })),
    contacts: (contacts as any[]).map((c) => ({
      id: c._id,
      name: c.name ?? null,
      role: c.role ?? null,
      email: c.email ?? null,
    })),
    lenders: (lenders as any[]).map((l) => ({
      id: l._id,
      name: l.name ?? l.companyName ?? null,
    })),
  };
}

/** POST the atomize payload to the Next route with the shared cron secret. */
export async function callAtomizeRoute(payload: unknown): Promise<any[]> {
  const apiBase = process.env.NEXT_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!apiBase || !secret) {
    throw new Error(
      "NEXT_APP_URL / CRON_SECRET not configured on the Convex deployment",
    );
  }
  const normalized = apiBase.match(/^https?:\/\//)
    ? apiBase
    : `https://${apiBase}`;
  const resp = await fetch(
    `${normalized.replace(/\/$/, "")}/api/knowledge/atomize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": secret,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`atomize route ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await resp.json().catch(() => null);
  if (!json?.ok) {
    throw new Error(
      `atomize route error: ${String(json?.error ?? "unknown").slice(0, 300)}`,
    );
  }
  return Array.isArray(json.candidates) ? json.candidates : [];
}
