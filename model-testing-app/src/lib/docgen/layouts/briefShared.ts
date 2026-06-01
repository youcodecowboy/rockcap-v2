// src/lib/docgen/layouts/briefShared.ts
// Shared chrome for the RockCap branded brief layouts (lender-brief, client-brief).
// Both briefs are visually identical — same masthead frame, key-facts block, section
// typography, black page-footer band, and RM sign-off — and differ only in the
// masthead label and their section set. The CSS and the PDF footerTemplate live here
// so the two layouts cannot drift apart; each layout file builds its own masthead.
import { ROCKCAP_COMPANY } from "../rockcapCompany";

// Shared brief CSS. Kept byte-identical to the original lender-brief CSS so existing
// layout snapshots/assertions hold; both layouts emit the same <style> block.
export const BRIEF_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #141414; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main.brief { font-size: 10.5pt; line-height: 1.5; }
  .brief-header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #141414; padding-bottom: 10px; margin-bottom: 18px; }
  .brief-wordmark { font-size: 22pt; font-weight: 400; letter-spacing: -0.01em; }
  .brief-header-meta { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; text-align: right; line-height: 1.4; }
  .brief-title h1 { font-size: 19pt; letter-spacing: 0.01em; text-transform: uppercase; margin: 0 0 2px; }
  .brief-title .descriptor { font-size: 12pt; color: #3a3a3a; margin: 0 0 4px; }
  .brief-title .metaline { font-family: ui-monospace, monospace; font-size: 8.5pt; color: #6b6b6b; margin: 0; }
  table.key-facts { width: 100%; border-collapse: collapse; margin: 16px 0 22px; }
  table.key-facts td { padding: 5px 0; vertical-align: top; border-bottom: 1px solid #ededed; }
  table.key-facts td.kf-label { width: 220px; font-family: ui-monospace, monospace; font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b; }
  section.brief-section { margin: 18px 0; }
  section.brief-section > h2 { font-size: 12.5pt; margin: 0 0 7px; padding-bottom: 4px; border-bottom: 1px solid #d9d9d9; }
  section.brief-section p { margin: 0 0 8px; }
  .brief-section table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; }
  .brief-section th { text-align: left; font-family: ui-monospace, monospace; font-size: 7.5pt; letter-spacing: 0.05em; text-transform: uppercase; color: #6b6b6b; border-bottom: 1.5px solid #141414; padding: 5px 8px; }
  .brief-section td { padding: 5px 8px; border-bottom: 1px solid #ededed; vertical-align: top; }
  .brief-section td.num, .brief-section th.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
  .brief-section .caption { font-size: 8pt; color: #8a8a8a; margin-top: -4px; }
  .brief-section .sub { display: block; font-size: 8pt; color: #8a8a8a; margin-top: 1px; }
  .brief-section svg { width: 100%; height: auto; display: block; margin: 6px 0 10px; }
  .brief-section em { font-style: italic; color: #6b6b6b; }
  .brief-signoff { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d9d9d9; margin-bottom: 8px; }
  .brief-signoff .name { font-weight: 600; }
  .brief-signoff .contact { font-family: ui-monospace, monospace; font-size: 9pt; color: #6b6b6b; }
  /* Block cohesion: a section is one unit — its heading must never sit at a page
     bottom with the body overleaf. Sections taller than a page still break (the
     engine ignores break-inside:avoid when it cannot fit), but break-after on the
     h2 keeps the heading with its first content and tables never split. Operator
     rule: prefer whole-block placement over tight page-fill, even at the cost of
     some bottom whitespace. */
  section.brief-section { break-inside: avoid; }
  section.brief-section > h2 { break-after: avoid; }
  .brief-section table, .brief-section thead, .brief-section tr { break-inside: avoid; }
  .brief-section p { orphans: 2; widows: 2; }
  .brief-signoff { break-inside: avoid; break-before: avoid; }
`;

// Chromium footerTemplate (PDF only): outer flex container fills the reserved bottom
// margin (height:100%); align-items:flex-end pins the 11mm black band to the very
// bottom of the footer area, leaving empty white space above — this creates a gap
// between the last content line and the band on every page.
// Chromium quirks handled: explicit font-size (default is 0), exact color print.
// Identical for every brief layout — the company legal line + page numbers.
export function buildBriefFooterTemplate(): string {
  const c = ROCKCAP_COMPANY;
  const legal = [c.legalName, c.registeredOffice, c.companyNo ? `Co. No. ${c.companyNo}` : "", c.website]
    .filter(Boolean)
    .join("  ·  ");
  return (
    `<div style="height:100%;width:100%;margin:0;padding:0;display:flex;align-items:flex-end;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;">` +
    `<div style="width:100%;height:11mm;box-sizing:border-box;background:#141414;color:#ffffff;display:flex;` +
    `align-items:center;justify-content:space-between;padding:0 18mm;` +
    `font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:8.5pt;letter-spacing:0.03em;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;">` +
    `<span>${legal}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>` +
    `</div>`
  );
}
