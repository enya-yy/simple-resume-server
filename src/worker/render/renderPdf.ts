import puppeteer, { type Page } from "puppeteer";

import {
  buildMeasureExportHtml,
  buildPaginatedExportHtml,
  type ResumeExportParts,
} from "./buildResumeExportHtml.js";
import {
  RP_A4_WIDTH_PX,
  computePageLayoutFromTotalHeight,
} from "./computeResumePageLayout.js";

async function measurePreviewTotalHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="resume-preview-root"]',
    ) as HTMLElement | null;
    if (!el) {
      return 0;
    }
    return Math.ceil(
      Math.max(el.scrollHeight, el.getBoundingClientRect().height),
    );
  });
}

async function printHtmlPage(page: Page, html: string): Promise<Buffer> {
  await page.setViewport({
    width: RP_A4_WIDTH_PX,
    height: 900,
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  return Buffer.from(pdf);
}

/** 与聊天预览同一套 A4 硬切 + 36px 页间安全边距。 */
export async function renderResumeExportPartsToPdf(
  parts: ResumeExportParts,
): Promise<Buffer> {
  const measureHtml = buildMeasureExportHtml(parts);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--font-render-hinting=none",
    ],
  });
  try {
    const page = await browser.newPage();
    await printHtmlPage(page, measureHtml);
    const totalHeight = await measurePreviewTotalHeight(page);
    const layout = computePageLayoutFromTotalHeight(totalHeight);
    const paginatedHtml = buildPaginatedExportHtml(parts, layout.pages);
    return printHtmlPage(page, paginatedHtml);
  } finally {
    await browser.close();
  }
}

/** @deprecated 请使用 {@link renderResumeExportPartsToPdf}，以与预览分页一致。 */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--font-render-hinting=none",
    ],
  });
  try {
    const page = await browser.newPage();
    return printHtmlPage(page, html);
  } finally {
    await browser.close();
  }
}
