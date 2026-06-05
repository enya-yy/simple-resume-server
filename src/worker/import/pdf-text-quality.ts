import { PDF_TEXT_MIN_CHARS } from '../../common/llm/import/import-constants';

/** pdf-parse 对部分中文 PDF 会抽出乱码但仍超过字数阈值，需改走 Vision OCR。 */
export function isPdfExtractedTextGarbled(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 40) return false;

  const chars = [...trimmed];
  const total = chars.length;
  if (total === 0) return false;

  const cjkCount = (trimmed.match(/[\u3400-\u9fff\uf900-\ufaff]/gu) ?? []).length;

  const cidMatches = trimmed.match(/\(cid:\d+\)/gi);
  if (cidMatches && cidMatches.length >= 3) return true;

  const replacementCount = (trimmed.match(/\uFFFD/g) ?? []).length;
  if (replacementCount >= 3) return true;

  const latinExtended = (trimmed.match(/[\u00c0-\u00ff]/g) ?? []).length;
  const latinExtendedRatio = latinExtended / total;
  if (latinExtendedRatio > 0.15 && cjkCount < 5) return true;

  if (total < PDF_TEXT_MIN_CHARS) return false;

  const cjkRatio = cjkCount / total;
  if (cjkRatio >= 0.03) return false;

  if (latinExtendedRatio > 0.08) return true;

  const nonAscii = (trimmed.match(/[^\x00-\x7f]/gu) ?? []).length;
  if (nonAscii / total > 0.4 && cjkCount < 5) return true;

  return false;
}
