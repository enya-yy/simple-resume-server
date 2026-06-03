import { buildFormCardLeadIn } from '../form-card-lead-in';

describe('buildFormCardLeadIn', () => {
  it('wraps adequate model text with markdown heading when plain', () => {
    expect(
      buildFormCardLeadIn({
        formType: 'basic_info',
        modelResponseText: '先把联系方式和期望职位填好。',
      }),
    ).toBe('## 请完善以下内容\n\n先把联系方式和期望职位填好。');
  });

  it('uses short template when model text is too short', () => {
    const out = buildFormCardLeadIn({
      formType: 'experience',
      modelResponseText: '好的',
      resumeSummary: '- 工作经验 (experience): 缺失 (0条)',
    });
    expect(out).toContain('## 添加工作经历');
    expect(out).toContain('成果导向');
  });

  it('wraps model text with heading instead of appending template', () => {
    const model = '我们来补一段项目经历，写清贡献即可。';
    const out = buildFormCardLeadIn({
      formType: 'project',
      modelResponseText: model,
      resumeSummary: '- 项目经验 (project): 缺失 (0条)',
    });
    expect(out).toBe(`## 请完善以下内容\n\n${model}`);
  });
});
