import { describe, it, expect } from "vitest";
import { chunkTextDedupeKey, dedupeChunksByText } from "./chunkDedupe";

// Regression coverage for the duplicate-chunk slot burn found by the live
// retrieval eval (37/160 top-8 slots — 23% — held near-identical chunks from
// duplicate document rows). The dedupe must key on normalized chunk TEXT, not
// on (contentChecksum, chunkIndex): the duplicate rows carry DIFFERENT
// checksums (Drive byte checksum vs text-fnv1a fallback), so only the text
// itself identifies them.

type Row = { chunkId: string; text: string; rrfScore: number };

function row(chunkId: string, text: string, rrfScore: number): Row {
  return { chunkId, text, rrfScore };
}

describe("chunkTextDedupeKey", () => {
  it("is insensitive to case and whitespace shape", () => {
    const a = chunkTextDedupeKey("The Facility Letter  requires\nconsent.");
    const b = chunkTextDedupeKey("the facility letter requires consent.");
    const c = chunkTextDedupeKey("  THE FACILITY\tLETTER REQUIRES CONSENT.  ");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("distinguishes genuinely different text", () => {
    expect(chunkTextDedupeKey("clause 4.1 applies")).not.toBe(
      chunkTextDedupeKey("clause 4.2 applies"),
    );
  });
});

describe("dedupeChunksByText", () => {
  it("keeps the first (highest-scoring) instance of duplicated text", () => {
    const rows = [
      row("c1", "Restriction: no disposition without consent.", 0.03),
      row("c2", "Some other clause entirely.", 0.02),
      // Same text re-ingested under a different document row — different
      // chunkId, different score, whitespace/case drift from re-extraction.
      row("c3", "restriction:  no disposition\nwithout consent.", 0.01),
    ];
    const out = dedupeChunksByText(rows);
    expect(out.map((r) => r.chunkId)).toEqual(["c1", "c2"]);
    expect(out[0].rrfScore).toBe(0.03);
  });

  it("preserves input order and passes distinct rows through untouched", () => {
    const rows = [
      row("a", "alpha", 3),
      row("b", "beta", 2),
      row("c", "gamma", 1),
    ];
    expect(dedupeChunksByText(rows)).toEqual(rows);
  });

  it("collapses a 4x-ingested duplicate to one slot", () => {
    const text =
      "The title register carries a restriction in favour of the lender.";
    const rows = [
      row("d1", text, 0.9),
      row("d2", text.toUpperCase(), 0.8),
      row("d3", `  ${text}  `, 0.7),
      row("d4", text.replace(/ /g, "  "), 0.6),
      row("d5", "An unrelated passage.", 0.5),
    ];
    const out = dedupeChunksByText(rows);
    expect(out.map((r) => r.chunkId)).toEqual(["d1", "d5"]);
  });

  it("handles the empty page", () => {
    expect(dedupeChunksByText([])).toEqual([]);
  });
});
