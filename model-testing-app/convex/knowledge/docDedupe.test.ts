import { describe, it, expect } from "vitest";
import {
  classificationRichness,
  dedupeGroupKey,
  observationIdentityKey,
  partitionByFileSize,
  selectCanonical,
  type CanonicalInput,
} from "./docDedupe";

// Pure-part coverage for the duplicate-document consolidation pass: the
// grouping key (content identity, never across clients), the fileSize gate,
// and the canonical-selection ordering (Drive mirror > classification
// richness > earliest _creationTime).

const baseDigest = {
  clientId: "client1" as string | null,
  scope: null as string | null,
  ownerId: null as string | null,
  textChecksum: "text-fnv1a:deadbeef:1042" as string | null,
  fileStorageId: null as string | null,
  fileName: "LintonLane_LenderBrief_RC_INTERNAL_V1.3_20260608.docx",
};

describe("dedupeGroupKey", () => {
  it("groups text-bearing docs by client scope + text checksum", () => {
    const a = dedupeGroupKey({ ...baseDigest });
    const b = dedupeGroupKey({ ...baseDigest, fileStorageId: "st2" });
    expect(a).toBe(
      "text|client1|lintonlane lenderbrief rc internal v1.3 20260608|text-fnv1a:deadbeef:1042",
    );
    // Differing fileStorageId does NOT split a text group (dupes routinely
    // carry distinct storage ids for the same bytes).
    expect(b).toBe(a);
  });

  it("never produces the same key for different clientIds", () => {
    const a = dedupeGroupKey({ ...baseDigest, clientId: "client1" });
    const b = dedupeGroupKey({ ...baseDigest, clientId: "client2" });
    expect(a).not.toBe(b);
  });

  it("separates a client-scoped doc from an unscoped doc with identical text", () => {
    const scoped = dedupeGroupKey({ ...baseDigest });
    const unscoped = dedupeGroupKey({ ...baseDigest, clientId: null });
    expect(scoped).not.toBe(unscoped);
  });

  it("keys personal-scope docs per owner", () => {
    const u1 = dedupeGroupKey({
      ...baseDigest,
      clientId: null,
      scope: "personal",
      ownerId: "user1",
    });
    const u2 = dedupeGroupKey({
      ...baseDigest,
      clientId: null,
      scope: "personal",
      ownerId: "user2",
    });
    expect(u1).not.toBe(u2);
  });

  it("empty-text docs group ONLY on an exactly shared fileStorageId", () => {
    const noTextNoStorage = dedupeGroupKey({
      ...baseDigest,
      textChecksum: null,
    });
    expect(noTextNoStorage).toBeNull();

    const s1 = dedupeGroupKey({
      ...baseDigest,
      textChecksum: null,
      fileStorageId: "storageA",
    });
    const s2 = dedupeGroupKey({
      ...baseDigest,
      textChecksum: null,
      fileStorageId: "storageA",
    });
    const s3 = dedupeGroupKey({
      ...baseDigest,
      textChecksum: null,
      fileStorageId: "storageB",
    });
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
    expect(s1).toMatch(/^storage\|/);
  });

  it("a storage-keyed doc never collides with a text-keyed doc", () => {
    const text = dedupeGroupKey({ ...baseDigest, textChecksum: "x" });
    const storage = dedupeGroupKey({
      ...baseDigest,
      textChecksum: null,
      fileStorageId: "x",
    });
    expect(text).not.toBe(storage);
  });
});

describe("partitionByFileSize", () => {
  const m = (id: string, fileSize: number | null) => ({ id, fileSize });

  it("splits a text group whose members disagree on fileSize", () => {
    const parts = partitionByFileSize([m("a", 100), m("b", 100), m("c", 250)]);
    expect(parts.map((p) => p.map((x) => x.id).sort())).toEqual(
      expect.arrayContaining([["a", "b"], ["c"]]),
    );
    expect(parts).toHaveLength(2);
  });

  it("keeps a same-size group whole", () => {
    const parts = partitionByFileSize([m("a", 100), m("b", 100)]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
  });

  it("attaches unsized members when exactly one positive size exists", () => {
    const parts = partitionByFileSize([m("a", 100), m("b", 0), m("c", null)]);
    expect(parts).toHaveLength(1);
    expect(parts[0].map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps unsized members apart when sizes are ambiguous", () => {
    const parts = partitionByFileSize([m("a", 100), m("b", 200), m("c", 0)]);
    expect(parts).toHaveLength(3);
    const unsized = parts.find((p) => p.some((x) => x.id === "c"))!;
    expect(unsized.map((x) => x.id)).toEqual(["c"]);
  });
});

describe("classificationRichness", () => {
  const bare = {
    fileTypeDetected: null as string | null,
    category: null as string | null,
    hasDocumentAnalysis: false,
    hasExtractedIntelligence: false,
    hasDocumentCode: false,
    summaryLength: 0,
  };

  it("scores an unclassified stub at zero", () => {
    expect(classificationRichness(bare)).toBe(0);
    expect(
      classificationRichness({
        ...bare,
        fileTypeDetected: "Unclassified",
        category: "Unclassified",
      }),
    ).toBe(0);
  });

  it("a detected fileType beats the cosmetic extras combined", () => {
    const typedOnly = classificationRichness({
      ...bare,
      fileTypeDetected: "RedBook Valuation",
    });
    const untypedExtras = classificationRichness({
      ...bare,
      category: "Appraisals",
      hasDocumentCode: true,
      summaryLength: 200,
    });
    expect(typedOnly).toBeGreaterThan(untypedExtras);
  });

  it("documentAnalysis outranks any single one-point signal", () => {
    const withAnalysis = classificationRichness({
      ...bare,
      hasDocumentAnalysis: true,
    });
    const withIntel = classificationRichness({
      ...bare,
      hasExtractedIntelligence: true,
    });
    expect(withAnalysis).toBeGreaterThan(withIntel);
  });

  it("is monotone in each signal", () => {
    let prev = classificationRichness(bare);
    const steps: Array<Partial<typeof bare>> = [
      { fileTypeDetected: "RedBook Valuation" },
      { category: "Appraisals" },
      { hasDocumentAnalysis: true },
      { hasExtractedIntelligence: true },
      { hasDocumentCode: true },
      { summaryLength: 10 },
    ];
    const acc = { ...bare };
    for (const step of steps) {
      Object.assign(acc, step);
      const next = classificationRichness(acc);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });
});

describe("selectCanonical", () => {
  const member = (
    id: string,
    over: Partial<CanonicalInput> = {},
  ): CanonicalInput => ({
    documentId: id,
    creationTime: 1000,
    hasDriveMirror: false,
    richness: 0,
    ...over,
  });

  it("prefers the row with a Drive mirror over richer classification", () => {
    const { canonicalId, reason } = selectCanonical([
      member("rich", { richness: 10, creationTime: 1 }),
      member("mirrored", { hasDriveMirror: true }),
    ]);
    expect(canonicalId).toBe("mirrored");
    expect(reason).toBe("drive_mirror");
  });

  it("falls back to richest classification when no mirror separates", () => {
    const { canonicalId, reason } = selectCanonical([
      member("later-richer", { richness: 5, creationTime: 2000 }),
      member("earlier-poorer", { richness: 1, creationTime: 1 }),
    ]);
    expect(canonicalId).toBe("later-richer");
    expect(reason).toBe("richest_classification");
  });

  it("falls back to earliest _creationTime on richness ties", () => {
    const { canonicalId, reason } = selectCanonical([
      member("late", { creationTime: 2000 }),
      member("early", { creationTime: 500 }),
      member("middle", { creationTime: 1000 }),
    ]);
    expect(canonicalId).toBe("early");
    expect(reason).toBe("earliest_created");
  });

  it("mirror preference compares mirrors first even when both are mirrored", () => {
    const { canonicalId, reason } = selectCanonical([
      member("m1", { hasDriveMirror: true, richness: 2, creationTime: 2000 }),
      member("m2", { hasDriveMirror: true, richness: 4, creationTime: 3000 }),
    ]);
    expect(canonicalId).toBe("m2"); // both mirrored → richness decides
    expect(reason).toBe("richest_classification");
  });

  it("is deterministic on full ties (id tiebreak) and order-independent", () => {
    const a = member("aaa");
    const b = member("bbb");
    expect(selectCanonical([a, b]).canonicalId).toBe("aaa");
    expect(selectCanonical([b, a]).canonicalId).toBe("aaa");
    expect(selectCanonical([b, a]).reason).toBe("id_tiebreak");
  });

  it("does not mutate its input", () => {
    const members = [
      member("z", { creationTime: 3 }),
      member("a", { creationTime: 1 }),
    ];
    const snapshot = members.map((m) => m.documentId);
    selectCanonical(members);
    expect(members.map((m) => m.documentId)).toEqual(snapshot);
  });

  it("throws on an empty group", () => {
    expect(() => selectCanonical([])).toThrow();
  });
});

describe("observationIdentityKey", () => {
  const base = {
    atomId: "atom1",
    sourceType: "document",
    authorityTier: 3,
    sourceText: "Facility of £2.5m at 9.5%",
    locator: { page: 4 },
    extractedValue: 2_500_000,
  };

  it("ignores which document carried the evidence (that is the point)", () => {
    // documentId is not part of the identity — two ingests of the same file
    // produce the same key and collapse onto the canonical.
    const a = observationIdentityKey(base);
    const b = observationIdentityKey({ ...base });
    expect(a).toBe(b);
  });

  it("distinguishes different anchors, atoms and tiers", () => {
    const a = observationIdentityKey(base);
    expect(observationIdentityKey({ ...base, atomId: "atom2" })).not.toBe(a);
    expect(observationIdentityKey({ ...base, authorityTier: 4 })).not.toBe(a);
    expect(
      observationIdentityKey({ ...base, sourceText: "different snippet" }),
    ).not.toBe(a);
    expect(
      observationIdentityKey({ ...base, locator: { page: 5 } }),
    ).not.toBe(a);
    expect(
      observationIdentityKey({ ...base, extractedValue: 2_600_000 }),
    ).not.toBe(a);
  });

  it("treats absent optional fields stably", () => {
    const sparse = {
      atomId: "atom1",
      sourceType: "document",
      authorityTier: 3,
    };
    expect(observationIdentityKey(sparse)).toBe(
      observationIdentityKey({
        ...sparse,
        sourceText: null,
        locator: undefined,
        extractedValue: undefined,
      }),
    );
  });
});

describe("normalizedNameKey / filename gate", () => {
  it("splits byte-identical INTERNAL vs EXTERNAL copies (naming standard)", () => {
    const internal = dedupeGroupKey({ ...baseDigest });
    const external = dedupeGroupKey({
      ...baseDigest,
      fileName: "LintonLane_LenderBrief_RC_EXTERNAL_V1.3_20260608.docx",
    });
    expect(internal).not.toBe(external);
  });

  it("still groups download artifacts and case variants of one file", () => {
    const a = dedupeGroupKey({ ...baseDigest, fileName: "Valuation Report.pdf" });
    const b = dedupeGroupKey({ ...baseDigest, fileName: "valuation report (1).PDF" });
    const c = dedupeGroupKey({ ...baseDigest, fileName: "Valuation%20Report.pdf" });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});
