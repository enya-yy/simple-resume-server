import { buildResumeExportHtml } from "./buildResumeExportHtml.js";
import type { ResumeDocument } from "../../contracts/index";

describe("buildResumeExportHtml", () => {
  it("renders classic-list layout", () => {
    const doc: ResumeDocument = {
      templateId: "classic-list",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "林晓晨",
        headline: "高级前端",
        email: "a@b.com",
        phone: "+86 138",
        location: "上海",
        summary: "简介内容",
      },
      sections: [],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain('id="resume-classic"');
    expect(html).toContain("林晓晨");
    expect(html).toContain("Profile Summary");
  });

  it("renders minimal-dual sidebar and skill tags", () => {
    const doc: ResumeDocument = {
      templateId: "minimal-dual",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "林晓晨",
        headline: "研发专家",
        email: "a@b.com",
        phone: "+86 138",
        location: "上海",
        summary: "深耕技术栈",
      },
      sections: [
        {
          id: "skill-1",
          type: "skill",
          title: "专业技能",
          order: 0,
          items: [
            {
              id: "sk1",
              title: "语言",
              bullets: ["TypeScript、Vue、React"],
            },
          ],
        },
      ],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain('id="resume-modern"');
    expect(html).toContain("rp-modern__skill-tag");
    expect(html).toContain("TypeScript");
  });

  it("renders executive-dark layout", () => {
    const doc: ResumeDocument = {
      templateId: "executive-dark",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "陈远舟",
        headline: "CTO",
        email: "a@b.com",
        phone: "+86 139",
        location: "北京",
        summary: "技术战略专家",
      },
      sections: [
        {
          id: "skill-1",
          type: "skill",
          title: "核心能力",
          order: 0,
          items: [{ id: "sk1", title: "管理", bullets: ["战略", "组织"] }],
        },
      ],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain('id="resume-executive"');
    expect(html).toContain("rp-exec__skill-tag");
    expect(html).toContain("联系方式");
  });

  it("renders editorial-gold layout", () => {
    const doc: ResumeDocument = {
      templateId: "editorial-gold",
      layoutOptions: {
        fontSizeStep: 1,
        pageMargin: "standard",
        bodyLineHeight: "normal",
      },
      basics: {
        fullName: "苏晚晴",
        headline: "品牌总监",
        email: "a@b.com",
        phone: "+86 136",
        location: "上海",
        summary: "品牌叙事专家",
      },
      sections: [],
    };
    const html = buildResumeExportHtml(doc);
    expect(html).toContain('id="resume-editorial"');
    expect(html).toContain("rp-editorial__band");
    expect(html).toContain("苏晚晴");
  });
});
