// src/lib/docgen/layouts/clientBrief.ts
// Branded client-brief layout: the borrower-facing counterpart to the lender brief.
// Same branded frame and chrome as the lender brief (shared CSS + footer in
// briefShared.ts) — the difference is the masthead label ("Client Briefing /
// Confidential" rather than "Lender Brief / Strictly Private & Confidential") and the
// section set, which the composer supplies as structured briefData. Shell fields are
// escaped; section bodyHtml is injected raw (the composer is trusted). The PDF footer
// is the shared Chromium footerTemplate (passed via renderPdf PdfOptions) so the
// bottom margin is reserved on EVERY page — content never flows behind the band.
import { escapeHtml } from "../houseStyle";
import { ROCKCAP_COMPANY } from "../rockcapCompany";
import { BRIEF_CSS, buildBriefFooterTemplate } from "./briefShared";
import type { ClientBriefData } from "../types";

const CLIENT_BRIEF_CSS = BRIEF_CSS;

export function buildClientBriefHtml(data: ClientBriefData): string {
  const c = ROCKCAP_COMPANY;
  const keyFactRows = data.keyFacts
    .map((kf) => `<tr><td class="kf-label">${escapeHtml(kf.label)}</td><td>${escapeHtml(kf.value)}</td></tr>`)
    .join("");
  const sections = data.sections
    .map((s) => `<section class="brief-section"><h2>${escapeHtml(String(s.n))}. ${escapeHtml(s.title)}</h2>${s.bodyHtml}</section>`)
    .join("");
  // Confidentiality lives only in the in-body masthead ("Confidential"), mirroring the
  // lender brief's convention — the meta line carries borrower · preparedBy · date.
  const metaline = `${data.meta.borrower}  ·  Prepared by ${data.meta.preparedBy}  ·  ${data.meta.date}`;
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    `<title>${escapeHtml(`${data.title.location} — Client Brief`)}</title>` +
    `<style>${CLIENT_BRIEF_CSS}</style></head><body><main class="brief">` +
    // In-body masthead — wordmark left, "Client Briefing / Confidential" right.
    `<div class="brief-header"><div class="brief-wordmark">${escapeHtml(c.wordmark)}</div>` +
    `<div class="brief-header-meta">Client Briefing<br>Confidential</div></div>` +
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

// PDF footer — identical company band + page numbers as the lender brief.
export function buildClientBriefFooterTemplate(): string {
  return buildBriefFooterTemplate();
}
