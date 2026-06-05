import { accessSync, constants, existsSync, readFileSync } from 'node:fs';

import puppeteer, { type Browser, type Page } from 'puppeteer';

import {
  buildMeasureExportHtml,
  buildPaginatedExportHtml,
  type ResumeExportParts,
} from './buildResumeExportHtml.js';
import {
  RP_A4_WIDTH_PX,
  computePageLayoutFromTotalHeight,
} from './computeResumePageLayout.js';

const BLOCKED_FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const PUPPETEER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

function isUsableChromeBinary(path: string): boolean {
  if (!path || !existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
  } catch {
    return false;
  }
  try {
    const head = readFileSync(path, { encoding: 'utf8' }).slice(0, 256);
    // Ubuntu chromium-browser 常为 snap 包装脚本，Puppeteer 无法直接启动。
    if (head.startsWith('#!')) return false;
  } catch {
    return false;
  }
  return true;
}

function resolveChromeExecutablePath(): string {
  const candidates: string[] = [];
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) candidates.push(fromEnv);

  try {
    const bundled = puppeteer.executablePath();
    if (bundled) candidates.push(bundled);
  } catch {
    // puppeteer cache may be empty
  }

  for (const system of [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ]) {
    candidates.push(system);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (isUsableChromeBinary(candidate)) return candidate;
  }

  throw new Error(
    `No usable Chrome/Chromium binary found (tried: ${[...seen].join(', ')}). ` +
      'Run puppeteer browsers install chrome or set PUPPETEER_EXECUTABLE_PATH.',
  );
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveChromeExecutablePath();
  try {
    return await puppeteer.launch({
      headless: true,
      executablePath,
      args: PUPPETEER_LAUNCH_ARGS,
      timeout: 60_000,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Puppeteer launch failed (executable: ${executablePath}): ${detail}`,
      { cause: err },
    );
  }
}

async function openExportPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const host = (() => {
      try {
        return new URL(req.url()).host;
      } catch {
        return '';
      }
    })();
    if (BLOCKED_FONT_HOSTS.some((h) => host.includes(h))) {
      void req.abort();
      return;
    }
    void req.continue();
  });
  return page;
}

async function loadHtmlPage(page: Page, html: string): Promise<void> {
  await page.setViewport({
    width: RP_A4_WIDTH_PX,
    height: 900,
    deviceScaleFactor: 1,
  });
  await page.setContent(html, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

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

async function printLoadedPage(page: Page): Promise<Buffer> {
  const pdf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    scale: 1,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  return Buffer.from(pdf);
}

/** 与聊天预览同一套 A4 硬切 + 36px 页间安全边距。 */
export async function renderResumeExportPartsToPdf(
  parts: ResumeExportParts,
): Promise<Buffer> {
  const measureHtml = buildMeasureExportHtml(parts);
  const browser = await launchBrowser();
  try {
    const measurePage = await openExportPage(browser);
    try {
      await loadHtmlPage(measurePage, measureHtml);
      const totalHeight = await measurePreviewTotalHeight(measurePage);
      const layout = computePageLayoutFromTotalHeight(totalHeight);
      const paginatedHtml = buildPaginatedExportHtml(parts, layout.pages);

      const printPage = await openExportPage(browser);
      try {
        await loadHtmlPage(printPage, paginatedHtml);
        return await printLoadedPage(printPage);
      } finally {
        if (!printPage.isClosed()) {
          await printPage.close();
        }
      }
    } finally {
      if (!measurePage.isClosed()) {
        await measurePage.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/** @deprecated 请使用 {@link renderResumeExportPartsToPdf}，以与预览分页一致。 */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await openExportPage(browser);
    try {
      await loadHtmlPage(page, html);
      return await printLoadedPage(page);
    } finally {
      if (!page.isClosed()) {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
