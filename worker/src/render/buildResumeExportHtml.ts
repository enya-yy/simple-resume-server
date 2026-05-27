import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resumeMarkdownToSafeHtml,
  type ResumeDocument,
  type ResumeModule,
} from '../contracts/index.js';

const PDF_EXPORT_STYLE = `
@page { size: A4; margin: 10mm; }
html, body { margin: 0; background: #fff; }
.rp-root {
  box-shadow: none;
  border-radius: 0;
  width: 100%;
  min-height: auto;
  aspect-ratio: unset;
}
`;

function monorepoRoot(): string {
  return join(__dirname, '../../../..');
}

/** 与前端 `web/src/styles/resume-preview.css` 保持一致，避免 PDF 与预览样式分叉 */
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

/** 与 `ResumePreview.vue` 中 `effectiveLayout` 一致 */
function effectiveLayout(doc: ResumeDocument) {
  const lo = doc.layoutOptions;
  if (
    doc.templateId === 'professional-two-column' ||
    doc.templateId === 'executive-navy'
  ) {
    return { ...lo, pageMargin: 'standard' as const };
  }
  return lo;
}

/** 与 `ResumePreview.vue` 根节点 class 一致 */
function rpRootClass(doc: ResumeDocument): string {
  const lo = effectiveLayout(doc);
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

function nameInitialsExport(fullName: string): string {
  const n = fullName.trim();
  if (!n) {
    return '·';
  }
  const asciiParts = n.split(/\s+/).filter(Boolean);
  if (asciiParts.length >= 2 && /^[\x20-\x7F]+$/.test(n)) {
    return `${asciiParts[0]!.charAt(0)}${asciiParts[1]!.charAt(0)}`.toUpperCase();
  }
  return n.slice(0, 2);
}

function sidebarSections(doc: ResumeDocument): ResumeModule[] {
  return doc.sections.filter(
    (s) => s.type === 'skill' || s.type === 'education',
  );
}

function mainSections(doc: ResumeDocument): ResumeModule[] {
  return doc.sections.filter(
    (s) => s.type !== 'skill' && s.type !== 'education',
  );
}

function buildContactListHtml(
  doc: ResumeDocument,
  options: { pdfIcons?: boolean },
): string {
  const basics = doc.basics;
  const iconClass = options.pdfIcons
    ? 'rp-contact-icon rp-contact-icon--pdf'
    : 'rp-contact-icon';
  return [
    basics.email.trim()
      ? `<div class="rp-contact-item"><span class="${iconClass}"></span><span class="rp-contact-text">${escapeHtml(basics.email.trim())}</span></div>`
      : '',
    basics.phone.trim()
      ? `<div class="rp-contact-item"><span class="${iconClass}"></span><span class="rp-contact-text">${escapeHtml(basics.phone.trim())}</span></div>`
      : '',
    basics.location.trim()
      ? `<div class="rp-contact-item"><span class="${iconClass}"></span><span class="rp-contact-text">${escapeHtml(basics.location.trim())}</span></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');
}

function buildSidebarBlocksHtml(
  doc: ResumeDocument,
  options: { contactLabel: string; pdfIcons?: boolean },
): string {
  const contactHtml = buildContactListHtml(doc, {
    pdfIcons: options.pdfIcons,
  });
  const blocks =
    `<div class="rp-two-col__sidebar-block"><h2 class="rp-section-label">${escapeHtml(options.contactLabel)}</h2><div class="rp-contact-list">${contactHtml || '<p class="rp-sidebar-muted">—</p>'}</div></div>` +
    sidebarSections(doc)
      .map((section) => {
        const items = section.items
          .map((item) => {
            const tags = item.bullets
              .map((b) => (b ?? '').trim())
              .filter(Boolean)
              .map((t) => `<span class="rp-tag">${escapeHtml(t)}</span>`)
              .join('');
            return `<div class="rp-sidebar-item">${item.title.trim() ? `<p class="rp-sidebar-item-title">${escapeHtml(item.title)}</p>` : ''}<div class="rp-tag-list">${tags}</div></div>`;
          })
          .join('');
        return `<div class="rp-two-col__sidebar-block"><h2 class="rp-section-label">${escapeHtml(section.title)}</h2>${items}</div>`;
      })
      .join('');
  return blocks;
}

function buildTwoColMainSectionsHtml(
  sections: ResumeModule[],
  options: { navyTitles?: boolean },
): string {
  const titleClass = options.navyTitles
    ? 'rp-two-col__section-title rp-two-col__section-title--navy'
    : 'rp-two-col__section-title';
  return sections
    .map((section) => {
      const entries = section.items
        .map((item) => {
          const bullets = item.bullets
            .map((b) => {
              const t = (b ?? '').trim();
              const inner = t
                ? resumeMarkdownToSafeHtml(b)
                : escapeHtml('（空要点）');
              return `<li class="rp-two-col__bullet"><span class="rp-two-col__bullet-dot"></span><span class="rp-md">${inner}</span></li>`;
            })
            .join('');
          const bl = bullets
            ? `<ul class="rp-two-col__bullet-list">${bullets}</ul>`
            : '';
          return `<div class="rp-two-col__entry"><h3 class="rp-two-col__entry-title">${escapeHtml(item.title || '（未命名条目）')}</h3>${bl}</div>`;
        })
        .join('');
      return `<div class="rp-two-col__section">
        <h2 class="${titleClass}"><span>${escapeHtml(section.title)}</span><span class="rp-two-col__section-line"></span></h2>
        <div class="rp-two-col__section-items">${entries}</div>
      </div>`;
    })
    .join('');
}

function buildExecutiveNavyExportHtml(doc: ResumeDocument): string {
  const basics = doc.basics;
  const sidebarBlocks = buildSidebarBlocksHtml(doc, {
    contactLabel: '联系方式',
    pdfIcons: true,
  });
  const initials = nameInitialsExport(basics.fullName);
  const headline = basics.headline.trim() || '—';
  const loc = basics.location.trim() || '—';
  const em = basics.email.trim() || '—';
  const ph = basics.phone.trim() || '—';

  const metaGrid = `<div class="rp-navy__meta-grid">
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">求职意向</span><span class="rp-navy__meta-value">${escapeHtml(headline)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">意向城市</span><span class="rp-navy__meta-value">${escapeHtml(loc)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">邮箱</span><span class="rp-navy__meta-value rp-navy__meta-value--small">${escapeHtml(em)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">电话</span><span class="rp-navy__meta-value">${escapeHtml(ph)}</span></div>
  </div>`;

  const headerHtml = `<header class="rp-two-col__header">
    <h1 class="rp-two-col__name">${escapeHtml(basics.fullName.trim() || '（姓名）')}</h1>
    ${metaGrid}
  </header>`;

  const summaryHtml = basics.summary.trim()
    ? `<div class="rp-navy__summary-panel"><div class="rp-navy__summary-text rp-md">${resumeMarkdownToSafeHtml(basics.summary)}</div></div>`
    : '';

  const body = `<div class="rp-two-col rp-two-col--executive-navy">
<aside class="rp-two-col__sidebar">
<div class="rp-navy__avatar"><span class="rp-navy__avatar-text">${escapeHtml(initials)}</span></div>
${sidebarBlocks}
</aside>
<div class="rp-two-col__main">
${headerHtml}
${summaryHtml}
${buildTwoColMainSectionsHtml(mainSections(doc), { navyTitles: true })}
</div>
</div>`;

  return wrapExportHtml(rpRootClass(doc), body);
}

function buildProfessionalTwoColumnExportHtml(doc: ResumeDocument): string {
  const basics = doc.basics;
  const sidebarBlocks = buildSidebarBlocksHtml(doc, {
    contactLabel: 'Contact',
    pdfIcons: false,
  });

  const headlineHtml = basics.headline.trim()
    ? `<div class="rp-two-col__headline-row"><span class="rp-two-col__headline-bar"></span><p class="rp-two-col__headline">${escapeHtml(basics.headline)}</p></div>`
    : '';

  const headerHtml = `<header class="rp-two-col__header">
    <h1 class="rp-two-col__name">${escapeHtml(basics.fullName.trim() || '（姓名）')}</h1>
    ${headlineHtml}
  </header>`;

  const summaryHtml = basics.summary.trim()
    ? `<div class="rp-two-col__summary-card"><div class="rp-two-col__summary-text rp-md">${resumeMarkdownToSafeHtml(basics.summary)}</div></div>`
    : '';

  const body = `<div class="rp-two-col">
<aside class="rp-two-col__sidebar">
${sidebarBlocks}
</aside>
<div class="rp-two-col__main">
${headerHtml}
${summaryHtml}
${buildTwoColMainSectionsHtml(mainSections(doc), { navyTitles: false })}
</div>
</div>`;

  return wrapExportHtml(rpRootClass(doc), body);
}

function buildClassicListExportHtml(doc: ResumeDocument): string {
  const basics = doc.basics;
  const parts = [basics.email, basics.phone, basics.location]
    .map((s) => s.trim())
    .filter(Boolean);
  const contactItems = parts
    .map(
      (c, i) =>
        `${i > 0 ? '<span class="rp-classic__contact-dot"></span>' : ''}<span class="rp-classic__contact-item">${escapeHtml(c)}</span>`,
    )
    .join('');

  const headerHtml = `<header class="rp-classic__header">
    <span class="rp-classic__cv-badge">Curriculum Vitae</span>
    <h1 class="rp-classic__name">${escapeHtml(basics.fullName.trim() || '（姓名）')}</h1>
    ${basics.headline.trim() ? `<p class="rp-classic__headline">${escapeHtml(basics.headline)}</p>` : ''}
    ${parts.length ? `<div class="rp-classic__contact-row">${contactItems}</div>` : ''}
  </header>`;

  const summaryHtml = basics.summary.trim()
    ? `<section class="rp-classic__grid-section">
    <div class="rp-classic__grid-label-col"><h2 class="rp-classic__grid-label">Summary</h2></div>
    <div class="rp-classic__grid-content-col"><div class="rp-classic__summary-text rp-md">${resumeMarkdownToSafeHtml(basics.summary)}</div></div>
  </section>`
    : '';

  const sectionsHtml = doc.sections
    .map((section) => {
      const entries = section.items
        .map((item) => {
          const bullets = item.bullets
            .map((b) => {
              const t = (b ?? '').trim();
              const inner = t
                ? resumeMarkdownToSafeHtml(b)
                : escapeHtml('（空要点）');
              return `<li class="rp-classic__bullet"><span class="rp-classic__bullet-diamond"></span><span class="rp-md">${inner}</span></li>`;
            })
            .join('');
          const bl = bullets
            ? `<ul class="rp-classic__bullet-list">${bullets}</ul>`
            : '';
          return `<div class="rp-classic__entry"><h3 class="rp-classic__entry-title">${escapeHtml(item.title || '（未命名条目）')}</h3>${bl}</div>`;
        })
        .join('');
      return `<div class="rp-classic__divider"></div>
      <section class="rp-classic__grid-section">
        <div class="rp-classic__grid-label-col"><h2 class="rp-classic__grid-label">${escapeHtml(section.title)}</h2></div>
        <div class="rp-classic__grid-content-col">${entries}</div>
      </section>`;
    })
    .join('');

  const body = `<div class="rp-classic">
${headerHtml}
${summaryHtml}
${sectionsHtml}
</div>`;

  return wrapExportHtml(rpRootClass(doc), body);
}

/**
 * 生成与 `ResumePreview.vue` 同结构 HTML，供 headless PDF 使用。
 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
  switch (doc.templateId) {
    case 'executive-navy':
      return buildExecutiveNavyExportHtml(doc);
    case 'professional-two-column':
      return buildProfessionalTwoColumnExportHtml(doc);
    case 'classic-list':
    default:
      return buildClassicListExportHtml(doc);
  }
}
