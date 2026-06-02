import { buildResumeExportHtml } from "./buildResumeExportHtml";
import type { ResumeDocument } from "../../contracts/index";

describe("buildResumeExportHtml", () => {
  it("renders amber-elegant layout", () => {
    const doc: ResumeDocument = {
      templateId: "amber-elegant",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "张若曦",
        headline: "产品经理",
        email: "a@b.com",
        phone: "+86 188",
        location: "上海",
        summary: "简介内容",
      },
      sections: [],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain('class="rp-amber__sheet"');
    expect(html).toContain("张若曦");
    expect(html).toContain("rp-amber__sidebar");
  });

  it("renders obsidian-gold hero and metrics grid", () => {
    const doc: ResumeDocument = {
      templateId: "obsidian-gold",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "沈聿玿",
        headline: "产品总监",
        email: "a@b.com",
        phone: "+86 186",
        location: "北京",
        summary: "简介",
      },
      sections: [
        {
          id: "m1",
          type: "project",
          title: "核心指标",
          order: 0,
          items: [
            { id: "i1", title: "用户增长", bullets: ["100w+", "高活跃"] },
          ],
        },
      ],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain("rp-obsidian__hero");
    expect(html).toContain("rp-obsidian__metrics-grid");
    expect(html).toContain("100w+");
  });
});
