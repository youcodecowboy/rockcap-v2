# Desktop ClientsSidebar — fix nested <button> hydration error

Created: 2026-04-17
Status: done
Tags: #desktop #bug
Source:
  - 2026-04-17 — [bug] Next.js hydration error on desktop clients page: "In HTML, <button> cannot be a descendant of <button>" — SelectTrigger (src/components/ui/select.tsx:36) inside EditableClientTypeBadge (src/components/EditableClientTypeBadge.tsx:127) is rendered inside the ClientList row <button> at src/app/(desktop)/clients/components/ClientsSidebar.tsx:395 (Next 16.0.7 / Webpack)
  - 2026-04-17 — [bug] Second console error on desktop clients page: "<button> cannot contain a nested <button>" — stack points at the outer row <button> at src/app/(desktop)/clients/components/ClientsSidebar.tsx:348 inside ClientList (same root cause as the SelectTrigger-in-button bug; row button wraps nested interactive controls). Next 16.0.7 / Webpack
Priority: high

## Notes

Shipped 2026-04-17 — commit 5567742: replaced outer <button> with <div role='button' tabIndex={0}> + onKeyDown handler for Enter/Space activation. Added focus-visible ring for keyboard users.
