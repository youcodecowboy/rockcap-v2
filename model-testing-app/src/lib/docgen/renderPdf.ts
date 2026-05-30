// src/lib/docgen/renderPdf.ts
// HTML -> PDF via headless Chromium. Uses @sparticuz/chromium on serverless
// (Vercel) and a local Chrome via CHROMIUM_EXECUTABLE_PATH in development.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export interface PdfOptions {
  /** Bottom margin in mm for Puppeteer's margin option. Default 20. */
  marginBottomMm?: number;
  /** Top margin override in mm. Default 20. */
  marginTopMm?: number;
  /** Left/right margin override in mm. Default 18. */
  marginSideMm?: number;
  /**
   * Chromium footer template HTML. When provided, displayHeaderFooter is set to
   * true and an empty headerTemplate is supplied to suppress the default header.
   * The template has access to Chromium's .pageNumber / .totalPages inject spans.
   * The reserved bottom margin (marginBottomMm) is what physically hosts the band
   * on EVERY page — this is how page-overflow is avoided.
   */
  footerTemplate?: string;
}

async function resolveExecutablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  return await chromium.executablePath();
}

export async function renderHtmlToPdf(html: string, opts?: PdfOptions): Promise<Buffer> {
  const executablePath = await resolveExecutablePath();
  const browser = await puppeteer.launch({
    args: process.env.CHROMIUM_EXECUTABLE_PATH ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const useFooterTemplate = Boolean(opts?.footerTemplate);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: useFooterTemplate,
      ...(useFooterTemplate && {
        headerTemplate: "<span></span>",
        footerTemplate: opts!.footerTemplate,
      }),
      margin: {
        top: `${opts?.marginTopMm ?? 20}mm`,
        bottom: `${opts?.marginBottomMm ?? 20}mm`,
        left: `${opts?.marginSideMm ?? 18}mm`,
        right: `${opts?.marginSideMm ?? 18}mm`,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
