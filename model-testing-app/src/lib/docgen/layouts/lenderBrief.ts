// src/lib/docgen/layouts/lenderBrief.ts
// Branded lender-brief layout: assembles a full HTML document from structured
// briefData. Shell fields are escaped; section bodyHtml is injected raw (the
// composer is trusted). Page 1 has an in-body masthead (brief-header). The PDF
// footer is rendered as a Chromium footerTemplate (passed via renderPdf PdfOptions)
// so Chromium reserves the bottom margin on EVERY page — content never flows
// behind the footer band on intermediate pages. Page numbers (Page X of Y) are
// included via Chromium's .pageNumber / .totalPages inject spans.
import { escapeHtml } from "../houseStyle";
import { ROCKCAP_COMPANY } from "../rockcapCompany";
import { BRIEF_CSS, buildBriefFooterTemplate } from "./briefShared";
import type { LenderBriefData } from "../types";

const LENDER_BRIEF_CSS = BRIEF_CSS;

export function buildLenderBriefHtml(data: LenderBriefData): string {
  const c = ROCKCAP_COMPANY;
  const keyFactRows = data.keyFacts
    .map((kf) => `<tr><td class="kf-label">${escapeHtml(kf.label)}</td><td>${escapeHtml(kf.value)}</td></tr>`)
    .join("");
  const sections = data.sections
    .map((s) => `<section class="brief-section"><h2>${escapeHtml(String(s.n))}. ${escapeHtml(s.title)}</h2>${s.bodyHtml}</section>`)
    .join("");
  // Change 3: drop confidentiality token from the meta line; "Strictly Private & Confidential"
  // appears in the in-body masthead header-meta and is the only confidentiality marker.
  const metaline = `${data.meta.borrower}  ·  Prepared by ${data.meta.preparedBy}  ·  ${data.meta.date}`;
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    `<title>${escapeHtml(`${data.title.location} — Lender Brief`)}</title>` +
    `<style>${LENDER_BRIEF_CSS}</style></head><body><main class="brief">` +
    // Change 1: in-body masthead — wordmark left, "Lender Brief / Strictly Private & Confidential" right
    `<div class="brief-header"><div class="brief-wordmark">${escapeHtml(c.wordmark)}</div>` +
    `<div class="brief-header-meta">Lender Brief<br>Strictly Private &amp; Confidential</div></div>` +
    `<div class="brief-title"><h1>${escapeHtml(data.title.location)}</h1>` +
    `<p class="descriptor">${escapeHtml(data.title.descriptor)}</p>` +
    `<p class="metaline">${escapeHtml(metaline)}</p></div>` +
    `<table class="key-facts"><tbody>${keyFactRows}</tbody></table>` +
    sections +
    `<div class="brief-signoff"><div class="name">${escapeHtml(data.signOff.name)}</div>` +
    `<div>${escapeHtml(data.signOff.role)}</div>` +
    `<div class="contact">${escapeHtml(`${data.signOff.email}  |  ${data.signOff.phone}`)}</div></div>` +
    `</main>` +
    `</body></html>`
  );
}

// Chromium footerTemplate (PDF only): the black company band pinned to the bottom of
// the reserved margin, with page numbers. Identical across brief layouts — delegated
// to the shared builder.
export function buildLenderBriefFooterTemplate(): string {
  return buildBriefFooterTemplate();
}
