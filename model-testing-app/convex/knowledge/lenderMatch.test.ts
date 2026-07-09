import { describe, it, expect } from "vitest";
import {
  LENDER_EDGE_SOURCE_PREDICATES,
  coreLenderName,
  isLenderEdgeSource,
  lenderAcronym,
  lenderBrandStem,
  matchRosteredLenders,
  normalizeLenderName,
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

describe("matchRosteredLenders — self-ambiguity dedup (2026-07 wave regression)", () => {
  it("one client row matching via name AND companyName is a SINGLE match", () => {
    // Live wave: "Funding 365" matched itself twice (name + companyName) and
    // was skipped as ambiguous. Dedup by clientId must collapse it.
    const roster: RosteredLender[] = [
      {
        clientId: "funding365",
        name: "Funding 365",
        companyName: "Funding 365 Ltd",
      },
    ];
    const hits = matchRosteredLenders(
      "Funding 365 Ltd issued indicative terms at 65% LTGDV.",
      roster,
    );
    expect(hits).toEqual([
      {
        clientId: "funding365",
        name: "Funding 365",
        companyName: "Funding 365 Ltd",
        via: "name",
      },
    ]);
  });

  it("one client row matching via name AND acronym is a SINGLE match", () => {
    const roster: RosteredLender[] = [
      {
        clientId: "utb",
        name: "United Trust Bank",
        companyName: "UTB Partners Group",
      },
    ];
    const hits = matchRosteredLenders(
      "United Trust Bank (UTB) issued indicative terms.",
      roster,
    );
    expect(hits.map((h) => h.clientId)).toEqual(["utb"]);
    expect(hits[0].via).toBe("name");
  });

  it("two DISTINCT lender clients are still ambiguous (2 hits)", () => {
    const roster: RosteredLender[] = [
      { clientId: "funding365", name: "Funding 365" },
      { clientId: "downing", name: "Downing LLP" },
    ];
    const hits = matchRosteredLenders(
      "Funding 365 and Downing both issued indicative terms.",
      roster,
    );
    expect(hits.map((h) => h.clientId).sort()).toEqual([
      "downing",
      "funding365",
    ]);
  });

  it("the same clientId appearing twice in the roster still yields one match", () => {
    const roster: RosteredLender[] = [
      { clientId: "funding365", name: "Funding 365" },
      { clientId: "funding365", name: "Funding 365 Ltd" },
    ];
    const hits = matchRosteredLenders(
      "Funding 365 issued indicative terms.",
      roster,
    );
    expect(hits.map((h) => h.clientId)).toEqual(["funding365"]);
  });
});

describe("matchRosteredLenders — brand-stem aliases (2026-07 wave misses)", () => {
  it("'Allica Bridging Finance' in text matches roster 'Allica Bank' via stem", () => {
    const hits = matchRosteredLenders(
      "Allica Bridging Finance issued indicative terms on the scheme.",
      [{ clientId: "allica", name: "Allica Bank" }],
    );
    expect(hits).toEqual([
      { clientId: "allica", name: "Allica Bank", via: "stem" },
    ]);
  });

  it("bare 'Pivot' in text matches roster 'Pivot Finance' via stem", () => {
    const hits = matchRosteredLenders(
      "Pivot confirmed appetite for the senior facility.",
      [{ clientId: "pivot", name: "Pivot Finance" }],
    );
    expect(hits).toEqual([
      { clientId: "pivot", name: "Pivot Finance", via: "stem" },
    ]);
  });

  it("'Downing' matches a Downing lender whose roster name carries generic words", () => {
    const hits = matchRosteredLenders(
      "Downing's indicative facility runs 24 months.",
      [{ clientId: "downing", name: "Downing Development Finance" }],
    );
    expect(hits.map((h) => h.clientId)).toEqual(["downing"]);
    expect(hits[0].via).toBe("stem");
  });

  it("a short single-word stem never fires ('West Bank' ↛ bare 'West')", () => {
    expect(
      matchRosteredLenders(
        "The West elevation overlooks the courtyard.",
        [{ clientId: "west", name: "West Bank" }],
      ),
    ).toEqual([]);
  });

  it("a lowercase common-noun hit never fires a stem ('the quantum of the claim')", () => {
    expect(
      matchRosteredLenders(
        "The parties agreed the quantum of the claim at mediation.",
        [{ clientId: "quantum", name: "Quantum Development Finance Ltd" }],
      ),
    ).toEqual([]);
    expect(
      matchRosteredLenders("We should pivot the exit strategy to sales.", [
        { clientId: "pivot", name: "Pivot Finance" },
      ]),
    ).toEqual([]);
  });

  it("proper-noun stem hits still fire, including ALL-CAPS term-sheet headers", () => {
    expect(
      matchRosteredLenders("Quantum issued a revised facility letter.", [
        { clientId: "quantum", name: "Quantum Development Finance Ltd" },
      ]).map((h) => h.via),
    ).toEqual(["stem"]);
    expect(
      matchRosteredLenders("INDICATIVE TERMS — PIVOT — STRICTLY PRIVATE", [
        { clientId: "pivot", name: "Pivot Finance" },
      ]).map((h) => h.via),
    ).toEqual(["stem"]);
  });

  it("a stem match on two distinct lenders is ambiguous (caller skips)", () => {
    const hits = matchRosteredLenders(
      "Allica issued revised terms on Friday.",
      [
        { clientId: "allica-bank", name: "Allica Bank" },
        { clientId: "allica-cap", name: "Allica Capital" },
      ],
    );
    expect(hits.map((h) => h.clientId).sort()).toEqual([
      "allica-bank",
      "allica-cap",
    ]);
  });

  it("full-name matches still take precedence over stems", () => {
    const hits = matchRosteredLenders(
      "Allica Bank issued indicative terms.",
      [{ clientId: "allica", name: "Allica Bank" }],
    );
    expect(hits[0].via).toBe("name");
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
    // Reviewed additions 2026-07-09 (Donnington pilot hardening): loan-term
    // and guarantee attributes are financing facts stated by lender terms
    // docs, so a project-anchored one naming a rostered lender is a valid
    // companion-edge source like the other four.
    expect([...LENDER_EDGE_SOURCE_PREDICATES].sort()).toEqual([
      "has_guarantee",
      "has_interest_rate",
      "has_loan_amount",
      "has_loan_term_months",
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

  it("lenderBrandStem strips generic finance words, conservatively", () => {
    expect(lenderBrandStem("Allica Bank")).toBe("Allica");
    expect(lenderBrandStem("Pivot Finance")).toBe("Pivot");
    expect(lenderBrandStem("Downing Development Finance")).toBe("Downing");
    // Short single-word stems never fire.
    expect(lenderBrandStem("West Bank")).toBeNull();
    // Nothing stripped → null (the full-name rule already covers it).
    expect(lenderBrandStem("Triple Point")).toBeNull();
    // All words generic → null.
    expect(lenderBrandStem("Development Finance Group Ltd")).toBeNull();
    // Multi-word stems are allowed regardless of word length.
    expect(lenderBrandStem("Hampshire Trust Bank")).toBe("Hampshire Trust");
  });
});

describe("normalizeLenderName — lender.create dedup key (equality only)", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeLenderName("  Funding 365  ")).toBe("funding 365");
    expect(normalizeLenderName("Maslow, Capital.")).toBe("maslow capital");
    expect(normalizeLenderName("O'Brien Finance")).toBe("o brien finance");
  });

  it("drops trailing legal suffixes so suffix variants collapse", () => {
    expect(normalizeLenderName("Downing LLP")).toBe(normalizeLenderName("Downing"));
    expect(normalizeLenderName("Funding 365 Ltd")).toBe("funding 365");
    expect(normalizeLenderName("Shawbrook Bank PLC")).toBe("shawbrook bank");
    expect(normalizeLenderName("Acme Inc")).toBe("acme");
  });

  it("real duplicate pairs from the roster key equal", () => {
    expect(normalizeLenderName("Funding 365")).toBe(normalizeLenderName("Funding 365 Limited"));
    expect(normalizeLenderName("Maslow Capital")).toBe(normalizeLenderName("Maslow Capital LLP"));
  });

  it("does NOT collapse distinct brands (equality, never fuzzy/substring)", () => {
    // Sector words are NOT stripped here — Paragon vs Paragon Bank stay
    // distinct; that judgement is left to the operator via lender.merge.
    expect(normalizeLenderName("Paragon")).not.toBe(normalizeLenderName("Paragon Bank"));
    expect(normalizeLenderName("Downing")).not.toBe(normalizeLenderName("Downing Development Finance"));
  });

  it("never strips the sole word away", () => {
    expect(normalizeLenderName("Limited")).toBe("limited");
    expect(normalizeLenderName("LLP")).toBe("llp");
  });
});
