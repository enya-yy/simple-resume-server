import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resumeMarkdownToSafeHtml,
  type ResumeDocument,
  type ResumeModule,
  type ResumeSectionItem,
  type ResumeTemplateId,
} from '../../contracts/index.js';

const PDF_EXPORT_STYLE = `
@page { size: A4; margin: 10mm; }
html, body { margin: 0; background: #fff; }
.rp-root { box-shadow: none; border-radius: 0; width: 100%; min-height: auto; aspect-ratio: unset; }
`;

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

function rpRootClass(doc: ResumeDocument): string {
  const lo = doc.layoutOptions;
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
<div class="${rootClass}" data-testid="resume-preview-root">
${body}
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

function buildClassicExportHtml(doc: ResumeDocument): string {
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
  const body = `<div id="resume-classic" class="rp-classic">${header}${summary}<div class="rp-classic__sections">${sectionsHtml}</div></div>`;
  return wrapExportHtml(rpRootClass(doc), body);
}

function buildMinimalDualExportHtml(doc: ResumeDocument): string {
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

  const body = `<div id="resume-modern" class="rp-modern"><div class="rp-modern__accent"></div><div class="rp-modern__grid"><aside class="rp-modern__sidebar">${identity}${contacts}${sidebarHtml}</aside><div class="rp-modern__main">${summary}${mainHtml}</div></div></div>`;
  return wrapExportHtml(rpRootClass(doc), body);
}

/** 生成与 `ResumePreview.vue` 同结构 HTML，供 headless PDF 使用。 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
  if (doc.templateId === 'minimal-dual') {
    return buildMinimalDualExportHtml(doc);
  }
  return buildClassicExportHtml(doc);
}
