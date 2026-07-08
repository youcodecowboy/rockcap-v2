import { describe, it, expect } from "vitest";
import { versionPrecedenceWinner } from "./versionPrecedence";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Regression coverage for the order-dependent early return in
// versionPrecedenceWinner (adversarial-review finding). The write path must
// only auto-resolve on version precedence when EVERY document backing the
// incumbent shares the incoming doc's series; a mixed-series incumbent — which
// corroboration legitimately produces — must abstain (return null) regardless
// of the order the incumbent's backing observations were inserted.

type FakeDoc = {
  _id: string;
  _creationTime: number;
  fileName: string;
  fileTypeDetected?: string;
  clientId?: string;
  projectId?: string;
};

function makeDoc(
  id: string,
  fileName: string,
  over: Partial<FakeDoc> = {},
): FakeDoc {
  return {
    _id: id,
    _creationTime: over._creationTime ?? 1_000,
    fileName,
    fileTypeDetected: over.fileTypeDetected ?? "valuation",
    clientId: over.clientId,
    projectId: "projectId" in over ? over.projectId : "p1",
  };
}

/** MutationCtx stub exposing only db.get — the sole ctx surface the function
 * touches. Docs are looked up from an in-memory map. */
function ctxWith(docs: FakeDoc[]): MutationCtx {
  const byId = new Map(docs.map((d) => [d._id, d]));
  return {
    db: {
      get: async (id: string) => (byId.get(id) ?? null) as never,
    },
  } as unknown as MutationCtx;
}

function obs(id: string) {
  return { sourceType: "document" as const, documentId: id as Id<"documents"> };
}

const NEW = obs("new");

describe("versionPrecedenceWinner", () => {
  // "Valuation" series on project p1: V1.0 (older) → V2.0 (newer). Cross-series
  // doc is a different fileType so isSameSeries fails.
  const incomingOld = makeDoc("new", "Valuation V1.0 20240101.pdf");
  const sameSeriesNewer = makeDoc("inc-new", "Valuation V2.0 20240601.pdf");
  const crossSeries = makeDoc("inc-x", "Appraisal 20240601.pdf", {
    fileTypeDetected: "appraisal",
  });

  it("abstains on a MIXED-series incumbent regardless of observation order", async () => {
    const ctx = ctxWith([incomingOld, sameSeriesNewer, crossSeries]);

    // [same-series-newer, cross-series] — the order that used to short-circuit
    // to "incumbent" before the cross-series backer was ever checked.
    const forward = await versionPrecedenceWinner(ctx, NEW, [
      obs("inc-new"),
      obs("inc-x"),
    ]);
    // [cross-series, same-series-newer] — the order that already returned null.
    const reverse = await versionPrecedenceWinner(ctx, NEW, [
      obs("inc-x"),
      obs("inc-new"),
    ]);

    expect(forward).toBeNull();
    expect(reverse).toBeNull();
    expect(forward).toBe(reverse);
  });

  it("returns 'new' when the incoming doc is a newer version of the whole same-series set", async () => {
    const incomingNewer = makeDoc("new", "Valuation V2.0 20240601.pdf");
    const older = makeDoc("inc-old", "Valuation V1.0 20240101.pdf");
    const ctx = ctxWith([incomingNewer, older]);
    expect(await versionPrecedenceWinner(ctx, NEW, [obs("inc-old")])).toBe("new");
  });

  it("returns 'incumbent' when the incoming doc is a backfilled older version", async () => {
    const ctx = ctxWith([incomingOld, sameSeriesNewer]);
    expect(
      await versionPrecedenceWinner(ctx, NEW, [obs("inc-new")]),
    ).toBe("incumbent");
  });

  it("abstains on a pure cross-series conflict", async () => {
    const ctx = ctxWith([incomingOld, crossSeries]);
    expect(await versionPrecedenceWinner(ctx, NEW, [obs("inc-x")])).toBeNull();
  });

  it("abstains on an unorderable same-series tie", async () => {
    const twin = makeDoc("inc-twin", "Valuation V1.0 20240101.pdf");
    const ctx = ctxWith([incomingOld, twin]);
    expect(await versionPrecedenceWinner(ctx, NEW, [obs("inc-twin")])).toBeNull();
  });

  it("abstains on any non-document incumbent observation", async () => {
    const ctx = ctxWith([incomingOld, sameSeriesNewer]);
    const result = await versionPrecedenceWinner(ctx, NEW, [
      obs("inc-new"),
      { sourceType: "companies_house" as never, documentId: undefined },
    ]);
    expect(result).toBeNull();
  });
});
