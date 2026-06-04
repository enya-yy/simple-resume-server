import { tryInferEducationAddFromMessage } from '../resume-agent-education-fallback';

describe('tryInferEducationAddFromMessage', () => {
  it('parses high school with year range and 就读', () => {
    const call = tryInferEducationAddFromMessage(
      '2007-2010年在山东省潍坊一中就读',
    );
    expect(call).toEqual({
      name: 'add_section_item',
      arguments: {
        moduleType: 'education',
        item: {
          title: '山东省潍坊一中',
          bullets: ['高中', '2007 — 2010'],
        },
      },
    });
  });

  it('parses university degree with dates', () => {
    const call = tryInferEducationAddFromMessage(
      '另外我2014-2016年在山东大学读计算机的研究生',
    );
    expect(call?.name).toBe('add_section_item');
    expect(call?.arguments).toMatchObject({
      moduleType: 'education',
      item: {
        title: '山东大学',
        bullets: expect.arrayContaining(['2014 — 2016']),
      },
    });
  });

  it('returns null for vague chat', () => {
    expect(tryInferEducationAddFromMessage('你好')).toBeNull();
    expect(
      tryInferEducationAddFromMessage('帮我改一下简历'),
    ).toBeNull();
  });

  it('returns null for system events', () => {
    expect(
      tryInferEducationAddFromMessage('[系统事件] 已保存教育经历'),
    ).toBeNull();
  });
});
