import type { ResumeDocument } from "../types/resume.js";

/**
 * Applies polished text back to the resume document at the specified target location.
 * Symmetric to `extractPolishTargetText`: the same `moduleId + itemId + bulletIndex` addressing.
 *
 * Returns a **new** document (immutable); the original is not mutated.
 * Returns `null` when the target cannot be located (module/item missing, bullet out of range).
 */
export function applyPolishTargetText(
  doc: ResumeDocument,
  target: {
    moduleId: string;
    itemId: string;
    bulletIndex?: number;
  },
  polishedText: string,
): ResumeDocument | null {
  const modIndex = doc.sections.findIndex((s) => s.id === target.moduleId);
  if (modIndex === -1) return null;
  const mod = doc.sections[modIndex];

  const itemIndex = mod.items.findIndex((i) => i.id === target.itemId);
  if (itemIndex === -1) return null;
  const item = mod.items[itemIndex];

  const bi = target.bulletIndex;

  if (bi !== undefined && bi !== null && bi >= 0) {
    if (bi >= item.bullets.length) return null;
    const nextBullets = item.bullets.map((b, idx) =>
      idx === bi ? polishedText : b,
    );
    return replaceItem(doc, modIndex, itemIndex, {
      ...item,
      bullets: nextBullets,
    });
  }

  // Whole-item mode: split polishedText by newline.
  // Mirror extract logic: if the item originally had a title, first line → title, rest → bullets.
  // If the item had no title (empty string), all lines → bullets.
  const lines = polishedText.split("\n");

  if (item.title) {
    const [newTitle, ...newBullets] = lines;
    return replaceItem(doc, modIndex, itemIndex, {
      ...item,
      title: newTitle ?? "",
      bullets: newBullets,
    });
  }

  // No title — all lines become bullets (symmetric: extract concatenated only non-empty bullets)
  return replaceItem(doc, modIndex, itemIndex, {
    ...item,
    title: "",
    bullets: lines,
  });
}

function replaceItem(
  doc: ResumeDocument,
  modIndex: number,
  itemIndex: number,
  newItem: ResumeDocument["sections"][number]["items"][number],
): ResumeDocument {
  return {
    ...doc,
    sections: doc.sections.map((section, sIdx) => {
      if (sIdx !== modIndex) return section;
      return {
        ...section,
        items: section.items.map((it, iIdx) =>
          iIdx === itemIndex ? newItem : it,
        ),
      };
    }),
  };
}
