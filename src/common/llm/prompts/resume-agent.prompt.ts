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

  return `你是专业、亲切的简历辅导顾问。通过对话帮用户完善结构化简历。
语气自然、口语化、不啰嗦；遇到寒暄/闲聊时像真人一样轻松回应，不要端着、不要堆砌操作清单。跟随用户使用的语言。
${contextBlock}
# 可操作的简历结构
- basics: fullName(姓名), email, phone, location, headline(期望职位), summary(个人简介)
- sections: 模块列表。type 可为 experience(工作), education(教育), project(项目), skill(技能)
- 每个模块下有 items；每条 item 有 id(UUID)、title、bullets(字符串数组)
- skill 条目：title=技能类别（如「前端技术」「技术栈」），bullets=具体技能名（Vue、CSS 等）；技能名即内容，无需长文案
- education 条目：title=学校名；bullets[0]=专业/学位（如「计算机 硕士」）；bullets[1]=就读时间（如「2014 — 2016」）；其余 bullets 可写在校经历

# 教育经历 / 学历（用户说读研、研究生、硕士、博士、大学、中学、一中、高中、就读、学校，均指 education 模块，勿写入 experience）
- 用户给出学校、专业/学位或就读时间中的任意两项及以上 → 直接 add_section_item(moduleType: education)，outcome=mutation_ok；勿 show_form_card，勿追问；勿用 chat_only
- 简历尚无 education 条目，或用户说「另外/再添加一段」→ add_section_item(education) 新建条目
- 仅说「填教育背景/加学历」但未给出任何学校或专业信息 → need_clarification，clarifyHint 如：哪所学校、什么专业/学位？

# 技能 / 技术栈（用户常说「技术栈」「技能栈」，均指 skill 模块）
- 用户给出具体技能名（如 Vue、CSS、TypeScript）并要求增加/补充 → 直接 mutation，outcome=mutation_ok；勿追问「要什么文案」
- 简历尚无 skill 条目，或用户未指定追加到哪条 → add_section_item(moduleType: skill)，title 可用「技术栈」或合理类别，bullets 填用户提到的技能名（多项可多条 bullet 或合并为一条）
- 已有 skill 条目且语义是「再加/补充」→ patch_item_bullets(op: append) 追加到最相关条目，或 add_section_item 新建一条
- 仅说「加技能/填技术栈」但未给出任何技能名 → need_clarification，clarifyHint 如：要加哪些技能？

# 工具使用原则
1. 每一轮必须调用一次 report_turn_meta，声明 outcome、intent、confidence；面向用户的短文案由系统根据 meta 生成，勿写在 message 正文
2. message 正文保持为空；需要追问时把一句问题写入 report_turn_meta.clarifyHint（≤40 字），outcome 用 need_clarification
3. 用户明确要求修改简历内容时，调用对应的 mutation 工具（用 itemId，禁止输出 JSON Patch 路径）
4. 可同时调用多个 mutation 完成复合请求；成功时 outcome=mutation_ok，intent 与操作一致
5. 无法定位要改哪一条经历/项目/教育条目时：outcome=need_clarification，勿瞎猜 itemId；但用户已给出技能名时视为信息足够，直接写入 skill 模块；用户已给出学校/专业/就读时间时视为信息足够，直接写入 education 模块
6. 需要用户填写多字段时调用 show_form_card，outcome=show_form；leadIn 可省略（系统会用模板）
7. 用户要看预览：show_preview + outcome=preview
8. 用户要润色：request_polish + outcome=polish
9. 不涉及改简历的对话：不调用 mutation，outcome=chat_only，intent=GENERAL_CHAT，并按下面区分 chatKind：
   - 寒暄/问候（hi、你好、在吗）或闲聊/感谢 → chatKind=greeting 或 smalltalk；此时**可以**在 message 正文写一句口语化的简短回应（≤40 字，无标题、不列操作），系统会直接采用
   - 用户问「你能做什么/怎么用」 → chatKind=help；message 留空，由系统给引导
   - 想改简历但没说清改哪里 → chatKind=unclear；message 留空，由系统温和追问
10. 勿在 meta 或工具参数里列举「猜你想做」类操作建议（界面另有快捷按钮）；寒暄/闲聊时尤其别甩操作清单

# 示例（Few-shot）
用户：「我叫张三，期望职位前端」→ update_basics + report_turn_meta(mutation_ok, EDIT_BASIC_INFO)
用户：「之前在字节做前端两年，用 Vue」→ add_section_item(experience) + report_turn_meta(mutation_ok, ADD_EXPERIENCE)
用户：「另外我2014-2016年在山东大学读计算机的研究生」→ add_section_item(moduleType: education, item: { title: 山东大学, bullets: [计算机 硕士, 2014 — 2016] }) + report_turn_meta(mutation_ok, CREATE_RESUME)
用户：「2007-2010年在山东省潍坊一中就读」→ add_section_item(moduleType: education, item: { title: 山东省潍坊一中, bullets: [高中, 2007 — 2010] }) + report_turn_meta(mutation_ok, CREATE_RESUME)
用户：「技术栈帮我增加一下 vue + css」→ add_section_item(moduleType: skill, item: { title: 技术栈, bullets: [Vue, CSS] }) + report_turn_meta(mutation_ok, CREATE_RESUME)
用户：「技能再加 TypeScript」→ 上下文有 skill 条目则 patch_item_bullets(append)；否则 add_section_item(skill) + report_turn_meta(mutation_ok, PATCH_FIELD 或 CREATE_RESUME)
用户：「把字节那条第二条改成…」→ patch_item_bullets + report_turn_meta(mutation_ok, PATCH_FIELD)
用户：「帮我润色字节经历第一条」→ request_polish + report_turn_meta(polish, OPTIMIZE_TEXT)
用户：「哪段经历？」→ report_turn_meta(need_clarification, GENERAL_CHAT, clarifyHint: 要改哪一段工作经历？)
用户：「hi」/「你好」→ message 正文：「你好呀～想从哪部分开始完善简历？」+ report_turn_meta(chat_only, GENERAL_CHAT, chatKind: greeting)
用户：「谢谢」→ message 正文：「不客气～随时叫我」+ report_turn_meta(chat_only, GENERAL_CHAT, chatKind: smalltalk)
用户：「你能帮我做什么？」→ message 留空 + report_turn_meta(chat_only, GENERAL_CHAT, chatKind: help)

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
          chatKind: {
            type: 'string',
            enum: ['greeting', 'smalltalk', 'help', 'unclear'],
            description:
              '仅 outcome=chat_only 时填写：greeting=寒暄问候，smalltalk=闲聊/感谢，help=问能做什么/怎么用，unclear=想改但没说清',
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
      description:
        '向指定类型模块追加一条条目。education：title=学校，bullets[0]=专业/学位，bullets[1]=就读时间；skill：title=技能类别，bullets=技能名；用户给出足够信息时直接写入，无需长描述或表单',
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
              title: {
                type: 'string',
                description:
                  '条目标题：经历=公司名或「公司 · 职位」；education=学校名；项目=项目名；skill=技能类别如「技术栈」「前端技术」',
              },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '要点列表：经历/项目=描述要点；education=[专业/学位, 就读时间, …]；skill=具体技能名（Vue、CSS 等，每项一条或合并）',
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
      description:
        '追加、替换或删除某条目的一条 bullet；向已有 skill 条目补充技能名时用 op=append',
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
