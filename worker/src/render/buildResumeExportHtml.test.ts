import { describe, expect, it } from "vitest";

import { buildResumeExportHtml } from "./buildResumeExportHtml.js";

describe("buildResumeExportHtml", () => {
  it("mirrors ResumePreview class stack for layout options", () => {
    const html = buildResumeExportHtml({
      templateId: "classic-list",
      layoutOptions: {
        fontSizeStep: 2,
        pageMargin: "compact",
        bodyLineHeight: "relaxed",
      },
      basics: {
        fullName: "张三",
        email: "a@b.com",
        phone: "",
        location: "",
        headline: "",
        summary: "",
      },
      sections: [
        {
          id: "m1",
          type: "experience",
          title: "工作经历",
          order: 0,
          items: [
            {
              id: "i1",
              title: "工程师",
              bullets: ["职责 A"],
            },
          ],
        },
      ],
    });
    expect(html).toContain("resume-preview-root--fs-2");
    expect(html).toContain("resume-preview-root--margin-compact");
    expect(html).toContain("resume-preview-root--lh-relaxed");
    expect(html).toContain("张三");
    expect(html).toContain("工作经历");
    expect(html).not.toContain("<script");
  });

  it("renders markdown in summary and bullets", () => {
    const html = buildResumeExportHtml({
      templateId: "classic-list",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "",
        email: "",
        phone: "",
        location: "",
        headline: "",
        summary: "简介 **重点**",
      },
      sections: [
        {
          id: "m1",
          type: "experience",
          title: "工作经历",
          order: 0,
          items: [
            {
              id: "i1",
              title: "工程师",
              bullets: ["职责 **加粗**"],
            },
          ],
        },
      ],
    });
    expect(html).toContain("<strong>重点</strong>");
    expect(html).toContain("<strong>加粗</strong>");
  });

  it("escapes HTML in user content", () => {
    const html = buildResumeExportHtml({
      templateId: "classic-list",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "<img src=x onerror=alert(1)>",
        email: "",
        phone: "",
        location: "",
        headline: "",
        summary: "",
      },
      sections: [],
    });
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});
