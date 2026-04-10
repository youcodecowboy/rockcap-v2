# Review: Mobile Document Library Design

**Reviewed spec:** `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md`

## Findings

### High: The spec's read-focused scope conflicts with the actions already exposed by the shared mobile docs primitives

The spec describes mobile docs as a read-focused surface and explicitly pushes filing, moving, and bulk operations back to desktop. The current `m-docs` implementation already exposes move, duplicate, and delete actions in both folder views and flat Internal/Personal lists through the shared file-row action sheet.

Relevant references:
- Spec read-focused scope: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:7`
- Spec out-of-scope move/bulk rules: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:322`
- Spec out-of-scope move/bulk rules: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:323`
- Internal/Personal destructive actions: `src/app/(mobile)/m-docs/components/DocsList.tsx:33`
- Internal/Personal file-row wiring: `src/app/(mobile)/m-docs/components/DocsList.tsx:260`
- Folder view destructive actions: `src/app/(mobile)/m-docs/components/FolderContents.tsx:54`
- Folder view move sheet wiring: `src/app/(mobile)/m-docs/components/FolderContents.tsx:188`
- Shared action sheet menu: `src/app/(mobile)/m-docs/components/shared/FileRow.tsx:47`
- Mobile move mutation: `src/app/(mobile)/m-docs/components/MoveFileSheet.tsx:44`

Impact:
- The acceptance criteria say one thing while the current mobile behavior allows another.
- A spec-driven refactor can easily preserve or reintroduce actions the design document claims are excluded.

Recommendation:
- Either document a constrained mobile-docs mode that disables `move`, `duplicate`, and `delete`, or update the scope section so it matches the behavior that is intentionally allowed on mobile.

### High: The DocumentViewer layout contract does not match how the current mobile shell renders it

The spec defines Screen 4 as a full-screen bottom-sheet overlay that covers the entire viewport and sits on top of the current screen. The current implementation does not do that. `DocsContent` replaces the route content with `DocumentViewer`, while `MobileShell` keeps the global header, tab strip, and sticky footer mounted around it. `DocumentViewer` then adds its own fixed action footer above the global footer instead of covering it.

Relevant references:
- Spec screen description: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:15`
- Spec full-screen overlay language: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:149`
- Spec overlay navigation rule: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:290`
- Spec styling rule: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:302`
- Current viewer replacement behavior: `src/app/(mobile)/m-docs/components/DocsContent.tsx:65`
- Current viewer render path: `src/app/(mobile)/m-docs/components/DocsContent.tsx:67`
- Persistent shell chrome: `src/components/mobile/MobileShell.tsx:11`
- Viewer fixed footer above bottom nav: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:165`
- Global sticky footer: `src/components/mobile/StickyFooter.tsx:34`

Impact:
- The spec currently gives the wrong container model for layout, safe-area spacing, and back/close behavior.
- Reviewers cannot tell whether the global mobile chrome should remain visible while a document is open.

Recommendation:
- Pick one contract and make the spec explicit. If the viewer should be a true overlay, call out how `MobileHeader`, `TabManager`, and `StickyFooter` are suppressed. If the current shell-preserving behavior is intended, rewrite the viewer section accordingly.

### High: The tab model is inconsistent with the current viewer contract

The spec says the viewer ships six tabs, with `Classification` and `Details` as separate destinations. The current mobile viewer exposes only five tabs and renders `ClassificationTab` inside the `Details` tab body. That means the navigation model, in-scope statement, and component breakdown are overstating what actually exists.

Relevant references:
- Spec tab order: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:176`
- Spec all-6-tabs scope statement: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:314`
- Current tab union: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:17`
- Current tab list: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:19`
- Classification rendered inside details: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:151`

Impact:
- A literal implementation of the spec creates a different navigation surface than the one currently shipped.
- QA and design review will fail against different expectations even when the underlying data is already present.

Recommendation:
- Either split `Classification` into its own tab in both design and implementation, or revise the spec to describe the current five-tab viewer with classification content grouped under `Details`.

### Medium: The Notes tab is documented as read-only even though mobile already supports note creation

The spec says the Notes tab is display-only and pushes note creation to future work. The current mobile tab already queries `documentNotes` and posts new notes from an inline composer.

Relevant references:
- Spec notes behavior: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:238`
- Spec note-creation out of scope: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:325`
- Current notes query: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx:28`
- Current notes create mutation: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx:31`
- Current inline composer: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx:55`

Impact:
- The spec currently treats an already-shipped mobile capability as future work.
- Following the spec literally would regress mobile behavior unless that regression is intentional.

Recommendation:
- Either bring note creation into scope and document the existing `documentNotes.create` flow, or explicitly state that mobile note creation is being removed and why.

### Medium: The viewer action model is missing current mobile affordances and places actions in a different location

The spec puts `Download` and `Open in browser` below the Preview tab and does not mention the current `Send to message` or `Add to tabs` affordances. The implementation keeps file actions in a fixed footer across viewer tabs and exposes the messaging shortcut in the header.

Relevant references:
- Spec preview actions: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:193`
- Spec preview actions: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:195`
- Current send-to-message action: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:52`
- Current add-to-tabs action: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:65`
- Current header button: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:101`
- Current fixed footer actions: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:165`

Impact:
- A spec-driven rewrite can accidentally drop existing messaging/tab-management affordances.
- Action placement decisions will not line up with the current shell and footer constraints.

Recommendation:
- Decide whether `Send to message` and `Add to tabs` are part of the intended mobile contract. If they are, add them to the spec and define which actions are fixed versus tab-local. If they are not, mark their removal as an intentional product change.

## Open Questions

### Is spreadsheet preview intentionally supported on mobile?

The current preview tab handles spreadsheet files via `XlsxPreview`, while the spec treats non-image, non-PDF formats as no-preview fallbacks.

Relevant references:
- Spec preview rules: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:189`
- Current XLS/XLSX preview support: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/PreviewTab.tsx:9`
- Current preview branching: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/PreviewTab.tsx:83`

### Should flat Internal/Personal document lists reuse the same action sheet as folder views?

The current shared `FileRow` menu exposes operational actions whenever handlers are passed, but the spec treats Internal/Personal as simple flat browse lists.

Relevant references:
- Spec flat list description: `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:46`
- Shared action sheet: `src/app/(mobile)/m-docs/components/shared/FileRow.tsx:47`
- Internal list action wiring: `src/app/(mobile)/m-docs/components/DocsList.tsx:260`

## Summary

The strongest issues are structural, not cosmetic:

- the scope section says read-only, but current mobile docs still expose operational file actions
- the viewer is specified as a true full-screen overlay, while the current shell renders it as page content under persistent mobile chrome
- the spec promises six tabs, but the shipped viewer only exposes five
- the notes and viewer-action sections are stale relative to the mobile behavior already in the repo
