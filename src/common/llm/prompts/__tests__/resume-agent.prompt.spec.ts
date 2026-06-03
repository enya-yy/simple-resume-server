import {
  buildResumeAgentSystemPrompt,
  RESUME_AGENT_TOOLS,
} from '../resume-agent.prompt';

describe('buildResumeAgentSystemPrompt', () => {
  it('includes skill / tech stack guidance and few-shot for adding skills', () => {
    const prompt = buildResumeAgentSystemPrompt();
    expect(prompt).toContain('技术栈帮我增加一下 vue + css');
    expect(prompt).toContain('技能 / 技术栈');
    expect(prompt).toContain('勿追问「要什么文案」');
    expect(prompt).toContain('用户已给出技能名时视为信息足够');
  });

  it('includes education guidance and few-shot for adding degree from natural language', () => {
    const prompt = buildResumeAgentSystemPrompt();
    expect(prompt).toContain('教育经历 / 学历');
    expect(prompt).toContain('2014-2016年在山东大学读计算机的研究生');
    expect(prompt).toContain('moduleType: education');
    expect(prompt).toContain('用户已给出学校/专业/就读时间时视为信息足够');
  });

  it('injects resume context when provided', () => {
    const prompt = buildResumeAgentSystemPrompt('## 模块与条目\n- skill item');
    expect(prompt).toContain('## 模块与条目');
    expect(prompt).toContain('- skill item');
  });
});

describe('RESUME_AGENT_TOOLS add_section_item', () => {
  const addItem = RESUME_AGENT_TOOLS.find(
    (t) => t.type === 'function' && t.function.name === 'add_section_item',
  );
  const fnTool =
    addItem?.type === 'function' ? addItem.function : undefined;
  const itemSchema = fnTool?.parameters as {
    properties?: {
      item?: { properties?: { title?: { description?: string } } };
    };
  };

  it('describes section item formats for education and skill', () => {
    expect(fnTool?.description).toContain('skill');
    expect(fnTool?.description).toContain('education');
    expect(fnTool?.description).toContain('就读时间');
    expect(itemSchema?.properties?.item?.properties?.title?.description).toContain(
      '技术栈',
    );
    expect(itemSchema?.properties?.item?.properties?.title?.description).toContain(
      '学校名',
    );
  });
});
