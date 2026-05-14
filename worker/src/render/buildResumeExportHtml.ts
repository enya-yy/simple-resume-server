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
  if (doc.templateId === "professional-two-column") {
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

/**
 * 生成与编辑器 `ResumePreview` 同语义 HTML（不含 Tailwind 壳层），供 headless PDF 使用。
 */
export function buildResumeExportHtml(doc: ResumeDocument): string {
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
