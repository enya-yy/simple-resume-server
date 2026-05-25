import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  resumeDocumentSchema,
  type ResumeDocument,
  type ResumeModule,
  type ResumeModuleType,
  type ResumeSectionItem,
  type ResumeToolCall,
} from '../../contracts/index';

export type ResumeToolExecutionResult = {
  ok: boolean;
  error?: string;
  document?: ResumeDocument;
};

const SECTION_MODULE_TYPES = [
  'experience',
  'education',
  'project',
  'skill',
] as const satisfies readonly ResumeModuleType[];

type SectionModuleType = (typeof SECTION_MODULE_TYPES)[number];

function defaultModuleTitle(type: ResumeModuleType): string {
  switch (type) {
    case 'experience':
      return '工作经历';
    case 'education':
      return '教育背景';
    case 'project':
      return '项目';
    case 'skill':
      return '技能';
    default:
      return '新模块';
  }
}

function normalizeModuleOrder(sections: ResumeModule[]): ResumeModule[] {
  return sections.map((section, index) => ({ ...section, order: index }));
}

function cloneDocument(doc: ResumeDocument): ResumeDocument {
  return JSON.parse(JSON.stringify(doc)) as ResumeDocument;
}

function findItemLocation(
  sections: ResumeModule[],
  itemId: string,
): { moduleIndex: number; itemIndex: number } | null {
  for (let mi = 0; mi < sections.length; mi += 1) {
    const items = sections[mi]?.items ?? [];
    const ii = items.findIndex((it) => it.id === itemId);
    if (ii >= 0) {
      return { moduleIndex: mi, itemIndex: ii };
    }
  }
  return null;
}

function validateAndReturn(doc: ResumeDocument): ResumeToolExecutionResult {
  const loose = resumeDocumentSchema.safeParse(doc);
  if (!loose.success) {
    const msg = loose.error.issues[0]?.message ?? '文档结构无效';
    return { ok: false, error: msg };
  }
  return { ok: true, document: loose.data as ResumeDocument };
}

@Injectable()
export class ResumeToolExecutorService {
  execute(doc: ResumeDocument, call: ResumeToolCall): ResumeToolExecutionResult {
    const next = cloneDocument(doc);
    switch (call.name) {
      case 'update_basics':
        return this.updateBasics(next, call.arguments);
      case 'add_section_item':
        return this.addSectionItem(next, call.arguments);
      case 'update_section_item':
        return this.updateSectionItem(next, call.arguments);
      case 'patch_item_bullets':
        return this.patchItemBullets(next, call.arguments);
      case 'delete_section_item':
        return this.deleteSectionItem(next, call.arguments);
      default:
        return { ok: false, error: `未知工具: ${String(call.name)}` };
    }
  }

  executeAll(
    doc: ResumeDocument,
    calls: ResumeToolCall[],
  ): { document: ResumeDocument; results: ResumeToolExecutionResult[] } {
    let current = doc;
    const results: ResumeToolExecutionResult[] = [];
    for (const call of calls) {
      const result = this.execute(current, call);
      results.push(result);
      if (result.ok && result.document) {
        current = result.document;
      }
    }
    return { document: current, results };
  }

  private updateBasics(
    doc: ResumeDocument,
    args: Record<string, unknown>,
  ): ResumeToolExecutionResult {
    const data = args.data;
    if (!data || typeof data !== 'object') {
      return { ok: false, error: '缺少 data 参数' };
    }
    const patch = data as Record<string, unknown>;
    const allowed = [
      'fullName',
      'email',
      'phone',
      'location',
      'headline',
      'summary',
    ] as const;
    const merged = { ...doc.basics };
    for (const key of allowed) {
      if (typeof patch[key] === 'string') {
        merged[key] = patch[key] as string;
      }
    }
    doc.basics = merged;
    return validateAndReturn(doc);
  }

  private addSectionItem(
    doc: ResumeDocument,
    args: Record<string, unknown>,
  ): ResumeToolExecutionResult {
    const moduleType = args.moduleType;
    if (
      typeof moduleType !== 'string' ||
      !SECTION_MODULE_TYPES.includes(moduleType as SectionModuleType)
    ) {
      return {
        ok: false,
        error: 'moduleType 须为 experience | education | project | skill',
      };
    }
    const itemRaw = args.item;
    if (!itemRaw || typeof itemRaw !== 'object') {
      return { ok: false, error: '缺少 item 参数' };
    }
    const itemIn = itemRaw as Record<string, unknown>;
    const title = typeof itemIn.title === 'string' ? itemIn.title.trim() : '';
    const bullets = Array.isArray(itemIn.bullets)
      ? itemIn.bullets
          .filter((b): b is string => typeof b === 'string')
          .map((b) => b.trim())
          .filter(Boolean)
      : [];

    const newItem: ResumeSectionItem = {
      id: randomUUID(),
      title: title.slice(0, 120),
      bullets: bullets.map((b) => b.slice(0, 300)),
    };

    const sections = doc.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({
        ...it,
        bullets: [...it.bullets],
      })),
    }));

    const type = moduleType as SectionModuleType;
    const existingIdx = sections.findIndex((m) => m.type === type);
    if (existingIdx === -1) {
      const mod: ResumeModule = {
        id: randomUUID(),
        type,
        title: defaultModuleTitle(type),
        items: [newItem],
        order: sections.length,
      };
      doc.sections = normalizeModuleOrder([...sections, mod]);
    } else {
      const mod = sections[existingIdx]!;
      sections[existingIdx] = {
        ...mod,
        items: [...mod.items, newItem],
      };
      doc.sections = normalizeModuleOrder(sections);
    }
    return validateAndReturn(doc);
  }

  private updateSectionItem(
    doc: ResumeDocument,
    args: Record<string, unknown>,
  ): ResumeToolExecutionResult {
    const itemId = args.itemId;
    if (typeof itemId !== 'string' || !itemId.trim()) {
      return { ok: false, error: '缺少 itemId' };
    }
    const updates = args.updates;
    if (!updates || typeof updates !== 'object') {
      return { ok: false, error: '缺少 updates' };
    }
    const loc = findItemLocation(doc.sections, itemId.trim());
    if (!loc) {
      return { ok: false, error: `未找到条目 id=${itemId}` };
    }
    const up = updates as Record<string, unknown>;
    const sections = doc.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({ ...it, bullets: [...it.bullets] })),
    }));
    const mod = sections[loc.moduleIndex]!;
    const item = mod.items[loc.itemIndex]!;
    if (typeof up.title === 'string') {
      item.title = up.title.trim().slice(0, 120);
    }
    if (Array.isArray(up.bullets)) {
      item.bullets = up.bullets
        .filter((b): b is string => typeof b === 'string')
        .map((b) => b.trim().slice(0, 300));
    }
    mod.items[loc.itemIndex] = item;
    doc.sections = normalizeModuleOrder(sections);
    return validateAndReturn(doc);
  }

  private patchItemBullets(
    doc: ResumeDocument,
    args: Record<string, unknown>,
  ): ResumeToolExecutionResult {
    const itemId = args.itemId;
    const op = args.op;
    if (typeof itemId !== 'string' || !itemId.trim()) {
      return { ok: false, error: '缺少 itemId' };
    }
    if (op !== 'append' && op !== 'replace' && op !== 'delete') {
      return { ok: false, error: 'op 须为 append | replace | delete' };
    }
    const loc = findItemLocation(doc.sections, itemId.trim());
    if (!loc) {
      return { ok: false, error: `未找到条目 id=${itemId}` };
    }

    const sections = doc.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({ ...it, bullets: [...it.bullets] })),
    }));
    const item = sections[loc.moduleIndex]!.items[loc.itemIndex]!;
    const index =
      typeof args.index === 'number' && Number.isInteger(args.index)
        ? args.index
        : undefined;
    const text = typeof args.text === 'string' ? args.text.trim() : '';

    if (op === 'append') {
      if (!text) {
        return { ok: false, error: 'append 需要 text' };
      }
      item.bullets = [...item.bullets, text.slice(0, 300)];
    } else if (op === 'replace') {
      if (!text) {
        return { ok: false, error: 'replace 需要 text' };
      }
      if (index === undefined) {
        return { ok: false, error: 'replace 需要 index' };
      }
      if (index < 0 || index >= item.bullets.length) {
        return { ok: false, error: `bullet 下标越界: ${index}` };
      }
      const bullets = [...item.bullets];
      bullets[index] = text.slice(0, 300);
      item.bullets = bullets;
    } else {
      if (index === undefined) {
        return { ok: false, error: 'delete 需要 index' };
      }
      if (index < 0 || index >= item.bullets.length) {
        return { ok: false, error: `bullet 下标越界: ${index}` };
      }
      item.bullets = item.bullets.filter((_, i) => i !== index);
    }

    doc.sections = normalizeModuleOrder(sections);
    return validateAndReturn(doc);
  }

  private deleteSectionItem(
    doc: ResumeDocument,
    args: Record<string, unknown>,
  ): ResumeToolExecutionResult {
    const itemId = args.itemId;
    if (typeof itemId !== 'string' || !itemId.trim()) {
      return { ok: false, error: '缺少 itemId' };
    }
    const id = itemId.trim();
    let removed = false;
    const sections = doc.sections.map((s) => {
      const before = s.items.length;
      const items = s.items.filter((it) => it.id !== id);
      if (items.length < before) {
        removed = true;
      }
      return { ...s, items };
    });
    if (!removed) {
      return { ok: false, error: `未找到条目 id=${id}` };
    }
    doc.sections = normalizeModuleOrder(sections);
    return validateAndReturn(doc);
  }
}
