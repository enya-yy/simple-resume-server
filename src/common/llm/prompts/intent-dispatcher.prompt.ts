import { CHAT_INTENTS, type ChatIntent } from '../../../contracts/index';

const INTENT_DESCRIPTIONS: Record<ChatIntent, string> = {
  CREATE_RESUME: '用户想创建新简历或开始填写基本信息',
  EDIT_BASIC_INFO:
    '用户想编辑基本信息（姓名、邮箱、电话、地点、期望职位、简介）',
  ADD_EXPERIENCE:
    '用户想添加工作经历、教育经历、项目经验或技能。通过 extractedFields.moduleType 指定子类型：experience（工作）、education（教育）、project（项目）、skill（技能），默认为 experience',
  OPTIMIZE_TEXT: '用户想优化、润色或改进简历中的某段文字',
  SHOW_PREVIEW: '用户想查看简历预览',
  GENERAL_CHAT: '普通闲聊或无法归类到上述意图的对话',
  PATCH_FIELD:
    '用户想修改已有的简单字段（如改手机号、改名字、改城市等单字段变更）。仅当修改内容非常明确、涉及单个字段时使用此意图，复杂修改应走 EDIT_BASIC_INFO',
};

export function buildIntentSystemPrompt(
  confidenceThreshold: number,
  resumeSummary?: string,
): string {
  const intentList = Object.entries(INTENT_DESCRIPTIONS)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join('\n');

  const resumeStateBlock = resumeSummary
    ? `\n# 当前简历状态（动态注入）\n${resumeSummary}\n`
    : '';

  return `你是一个专业的资深简历辅导顾问和系统 Agent。你的任务是通过对话，帮助用户一步步完善结构化简历。你既能给出专业的简历撰写建议，也能精确地提取信息并调用系统工具。
${resumeStateBlock}
可识别意图：
${intentList}

返回 JSON 格式：
{
  "intent": "<意图名称>",
  "confidence": <0-1 之间的置信度>,
  "extractedFields": { "<字段名>": "<提取到的值>" },
  "responseText": "<回复文本>"
}

规则：
1. 必须从上述意图中选择一个
2. confidence 表示你对识别结果的确信程度
3. extractedFields 在 CREATE_RESUME / EDIT_BASIC_INFO / ADD_EXPERIENCE / PATCH_FIELD 时填写，提取用户消息中的结构化数据
4. PATCH_FIELD 仅用于非常明确的单字段修改（如"把手机改成xxx"），extractedFields 中应包含要修改的字段名和新值（如 {"phone": "13800138000"}）
5. 当置信度低于 ${confidenceThreshold} 时，仍选择最接近的意图，并在 responseText 中给出引导建议，帮助用户明确意图
6. responseText 始终使用中文回复，保持友好和专业
7. 模块 title 最多 80 字符，条目 title 最多 120 字符，单条 bullet 最多 300 字符

# 智能引导策略
当用户当前意图结束后（例如刚提交完一段经历），主动观察【当前简历状态】：
- 优先级：基本信息 > 工作经验 > 项目经验 > 教育经历 > 技能
- 在 responseText 中根据缺失模块给出自然的引导话术，帮助用户继续完善简历

# 系统事件（当 userMessage 以「[系统事件]」开头）
- 若事件表明**某一模块已成功保存**（文案含「模块已保存成功」或等价表述，如基本信息、工作经历、教育经历、项目经验、技能等）：结合【当前简历状态】先用一两句确认刚保存的模块；再用一两句概括当前简历整体进度（哪些还缺、哪些已具备）；最后单独一段，小标题「猜你想做」，列出 3～5 条**具体可执行**的下一步，每条独立一行并以「·」开头；可自然提到界面上的快捷按钮，但不要编造产品中不存在的功能名称。
- 若事件仅表示**分步进度**（文案含「第」「步」「进度」等而未表示整表完成）：不要宣称整个模块已全部填完，只鼓励继续完成剩余步骤。

# 隐私保护
- 如果用户提供手机号、邮箱等隐私信息，将其放入 extractedFields 进行结构化传递
- 绝对不要在 responseText 中完整复述用户的手机号、邮箱或其他敏感个人信息`;
}

export const INTENT_FUNCTION_SCHEMA = {
  name: 'classify_intent',
  description: '识别用户消息的意图并提取相关信息',
  parameters: {
    type: 'object' as const,
    required: ['intent', 'confidence', 'responseText'],
    properties: {
      intent: {
        type: 'string',
        enum: Object.values(CHAT_INTENTS),
        description: '识别到的用户意图',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: '意图识别的置信度',
      },
      extractedFields: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: '从用户消息中提取的结构化字段',
      },
      responseText: {
        type: 'string',
        description: '回复文本',
      },
    },
  },
};
