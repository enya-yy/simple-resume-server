import type { ResumeDocument } from "../types/resume.js";

/** 与 worker `runPolishJobStep` 使用同一套定位规则，便于 API 同步校验。 */
export function extractPolishTargetText(
  doc: ResumeDocument,
  target: {
    moduleId: string;
    itemId: string;
    bulletIndex?: number;
  },
): string | null {
  const mod = doc.sections.find((s) => s.id === target.moduleId);
  if (!mod) return null;
  const item = mod.items.find((i) => i.id === target.itemId);
  if (!item) return null;

  const bi = target.bulletIndex;
  if (bi !== undefined && bi !== null && bi >= 0) {
    const bullet = item.bullets[bi];
    return bullet !== undefined ? bullet : null;
  }

  const parts: string[] = [];
  if (item.title) parts.push(item.title);
  parts.push(...item.bullets.filter((b) => b.length > 0));
  return parts.length > 0 ? parts.join("\n") : null;
}
