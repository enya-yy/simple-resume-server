import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isSidebarTemplateId,
  resumeMarkdownToSafeHtml,
  type ResumeDocument,
  type ResumeModule,
  type ResumeSectionItem,
  type ResumeTemplateId,
} from '../../contracts/index';

import type { ResumePageViewport } from './computeResumePageLayout.js';

const PDF_EXPORT_STYLE = `
@page { size: 595px ${595 * Math.SQRT2}px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.rpp-export-pages { display: flex; flex-direction: column; align-items: flex-start; }
.rpp-page-frame { page-break-after: always; break-after: page; width: 595px; }
.rpp-page-frame:last-child { page-break-after: auto; break-after: auto; }
.rpp-page-viewport { box-sizing: border-box; width: 595px; padding: 0; overflow: hidden; background: #fff; }
.rpp-page-viewport--first { padding: 0 0 36px; }
.rpp-page-viewport--middle { padding: 36px 0; }
.rpp-page-viewport--last { padding: 36px 0 0; }
.rpp-page-clip { overflow: hidden; position: relative; }
.rpp-page-shift { width: 595px; }
.rp-root { box-shadow: none; border-radius: 0; width: 595px; min-height: 0; aspect-ratio: unset; height: auto; }
`;

export type ResumeExportParts = {
  rootClass: string;
  templateBody: string;
};

function monorepoRoot(): string {
  return join(__dirname, '../../../..');
}

function loadResumePreviewCss(): string {
  const candidates = [
    join(monorepoRoot(), 'web/src/styles/resume-preview.css'),
    join(__dirname, 'resume-preview.css'),
    join(__dirname, '../../../src/worker/render/resume-preview.css'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error(
    `resume-preview.css not found (tried: ${candidates.join(', ')})`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function md(text: string): string {
  return resumeMarkdownToSafeHtml(text ?? '');
}

function effectiveLayoutOptions(doc: ResumeDocument) {
  const lo = doc.layoutOptions;
  if (isSidebarTemplateId(doc.templateId)) {
    return { ...lo, pageMargin: 'standard' as const };
  }
  return lo;
}

function rpRootClass(doc: ResumeDocument): string {
  const lo = effectiveLayoutOptions(doc);
  const fs = ['rp-fs-0', 'rp-fs-1', 'rp-fs-2'][lo.fontSizeStep] ?? 'rp-fs-1';
  const margin =
    lo.pageMargin === 'compact' ? 'rp-margin-compact' : 'rp-margin-standard';
  const lhMap: Record<string, string> = {
    tight: 'rp-lh-tight',
    normal: 'rp-lh-normal',
    relaxed: 'rp-lh-relaxed',
  };
  const lh = lhMap[lo.bodyLineHeight] ?? 'rp-lh-normal';
  return [
    'rp-root',
    fs,
    margin,
    lh,
    `rp-tpl-${doc.templateId}`,
    `resume-preview-root--${doc.templateId}`,
  ].join(' ');
}

function resumePreviewRootMarkup(rootClass: string, templateBody: string): string {
  return `<div class="${rootClass}" data-testid="resume-preview-root">${templateBody}</div>`;
}

function pageFrameMarkup(
  rootClass: string,
  templateBody: string,
  page: ResumePageViewport,
): string {
  const roleClass = `rpp-page-viewport--${page.role}`;
  const root = resumePreviewRootMarkup(rootClass, templateBody);
  return `<div class="rpp-page-frame">
<div class="rpp-page-viewport ${roleClass}" style="height:${page.viewportHeight}px">
<div class="rpp-page-clip" style="height:${page.sliceHeight}px">
<div class="rpp-page-shift" style="transform:translateY(${-page.offsetY}px)">
${root}
</div>
</div>
</div>
</div>`;
}

function wrapExportHtml(rootClass: string, body: string): string {
  const css = loadResumePreviewCss();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
${css}
${PDF_EXPORT_STYLE}
</style>
</head>
<body>
${resumePreviewRootMarkup(rootClass, body)}
</body>
</html>`;
}

export function buildPaginatedExportHtml(
  parts: ResumeExportParts,
  pages: ResumePageViewport[],
): string {
  const css = loadResumePreviewCss();
  const frames = pages
    .map((p) => pageFrameMarkup(parts.rootClass, parts.templateBody, p))
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
${css}
${PDF_EXPORT_STYLE}
</style>
</head>
<body>
<div class="rpp-export-pages">
${frames}
</div>
</body>
</html>`;
}

const DATE_RANGE_RE =
  /^(\d{4}[./-]\d{1,2}(?:\s*[-–—至]\s*(?:\d{4}[./-]\d{1,2}|至今))?|至今\s*[-–—至]\s*\d{4}[./-]\d{1,2}|\d{4}\s*[-–—至~]\s*(?:\d{4}|至今))/;

function isDateRange(text: string): boolean {
  return DATE_RANGE_RE.test(text.trim());
}

const FLAT_EDUCATION_TITLE_SEP = /\s*[·•|]\s*/;

function parseLegacyFlatEducationTitle(title: string): {
  school: string;
  degree: string;
  dateRange: string;
} | null {
  const trimmed = title.trim();
  if (!trimmed || !FLAT_EDUCATION_TITLE_SEP.test(trimmed)) {
    return null;
  }
  const parts = trimmed.split(FLAT_EDUCATION_TITLE_SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  let dateRange = '';
  const last = parts[parts.length - 1]!;
  if (isDateRange(last)) {
    dateRange = parts.pop()!;
  }
  const school = parts.shift() ?? trimmed;
  const degree = parts.join(' · ');
  return { school, degree, dateRange };
}

function parseEducationEntry(item: ResumeSectionItem) {
  const bullets = [...item.bullets];
  let degree = bullets.shift()?.trim() ?? '';
  let dateRange = '';
  if (bullets.length > 0 && isDateRange(bullets[0]!)) {
    dateRange = bullets.shift()!.trim();
  }
  return {
    school: item.title.trim() || '（学校）',
    degree,
    dateRange,
    extras: bullets,
  };
}

function parseYearLeadEntry(item: ResumeSectionItem) {
  const bullets = [...item.bullets];
  let dateVal = '';
  if (bullets.length > 0 && isDateRange(bullets[0]!)) {
    dateVal = bullets.shift()!.trim();
  } else if (bullets.length > 0 && /^\d{4}/.test(bullets[0]!)) {
    dateVal = bullets.shift()!.trim();
  }
  return { dateVal, bullets };
}

function parseMainSectionEntry(
  sectionType: ResumeModule['type'],
  item: ResumeSectionItem,
) {
  if (sectionType === 'education') {
    const hasBullets = item.bullets.some((b) => b.trim().length > 0);
    if (!hasBullets) {
      const legacy = parseLegacyFlatEducationTitle(item.title);
      if (legacy) {
        return {
          title: legacy.school || '（学校）',
          dateVal: legacy.dateRange,
          metaLines: legacy.degree ? [legacy.degree] : [],
          bullets: [] as string[],
        };
      }
      return {
        title: item.title.trim() || '（学校）',
        dateVal: '',
        metaLines: [] as string[],
        bullets: [] as string[],
      };
    }
    const edu = parseEducationEntry(item);
    return {
      title: edu.school,
      dateVal: edu.dateRange,
      metaLines: edu.degree ? [edu.degree] : [],
      bullets: edu.extras,
    };
  }
  const e = parseYearLeadEntry(item);
  return {
    title: item.title.trim() || '（未命名条目）',
    dateVal: e.dateVal,
    metaLines: [] as string[],
    bullets: e.bullets,
  };
}

function mainItemMetaHtml(metaLines: string[], className: string): string {
  return metaLines
    .map((m) => `<p class="${className}">${escapeHtml(m)}</p>`)
    .join('');
}

function sectionTypeEnLabel(type: ResumeModule['type']): string {
  switch (type) {
    case 'experience':
      return 'Work Experience';
    case 'education':
      return 'Education';
    case 'project':
      return 'Project Showcases';
    case 'skill':
      return 'Core Skills';
    case 'custom':
      return 'Additional Notes';
    default:
      return '';
  }
}

function sortedSections(sections: ResumeModule[]): ResumeModule[] {
  return [...sections].sort((a, b) => a.order - b.order);
}

function buildClassicTemplateBody(doc: ResumeDocument): string {
  const b = doc.basics;
  const header = `<header class="rp-classic__header"><h1 class="rp-classic__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>${b.headline.trim() ? `<p class="rp-classic__headline">${escapeHtml(b.headline)}</p>` : ''}<div class="rp-classic__contacts">${b.phone.trim() ? `<span class="rp-classic__contact"><span class="rp-classic__contact-icon">☎</span>${escapeHtml(b.phone)}</span>` : ''}${b.email.trim() ? `<span class="rp-classic__contact"><span class="rp-classic__contact-icon">✉</span><span class="rp-classic__email">${escapeHtml(b.email)}</span></span>` : ''}${b.location.trim() ? `<span class="rp-classic__contact"><span class="rp-classic__contact-icon">⌖</span>${escapeHtml(b.location)}</span>` : ''}</div></header>`;
  const summary = b.summary.trim()
    ? `<section class="rp-classic__summary-block"><div class="rp-classic__summary-label">个人简介 · Profile Summary</div><p class="rp-classic__summary-text rp-md">${md(b.summary)}</p></section>`
    : '';
  const sectionsHtml = sortedSections(doc.sections)
    .filter((s) => s.items.length > 0)
    .map((section) => {
      const items = section.items
        .map((item) => {
          const e = parseMainSectionEntry(section.type, item);
          const bullets = e.bullets.length
            ? `<ul class="rp-classic__bullet-list">${e.bullets
                .map(
                  (bl) =>
                    `<li class="rp-classic__bullet"><span class="rp-classic__bullet-marker"></span><span class="rp-classic__bullet-text"><span class="rp-md">${md(bl)}</span></span></li>`,
                )
                .join('')}</ul>`
            : '';
          const meta = mainItemMetaHtml(e.metaLines, 'rp-classic__item-meta');
          return `<div class="rp-classic__item"><div class="rp-classic__item-head"><div class="rp-classic__item-head-main"><h3 class="rp-classic__item-title">${escapeHtml(e.title)}</h3>${meta}</div>${e.dateVal ? `<span class="rp-classic__item-date">${escapeHtml(e.dateVal)}</span>` : ''}</div>${bullets}</div>`;
        })
        .join('');
      return `<section class="rp-classic__section"><h2 class="rp-classic__section-title"><span>${escapeHtml(section.title)}</span><span class="rp-classic__section-en">${sectionTypeEnLabel(section.type)}</span></h2><div class="rp-classic__items">${items}</div></section>`;
    })
    .join('');
  return `<div id="resume-classic" class="rp-classic">${header}${summary}<div class="rp-classic__sections">${sectionsHtml}</div></div>`;
}

function buildMinimalDualTemplateBody(doc: ResumeDocument): string {
  const b = doc.basics;
  const sections = sortedSections(doc.sections);
  const sidebar = sections.filter((s) => s.type === 'skill' || s.type === 'custom');
  const main = sections.filter((s) => s.type !== 'skill' && s.type !== 'custom');

  const identity = `<div class="rp-modern__identity"><h1 class="rp-modern__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>${b.headline.trim() ? `<p class="rp-modern__headline">${escapeHtml(b.headline)}</p>` : ''}</div>`;
  const contacts = `<div class="rp-modern__contacts-panel"><div class="rp-modern__contacts-label">联系方式 · Contacts</div><div class="rp-modern__contacts-list">${b.phone.trim() ? `<div class="rp-modern__contact-row"><span class="rp-modern__contact-icon">☎</span><span>${escapeHtml(b.phone)}</span></div>` : ''}${b.email.trim() ? `<div class="rp-modern__contact-row"><span class="rp-modern__contact-icon">✉</span><span class="rp-modern__email">${escapeHtml(b.email)}</span></div>` : ''}${b.location.trim() ? `<div class="rp-modern__contact-row"><span class="rp-modern__contact-icon">⌖</span><span>${escapeHtml(b.location)}</span></div>` : ''}</div></div>`;

  const sidebarHtml = sidebar
    .filter((s) => s.items.length > 0)
    .map((section) => {
      const items = section.items
        .map((item) => {
          const title = item.title.trim()
            ? `<h3 class="rp-modern__sidebar-item-title"><span class="rp-modern__sidebar-dot"></span><span>${escapeHtml(item.title)}</span></h3>`
            : '';
          const bullets = item.bullets
            .map((bl) => {
              if (section.type === 'skill' && /[、,，]/.test(bl)) {
                const tags = bl.split(/[、,，]\s*/).filter(Boolean);
                return `<div class="rp-modern__skill-tags">${tags.map((t) => `<span class="rp-modern__skill-tag">${escapeHtml(t)}</span>`).join('')}</div>`;
              }
              return `<p class="rp-modern__sidebar-bullet"><span class="rp-modern__sidebar-bullet-dot">•</span><span class="rp-md">${md(bl)}</span></p>`;
            })
            .join('');
          return `<div class="rp-modern__sidebar-item">${title}${bullets}</div>`;
        })
        .join('');
      return `<section class="rp-modern__sidebar-section"><h2 class="rp-modern__sidebar-title">${escapeHtml(section.title)}</h2><div class="rp-modern__sidebar-items">${items}</div></section>`;
    })
    .join('');

  const summary = b.summary.trim()
    ? `<section class="rp-modern__summary"><p class="rp-modern__summary-text rp-md">${md(b.summary)}</p></section>`
    : '';

  const mainHtml = main
    .filter((s) => s.items.length > 0)
    .map((section) => {
      const icon =
        section.type === 'experience'
          ? '💻'
          : section.type === 'education'
            ? '📖'
            : section.type === 'project'
              ? '📚'
              : '⚙';
      const suffix = section.id.split('-')[1]?.toUpperCase() ?? '';
      const items = section.items
        .map((item) => {
          const e = parseMainSectionEntry(section.type, item);
          const bullets = e.bullets.length
            ? `<ul class="rp-modern__bullet-list">${e.bullets
                .map(
                  (bl) =>
                    `<li class="rp-modern__bullet"><span class="rp-modern__bullet-marker"></span><span class="rp-md">${md(bl)}</span></li>`,
                )
                .join('')}</ul>`
            : '';
          const meta = mainItemMetaHtml(e.metaLines, 'rp-modern__main-item-meta');
          return `<div class="rp-modern__main-item"><div class="rp-modern__main-item-head"><div class="rp-modern__main-item-head-main"><h3 class="rp-modern__main-item-title">${escapeHtml(e.title)}</h3>${meta}</div>${e.dateVal ? `<span class="rp-modern__main-item-date">${escapeHtml(e.dateVal)}</span>` : ''}</div>${bullets}</div>`;
        })
        .join('');
      return `<section class="rp-modern__main-section"><h2 class="rp-modern__main-title"><span class="rp-modern__main-title-left"><span class="rp-modern__main-icon">${icon}</span><span>${escapeHtml(section.title)}</span></span><span class="rp-modern__main-title-suffix">${escapeHtml(suffix)}</span></h2><div class="rp-modern__main-items">${items}</div></section>`;
    })
    .join('');

  return `<div id="resume-modern" class="rp-modern"><div class="rp-modern__accent"></div><div class="rp-modern__grid"><aside class="rp-modern__sidebar">${identity}${contacts}${sidebarHtml}</aside><div class="rp-modern__main">${summary}${mainHtml}</div></div></div>`;
}

function nameInitialChar(fullName: string): string {
  const n = fullName.trim();
  if (!n) {
    return '·';
  }
  const asciiParts = n.split(/\s+/).filter(Boolean);
  if (asciiParts.length >= 2 && /^[\x20-\x7F]+$/.test(n)) {
    return `${asciiParts[0]!.charAt(0)}${asciiParts[1]!.charAt(0)}`.toUpperCase();
  }
  return n.charAt(0);
}

function buildExecutiveDarkTemplateBody(doc: ResumeDocument): string {
  const b = doc.basics;
  const sections = sortedSections(doc.sections);
  const sidebar = sections.filter((s) => s.type !== 'experience' && s.type !== 'project');
  const main = sections.filter((s) => s.type === 'experience' || s.type === 'project');
  const initial = escapeHtml(nameInitialChar(b.fullName.trim() || '（姓名）'));

  const contacts = `<div class="rp-exec__contacts"><h3 class="rp-exec__contacts-label">联系方式</h3>${b.email.trim() ? `<div class="rp-exec__contact-row"><span class="rp-exec__contact-icon">✉</span><span class="rp-exec__email">${escapeHtml(b.email)}</span></div>` : ''}${b.phone.trim() ? `<div class="rp-exec__contact-row"><span class="rp-exec__contact-icon">☎</span><span>${escapeHtml(b.phone)}</span></div>` : ''}${b.location.trim() ? `<div class="rp-exec__contact-row"><span class="rp-exec__contact-icon">⌖</span><span>${escapeHtml(b.location)}</span></div>` : ''}</div>`;

  const sidebarHtml = sidebar
    .filter((s) => s.items.length > 0)
    .map((section) => {
      const items = section.items
        .map((item) => {
          if (section.type === 'skill') {
            const title = item.title.trim()
              ? `<h4 class="rp-exec__sidebar-item-title">${escapeHtml(item.title)}</h4>`
              : '';
            const tags = item.bullets
              .map((bl) => `<span class="rp-exec__skill-tag">${escapeHtml(bl)}</span>`)
              .join('');
            return `<div class="rp-exec__sidebar-item">${title}<div class="rp-exec__skill-tags">${tags}</div></div>`;
          }
          const e = parseYearLeadEntry(item);
          const title = item.title.trim()
            ? `<h4 class="rp-exec__sidebar-item-title">${escapeHtml(item.title)}</h4>`
            : '';
          const time = e.dateVal
            ? `<p class="rp-exec__sidebar-date">${escapeHtml(e.dateVal)}</p>`
            : '';
          const bullets = e.bullets
            .map((bl) => `<p class="rp-exec__sidebar-bullet"><span class="rp-md">${md(bl)}</span></p>`)
            .join('');
          return `<div class="rp-exec__sidebar-item">${title}${time}${bullets}</div>`;
        })
        .join('');
      return `<section class="rp-exec__sidebar-section"><h3 class="rp-exec__sidebar-title">${escapeHtml(section.title)}</h3><div class="rp-exec__sidebar-items">${items}</div></section>`;
    })
    .join('');

  const header = `<header class="rp-exec__header"><h1 class="rp-exec__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>${b.headline.trim() ? `<p class="rp-exec__headline">${escapeHtml(b.headline)}</p>` : ''}</header>`;
  const summary = b.summary.trim()
    ? `<p class="rp-exec__summary rp-md">${md(b.summary)}</p>`
    : '';

  const mainHtml = main
    .filter((s) => s.items.length > 0)
    .map((section) => {
      const items = section.items
        .map((item) => {
          const e = parseYearLeadEntry(item);
          const title = item.title.trim()
            ? `<h3 class="rp-exec__main-item-title">${escapeHtml(item.title)}</h3>`
            : '';
          const bullets = e.bullets.length
            ? `<ul class="rp-exec__main-bullets">${e.bullets
                .map(
                  (bl) =>
                    `<li class="rp-exec__main-bullet"><span class="rp-exec__main-bullet-marker">&gt;</span><span class="rp-md">${md(bl)}</span></li>`,
                )
                .join('')}</ul>`
            : '';
          return `<div class="rp-exec__main-item"><div class="rp-exec__timeline-dot"></div><div class="rp-exec__timeline-line"></div><div class="rp-exec__main-item-head">${title}${e.dateVal ? `<span class="rp-exec__main-item-date">${escapeHtml(e.dateVal)}</span>` : ''}</div>${bullets}</div>`;
        })
        .join('');
      return `<section class="rp-exec__main-section"><div class="rp-exec__main-section-head"><h2 class="rp-exec__main-section-title">${escapeHtml(section.title)}</h2><div class="rp-exec__main-section-line"></div></div><div class="rp-exec__main-items">${items}</div></section>`;
    })
    .join('');

  return `<div id="resume-executive" class="rp-exec"><div class="rp-exec__accent"></div><div class="rp-exec__grid"><aside class="rp-exec__sidebar"><div class="rp-exec__avatar-wrap"><div class="rp-exec__avatar-ring"></div><div class="rp-exec__avatar-inner"></div><div class="rp-exec__avatar"><span class="rp-exec__avatar-initial">${initial}</span></div></div>${contacts}<div class="rp-exec__sidebar-sections">${sidebarHtml}</div></aside><div class="rp-exec__main">${header}${summary}<div class="rp-exec__main-sections">${mainHtml}</div></div></div><div class="rp-exec__corner rp-exec__corner--tr"></div><div class="rp-exec__corner rp-exec__corner--br"></div></div>`;
}

function buildEditorialSectionTimeline(section: ResumeModule): string {
  const items = section.items
    .map((item) => {
      const e = parseYearLeadEntry(item);
      const title = item.title.trim()
        ? `<h3 class="rp-editorial__item-title">${escapeHtml(item.title)}</h3>`
        : '';
      const bullets = e.bullets.length
        ? `<ul class="rp-editorial__bullets">${e.bullets
            .map(
              (bl) =>
                `<li class="rp-editorial__bullet"><span class="rp-editorial__bullet-marker">◆</span><span class="rp-md">${md(bl)}</span></li>`,
            )
            .join('')}</ul>`
        : '';
      return `<div class="rp-editorial__timeline-item"><span class="rp-editorial__timeline-dot"></span><div class="rp-editorial__item-head">${title}${e.dateVal ? `<span class="rp-editorial__item-date">${escapeHtml(e.dateVal)}</span>` : ''}</div>${bullets}</div>`;
    })
    .join('');
  const badge = escapeHtml(section.title.charAt(0));
  return `<section class="rp-editorial__content-section"><div class="rp-editorial__section-head"><span class="rp-editorial__section-badge">${badge}</span><h2 class="rp-editorial__section-title">${escapeHtml(section.title)}</h2><span class="rp-editorial__section-line"></span></div><div class="rp-editorial__timeline">${items}</div></section>`;
}

function buildEditorialSideSection(section: ResumeModule): string {
  const items = section.items
    .map((item) => {
      const e = parseYearLeadEntry(item);
      const title = item.title.trim()
        ? `<h4 class="rp-editorial__side-item-title">${escapeHtml(item.title)}</h4>`
        : '';
      const time = e.dateVal
        ? `<p class="rp-editorial__side-date">${escapeHtml(e.dateVal)}</p>`
        : '';
      const bullets = e.bullets
        .map((bl) => `<p class="rp-editorial__side-bullet"><span class="rp-md">${md(bl)}</span></p>`)
        .join('');
      return `<div class="rp-editorial__side-item">${title}${time}${bullets}</div>`;
    })
    .join('');
  return `<section class="rp-editorial__side-section"><h2 class="rp-editorial__side-title rp-editorial__side-title--lined">${escapeHtml(section.title)}</h2><div class="rp-editorial__side-items">${items}</div></section>`;
}

function buildEditorialGoldTemplateBody(doc: ResumeDocument): string {
  const b = doc.basics;
  const sections = sortedSections(doc.sections);
  const experience = sections.find((s) => s.type === 'experience');
  const project = sections.find((s) => s.type === 'project');
  const education = sections.find((s) => s.type === 'education');
  const skill = sections.find((s) => s.type === 'skill');
  const custom = sections.find((s) => s.type === 'custom');
  const initial = escapeHtml(nameInitialChar(b.fullName.trim() || '（姓名）'));

  const contacts = `<div class="rp-editorial__contacts">${b.email.trim() ? `<span class="rp-editorial__contact"><span class="rp-editorial__contact-icon">✉</span>${escapeHtml(b.email)}</span>` : ''}${b.email.trim() && b.phone.trim() ? `<span class="rp-editorial__contact-sep">|</span>` : ''}${b.phone.trim() ? `<span class="rp-editorial__contact"><span class="rp-editorial__contact-icon">☎</span>${escapeHtml(b.phone)}</span>` : ''}${(b.email.trim() || b.phone.trim()) && b.location.trim() ? `<span class="rp-editorial__contact-sep">|</span>` : ''}${b.location.trim() ? `<span class="rp-editorial__contact"><span class="rp-editorial__contact-icon">⌖</span>${escapeHtml(b.location)}</span>` : ''}</div>`;

  const summary = b.summary.trim()
    ? `<div class="rp-editorial__summary-box"><div class="rp-editorial__summary-rule rp-editorial__summary-rule--l"></div><div class="rp-editorial__summary-rule rp-editorial__summary-rule--r"></div><p class="rp-editorial__summary rp-md">${md(b.summary)}</p></div>`
    : '';

  const skillHtml =
    skill && skill.items.length > 0
      ? `<section class="rp-editorial__skill-panel"><h2 class="rp-editorial__side-title">${escapeHtml(skill.title)}</h2><div class="rp-editorial__skill-items">${skill.items
          .map((item) => {
            const title = item.title.trim()
              ? `<h4 class="rp-editorial__skill-group-title">${escapeHtml(item.title)}</h4>`
              : '';
            const tags = item.bullets
              .map((bl) => `<span class="rp-editorial__skill-tag">${escapeHtml(bl)}</span>`)
              .join('');
            return `<div class="rp-editorial__skill-group">${title}<div class="rp-editorial__skill-tags">${tags}</div></div>`;
          })
          .join('')}</div></section>`
      : '';

  const colMain = `${experience && experience.items.length > 0 ? buildEditorialSectionTimeline(experience) : ''}${project && project.items.length > 0 ? buildEditorialSectionTimeline(project) : ''}`;
  const colSide = `${skillHtml}${education && education.items.length > 0 ? buildEditorialSideSection(education) : ''}${custom && custom.items.length > 0 ? buildEditorialSideSection(custom) : ''}`;

  return `<div id="resume-editorial" class="rp-editorial"><div class="rp-editorial__band"><div class="rp-editorial__band-pattern"></div><div class="rp-editorial__band-line rp-editorial__band-line--top"></div><div class="rp-editorial__band-line rp-editorial__band-line--bottom"></div></div><div class="rp-editorial__avatar-wrap"><div class="rp-editorial__avatar-ring-outer"></div><div class="rp-editorial__avatar-ring-inner"></div><div class="rp-editorial__avatar"><span class="rp-editorial__avatar-initial">${initial}</span></div></div><div class="rp-editorial__body"><header class="rp-editorial__header"><h1 class="rp-editorial__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>${b.headline.trim() ? `<p class="rp-editorial__headline">${escapeHtml(b.headline)}</p>` : ''}${contacts}${summary}</header><div class="rp-editorial__divider"><span class="rp-editorial__divider-line"></span><span class="rp-editorial__divider-diamond"></span><span class="rp-editorial__divider-line"></span></div><div class="rp-editorial__cols"><div class="rp-editorial__col-main">${colMain}</div><div class="rp-editorial__col-side">${colSide}</div></div></div><div class="rp-editorial__footer"><span class="rp-editorial__footer-line"></span><span class="rp-editorial__footer-dot"></span><span class="rp-editorial__footer-line"></span></div></div>`;
}

export function buildResumeExportParts(doc: ResumeDocument): ResumeExportParts {
  const rootClass = rpRootClass(doc);
  let templateBody: string;
  switch (doc.templateId) {
    case 'minimal-dual':
      templateBody = buildMinimalDualTemplateBody(doc);
      break;
    case 'executive-dark':
      templateBody = buildExecutiveDarkTemplateBody(doc);
      break;
    case 'editorial-gold':
      templateBody = buildEditorialGoldTemplateBody(doc);
      break;
    default:
      templateBody = buildClassicTemplateBody(doc);
      break;
  }
  return { rootClass, templateBody };
}

/** 单页完整文档，供 headless 测量 scrollHeight。 */
export function buildMeasureExportHtml(parts: ResumeExportParts): string {
  return wrapExportHtml(parts.rootClass, parts.templateBody);
}

/** 生成与 `ResumePreview.vue` 同结构 HTML，供 headless PDF 测量高度。 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
  return buildMeasureExportHtml(buildResumeExportParts(doc));
}
