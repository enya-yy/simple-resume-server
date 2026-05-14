import type { ResumeBasicsSensitiveMap, ResumeDocument, ResumeModule, ResumeSectionItem } from "./types/resume.js";

const HIDDEN_PLACEHOLDER = "（已隐藏敏感信息）";

const BASICS_SENSITIVE_KEYS: (keyof ResumeBasicsSensitiveMap)[] = [
  "fullName",
  "email",
  "phone",
  "location",
  "headline",
  "summary",
];

function maskBasics(
  basics: ResumeDocument["basics"],
  sensitiveMap: ResumeBasicsSensitiveMap | undefined,
): ResumeDocument["basics"] {
  if (!sensitiveMap) return basics;

  const clone = { ...basics };
  for (const key of BASICS_SENSITIVE_KEYS) {
    if (sensitiveMap[key] !== true) continue;
    const value = clone[key];
    if (typeof value === "string" && value.trim()) {
      (clone as Record<string, string>)[key] = HIDDEN_PLACEHOLDER;
    }
  }
  return clone;
}

function maskItem(item: ResumeSectionItem): ResumeSectionItem {
  const needTitle = item.titleSensitive === true && item.title.trim();
  const needBullets =
    Array.isArray(item.bulletSensitive) && item.bulletSensitive.some(Boolean);

  if (!needTitle && !needBullets) return item;

  return {
    ...item,
    title: needTitle ? HIDDEN_PLACEHOLDER : item.title,
    bullets: needBullets
      ? item.bullets.map((b, i) =>
          item.bulletSensitive?.[i] ? HIDDEN_PLACEHOLDER : b,
        )
      : [...item.bullets],
  };
}

function maskSection(section: ResumeModule): ResumeModule {
  return {
    ...section,
    items: section.items.map(maskItem),
  };
}

/**
 * 纯函数：返回套用敏感策略后的新 ResumeDocument，不修改入参。
 * mask = true（默认）时启用隐藏策略。
 */
export function applySensitiveFieldPolicy(
  doc: ResumeDocument,
  options: { mask?: boolean } = {},
): ResumeDocument {
  const { mask = true } = options;
  if (!mask) return doc;

  return {
    ...doc,
    basics: maskBasics(doc.basics, doc.basicsSensitive),
    sections: doc.sections.map(maskSection),
  };
}

/** 隐藏占位文案，供测试断言使用 */
export { HIDDEN_PLACEHOLDER as SENSITIVE_HIDDEN_PLACEHOLDER };
