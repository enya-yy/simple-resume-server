import type { ResumeDocument } from '../types/resume';

export type ResumeItemLocation = {
  moduleId: string;
  itemId: string;
  moduleType: string;
  itemTitle: string;
};

/** 按 itemId 在 sections 中定位条目（供润色、指代消解）。 */
export function findResumeItemLocation(
  doc: ResumeDocument,
  itemId: string,
): ResumeItemLocation | null {
  const id = itemId.trim();
  if (!id) return null;
  for (const section of doc.sections) {
    const item = section.items.find((it) => it.id === id);
    if (item) {
      return {
        moduleId: section.id,
        itemId: item.id,
        moduleType: section.type,
        itemTitle: item.title,
      };
    }
  }
  return null;
}
