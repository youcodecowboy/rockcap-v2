# Contact ↔ company linkage audit and fix

Created: 2026-04-17
Status: done
Tags: #hubspot #data #bug
Source:
  - - 2026-04-17 — contacts still largely unlinked to companies — examine contact↔company ID linkage and ensure they connect (companies themselves now appear correctly)
Priority: high

## Notes

Shipped 2026-04-17 — commit 8ec9c5a: three-layer fix (getByClient union, forward-fix in linkContactAssociations, backfillContactClientLinks + contactLinkageStats mutations). Back-fill patched 46/4275 contacts.
