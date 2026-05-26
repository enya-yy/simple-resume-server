import { randomUUID } from 'node:crypto';
import {
  DEFAULT_RESUME_LAYOUT_OPTIONS,
  DEFAULT_RESUME_TEMPLATE_ID,
  MAX_BULLETS_PER_ITEM,
  MAX_ITEMS_PER_MODULE,
  MAX_RESUME_SECTIONS,
  resumeDocumentSchema,
  type ResumeDocument,
  type ResumeModuleType,
} from '../../../contracts/index';

const MODULE_TYPES = [
  'experience',
  'education',
  'project',
  'skill',
  'custom',
] as const;

const MAX_BULLET_CHARS = 300;
const MAX_ITEM_TITLE_CHARS = 120;
const MAX_MODULE_TITLE_CHARS = 80;
const MAX_BASICS = {
  fullName: 80,
  email: 254,
  phone: 40,
  location: 120,
  headline: 120,
  summary: 2000,
} as const;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

function coerceModuleType(raw: unknown): ResumeModuleType {
  if (
    typeof raw === 'string' &&
    (MODULE_TYPES as readonly string[]).includes(raw)
  ) {
    return raw as ResumeModuleType;
  }
  return 'custom';
}

/** 超长要点拆成多条，避免 LLM 输出整段描述导致 schema 校验失败。 */
export function normalizeImportBullets(bullets: string[]): string[] {
  const out: string[] = [];

  for (const bullet of bullets) {
    if (typeof bullet !== 'string') continue;
    let rest = bullet.trim();
    if (!rest) continue;

    while (rest.length > 0 && out.length < MAX_BULLETS_PER_ITEM) {
      if (rest.length <= MAX_BULLET_CHARS) {
        out.push(rest);
        break;
      }

      const chunk = rest.slice(0, MAX_BULLET_CHARS);
      const breakAt = Math.max(
        chunk.lastIndexOf('。'),
        chunk.lastIndexOf('；'),
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf('; '),
        chunk.lastIndexOf('，'),
        chunk.lastIndexOf(', '),
      );

      const cut =
        breakAt > MAX_BULLET_CHARS * 0.4 ? breakAt + 1 : MAX_BULLET_CHARS;
      const piece = rest.slice(0, cut).trim();
      if (piece) out.push(piece);
      rest = rest.slice(cut).trim();
    }
  }

  return out.slice(0, MAX_BULLETS_PER_ITEM);
}

/** 为 LLM 输出的 document 补全 ID、截断超长字段，并通过宽松 schema 校验。 */
export function normalizeImportedDocument(raw: unknown): ResumeDocument {
  const base =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const sectionsRaw = Array.isArray(base.sections) ? base.sections : [];
  const sections = sectionsRaw.slice(0, MAX_RESUME_SECTIONS).map((mod, modIndex) => {
    const m = mod && typeof mod === 'object' ? (mod as Record<string, unknown>) : {};
    const itemsRaw = Array.isArray(m.items) ? m.items : [];
    const items = itemsRaw.slice(0, MAX_ITEMS_PER_MODULE).map((item) => {
      const it =
        item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const bulletsRaw = Array.isArray(it.bullets) ? it.bullets : [];
      return {
        id: randomUUID(),
        title: truncate(
          typeof it.title === 'string' ? it.title : '',
          MAX_ITEM_TITLE_CHARS,
        ),
        bullets: normalizeImportBullets(
          bulletsRaw.filter((b): b is string => typeof b === 'string'),
        ),
      };
    });
    return {
      id: randomUUID(),
      type: coerceModuleType(m.type),
      title: truncate(
        typeof m.title === 'string' ? m.title : '其他',
        MAX_MODULE_TITLE_CHARS,
      ) || '其他',
      order: typeof m.order === 'number' ? m.order : modIndex,
      items,
    };
  });

  const basicsRaw =
    base.basics && typeof base.basics === 'object'
      ? (base.basics as Record<string, unknown>)
      : {};

  const merged = {
    templateId:
      typeof base.templateId === 'string'
        ? base.templateId
        : DEFAULT_RESUME_TEMPLATE_ID,
    layoutOptions:
      base.layoutOptions && typeof base.layoutOptions === 'object'
        ? base.layoutOptions
        : { ...DEFAULT_RESUME_LAYOUT_OPTIONS },
    basics: {
      fullName: truncate(
        typeof basicsRaw.fullName === 'string' ? basicsRaw.fullName : '',
        MAX_BASICS.fullName,
      ),
      email: truncate(
        typeof basicsRaw.email === 'string' ? basicsRaw.email : '',
        MAX_BASICS.email,
      ),
      phone: truncate(
        typeof basicsRaw.phone === 'string' ? basicsRaw.phone : '',
        MAX_BASICS.phone,
      ),
      location: truncate(
        typeof basicsRaw.location === 'string' ? basicsRaw.location : '',
        MAX_BASICS.location,
      ),
      headline: truncate(
        typeof basicsRaw.headline === 'string' ? basicsRaw.headline : '',
        MAX_BASICS.headline,
      ),
      summary: truncate(
        typeof basicsRaw.summary === 'string' ? basicsRaw.summary : '',
        MAX_BASICS.summary,
      ),
    },
    sections,
  };

  return resumeDocumentSchema.parse(merged) as ResumeDocument;
}

/** 从 LLM 响应中提取 JSON 对象（兼容 markdown 代码块包裹）。 */
export function parseJsonFromLlmResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1]!.trim() : trimmed;
  return JSON.parse(candidate);
}
