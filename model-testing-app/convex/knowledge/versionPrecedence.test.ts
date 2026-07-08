import { describe, it, expect } from "vitest";
import {
  parseSeriesKey,
  sameSeriesAndOrder,
  versionPrecedenceWinner,
  type SeriesDoc,
} from "./versionPrecedence";
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

/** FakeDoc → SeriesDoc for the pure-function tests (string ids stand in for
 * the branded Convex Id types, same as the ctx stub below). */
function series(doc: FakeDoc): SeriesDoc {
  return doc as unknown as SeriesDoc;
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

// ── V1.2 naming standard: dual-date document-date preference + R-token
// reissue ordering (RockCap_FileNamingStandard_RC_INTERNAL_V1.2_20260708
// §5/§9). Regression coverage that the standard's own rationale holds: a
// 2024 planning permission RECEIVED after a 2026 one must NOT look newer.

describe("parseSeriesKey — V1.2 dual-date and reissue shapes", () => {
  it("keys a dual-date name on the DOCUMENT date, keeping the filing date as tie-break", () => {
    const key = parseSeriesKey(
      "LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260608.pdf",
    );
    expect(key.dateToken).toBe("20240115");
    expect(key.filingDateToken).toBe("20260608");
    // Stem tokenization splits sub-parts on '-' and drops the 1-4-cap "WSD"
    // via the existing initials filter — both dates gone, series-stable.
    expect(key.stem).toBe("lintonlane planningpermission client");
  });

  it("gives two vintages of one dual-date series the SAME stem", () => {
    const a = parseSeriesKey(
      "LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260701.pdf",
    );
    const b = parseSeriesKey(
      "LintonLane_PlanningPermission_20260110_CLIENT-WSD_20260601.pdf",
    );
    expect(a.stem).toBe(b.stem);
    expect(a.stem).not.toBe("");
  });

  it("extracts the R-token as reissueToken and drops it from the stem", () => {
    const first = parseSeriesKey("LintonLane_Terms_LENDER-Avamore_20260612.pdf");
    const reissued = parseSeriesKey(
      "LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf",
    );
    expect(reissued.reissueToken).toBe(2);
    expect(first.reissueToken).toBeUndefined();
    expect(reissued.stem).toBe(first.stem);
  });

  it("leaves legacy single-date names untouched (no filingDateToken/reissueToken)", () => {
    const key = parseSeriesKey(
      "DarkMills_CreditChecklist_RS_INTERNAL_V1.0_20260707.pdf",
    );
    expect(key.dateToken).toBe("20260707");
    expect(key.filingDateToken).toBeUndefined();
    expect(key.reissueToken).toBeUndefined();
  });

  it("does NOT treat an R-token in a freetext space name as a reissue", () => {
    // "R2" here is a block label — stems must stay distinct.
    const r1 = parseSeriesKey("Dark Mills Block R1 Appraisal 20260101.pdf");
    const r2 = parseSeriesKey("Dark Mills Block R2 Appraisal 20260101.pdf");
    expect(r1.reissueToken).toBeUndefined();
    expect(r2.reissueToken).toBeUndefined();
    // Note: bare 1-4-cap tokens are dropped from stems by the existing
    // initials filter, so the residual over-merge caveat documented on
    // parseSeriesKey applies here — but they are never reissue ORDERING.
  });
});

describe("sameSeriesAndOrder — V1.2 ordering", () => {
  it("orders dual-date names by DOCUMENT date even when filing order disagrees", () => {
    // Old 2024 vintage RECEIVED LATER (filed 2026-07-01) vs new 2026 vintage
    // received earlier (filed 2026-06-01). Filing-date ordering would call
    // the old one newer — the standard's §5 trap.
    const oldVintageFiledLater = makeDoc(
      "a",
      "LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260701.pdf",
    );
    const newVintageFiledEarlier = makeDoc(
      "b",
      "LintonLane_PlanningPermission_20260110_CLIENT-WSD_20260601.pdf",
    );
    expect(
      sameSeriesAndOrder(series(oldVintageFiledLater), series(newVintageFiledEarlier)),
    ).toBe("b_newer");
  });

  it("breaks an equal-vintage tie on the filing date", () => {
    const filedEarlier = makeDoc(
      "a",
      "LintonLane_Valuation_20260620_VALUER-Savills_20260622.pdf",
    );
    const filedLater = makeDoc(
      "b",
      "LintonLane_Valuation_20260620_VALUER-Savills_20260625.pdf",
    );
    expect(sameSeriesAndOrder(series(filedEarlier), series(filedLater))).toBe("b_newer");
  });

  it("orders same-date terms reissues by R-token (R2 > unnumbered first issue)", () => {
    const firstIssue = makeDoc(
      "a",
      "LintonLane_Terms_LENDER-Avamore_20260612.pdf",
    );
    const reissue = makeDoc(
      "b",
      "LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf",
    );
    expect(sameSeriesAndOrder(series(firstIssue), series(reissue))).toBe("b_newer");
    expect(sameSeriesAndOrder(series(reissue), series(firstIssue))).toBe("a_newer");
  });

  it("orders R3 above R2", () => {
    const r2 = makeDoc("a", "LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf");
    const r3 = makeDoc("b", "LintonLane_Terms_LENDER-Avamore_R3_20260612.pdf");
    expect(sameSeriesAndOrder(series(r2), series(r3))).toBe("b_newer");
  });
});

describe("versionPrecedenceWinner — V1.2 dual-date regression", () => {
  it("returns 'incumbent' for a backfilled OLD vintage received after a newer one", async () => {
    const incomingOldVintage = makeDoc(
      "new",
      "LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260701.pdf",
    );
    const incumbentNewVintage = makeDoc(
      "inc",
      "LintonLane_PlanningPermission_20260110_CLIENT-WSD_20260601.pdf",
    );
    const ctx = ctxWith([incomingOldVintage, incumbentNewVintage]);
    expect(await versionPrecedenceWinner(ctx, NEW, [obs("inc")])).toBe(
      "incumbent",
    );
  });

  it("returns 'new' for a terms reissue over the unnumbered first issue", async () => {
    const incomingReissue = makeDoc(
      "new",
      "LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf",
    );
    const incumbentFirstIssue = makeDoc(
      "inc",
      "LintonLane_Terms_LENDER-Avamore_20260612.pdf",
    );
    const ctx = ctxWith([incomingReissue, incumbentFirstIssue]);
    expect(await versionPrecedenceWinner(ctx, NEW, [obs("inc")])).toBe("new");
  });
});
