import { describe, it, expect } from "vitest";
import {
  chunkString,
  computeDegrees,
  dedupeOverviewEdges,
  normalizeClientStatus,
  normalizeClientType,
  rankOverviewEdges,
  truncateOverview,
  type OverviewEdge,
  type OverviewNode,
} from "./graphOverview";

// Pure-helper coverage for the atlas snapshot (graph.overview): the
// (from, to, predicate) dedupe rules (atom wins over native with
// corroboration noted; contested never hidden by a calmer duplicate) and the
// truncation ordering (lowest-degree contact/company/candidate leaves drop
// first; degrees recomputed on the RETURNED edge list).

function atomEdge(over: Partial<OverviewEdge> = {}): OverviewEdge {
  return {
    from: "client:c1",
    to: "project:p1",
    predicate: "developing",
    kind: "atom",
    atomId: "a1",
    status: "active",
    confidence: 0.8,
    ...over,
  };
}

function nativeEdge(over: Partial<OverviewEdge> = {}): OverviewEdge {
  return {
    from: "client:c1",
    to: "project:p1",
    predicate: "developing",
    kind: "native",
    status: "active",
    ...over,
  };
}

function node(key: string, over: Partial<OverviewNode> = {}): OverviewNode {
  const sep = key.indexOf(":");
  return {
    key,
    type: key.slice(0, sep) as OverviewNode["type"],
    id: key.slice(sep + 1),
    name: key,
    atomCount: 0,
    contestedCount: 0,
    degree: 0,
    ...over,
  };
}

describe("dedupeOverviewEdges", () => {
  it("keeps distinct (from, to, predicate) triples apart", () => {
    const edges = dedupeOverviewEdges([
      atomEdge(),
      atomEdge({ predicate: "funds_project" }),
      atomEdge({ to: "project:p2" }),
      atomEdge({ from: "client:c2" }),
    ]);
    expect(edges).toHaveLength(4);
  });

  it("atom wins over its native mirror and is marked corroborated (either order)", () => {
    for (const input of [
      [atomEdge(), nativeEdge()],
      [nativeEdge(), atomEdge()],
    ]) {
      const edges = dedupeOverviewEdges(input);
      expect(edges).toHaveLength(1);
      expect(edges[0].kind).toBe("atom");
      expect(edges[0].atomId).toBe("a1");
      expect(edges[0].corroborated).toBe(true);
    }
  });

  it("native mirrors collected from both endpoints collapse to one", () => {
    const edges = dedupeOverviewEdges([nativeEdge(), nativeEdge()]);
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("native");
    expect(edges[0].corroborated).toBeUndefined();
  });

  it("a contested duplicate atom wins over a higher-confidence active one (either order)", () => {
    const contested = atomEdge({ atomId: "a-contested", status: "contested", confidence: 0.3 });
    const active = atomEdge({ atomId: "a-active", status: "active", confidence: 0.95 });
    for (const input of [
      [contested, active],
      [active, contested],
    ]) {
      const edges = dedupeOverviewEdges(input);
      expect(edges).toHaveLength(1);
      expect(edges[0].status).toBe("contested");
      expect(edges[0].atomId).toBe("a-contested");
    }
  });

  it("same-status duplicate atoms keep the higher confidence", () => {
    const edges = dedupeOverviewEdges([
      atomEdge({ atomId: "low", confidence: 0.5 }),
      atomEdge({ atomId: "high", confidence: 0.9 }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].atomId).toBe("high");
    expect(edges[0].confidence).toBe(0.9);
  });

  it("corroboration survives a later atom-vs-atom dedupe", () => {
    const edges = dedupeOverviewEdges([
      atomEdge({ atomId: "first", confidence: 0.5 }),
      nativeEdge(),
      atomEdge({ atomId: "second", confidence: 0.9 }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].atomId).toBe("second");
    expect(edges[0].corroborated).toBe(true);
  });
});

describe("computeDegrees", () => {
  it("counts edge endpoints per node, self-loops once", () => {
    const degrees = computeDegrees([
      atomEdge({ from: "client:c1", to: "project:p1" }),
      atomEdge({ from: "client:c1", to: "project:p2", predicate: "x" }),
      atomEdge({ from: "client:c1", to: "client:c1", predicate: "self" }),
    ]);
    expect(degrees.get("client:c1")).toBe(3);
    expect(degrees.get("project:p1")).toBe(1);
    expect(degrees.get("project:p2")).toBe(1);
  });
});

describe("rankOverviewEdges", () => {
  it("orders contested > atom > native > lower confidence", () => {
    const contested = nativeEdge({ status: "contested", predicate: "a" });
    const atomHi = atomEdge({ predicate: "b", confidence: 0.9 });
    const atomLo = atomEdge({ predicate: "c", confidence: 0.2 });
    const native = nativeEdge({ predicate: "d" });
    const sorted = [native, atomLo, atomHi, contested].sort(rankOverviewEdges);
    expect(sorted.map((e) => e.predicate)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("truncateOverview", () => {
  it("passes through untouched when under both caps", () => {
    const nodes = [node("client:c1"), node("project:p1")];
    const edges = [atomEdge()];
    const result = truncateOverview(nodes, edges, 10, 10);
    expect(result.truncated).toBe(false);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    // Degrees are recomputed from the returned edges.
    expect(result.nodes.find((n) => n.key === "client:c1")?.degree).toBe(1);
  });

  it("drops lowest-degree contact/company leaves before clients and projects", () => {
    const nodes = [
      node("client:c1", { degree: 5 }),
      node("project:p1", { degree: 4 }),
      node("contact:x1", { degree: 0 }),
      node("company:y1", { degree: 1 }),
      node("contact:x2", { degree: 3 }),
    ];
    const result = truncateOverview(nodes, [], 3, 10);
    expect(result.truncated).toBe(true);
    const kept = result.nodes.map((n) => n.key).sort();
    // The two lowest-degree leaf nodes (contact:x1 deg 0, company:y1 deg 1) drop.
    expect(kept).toEqual(["client:c1", "contact:x2", "project:p1"]);
  });

  it("drops candidates before contacts/companies at equal degree", () => {
    const nodes = [
      node("candidate:z1", { degree: 2 }),
      node("contact:x1", { degree: 0 }),
      node("client:c1", { degree: 1 }),
    ];
    const result = truncateOverview(nodes, [], 2, 10);
    expect(result.nodes.map((n) => n.key).sort()).toEqual(["client:c1", "contact:x1"]);
  });

  it("removes edges touching dropped nodes", () => {
    const nodes = [
      node("client:c1", { degree: 2 }),
      node("project:p1", { degree: 1 }),
      node("contact:x1", { degree: 1 }),
    ];
    const edges = [
      atomEdge({ from: "client:c1", to: "project:p1" }),
      atomEdge({ from: "contact:x1", to: "client:c1", predicate: "works_at" }),
    ];
    const result = truncateOverview(nodes, edges, 2, 10);
    expect(result.nodes.map((n) => n.key).sort()).toEqual(["client:c1", "project:p1"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].to).toBe("project:p1");
    expect(result.nodes.find((n) => n.key === "client:c1")?.degree).toBe(1);
  });

  it("truncates edges by keep-priority (contested and atoms survive)", () => {
    const nodes = [node("client:c1"), node("project:p1")];
    const edges = [
      nativeEdge({ predicate: "n1" }),
      atomEdge({ predicate: "a1", confidence: 0.4 }),
      nativeEdge({ predicate: "n2", status: "contested" }),
      atomEdge({ predicate: "a2", confidence: 0.9 }),
    ];
    const result = truncateOverview(nodes, edges, 10, 2);
    expect(result.truncated).toBe(true);
    expect(result.edges.map((e) => e.predicate)).toEqual(["n2", "a2"]);
  });
});

describe("client flag normalization", () => {
  it("normalizes free-string client types", () => {
    expect(normalizeClientType("lender")).toBe("lender");
    expect(normalizeClientType("Private Lender")).toBe("lender");
    expect(normalizeClientType("real-estate-developer")).toBe("developer");
    expect(normalizeClientType("borrower")).toBe("borrower");
    expect(normalizeClientType("solicitor")).toBeUndefined();
    expect(normalizeClientType(undefined)).toBeUndefined();
  });

  it("normalizes client status (legacy undefined ⇒ active; archived/past unflagged)", () => {
    expect(normalizeClientStatus("prospect")).toBe("prospect");
    expect(normalizeClientStatus("active")).toBe("active");
    expect(normalizeClientStatus(undefined)).toBe("active");
    expect(normalizeClientStatus("archived")).toBeUndefined();
    expect(normalizeClientStatus("past")).toBeUndefined();
  });
});

describe("chunkString (snapshot chunking)", () => {
  it("round-trips exactly and respects the size cap", () => {
    const s = "a".repeat(10) + "£€🌍" + "b".repeat(10);
    for (const size of [1, 3, 7, 100]) {
      const chunks = chunkString(s, size);
      expect(chunks.join("")).toBe(s);
      // +1 slack: a chunk may grow one unit to keep a surrogate pair whole.
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(size + 1);
    }
  });

  it("never splits a surrogate pair across chunks", () => {
    const s = "🌍🌎🌏"; // 6 UTF-16 units, 3 pairs
    for (const size of [1, 2, 3, 5]) {
      for (const c of chunkString(s, size)) {
        // A chunk ending in an unpaired high surrogate would not round-trip
        // through UTF-8 storage.
        const last = c.charCodeAt(c.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      }
    }
  });

  it("always returns at least one chunk", () => {
    expect(chunkString("", 100)).toEqual([""]);
  });
});
