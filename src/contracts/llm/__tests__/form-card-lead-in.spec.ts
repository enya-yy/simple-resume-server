import { buildFormCardLeadIn } from '../form-card-lead-in';

describe('buildFormCardLeadIn', () => {
  it('uses model text when adequate', () => {
    expect(
      buildFormCardLeadIn({
        formType: 'basic_info',
        modelResponseText: '先把联系方式和期望职位填好。',
      }),
    ).toBe('先把联系方式和期望职位填好。');
  });

  it('uses short template when model text is too short', () => {
    const out = buildFormCardLeadIn({
      formType: 'experience',
      modelResponseText: '好的',
      resumeSummary: '- 工作经验 (experience): 缺失 (0条)',
    });
    expect(out).toBe('来补一段工作经历，描述里尽量写成果。');
  });

  it('does not append template after model text', () => {
    const model = '我们来补一段项目经历，写清贡献即可。';
    const out = buildFormCardLeadIn({
      formType: 'project',
      modelResponseText: model,
      resumeSummary: '- 项目经验 (project): 缺失 (0条)',
    });
    expect(out).toBe(model);
    expect(out).not.toContain('\n\n');
  });
});
