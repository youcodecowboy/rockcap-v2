"""
Streaming parser for the Companies House Mortgage/Charges Snapshot (Product 199).

The Prod199 .dat files are a 2009-era mainframe export: a header line, then a
flat stream of newline-delimited records each prefixed with a 2-char identifier,
then a trailer line. Records are hierarchical by position, NOT tabular:

    MORTSNAP325620260530          header  (MORTSNAP + run no + CCYYMMDD)
    RN00000086                    company (Register Number = borrower co. number)
    CN0004                        charge  (pre-2013 charge number)        ─┐
    DR29112001                    date registered (DDMMYYYY)               │
    DC14112001                    date created                             │ one
    DMLEGAL CHARGE...             description (may wrap over several DM)    │ charge
    ASALL MONIES DUE...           amount secured (wraps over several AS)    │ block
    PPPLOTS 28-29...              property particulars (wraps over PP)      │
    PENATIONAL WESTMINSTER BANK PLC          ...spaces...      <<<<<        │ LENDER
    NMF                           nature of mem-sat (F = fully satisfied)   │
    DF05112019                    date fully satisfied                    ─┘
    RN00000086                    next charge on the same company ...
    99999999000NNNNNN             trailer (id + detail-record count)

Post-6-April-2013 charges use a `CC` charge code (14 chars, first 8 == company
number) instead of `CN`. Multiple persons entitled appear as repeated `PE`
records; >4 persons collapse to a single `MP` "THERE ARE MORE THAN FOUR..." line.

Spec: "Mortgage Snapshot prod 199 spec final v2.2". Verified against run 3256
(snapshot 2026-05-30): 3,156,035 PE records in the E&W file, structure exact.

This module is pure parsing — it yields one `Charge` per (company, charge),
carrying the raw `persons_entitled` strings. Lender-name canonicalisation lives
in `canonicalize.py`; loading lives in `load.py`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Iterator, Optional, TextIO

# A charge block starts when we encounter the charge identifier (CN or CC).
# RN always precedes it and sets the owning company.
_CHARGE_START = ("CN", "CC")

# Trailing chevrons + padding terminator on PE / NT / NE name fields.
_NAME_TERMINATOR = re.compile(r"[<\s]+$")


@dataclass
class Charge:
    """One registered charge against one company, with its chargeholder(s)."""

    company_number: str
    charge_id: str
    charge_id_type: str  # "CC" (post-2013) or "CN" (pre-2013)
    persons_entitled: list[str] = field(default_factory=list)
    amount_secured: Optional[str] = None
    description: Optional[str] = None
    property_particulars: Optional[str] = None
    date_registered: Optional[date] = None
    date_created: Optional[date] = None
    # Memorandum of satisfaction. NM == "F" means fully satisfied; other codes
    # (S/T/U/V/W/M/Y/Z) are partial events. We expose the raw code plus a bool.
    mem_sat_code: Optional[str] = None
    date_satisfied: Optional[date] = None

    @property
    def fully_satisfied(self) -> bool:
        return self.mem_sat_code == "F"


def _parse_ddmmyyyy(raw: str) -> Optional[date]:
    """Detail-record dates are DDMMYYYY. Return None for blank/zero/garbage."""
    raw = raw.strip()
    if len(raw) != 8 or not raw.isdigit() or raw == "00000000":
        return None
    try:
        return date(int(raw[4:8]), int(raw[2:4]), int(raw[0:2]))
    except ValueError:
        return None


def _clean_name(body: str) -> str:
    """Strip the trailing chevron/padding terminator from a PE name field.

    e.g. "NATIONAL WESTMINSTER BANK PLC" + spaces + "<<<<<"  ->  "...PLC"
    """
    return _NAME_TERMINATOR.sub("", body).strip()


def parse_dat(lines: TextIO) -> Iterator[Charge]:
    """Yield a `Charge` for every charge block in a Prod199 .dat stream.

    `lines` is any iterable of text lines (an open file, or a gzip/zip text
    wrapper). Records are matched on their 2-char identifier; unknown record
    types are ignored so the parser is forward-compatible with rare codes.
    """
    current_company: Optional[str] = None
    charge: Optional[Charge] = None
    # Multi-line text fields accumulate fragments until the block flushes.
    amount_frag: list[str] = []
    desc_frag: list[str] = []
    prop_frag: list[str] = []

    def flush() -> Optional[Charge]:
        nonlocal amount_frag, desc_frag, prop_frag
        if charge is None:
            return None
        if amount_frag:
            charge.amount_secured = "".join(amount_frag).strip() or None
        if desc_frag:
            charge.description = "".join(desc_frag).strip() or None
        if prop_frag:
            charge.property_particulars = "".join(prop_frag).strip() or None
        amount_frag, desc_frag, prop_frag = [], [], []
        return charge

    for raw in lines:
        line = raw.rstrip("\n").rstrip("\r")
        if len(line) < 2:
            continue
        tag, body = line[:2], line[2:]

        if tag == "RN":
            current_company = body.strip()
            continue

        if tag in _CHARGE_START:
            # New charge block: emit the previous one, then start fresh.
            done = flush()
            if done is not None:
                yield done
            charge = Charge(
                company_number=current_company or "",
                charge_id=body.strip(),
                charge_id_type=tag,
            )
            continue

        if charge is None:
            # Header (MORTSNAP), trailer (99999999...), or pre-charge noise.
            continue

        if tag == "PE":
            name = _clean_name(body)
            if name:
                charge.persons_entitled.append(name)
        elif tag == "NT":  # debenture trustee — also a chargeholder for our purposes
            name = _clean_name(body)
            if name:
                charge.persons_entitled.append(name)
        elif tag == "AS":
            amount_frag.append(body)
        elif tag == "DM":
            desc_frag.append(body)
        elif tag == "PP":
            prop_frag.append(body)
        elif tag == "DR":
            charge.date_registered = _parse_ddmmyyyy(body)
        elif tag == "DC":
            charge.date_created = _parse_ddmmyyyy(body)
        elif tag == "NM":
            charge.mem_sat_code = body.strip()[:1] or None
        elif tag == "DF":
            charge.date_satisfied = _parse_ddmmyyyy(body)
        # All other record types (MP, CU, TA, receivers, Scottish-only, FT...)
        # are not needed for the chargeholder index and are skipped.

    done = flush()
    if done is not None:
        yield done


def parse_file(path: str, encoding: str = "latin-1") -> Iterator[Charge]:
    """Convenience wrapper: open a .dat file and yield its charges.

    CH bulk data is single-byte (Latin-1 superset of ASCII); decode permissively.
    """
    with open(path, "r", encoding=encoding, errors="replace") as fh:
        yield from parse_dat(fh)


if __name__ == "__main__":
    # Quick CLI sanity check / sampler:
    #   python -m etl.parser /path/to/Prod199_..._ew_....dat [LENDER_SUBSTRING]
    import sys

    src = sys.argv[1]
    needle = sys.argv[2].upper() if len(sys.argv) > 2 else None

    total = matched = 0
    for c in parse_file(src):
        total += 1
        if needle:
            for pe in c.persons_entitled:
                if needle in pe.upper():
                    matched += 1
                    status = "SATISFIED" if c.fully_satisfied else "OUTSTANDING"
                    print(f"{c.company_number}\t{c.charge_id_type}{c.charge_id}\t{status}\t{pe}")
                    break
    print(f"\n# parsed {total:,} charges", end="")
    if needle:
        print(f"; {matched:,} held by a lender matching '{needle}'", end="")
    print()
