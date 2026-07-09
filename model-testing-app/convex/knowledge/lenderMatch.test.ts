import { describe, it, expect } from "vitest";
import {
  LENDER_EDGE_SOURCE_PREDICATES,
  coreLenderName,
  isLenderEdgeSource,
  lenderAcronym,
  matchRosteredLenders,
  type RosteredLender,
} from "./lenderMatch";

// The live roster the eval ran against (client_list type=lender, 2026-07-08).
const ROSTER: RosteredLender[] = [
  { clientId: "shawbrook", name: "Shawbrook Bank" },
  { clientId: "qdf", name: "Quantum Development Finance Ltd" },
  { clientId: "qdf2", name: "QDF Funding 2 Ltd" },
  { clientId: "utb", name: "United Trust Bank" },
  { clientId: "htb", name: "Hampshire Trust Bank" },
  { clientId: "oaknorth", name: "OakNorth Bank" },
  { clientId: "triplepoint", name: "Triple Point" },
  { clientId: "paragon", name: "Paragon Bank" },
];

describe("matchRosteredLenders — full-name containment", () => {
  it("matches the eval statement that motivated the fix (UTB full name, possessive)", () => {
    const hits = matchRosteredLenders(
      "United Trust Bank's 2026-03-09 indicative Dark Mills facility totals £9.524m gross.",
      ROSTER,
    );
    expect(hits).toEqual([
      { clientId: "utb", name: "United Trust Bank", via: "name" },
    ]);
  });

  it("matches case-insensitively", () => {
    const hits = matchRosteredLenders(
      "the HAMPSHIRE TRUST BANK indicative terms run 25 months",
      ROSTER,
    );
    expect(hits.map((h) => h.clientId)).toEqual(["htb"]);
    expect(hits[0].via).toBe("name");
  });

  it("matches a suffix-stripped client name (text omits 'Ltd')", () => {
    const hits = matchRosteredLenders(
      "Quantum Development Finance offered a £3,805,045 gross senior facility.",
      ROSTER,
    );
    expect(hits.map((h) => h.clientId)).toEqual(["qdf"]);
  });

  it("matches two-word lenders that have no >=3-letter acronym (Triple Point)", () => {
    const hits = matchRosteredLenders(
      "Triple Point's 2026-03-13 indicative facility is £9,589,060 at 65% GDV.",
      ROSTER,
    );
    expect(hits).toEqual([
      { clientId: "triplepoint", name: "Triple Point", via: "name" },
    ]);
  });

  it("requires whole-word boundaries — no substring-of-a-word hits", () => {
    // "SUTB" must not acronym-match UTB; "Paragons Court" must not name-match
    // "Paragon Bank" (full name absent).
    expect(
      matchRosteredLenders("The SUTB facility at Paragons Court.", ROSTER),
    ).toEqual([]);
  });
});

describe("matchRosteredLenders — initials acronym", () => {
  it("matches the eval qualifier 'UTB indicative'", () => {
    const hits = matchRosteredLenders("UTB indicative", ROSTER);
    expect(hits).toEqual([
      { clientId: "utb", name: "United Trust Bank", via: "acronym" },
    ]);
  });

  it("matches 'HTB' to Hampshire Trust Bank", () => {
    const hits = matchRosteredLenders(
      "1% arrangement fee on the HTB facility",
      ROSTER,
    );
    expect(hits.map((h) => h.clientId)).toEqual(["htb"]);
    expect(hits[0].via).toBe("acronym");
  });

  it("matches 'QDF' to Quantum Development Finance Ltd (suffix stripped before initials)", () => {
    const hits = matchRosteredLenders(
      "QDF's January 2025 indicative Howell Hill facility runs over a 20-month term.",
      ROSTER,
    );
    expect(hits).toEqual([
      {
        clientId: "qdf",
        name: "Quantum Development Finance Ltd",
        via: "acronym",
      },
    ]);
  });

  it("is case-sensitive — lowercase 'utb' in prose never matches", () => {
    expect(matchRosteredLenders("the utb of the scheme", ROSTER)).toEqual([]);
  });

  it("never acronym-matches two-letter initials (TP ↛ Triple Point)", () => {
    expect(matchRosteredLenders("TP indicative terms", ROSTER)).toEqual([]);
  });
});

describe("matchRosteredLenders — ambiguity is surfaced, never guessed", () => {
  it("returns both lenders when a statement names two (caller skips)", () => {
    const hits = matchRosteredLenders(
      "United Trust Bank and Hampshire Trust Bank both issued indicative terms.",
      ROSTER,
    );
    expect(hits.map((h) => h.clientId).sort()).toEqual(["htb", "utb"]);
  });

  it("'QDF Funding 2 Ltd' text hits both QDF entities → ambiguous", () => {
    // Full-name match on QDF Funding 2 Ltd AND acronym match on Quantum
    // Development Finance ("QDF" token) — exactly the co-lender confusion the
    // skip rule exists for.
    const hits = matchRosteredLenders(
      "QDF Funding 2 Ltd is a co-lender on the senior facility.",
      ROSTER,
    );
    expect(hits.map((h) => h.clientId).sort()).toEqual(["qdf", "qdf2"]);
  });
});

describe("matchRosteredLenders — negatives", () => {
  it("borrower-side names never match (only rostered lenders are candidates)", () => {
    expect(
      matchRosteredLenders(
        "Kinspire Property Ltd drew £2,975,000 under the revised facility.",
        ROSTER,
      ),
    ).toEqual([]);
  });

  it("returns [] when nothing is named", () => {
    expect(
      matchRosteredLenders(
        "The scheme has an assumed gross development value of £5,600,000.",
        ROSTER,
      ),
    ).toEqual([]);
  });
});

describe("isLenderEdgeSource — the write-path gate", () => {
  it("fires only for project-anchored financing attributes", () => {
    expect(isLenderEdgeSource("project", "has_loan_amount")).toBe(true);
    expect(isLenderEdgeSource("project", "has_interest_rate")).toBe(true);
    expect(isLenderEdgeSource("project", "matures_on")).toBe(true);
  });

  it("never fires for borrower-side (subjectType=client) atoms", () => {
    expect(isLenderEdgeSource("client", "has_loan_amount")).toBe(false);
    expect(isLenderEdgeSource("client", "has_interest_rate")).toBe(false);
  });

  it("never fires for non-financing or edge predicates", () => {
    expect(isLenderEdgeSource("project", "has_gdv")).toBe(false); // property family
    expect(isLenderEdgeSource("project", "planning_status")).toBe(false);
    expect(isLenderEdgeSource("project", "funds_project")).toBe(false); // already an edge
    expect(isLenderEdgeSource("project", "lends_to")).toBe(false);
  });

  it("the predicate gate is derived from the vocabulary's financing attributes", () => {
    expect([...LENDER_EDGE_SOURCE_PREDICATES].sort()).toEqual([
      "has_interest_rate",
      "has_loan_amount",
      "has_total_development_cost",
      "matures_on",
    ]);
  });
});

describe("name helpers", () => {
  it("coreLenderName strips trailing corporate suffixes only", () => {
    expect(coreLenderName("Quantum Development Finance Ltd")).toBe(
      "Quantum Development Finance",
    );
    expect(coreLenderName("Shawbrook Bank Plc")).toBe("Shawbrook Bank");
    expect(coreLenderName("United Trust Bank")).toBe("United Trust Bank");
  });

  it("lenderAcronym needs >=3 letter-initial words", () => {
    expect(lenderAcronym("United Trust Bank")).toBe("UTB");
    expect(lenderAcronym("Hampshire Trust Bank")).toBe("HTB");
    expect(lenderAcronym("Quantum Development Finance Ltd")).toBe("QDF");
    expect(lenderAcronym("Triple Point")).toBeNull();
    expect(lenderAcronym("OakNorth Bank")).toBeNull();
    // "QDF Funding 2 Ltd" → only two letter-words ("QDF", "Funding") → null,
    // so the bare token "QDF" can only mean Quantum Development Finance.
    expect(lenderAcronym("QDF Funding 2 Ltd")).toBeNull();
  });
});
