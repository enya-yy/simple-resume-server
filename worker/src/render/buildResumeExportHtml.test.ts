import { describe, expect, it } from "vitest";

import { buildResumeExportHtml } from "./buildResumeExportHtml.js";

const baseLayout = {
  fontSizeStep: 1 as const,
  pageMargin: "standard" as const,
  bodyLineHeight: "normal" as const,
};

describe("buildResumeExportHtml", () => {
  it("uses rp-root class stack for layout options (classic-list)", () => {
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
    expect(html).toContain("rp-fs-2");
    expect(html).toContain("rp-margin-compact");
    expect(html).toContain("rp-lh-relaxed");
    expect(html).toContain("rp-classic");
    expect(html).toContain("张三");
    expect(html).toContain("工作经历");
    expect(html).not.toContain("resume-preview-module-list");
    expect(html).not.toContain("<script");
  });

  it("renders markdown in summary and bullets", () => {
    const html = buildResumeExportHtml({
      templateId: "classic-list",
      layoutOptions: baseLayout,
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

  it("uses executive navy layout for template executive-navy", () => {
    const html = buildResumeExportHtml({
      templateId: "executive-navy",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "compact",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "李四",
        email: "e@e.com",
        phone: "123",
        location: "上海",
        headline: "前端工程师",
        summary: "自我评价段落",
      },
      sections: [
        {
          id: "s1",
          type: "skill",
          title: "技能",
          order: 0,
          items: [{ id: "i1", title: "Vue", bullets: ["熟练"] }],
        },
        {
          id: "m1",
          type: "experience",
          title: "工作经历",
          order: 1,
          items: [{ id: "i2", title: "A 公司 · 工程师", bullets: ["项目成果"] }],
        },
      ],
    });
    expect(html).toContain("rp-root");
    expect(html).toContain("rp-two-col--executive-navy");
    expect(html).toContain("rp-margin-standard");
    expect(html).toContain("李四");
    expect(html).toContain("前端工程师");
    expect(html).toContain("自我评价段落");
    expect(html).not.toContain("<script");
  });

  it("uses professional two-column layout (not legacy module list)", () => {
    const html = buildResumeExportHtml({
      templateId: "professional-two-column",
      layoutOptions: baseLayout,
      basics: {
        fullName: "王五",
        email: "w@w.com",
        phone: "1",
        location: "北京",
        headline: "产品经理",
        summary: "简介",
      },
      sections: [
        {
          id: "s1",
          type: "skill",
          title: "技能",
          order: 0,
          items: [{ id: "i1", title: "Axure", bullets: ["熟练"] }],
        },
        {
          id: "m1",
          type: "experience",
          title: "经历",
          order: 1,
          items: [{ id: "i2", title: "某公司", bullets: ["成果"] }],
        },
      ],
    });
    expect(html).toContain('<div class="rp-two-col">');
    expect(html).not.toContain('<div class="rp-two-col rp-two-col--executive-navy">');
    expect(html).toContain("Contact");
    expect(html).not.toContain("resume-preview-module-list");
    expect(html).toContain("王五");
  });

  it("escapes HTML in user content", () => {
    const html = buildResumeExportHtml({
      templateId: "classic-list",
      layoutOptions: baseLayout,
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
