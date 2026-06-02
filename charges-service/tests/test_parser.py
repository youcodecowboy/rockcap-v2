"""Parser + canonicaliser unit tests using a synthetic Prod199 fragment.

Run: python -m pytest charges-service/tests  (or python -m tests.test_parser)
"""

import io

from etl.canonicalize import canonicalize, extract_crn
from etl.parser import parse_dat

# Two charges on one company: a satisfied NatWest charge and an outstanding
# Paragon Dev Finance charge — mirrors the real run-3256 structure.
SAMPLE = """MORTSNAP325620260530
RN00000086
CN0004
DR29112001
DC14112001
DMLEGAL CHARGE
ASALL MONIES DUE OR TO BECOME DUE FROM THE
AS COMPANY TO THE CHARGEE
PENATIONAL WESTMINSTER BANK PLC                                                                  <<<<<
NMF
DF05112019
RN00237258
CC002372580009
DR15032023
DC10032023
PEPARAGON DEVELOPMENT FINANCE LIMITED                                                            <<<<<
99999999000000002
"""


def test_parse_two_charges():
    charges = list(parse_dat(io.StringIO(SAMPLE)))
    assert len(charges) == 2

    natwest, paragon = charges

    assert natwest.company_number == "00000086"
    assert natwest.charge_id == "0004"
    assert natwest.charge_id_type == "CN"
    assert natwest.persons_entitled == ["NATIONAL WESTMINSTER BANK PLC"]
    assert natwest.fully_satisfied is True
    assert natwest.date_registered.isoformat() == "2001-11-29"

    assert paragon.company_number == "00237258"
    assert paragon.charge_id == "002372580009"
    assert paragon.charge_id_type == "CC"
    assert paragon.persons_entitled == ["PARAGON DEVELOPMENT FINANCE LIMITED"]
    assert paragon.fully_satisfied is False


def test_canonicalize_keeps_entities_distinct():
    # Spelling noise collapses...
    assert canonicalize("PARAGON BANK PLC.").canonical == "PARAGON BANK PLC"
    assert canonicalize("PARAGON BANK PLC LIMITED").canonical == "PARAGON BANK PLC"
    # ...but genuinely different legal entities stay distinct.
    assert (
        canonicalize("PARAGON DEVELOPMENT FINANCE LIMITED").canonical
        != canonicalize("PARAGON BANK PLC").canonical
    )


def test_extract_embedded_crn():
    assert extract_crn("PARAGON BANK PLC (CRN: 05390593)") == "05390593"
    assert extract_crn("PARAGON BANK PLC (COMPANY NUMBER 05390593)") == "05390593"
    assert extract_crn("PARAGON DEVELOPMENT FINANCE LIMITED") is None


if __name__ == "__main__":
    test_parse_two_charges()
    test_canonicalize_keeps_entities_distinct()
    test_extract_embedded_crn()
    print("ok")
