import {
  EMPTY_RESUME_DOCUMENT,
  type ResumeDocument,
} from '../../../contracts/index';
import { ResumeToolExecutorService } from '../resume-tool-executor.service';

describe('ResumeToolExecutorService', () => {
  const executor = new ResumeToolExecutorService();
  const emptyDoc = EMPTY_RESUME_DOCUMENT as ResumeDocument;

  it('update_basics merges partial fields', () => {
    const result = executor.execute(emptyDoc, {
      name: 'update_basics',
      arguments: { data: { fullName: '张三', headline: '前端工程师' } },
    });
    expect(result.ok).toBe(true);
    expect(result.document?.basics.fullName).toBe('张三');
    expect(result.document?.basics.headline).toBe('前端工程师');
  });

  it('add_section_item creates experience module and item', () => {
    const result = executor.execute(emptyDoc, {
      name: 'add_section_item',
      arguments: {
        moduleType: 'experience',
        item: {
          title: '字节跳动 · 前端',
          bullets: ['使用 Vue 开发业务功能'],
        },
      },
    });
    expect(result.ok).toBe(true);
    const sections = result.document?.sections ?? [];
    expect(sections).toHaveLength(1);
    expect(sections[0]?.type).toBe('experience');
    expect(sections[0]?.items).toHaveLength(1);
    expect(sections[0]?.items[0]?.bullets[0]).toContain('Vue');
  });

  it('add_section_item creates education module with school, degree and dates', () => {
    const result = executor.execute(emptyDoc, {
      name: 'add_section_item',
      arguments: {
        moduleType: 'education',
        item: {
          title: '山东大学',
          bullets: ['计算机 硕士', '2014 — 2016'],
        },
      },
    });
    expect(result.ok).toBe(true);
    const sections = result.document?.sections ?? [];
    expect(sections).toHaveLength(1);
    expect(sections[0]?.type).toBe('education');
    expect(sections[0]?.title).toBe('教育背景');
    expect(sections[0]?.items[0]?.title).toBe('山东大学');
    expect(sections[0]?.items[0]?.bullets).toEqual([
      '计算机 硕士',
      '2014 — 2016',
    ]);
  });

  it('patch_item_bullets appends by itemId', () => {
    const added = executor.execute(emptyDoc, {
      name: 'add_section_item',
      arguments: {
        moduleType: 'project',
        item: { title: '简历助手', bullets: ['第一版'] },
      },
    });
    const itemId = added.document?.sections[0]?.items[0]?.id;
    expect(itemId).toBeTruthy();

    const patched = executor.execute(added.document!, {
      name: 'patch_item_bullets',
      arguments: {
        itemId,
        op: 'append',
        text: '接入 Tool Calling',
      },
    });
    expect(patched.ok).toBe(true);
    expect(patched.document?.sections[0]?.items[0]?.bullets).toEqual([
      '第一版',
      '接入 Tool Calling',
    ]);
  });
});
