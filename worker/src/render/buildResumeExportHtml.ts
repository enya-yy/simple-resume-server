import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resumeMarkdownToSafeHtml, type ResumeDocument } from "../contracts/index.js";

const _dir = dirname(fileURLToPath(import.meta.url));

function loadResumePreviewCss(): string {
  return readFileSync(join(_dir, "resume-preview.css"), "utf8");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 与 `ResumePreview.vue` 中 `effectiveLayout` 一致 */
function effectiveLayout(doc: ResumeDocument) {
  const lo = doc.layoutOptions;
  if (
    doc.templateId === "professional-two-column" ||
    doc.templateId === "executive-navy"
  ) {
    return { ...lo, pageMargin: "standard" as const };
  }
  return lo;
}

function rootClass(doc: ResumeDocument): string {
  const t = doc.templateId;
  const base =
    t === "professional-two-column"
      ? "resume-preview-root resume-preview-root--professional-two-column"
      : "resume-preview-root resume-preview-root--classic-list";
  const lo = effectiveLayout(doc);
  return [
    base,
    `resume-preview-root--fs-${lo.fontSizeStep}`,
    `resume-preview-root--margin-${lo.pageMargin}`,
    `resume-preview-root--lh-${lo.bodyLineHeight}`,
  ].join(" ");
}

function nameInitialsExport(fullName: string): string {
  const n = fullName.trim();
  if (!n) {
    return "·";
  }
  const asciiParts = n.split(/\s+/).filter(Boolean);
  if (asciiParts.length >= 2 && /^[\x20-\x7F]+$/.test(n)) {
    return `${asciiParts[0]!.charAt(0)}${asciiParts[1]!.charAt(0)}`.toUpperCase();
  }
  return n.slice(0, 2);
}

function buildExecutiveNavyExportHtml(doc: ResumeDocument): string {
  const css = loadResumePreviewCss();
  const lo = effectiveLayout(doc);
  const basics = doc.basics;
  const root = [
    "resume-preview-root resume-preview-root--executive-navy",
    `resume-preview-root--fs-${lo.fontSizeStep}`,
    `resume-preview-root--margin-${lo.pageMargin}`,
    `resume-preview-root--lh-${lo.bodyLineHeight}`,
  ].join(" ");

  const initials = nameInitialsExport(basics.fullName);
  const sidebarSecs = doc.sections.filter(
    (s) => s.type === "skill" || s.type === "education",
  );
  const mainSecs = doc.sections.filter(
    (s) => s.type !== "skill" && s.type !== "education",
  );

  const contactHtml = [
    basics.email.trim()
      ? `<div class="rp-contact-item"><span class="rp-contact-icon rp-contact-icon--pdf"></span><span class="rp-contact-text">${escapeHtml(basics.email.trim())}</span></div>`
      : "",
    basics.phone.trim()
      ? `<div class="rp-contact-item"><span class="rp-contact-icon rp-contact-icon--pdf"></span><span class="rp-contact-text">${escapeHtml(basics.phone.trim())}</span></div>`
      : "",
    basics.location.trim()
      ? `<div class="rp-contact-item"><span class="rp-contact-icon rp-contact-icon--pdf"></span><span class="rp-contact-text">${escapeHtml(basics.location.trim())}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const sidebarBlocks =
    `<div class="rp-two-col__sidebar-block"><h2 class="rp-section-label">联系方式</h2><div class="rp-contact-list">${contactHtml || `<p class="rp-sidebar-muted">—</p>`}</div></div>` +
    sidebarSecs
      .map((section) => {
        const items = section.items
          .map((item) => {
            const tags = item.bullets
              .map((b) => (b ?? "").trim())
              .filter(Boolean)
              .map((t) => `<span class="rp-tag">${escapeHtml(t)}</span>`)
              .join("");
            return `<div class="rp-sidebar-item">${item.title.trim() ? `<p class="rp-sidebar-item-title">${escapeHtml(item.title)}</p>` : ""}<div class="rp-tag-list">${tags}</div></div>`;
          })
          .join("");
        return `<div class="rp-two-col__sidebar-block"><h2 class="rp-section-label">${escapeHtml(section.title)}</h2>${items}</div>`;
      })
      .join("");

  const headline = basics.headline.trim() || "—";
  const loc = basics.location.trim() || "—";
  const em = basics.email.trim() || "—";
  const ph = basics.phone.trim() || "—";

  const metaGrid = `<div class="rp-navy__meta-grid">
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">求职意向</span><span class="rp-navy__meta-value">${escapeHtml(headline)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">意向城市</span><span class="rp-navy__meta-value">${escapeHtml(loc)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">邮箱</span><span class="rp-navy__meta-value rp-navy__meta-value--small">${escapeHtml(em)}</span></div>
    <div class="rp-navy__meta-cell"><span class="rp-navy__meta-label">电话</span><span class="rp-navy__meta-value">${escapeHtml(ph)}</span></div>
  </div>`;

  const headerHtml = `<header class="rp-two-col__header">
    <h1 class="rp-two-col__name">${escapeHtml(basics.fullName.trim() || "（姓名）")}</h1>
    ${metaGrid}
  </header>`;

  const summaryHtml = basics.summary.trim()
    ? `<div class="rp-navy__summary-panel"><div class="rp-navy__summary-text rp-md">${resumeMarkdownToSafeHtml(basics.summary)}</div></div>`
    : "";

  const mainBody = mainSecs
    .map((section) => {
      const entries = section.items
        .map((item) => {
          const bullets = item.bullets
            .map((b) => {
              const t = (b ?? "").trim();
              const inner = t
                ? resumeMarkdownToSafeHtml(b)
                : escapeHtml("（空要点）");
              return `<li class="rp-two-col__bullet"><span class="rp-two-col__bullet-dot"></span><span class="rp-md">${inner}</span></li>`;
            })
            .join("");
          const bl = bullets
            ? `<ul class="rp-two-col__bullet-list">${bullets}</ul>`
            : "";
          return `<div class="rp-two-col__entry"><h3 class="rp-two-col__entry-title">${escapeHtml(item.title || "（未命名条目）")}</h3>${bl}</div>`;
        })
        .join("");
      return `<div class="rp-two-col__section">
        <h2 class="rp-two-col__section-title rp-two-col__section-title--navy"><span>${escapeHtml(section.title)}</span><span class="rp-two-col__section-line"></span></h2>
        <div class="rp-two-col__section-items">${entries}</div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
${css}
@page { size: A4; margin: 10mm; }
html, body { margin: 0; background: #fff; }
</style>
</head>
<body>
<div class="${root}">
<div class="rp-two-col rp-two-col--executive-navy">
<aside class="rp-two-col__sidebar">
<div class="rp-navy__avatar"><span class="rp-navy__avatar-text">${escapeHtml(initials)}</span></div>
${sidebarBlocks}
</aside>
<div class="rp-two-col__main">
${headerHtml}
${summaryHtml}
${mainBody}
</div>
</div>
</div>
</body>
</html>`;
}

/**
 * 生成与编辑器 `ResumePreview` 同语义 HTML（不含 Tailwind 壳层），供 headless PDF 使用。
 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
  if (doc.templateId === "executive-navy") {
    return buildExecutiveNavyExportHtml(doc);
  }

  const css = loadResumePreviewCss();
  const basics = doc.basics;
  const parts = [basics.email, basics.phone, basics.location]
    .map((s) => s.trim())
    .filter(Boolean);
  const contactLine = parts.length ? parts.join(" · ") : "";
  const hasBasics = Boolean(
    basics.fullName.trim() ||
      basics.headline.trim() ||
      basics.email.trim() ||
      basics.phone.trim() ||
      basics.location.trim() ||
      basics.summary.trim(),
  );

  const modulesHtml = doc.sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          const bullets = item.bullets
            .map((b) => {
              const t = (b ?? "").trim();
              const inner = t
                ? resumeMarkdownToSafeHtml(b)
                : escapeHtml("（空要点）");
              return `<li class="rp-md">${inner}</li>`;
            })
            .join("");
          return `<li>
            <p class="resume-preview-item-title">${escapeHtml(item.title || "（未命名条目）")}</p>
            <ul class="resume-preview-bullet-list">${bullets}</ul>
          </li>`;
        })
        .join("");
      return `<li>
        <p class="resume-preview-module-title">${escapeHtml(section.title)}（${escapeHtml(section.type)}）</p>
        <ol class="resume-preview-item-list">${items}</ol>
      </li>`;
    })
    .join("");

  const basicsBlock = hasBasics
    ? `<header class="resume-preview-basics" aria-label="基础信息">
      ${basics.fullName.trim() ? `<h3 class="resume-preview-basics-name">${escapeHtml(basics.fullName)}</h3>` : ""}
      ${basics.headline.trim() ? `<p class="resume-preview-basics-headline">${escapeHtml(basics.headline)}</p>` : ""}
      ${contactLine ? `<p class="resume-preview-basics-contact">${escapeHtml(contactLine)}</p>` : ""}
      ${
        basics.summary.trim()
          ? `<div class="resume-preview-basics-summary rp-md">${resumeMarkdownToSafeHtml(basics.summary)}</div>`
          : ""
      }
    </header>`
    : `<header class="resume-preview-basics"><p class="resume-preview-basics-placeholder">（基础信息预览）</p></header>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
${css}
@page { size: A4; margin: 10mm; }
html, body { margin: 0; background: #fff; }
.resume-preview-module-title { font-weight: 600; }
.resume-preview-module-list > li + li { margin-top: 0.5rem; }
</style>
</head>
<body>
<div class="${rootClass(doc)}">
${basicsBlock}
<ol class="resume-preview-module-list">${modulesHtml}</ol>
</div>
</body>
</html>`;
}
