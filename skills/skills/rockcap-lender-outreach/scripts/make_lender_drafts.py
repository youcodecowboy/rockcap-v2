#!/usr/bin/env python3
"""Create RockCap lender-outreach Gmail drafts from a JSON config, in one process.

Why one process: the gmail.compose consent (if ever needed) then happens once, and
all drafts share the authenticated session.

Usage:
    python make_lender_drafts.py <config.json> [--dry-run]

--dry-run prints each assembled email + recipients + attachment count WITHOUT
creating anything. Always dry-run first to eyeball the bodies, then run for real.

Config schema (see make_lender_drafts.example.json):
{
  "gmail_api_dir": "/abs/path/to/EmailTriage/gmail-api",   # where create_draft_new_thread.py lives
  "subject_stem": "Oakridge Lynch, Stroud / Oakfield Developments / ",
  "cc": ["alex@rockcap.uk"],
  "closing": "Alex will give you a call to discuss.",
  "cold_intro": "I work with Alex at RockCap and he wanted to share the below with you.",
  # NOTE: no "signature" key needed (17/07/2026) — the real Gmail signature is
  # auto-appended by create_draft_new_thread; any "signature" value is ignored.
  "tiers": {
    "senior": {
      "subject_suffix": "Residential Development Finance",
      "pack_dir": "/abs/.../Senior Lender Pack",
      "lead": "Please find attached the lender pack for a residential development at <Scheme>. We are seeking senior development finance for the scheme, ",
      "attached": "I have attached:\n- Lender Note\n- RockCap appraisal and client build appraisal\n- Borrower CV and combined Asset & Liability statement\n- Planning appeal decision, Design & Access Statement and approved drawings",
      "expect_files": 22
    }
  },
  "lenders": [
    {"label": "Paragon", "tier": "senior", "salutation": "Hi James,",
     "to": ["james.helmore@paragonbank.co.uk"], "cold": false,
     "leverage": "and the appraisal is modelled at both 65% and 70% LTGDV."}
    # per-lender overrides allowed: "tier" picks the block; or set "pack_dir",
    # "lead", "attached", "subject_suffix" directly (used for Falco-type exceptions).
    # "closing_extra": "Any questions, please let me know." appends after the call line.
  ]
}
"""
import sys, os, glob, json


def load_pack(pack_dir, expect=None):
    files = [a for a in sorted(glob.glob(os.path.join(pack_dir, "*"))) if os.path.isfile(a)]
    files += sorted(glob.glob(os.path.join(pack_dir, "Plans", "*.pdf")))
    if expect is not None and len(files) != expect:
        raise SystemExit(f"PACK COUNT MISMATCH in {pack_dir}: expected {expect}, got {len(files)}.\n"
                         f"Refusing to draft an incomplete pack. Files:\n  " + "\n  ".join(files))
    return files


def build_body(cfg, tier, L):
    lead = L.get("lead") or tier["lead"]
    attached = L.get("attached") or tier["attached"]
    leverage = L.get("leverage", "")
    parts = [L["salutation"], "", "I hope you are well.", ""]
    if L.get("cold"):
        parts += [cfg["cold_intro"], ""]
    lead_sentence = (lead + leverage).rstrip()
    parts += [lead_sentence, "", attached, ""]
    close = cfg["closing"]
    if L.get("closing_extra"):
        close = close + " " + L["closing_extra"]
    # NO signature in the body (17/07/2026): create_draft_new_thread auto-appends
    # Rayn's real Gmail signature (gmail-api/signature_rayn.html), sign-off included.
    # A cfg["signature"] key, if present, is deliberately ignored.
    parts += [close]
    return "\n".join(parts)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cfg = json.load(open(sys.argv[1]))
    dry = "--dry-run" in sys.argv[1:]

    sys.path.insert(0, cfg["gmail_api_dir"])
    create_new_draft = None
    if not dry:
        from create_draft_new_thread import create_new_draft  # noqa

    cc = cfg.get("cc", [])
    pack_cache = {}
    results = []
    for L in cfg["lenders"]:
        tier = cfg["tiers"][L["tier"]]
        pack_dir = L.get("pack_dir") or tier["pack_dir"]
        if pack_dir not in pack_cache:
            pack_cache[pack_dir] = load_pack(pack_dir, tier.get("expect_files"))
        attachments = pack_cache[pack_dir]
        suffix = L.get("subject_suffix") or tier["subject_suffix"]
        subject = cfg["subject_stem"] + suffix
        body = build_body(cfg, tier, L)
        if dry:
            print("=" * 78)
            print(f"{L['label']}  [{L['tier']}{' COLD' if L.get('cold') else ''}]  "
                  f"to {', '.join(L['to'])}  cc {', '.join(cc)}  | {len(attachments)} attachments")
            print(f"SUBJECT: {subject}")
            print("-" * 78)
            print(body)
        else:
            d = create_new_draft(L["to"], cc, subject, body, attachments)
            print(f"  OK {L['label']:34s} -> draft {d.get('id')}  to {', '.join(L['to'])}")
            results.append({"label": L["label"], "draftId": d.get("id"), "to": L["to"]})
    if not dry:
        print("DONE", len(results), "drafts")


if __name__ == "__main__":
    main()
