"""
Lender-name canonicalisation for the charges index.

This is the heart of the system's *precision*. Companies House stores the
chargeholder ("Person Entitled") as free text, so one real lender appears under
many spellings. Verified against run 3256, the "PARAGON" family alone produces:

    51,619  PARAGON BANK PLC                       <- buy-to-let, NOT dev finance
     4,419  PARAGON MORTGAGES (2010) LIMITED
     1,923  PARAGON DEVELOPMENT FINANCE LIMITED    <- the dev-finance competitor
       715  PARAGON BUSINESS FINANCE PLC
       128  PARAGON BANK PLC LIMITED               } same entity,
        77  PARAGON BANK PLC (CRN: 05390593)       } messy variants
        31  PARAGON BANK PLC.                       }
       114  PARAGON BANK PLC AND PARAGON MORTGAGES (2010) LIMITED   <- joint

A naive `LIKE '%PARAGON%'` would lump Paragon Bank's 51k buy-to-let mortgages in
with the 1,923 development-finance charges — reporting a competitor as 25x larger
in our space than it is. So we derive a stable `canonical` key for grouping and
exact match, and extract an embedded company number (`crn`) where present as the
strongest identity signal.

Joint charges ("X AND Y" in a single PE) are left as-is by default: splitting on
" AND " is unsafe because lender names legitimately contain "AND" (e.g.
"BROWN AND SONS"). The genuine multi-party case is already modelled by CH as
separate PE records. `split_joint()` is provided but opt-in.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# Embedded company-registration-number hints, e.g. "(CRN: 05390593)",
# "(COMPANY NUMBER: 05390593)", "(05390593)". 8 digits, optionally prefixed.
_CRN_PATTERN = re.compile(
    r"\(\s*(?:CRN|COMPANY\s+(?:NO|NUMBER|REG(?:ISTRATION)?\s+(?:NO|NUMBER))?)?\s*:?\s*"
    r"([0-9]{6,8}|[A-Z]{2}[0-9]{6})\s*\)"
)

# Corporate-suffix normalisation (applied after uppercasing + punctuation strip).
_SUFFIX_REPLACEMENTS = [
    (re.compile(r"\bLTD\b"), "LIMITED"),
    (re.compile(r"\bPLC\b"), "PLC"),
    (re.compile(r"\bCO\b"), "COMPANY"),
    (re.compile(r"\b&\b"), "AND"),
]

_PUNCT = re.compile(r"[.,]")
_MULTISPACE = re.compile(r"\s+")


@dataclass
class CanonicalLender:
    raw: str
    canonical: str
    crn: Optional[str] = None


def extract_crn(name: str) -> Optional[str]:
    """Pull an embedded company number out of a lender name, if present."""
    m = _CRN_PATTERN.search(name.upper())
    if not m:
        return None
    crn = m.group(1)
    # CH company numbers are 8 chars, zero-padded (e.g. "05390593").
    if crn.isdigit():
        return crn.zfill(8)
    return crn


def canonicalize(name: str) -> CanonicalLender:
    """Normalise a raw PE string into a stable canonical key.

    The canonical form is used for grouping and exact-match lookups; `pg_trgm`
    fuzzy search runs over this same column for discovery. We deliberately keep
    distinct legal entities distinct (e.g. PARAGON BANK PLC vs PARAGON
    DEVELOPMENT FINANCE LIMITED) — we only collapse spelling noise.
    """
    raw = name.strip()
    crn = extract_crn(raw)

    s = raw.upper()
    s = _CRN_PATTERN.sub(" ", s)  # drop the parenthetical CRN before keying
    s = _PUNCT.sub(" ", s)
    for pattern, repl in _SUFFIX_REPLACEMENTS:
        s = pattern.sub(repl, s)
    # Collapse a doubled suffix artefact like "PLC LIMITED" -> "PLC".
    s = re.sub(r"\bPLC\s+LIMITED\b", "PLC", s)
    s = _MULTISPACE.sub(" ", s).strip()

    return CanonicalLender(raw=raw, canonical=s, crn=crn)


# Conservative, opt-in joint splitter. Only use when you have confirmed the PE
# value is a true multi-party string rather than a single legal name.
_JOINT_SPLIT = re.compile(r"\s+AND\s+|\s*;\s*")


def split_joint(name: str) -> list[str]:
    """Best-effort split of a single PE string into multiple parties.

    NOTE: heuristic and lossy — "BROWN AND SONS LIMITED" would split wrongly.
    Off by default in the loader. Surface candidates to an operator instead.
    """
    parts = [p.strip() for p in _JOINT_SPLIT.split(name.upper()) if p.strip()]
    return parts if len(parts) > 1 else [name.strip()]


if __name__ == "__main__":
    for sample in [
        "PARAGON DEVELOPMENT FINANCE LIMITED",
        "PARAGON BANK PLC (CRN: 05390593)",
        "PARAGON BANK PLC LIMITED",
        "PARAGON BANK PLC.",
        "PARAGON MORTGAGES (2010) LTD",
    ]:
        c = canonicalize(sample)
        print(f"{sample!r:55} -> canonical={c.canonical!r:40} crn={c.crn}")
