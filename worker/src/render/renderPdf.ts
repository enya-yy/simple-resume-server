import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer, {
  type Browser,
  type LaunchOptions,
  type Page,
} from 'puppeteer';

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

function resolveExplicitChromePath(): string | undefined {
  const candidates: string[] = [];
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) candidates.push(fromEnv);

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
  return undefined;
}

function headlessModeFor(executablePath: string | undefined): boolean | 'shell' {
  // chrome-headless-shell 体积更小、仅支持旧版 headless；完整 Chrome 用新版 headless。
  if (!executablePath) return 'shell';
  return /headless[-_]shell/i.test(executablePath) ? 'shell' : true;
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveExplicitChromePath();

  // 显式路径（系统 Chrome 或 PUPPETEER_EXECUTABLE_PATH）优先；否则用 Puppeteer
  // 缓存内的浏览器：先试更轻量的 chrome-headless-shell，缺失时回退完整 Chrome。
  const attempts: LaunchOptions[] = executablePath
    ? [
        {
          headless: headlessModeFor(executablePath),
          executablePath,
          args: PUPPETEER_LAUNCH_ARGS,
          timeout: 60_000,
        },
      ]
    : [
        { headless: 'shell', args: PUPPETEER_LAUNCH_ARGS, timeout: 60_000 },
        { headless: true, args: PUPPETEER_LAUNCH_ARGS, timeout: 60_000 },
      ];

  let lastErr: unknown;
  for (const options of attempts) {
    try {
      return await puppeteer.launch(options);
    } catch (err) {
      lastErr = err;
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Puppeteer launch failed (executable: ${
      executablePath ?? 'puppeteer-managed'
    }): ${detail}`,
  );
}

let sharedBrowserPromise: Promise<Browser> | null = null;

/**
 * 复用同一个浏览器实例：导出是长驻 worker 里的高频操作，每次都冷启动 Chrome
 * 既慢又吃内存。进程内只保留一个 browser，按需开关 page；断连后自动重启。
 */
async function getBrowser(): Promise<Browser> {
  if (sharedBrowserPromise) {
    try {
      const existing = await sharedBrowserPromise;
      if (existing.connected) return existing;
    } catch {
      // 上次启动失败，下面重新启动
    }
    sharedBrowserPromise = null;
  }

  const pending = launchBrowser();
  sharedBrowserPromise = pending;
  try {
    const browser = await pending;
    browser.once('disconnected', () => {
      if (sharedBrowserPromise === pending) {
        sharedBrowserPromise = null;
      }
    });
    return browser;
  } catch (err) {
    if (sharedBrowserPromise === pending) {
      sharedBrowserPromise = null;
    }
    throw err;
  }
}

/** 进程退出时优雅关闭复用的浏览器实例。 */
export async function closeSharedBrowser(): Promise<void> {
  const pending = sharedBrowserPromise;
  sharedBrowserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // 进程即将退出，关闭失败忽略
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

/**
 * 通过 file:// 临时文件加载 HTML，而非 page.setContent()。
 *
 * setContent 生成的是 about:blank 文档，Chrome 出于安全会拒绝从中加载 file://
 * 子资源（@font-face 的本地字体永远不会被请求），导致内嵌字体失效——在没有系统
 * 中文字体的服务器（如 Ubuntu）上中文直接渲染为空白。改用 file:// 页面后，文档源
 * 即为 file://，本地字体才允许加载。返回值用于清理临时文件。
 */
async function loadHtmlPage(page: Page, html: string): Promise<() => void> {
  await page.setViewport({
    width: RP_A4_WIDTH_PX,
    height: 900,
    deviceScaleFactor: 1,
  });
  const dir = mkdtempSync(join(tmpdir(), 'resume-export-'));
  const file = join(dir, 'page.html');
  writeFileSync(file, html, 'utf8');
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // 临时文件清理失败不应影响导出
    }
  };
  try {
    await page.goto(pathToFileURL(file).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
  } catch (err) {
    cleanup();
    throw err;
  }
  return cleanup;
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
  const browser = await getBrowser();
  const measurePage = await openExportPage(browser);
  let cleanupMeasure: (() => void) | null = null;
  try {
    cleanupMeasure = await loadHtmlPage(measurePage, measureHtml);
    const totalHeight = await measurePreviewTotalHeight(measurePage);
    const layout = computePageLayoutFromTotalHeight(totalHeight);
    const paginatedHtml = buildPaginatedExportHtml(parts, layout.pages);

    const printPage = await openExportPage(browser);
    let cleanupPrint: (() => void) | null = null;
    try {
      cleanupPrint = await loadHtmlPage(printPage, paginatedHtml);
      return await printLoadedPage(printPage);
    } finally {
      cleanupPrint?.();
      if (!printPage.isClosed()) {
        await printPage.close();
      }
    }
  } finally {
    cleanupMeasure?.();
    if (!measurePage.isClosed()) {
      await measurePage.close();
    }
  }
}

/** @deprecated 请使用 {@link renderResumeExportPartsToPdf}，以与预览分页一致。 */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await openExportPage(browser);
  let cleanup: (() => void) | null = null;
  try {
    cleanup = await loadHtmlPage(page, html);
    return await printLoadedPage(page);
  } finally {
    cleanup?.();
    if (!page.isClosed()) {
      await page.close();
    }
  }
}
