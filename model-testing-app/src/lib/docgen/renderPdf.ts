// src/lib/docgen/renderPdf.ts
// HTML -> PDF via headless Chromium. Uses @sparticuz/chromium on serverless
// (Vercel) and a local Chrome via CHROMIUM_EXECUTABLE_PATH in development.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export interface PdfOptions {
  /** Chromium header template (HTML). Enables displayHeaderFooter.
   *  Chromium ignores external CSS; set all styles inline. */
  headerTemplate?: string;
  /** Chromium footer template (HTML). Enables displayHeaderFooter with an empty
   *  header. Use `<span class="pageNumber"></span>` / `totalPages` for page nos. */
  footerTemplate?: string;
  /** Top margin in mm when a header is shown. Default 24. */
  marginTopMm?: number;
  /** Bottom margin in mm when a footer is shown (must fit the footer). Default 24. */
  marginBottomMm?: number;
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
    const hasHeader = !!opts?.headerTemplate;
    const hasFooter = !!opts?.footerTemplate;
    const showHeaderFooter = hasHeader || hasFooter;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: showHeaderFooter,
      headerTemplate: showHeaderFooter ? (opts?.headerTemplate ?? "<span></span>") : undefined,
      footerTemplate: showHeaderFooter ? (opts?.footerTemplate ?? "<span></span>") : undefined,
      margin: {
        top: hasHeader ? `${opts?.marginTopMm ?? 24}mm` : "20mm",
        bottom: hasFooter ? `${opts?.marginBottomMm ?? 24}mm` : "20mm",
        left: "18mm",
        right: "18mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
