import type OpenAI from 'openai';
import { CHAT_INTENTS } from '../../../contracts/constants/chat-intents';
import { TURN_OUTCOMES } from '../../../contracts/llm/resume-agent-meta';

export const RESUME_META_TOOL_NAME = 'report_turn_meta' as const;

export const RESUME_MUTATION_TOOL_NAMES = [
  'update_basics',
  'add_section_item',
  'update_section_item',
  'patch_item_bullets',
  'delete_section_item',
] as const;

export const RESUME_UI_TOOL_NAMES = [
  'show_form_card',
  'show_preview',
  'request_polish',
] as const;

export function buildResumeAgentSystemPrompt(resumeAgentContext?: string): string {
  const contextBlock = resumeAgentContext
    ? `\n# 当前简历上下文（用 itemId / bullet[index] 定位，勿猜数组下标）\n${resumeAgentContext}\n`
    : '';

  return `你是专业的简历辅导顾问。通过对话帮用户完善结构化简历。
${contextBlock}
# 可操作的简历结构
- basics: fullName(姓名), email, phone, location, headline(期望职位), summary(个人简介)
- sections: 模块列表。type 可为 experience(工作), education(教育), project(项目), skill(技能)
- 每个模块下有 items；每条 item 有 id(UUID)、title、bullets(字符串数组)

# 工具使用原则
1. 每一轮必须调用一次 report_turn_meta，声明 outcome、intent、confidence；面向用户的短文案由系统根据 meta 生成，勿写在 message 正文
2. message 正文保持为空；需要追问时把一句问题写入 report_turn_meta.clarifyHint（≤40 字），outcome 用 need_clarification
3. 用户明确要求修改简历内容时，调用对应的 mutation 工具（用 itemId，禁止输出 JSON Patch 路径）
4. 可同时调用多个 mutation 完成复合请求；成功时 outcome=mutation_ok，intent 与操作一致
5. 信息不足以定位条目时：outcome=need_clarification，勿瞎猜 id，勿调用 mutation
6. 需要用户填写多字段时调用 show_form_card，outcome=show_form；leadIn 可省略（系统会用模板）
7. 用户要看预览：show_preview + outcome=preview
8. 用户要润色：request_polish + outcome=polish
9. 仅闲聊、不涉及改简历：不调用 mutation，outcome=chat_only，intent=GENERAL_CHAT
10. 勿在 meta 或工具参数里列举「猜你想做」类操作建议（界面另有快捷按钮）

# 示例（Few-shot）
用户：「我叫张三，期望职位前端」→ update_basics + report_turn_meta(mutation_ok, EDIT_BASIC_INFO)
用户：「之前在字节做前端两年，用 Vue」→ add_section_item + report_turn_meta(mutation_ok, ADD_EXPERIENCE)
用户：「把字节那条第二条改成…」→ patch_item_bullets + report_turn_meta(mutation_ok, PATCH_FIELD)
用户：「帮我润色字节经历第一条」→ request_polish + report_turn_meta(polish, OPTIMIZE_TEXT)
用户：「哪段经历？」→ report_turn_meta(need_clarification, GENERAL_CHAT, clarifyHint: 要改哪一段工作经历？)

# 字段长度
- 模块 title 最多 80 字，条目 title 最多 120 字，单条 bullet 最多 300 字
- 隐私：手机号、邮箱放入 update_basics，勿在 clarifyHint 复述

# 系统事件（userMessage 以「[系统事件]」开头）
- 调用 report_turn_meta(outcome=system_ack)；勿写 message 正文；勿列举界面快捷按钮`;
}

const CHAT_INTENT_ENUM = Object.values(CHAT_INTENTS);
const TURN_OUTCOME_ENUM = Object.values(TURN_OUTCOMES);

export const RESUME_AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: RESUME_META_TOOL_NAME,
      description:
        '声明本轮结果与意图（每轮必调一次）。用户可见回复由系统根据本工具生成，勿依赖 message 正文。',
      parameters: {
        type: 'object',
        required: ['outcome', 'intent', 'confidence'],
        properties: {
          outcome: {
            type: 'string',
            enum: [...TURN_OUTCOME_ENUM],
            description: '本轮结果类型',
          },
          intent: {
            type: 'string',
            enum: [...CHAT_INTENT_ENUM],
            description: '用户意图分类，供界面与埋点',
          },
          confidence: {
            type: 'number',
            description: '0～1，意图置信度',
          },
          clarifyHint: {
            type: 'string',
            description:
              '仅 need_clarification 时填写，一句追问，≤40 字',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_basics',
      description: '更新基本信息中的一个或多个字段',
      parameters: {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              location: { type: 'string' },
              headline: { type: 'string' },
              summary: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_section_item',
      description: '向指定类型模块追加一条经历/教育/项目/技能条目',
      parameters: {
        type: 'object',
        required: ['moduleType', 'item'],
        properties: {
          moduleType: {
            type: 'string',
            enum: ['experience', 'education', 'project', 'skill'],
          },
          item: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', description: '条目标题，如公司+职位' },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: '工作/项目描述要点',
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_section_item',
      description: '按 itemId 更新条目的 title 或整组 bullets',
      parameters: {
        type: 'object',
        required: ['itemId', 'updates'],
        properties: {
          itemId: { type: 'string' },
          updates: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_item_bullets',
      description: '追加、替换或删除某条目的一条 bullet',
      parameters: {
        type: 'object',
        required: ['itemId', 'op'],
        properties: {
          itemId: { type: 'string' },
          op: { type: 'string', enum: ['append', 'replace', 'delete'] },
          index: {
            type: 'number',
            description: 'replace/delete 时必填，0-based',
          },
          text: { type: 'string', description: 'append/replace 时必填' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_section_item',
      description: '按 itemId 删除整条经历/项目等条目',
      parameters: {
        type: 'object',
        required: ['itemId'],
        properties: {
          itemId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_form_card',
      description: '展示结构化填写卡片（多字段采集）',
      parameters: {
        type: 'object',
        required: ['formType'],
        properties: {
          formType: {
            type: 'string',
            enum: [
              'basic_info',
              'experience',
              'education',
              'project',
              'skill',
            ],
          },
          prefilledFields: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: '预填字段名到值',
          },
          leadIn: {
            type: 'string',
            description: '可选；通常省略，由系统生成表单引导语',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_preview',
      description: '打开简历预览面板',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_polish',
      description:
        '为指定条目的整条内容或某一条 bullet 创建异步润色任务（后台 worker 处理）',
      parameters: {
        type: 'object',
        required: ['itemId'],
        properties: {
          itemId: { type: 'string', description: '目录中的条目 UUID' },
          bulletIndex: {
            type: 'number',
            description: '仅润色该条 bullet 时填写，0-based；省略则润色整条',
          },
        },
      },
    },
  },
];
