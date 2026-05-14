import { z } from "zod";

import type { ResumeDocument, ResumeSectionItem } from "../types/resume.js";

/** 与前后端约定一致，避免魔法字符串分叉 */
export const SHAREABILITY_MISSING_ITEM_KEYS = [
  "MISSING_NAME",
  "MISSING_CONTACT",
  "MISSING_WORK_EXPERIENCE",
] as const;

export type ShareabilityMissingItemKey =
  (typeof SHAREABILITY_MISSING_ITEM_KEYS)[number];

const YEAR_RE = /\d{4}/;
/** 无四位年份时，仍认可常见时间表达（避免「公司 · 岗位 · 至今」被误判为不完整） */
const TIME_RANGE_HINT_RE = /至今|现在|目前|在读|\bpresent\b/i;
/** 用于区分「公司 / 岗位」等多段信息（与常见中文简历标题习惯一致） */
const COMPANY_ROLE_SEP_RE = /[·|｜/／•]|(\s+at\s+)/i;

/** 全角数字等常见于中文输入法，与编辑器「电话格式」宽松校验对齐，避免误报缺联系方式 */
function normalizePhoneForShareability(phone: string): string {
  return phone.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
}

function hasTimeRangeHint(textBlob: string): boolean {
  return YEAR_RE.test(textBlob) || TIME_RANGE_HINT_RE.test(textBlob);
}

function hasNonEmptyName(doc: ResumeDocument): boolean {
  return doc.basics.fullName.trim().length > 0;
}

function hasContact(doc: ResumeDocument): boolean {
  const email = doc.basics.email.trim();
  if (email.length > 0 && z.string().email().safeParse(email).success) {
    return true;
  }
  const phone = normalizePhoneForShareability(doc.basics.phone.trim());
  if (phone.length === 0) {
    return false;
  }
  return /^[+()\d\s\-]{1,40}$/.test(phone);
}

function itemLooksCompleteWorkExperience(item: ResumeSectionItem): boolean {
  const title = item.title.trim();
  if (title.length === 0) {
    return false;
  }
  const textBlob = [title, ...item.bullets.map((b) => b.trim())].join("\n");
  if (!hasTimeRangeHint(textBlob)) {
    return false;
  }
  const hasCompanyAndRole =
    COMPANY_ROLE_SEP_RE.test(title) ||
    (title.length >= 4 && /\s/.test(title)) ||
    item.bullets.some((b) => b.trim().length > 0) ||
    /** 常见「公司岗位2020—2023」一行写完、无空格无分隔符，仍应视为完整经历 */
    (YEAR_RE.test(title) && title.length >= 7);
  return hasCompanyAndRole;
}

function hasCompleteWorkExperience(doc: ResumeDocument): boolean {
  for (const m of doc.sections) {
    if (m.type !== "experience") {
      continue;
    }
    for (const item of m.items) {
      if (itemLooksCompleteWorkExperience(item)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 返回仍不满足的校验项（稳定顺序，便于清单 UI）。
 */
export function getShareabilityChecklist(
  document: ResumeDocument,
): ShareabilityMissingItemKey[] {
  const missing: ShareabilityMissingItemKey[] = [];
  if (!hasNonEmptyName(document)) {
    missing.push("MISSING_NAME");
  }
  if (!hasContact(document)) {
    missing.push("MISSING_CONTACT");
  }
  if (!hasCompleteWorkExperience(document)) {
    missing.push("MISSING_WORK_EXPERIENCE");
  }
  return missing;
}

export function isResumeShareable(document: ResumeDocument): boolean {
  return getShareabilityChecklist(document).length === 0;
}
