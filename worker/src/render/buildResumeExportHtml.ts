import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resumeMarkdownToSafeHtml,
  type ResumeDocument,
  type ResumeModule,
  type ResumeSectionItem,
  type ResumeTemplateId,
} from '../contracts/index.js';

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

const DATE_RANGE_RE =
  /^(\d{4}[./-]\d{1,2}(?:\s*[-–—至]\s*(?:\d{4}[./-]\d{1,2}|至今))?|至今\s*[-–—至]\s*\d{4}[./-]\d{1,2})/;

function isDateRange(text: string): boolean {
  return DATE_RANGE_RE.test(text.trim());
}

function parseTimelineEntry(item: ResumeSectionItem) {
  const bullets = [...item.bullets];
  let dateRange = '';
  let subtitle = '';
  if (bullets.length > 0 && isDateRange(bullets[0]!)) {
    dateRange = bullets.shift()!.trim();
  }
  if (
    bullets.length > 0 &&
    bullets[0]!.trim() &&
    bullets[0]!.trim().length <= 120 &&
    !/^[•\-*]/.test(bullets[0]!.trim())
  ) {
    subtitle = bullets.shift()!.trim();
  }
  return { title: item.title.trim() || '（未命名条目）', dateRange, subtitle, bullets };
}

function parseEducationEntry(item: ResumeSectionItem) {
  const bullets = [...item.bullets];
  const degree = bullets.shift()?.trim() ?? '';
  let dateRange = '';
  if (bullets.length > 0 && isDateRange(bullets[0]!)) {
    dateRange = bullets.shift()!.trim();
  }
  return { school: item.title.trim() || '（学校）', degree, dateRange };
}

function parseSkillPercent(item: ResumeSectionItem) {
  const raw = (item.bullets[0] ?? '').trim();
  const match = raw.match(/(\d{1,3})/);
  const percent = match
    ? Math.min(100, Math.max(0, Number.parseInt(match[1]!, 10)))
    : 80;
  return { label: item.title.trim() || raw || '技能', percent };
}

function parseSkillDots(item: ResumeSectionItem) {
  const raw = (item.bullets[0] ?? '').trim();
  const match = raw.match(/([1-5])/);
  const level = match ? Number.parseInt(match[1]!, 10) : 3;
  return { label: item.title.trim() || '工具', level };
}

function parseObsidianHeadline(headline: string): { romanization: string; jobTitle: string } {
  const trimmed = headline.trim();
  if (!trimmed) {
    return { romanization: '', jobTitle: '' };
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return { romanization: lines[0]!, jobTitle: lines.slice(1).join(' ') };
  }
  return { romanization: '', jobTitle: trimmed };
}

function parseMetricCard(item: ResumeSectionItem) {
  return {
    label: item.title.trim() || '指标',
    value: (item.bullets[0] ?? '').trim() || '—',
    caption: (item.bullets[1] ?? '').trim(),
  };
}

function sectionsOfType(sections: ResumeModule[], type: ResumeModule['type']) {
  return sections.filter((s) => s.type === type);
}

function sectionByHint(sections: ResumeModule[], ...hints: string[]) {
  return sections.find((s) => hints.some((h) => s.title.includes(h))) ?? null;
}

function skillSections(sections: ResumeModule[]) {
  return sectionsOfType(sections, 'skill');
}

function nameInitials(fullName: string): string {
  const n = fullName.trim();
  if (!n) return '·';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^[\x20-\x7F]+$/.test(n)) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return n.slice(0, 2);
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

function buildAmberExportHtml(doc: ResumeDocument): string {
  const b = doc.basics;
  const skills = skillSections(doc.sections);
  const progress = (
    skills.find((s) => s.title.includes('核心')) ?? skills[0]
  )?.items ?? [];
  const dots = (
    skills.find((s) => s.title.includes('工具')) ?? skills[1]
  )?.items ?? [];
  const experience =
    sectionByHint(doc.sections, '工作', '经历') ??
    sectionsOfType(doc.sections, 'experience')[0];
  const education =
    sectionByHint(doc.sections, '教育') ??
    sectionsOfType(doc.sections, 'education')[0];
  const awards =
    sectionByHint(doc.sections, '荣誉', '奖项') ??
    sectionsOfType(doc.sections, 'custom')[0];

  const profile = `<header class="rp-amber__profile">
    <div class="rp-amber__profile-text">
      <h1 class="rp-amber__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>
      ${b.headline.trim() ? `<p class="rp-amber__role">${escapeHtml(b.headline)}</p>` : ''}
      <div class="rp-amber__contacts">
        ${b.phone.trim() ? `<div class="rp-amber__contact"><span class="rp-amber__contact-icon">📱</span>${escapeHtml(b.phone)}</div>` : ''}
        ${b.email.trim() ? `<div class="rp-amber__contact"><span class="rp-amber__contact-icon">✉️</span>${escapeHtml(b.email)}</div>` : ''}
        ${b.location.trim() ? `<div class="rp-amber__contact"><span class="rp-amber__contact-icon">📍</span>${escapeHtml(b.location)}</div>` : ''}
      </div>
    </div>
    <div class="rp-amber__avatar-wrap"><div class="rp-amber__avatar-glow"></div><div class="rp-amber__avatar"><span class="rp-amber__avatar-initials">${escapeHtml(nameInitials(b.fullName))}</span></div></div>
  </header>`;

  const summary = b.summary.trim()
    ? `<section class="rp-amber__block"><h2 class="rp-amber__section-title">个人简介</h2><div class="rp-amber__body-text rp-md">${md(b.summary)}</div></section>`
    : '';

  const expHtml = experience?.items.length
    ? `<section class="rp-amber__block"><h2 class="rp-amber__section-title">工作经历</h2><div class="rp-amber__timeline">${experience.items
        .map((item, idx) => {
          const e = parseTimelineEntry(item);
          return `<div class="rp-amber__timeline-item"><span class="rp-amber__timeline-dot${idx > 0 ? ' rp-amber__timeline-dot--muted' : ''}"></span><div class="rp-amber__timeline-head"><h3 class="rp-amber__entry-title">${escapeHtml(e.title)}</h3>${e.dateRange ? `<span class="rp-amber__date-badge${idx > 0 ? ' rp-amber__date-badge--muted' : ''}">${escapeHtml(e.dateRange)}</span>` : ''}</div>${e.bullets.length ? `<ul class="rp-amber__bullet-list">${e.bullets.map((bl) => `<li class="rp-md">${md(bl)}</li>`).join('')}</ul>` : ''}</div>`;
        })
        .join('')}</div></section>`
    : '';

  const eduHtml = education?.items.length
    ? `<section class="rp-amber__block"><h2 class="rp-amber__section-title">教育背景</h2>${education.items
        .map((item) => {
          const e = parseEducationEntry(item);
          return `<div class="rp-amber__edu-row"><div><span class="rp-amber__edu-school">${escapeHtml(e.school)}</span>${e.degree ? `<span class="rp-amber__edu-sep">|</span><span class="rp-amber__edu-degree">${escapeHtml(e.degree)}</span>` : ''}</div>${e.dateRange ? `<span class="rp-amber__edu-date">${escapeHtml(e.dateRange)}</span>` : ''}</div>`;
        })
        .join('')}</section>`
    : '';

  const sidebarSkills = progress.length
    ? `<div class="rp-amber__sidebar-block"><h3 class="rp-amber__sidebar-title">核心技能</h3><div class="rp-amber__skill-bars">${progress
        .map((item) => {
          const s = parseSkillPercent(item);
          return `<div class="rp-amber__skill-bar"><div class="rp-amber__skill-bar-labels"><span>${escapeHtml(s.label)}</span><span>${s.percent}%</span></div><div class="rp-amber__skill-bar-track"><div class="rp-amber__skill-bar-fill" style="width:${s.percent}%"></div></div></div>`;
        })
        .join('')}</div></div>`
    : '';

  const sidebarDots = dots.length
    ? `<div class="rp-amber__sidebar-block"><h3 class="rp-amber__sidebar-title">工具技能</h3><div class="rp-amber__dot-skills">${dots
        .map((item) => {
          const s = parseSkillDots(item);
          const dotsHtml = Array.from({ length: 5 }, (_, i) =>
            `<span class="rp-amber__dot${i < s.level ? ' rp-amber__dot--filled' : ''}"></span>`,
          ).join('');
          return `<div class="rp-amber__dot-row"><span>${escapeHtml(s.label)}</span><div class="rp-amber__dots">${dotsHtml}</div></div>`;
        })
        .join('')}</div></div>`
    : '';

  const sidebarAwards = awards?.items.length
    ? `<div class="rp-amber__sidebar-block"><h3 class="rp-amber__sidebar-title">荣誉奖项</h3><ul class="rp-amber__awards">${awards.items
        .map((item) =>
          item.bullets.length
            ? item.bullets
                .map(
                  (bl) =>
                    `<li><div class="rp-amber__award-line"><span class="rp-amber__award-bullet">•</span><span class="rp-md">${md(bl)}</span></div></li>`,
                )
                .join('')
            : `<li><div class="rp-amber__award-line"><span class="rp-amber__award-bullet">•</span><span>${escapeHtml(item.title)}</span></div></li>`,
        )
        .join('')}</ul></div>`
    : '';

  const body = `<div class="rp-amber"><div class="rp-amber__sheet"><div class="rp-amber__main">${profile}${summary}${expHtml}${eduHtml}</div><aside class="rp-amber__sidebar">${sidebarSkills}${sidebarDots}${sidebarAwards}</aside></div></div>`;
  return wrapExportHtml(rpRootClass(doc), body);
}

function buildObsidianExportHtml(doc: ResumeDocument): string {
  const b = doc.basics;
  const competencies =
    sectionByHint(doc.sections, '核心优势', '优势') ??
    sectionsOfType(doc.sections, 'custom').find((s) => !s.title.includes('荣誉'));
  const skills = skillSections(doc.sections)[0] ?? sectionByHint(doc.sections, '技能');
  const education =
    sectionsOfType(doc.sections, 'education')[0] ?? sectionByHint(doc.sections, '教育');
  const experience =
    sectionsOfType(doc.sections, 'experience')[0] ?? sectionByHint(doc.sections, '工作');
  const metrics =
    sectionByHint(doc.sections, '数字', '指标', 'Metrics', '项目') ??
    sectionsOfType(doc.sections, 'project')[0];

  const heroHeadline = parseObsidianHeadline(b.headline);
  const hero = `<header class="rp-obsidian__hero"><div class="rp-obsidian__hero-grid"></div><div class="rp-obsidian__hero-inner"><div><h1 class="rp-obsidian__name">${escapeHtml(b.fullName.trim() || '（姓名）')}</h1>${heroHeadline.romanization ? `<p class="rp-obsidian__headline-en">${escapeHtml(heroHeadline.romanization)}</p>` : ''}${heroHeadline.jobTitle ? `<p class="rp-obsidian__headline">${escapeHtml(heroHeadline.jobTitle)}</p>` : ''}</div><div class="rp-obsidian__hero-contacts">${b.location.trim() ? `<div>📍 ${escapeHtml(b.location)}</div>` : ''}${b.phone.trim() ? `<div>📞 ${escapeHtml(b.phone)}</div>` : ''}${b.email.trim() ? `<div>✉️ ${escapeHtml(b.email)}</div>` : ''}</div></div></header>`;

  const leftComp = competencies?.items.length
    ? `<section class="rp-obsidian__left-block"><h2 class="rp-obsidian__left-badge">核心优势 (Competencies)</h2><div class="rp-obsidian__competencies">${competencies.items
        .map(
          (item, idx) =>
            `<div class="rp-obsidian__competency"><span class="rp-obsidian__competency-num">${idx + 1}</span><p class="rp-md">${md(item.bullets[0] || item.title)}</p></div>`,
        )
        .join('')}</div></section>`
    : '';

  const leftSkills = skills?.items.length
    ? `<section class="rp-obsidian__left-block"><h2 class="rp-obsidian__left-heading">专业技能</h2><ul class="rp-obsidian__skill-list">${skills.items
        .map(
          (item) =>
            `<li><span class="rp-obsidian__skill-icon">⚖️</span><span>${escapeHtml(item.title || item.bullets[0] || '')}</span></li>`,
        )
        .join('')}</ul></section>`
    : '';

  const leftEdu = education?.items.length
    ? `<section class="rp-obsidian__left-block"><h2 class="rp-obsidian__left-heading">教育背景</h2>${education.items
        .map((item) => {
          const e = parseEducationEntry(item);
          return `<div class="rp-obsidian__edu"><p class="rp-obsidian__edu-school">${escapeHtml(e.school)}</p>${e.degree ? `<p class="rp-obsidian__edu-degree">${escapeHtml(e.degree)}</p>` : ''}${e.dateRange ? `<p class="rp-obsidian__edu-date">${escapeHtml(e.dateRange)}</p>` : ''}</div>`;
        })
        .join('')}</section>`
    : '';

  const summary = b.summary.trim()
    ? `<section class="rp-obsidian__main-block"><h2 class="rp-obsidian__main-title"><span>个人简介</span><span class="rp-obsidian__main-title-en">SUMMARY</span></h2><div class="rp-obsidian__body-text rp-md">${md(b.summary)}</div></section>`
    : '';

  const expHtml = experience?.items.length
    ? `<section class="rp-obsidian__main-block"><h2 class="rp-obsidian__main-title rp-obsidian__main-title--plain">工作经历</h2><div class="rp-obsidian__entries">${experience.items
        .map((item, idx) => {
          const e = parseTimelineEntry(item);
          return `<div class="rp-obsidian__entry"><div class="rp-obsidian__entry-head"><h3 class="rp-obsidian__entry-title">${escapeHtml(e.title)}</h3>${e.dateRange ? `<span class="rp-obsidian__date-badge${idx > 0 ? ' rp-obsidian__date-badge--muted' : ''}">${escapeHtml(e.dateRange)}</span>` : ''}</div>${e.subtitle ? `<p class="rp-obsidian__entry-sub">${escapeHtml(e.subtitle)}</p>` : ''}${e.bullets.length ? `<ul class="rp-obsidian__bullet-list">${e.bullets.map((bl) => `<li class="rp-md">${md(bl)}</li>`).join('')}</ul>` : ''}</div>`;
        })
        .join('')}</div></section>`
    : '';

  const metricsHtml = metrics?.items.length
    ? `<section class="rp-obsidian__main-block"><h2 class="rp-obsidian__metrics-title">🏆 核心项目数字回报 (Key Metrics)</h2><div class="rp-obsidian__metrics-grid">${metrics.items
        .map((item) => {
          const m = parseMetricCard(item);
          return `<div class="rp-obsidian__metric-card"><p class="rp-obsidian__metric-label">${escapeHtml(m.label)}</p><span class="rp-obsidian__metric-value">${escapeHtml(m.value)}</span>${m.caption ? `<p class="rp-obsidian__metric-caption">${escapeHtml(m.caption)}</p>` : ''}</div>`;
        })
        .join('')}</div></section>`
    : '';

  const body = `<div class="rp-obsidian"><div class="rp-obsidian__sheet">${hero}<div class="rp-obsidian__body"><aside class="rp-obsidian__left">${leftComp}${leftSkills}${leftEdu}</aside><div class="rp-obsidian__main">${summary}${expHtml}${metricsHtml}</div></div></div></div>`;
  return wrapExportHtml(rpRootClass(doc), body);
}

/** 生成与 `ResumePreview.vue` 同结构 HTML，供 headless PDF 使用。 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
  const templateId: ResumeTemplateId = doc.templateId;
  switch (templateId) {
    case 'obsidian-gold':
      return buildObsidianExportHtml(doc);
    case 'amber-elegant':
    default:
      return buildAmberExportHtml(doc);
  }
}
