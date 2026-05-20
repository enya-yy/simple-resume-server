import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  buildFormCardLeadIn,
  buildResumeSummary,
  createChatSessionBodySchema,
  ERROR_CODES,
  INTENT_RESPONSE_TYPE,
  patchChatFormCardMessageBodySchema,
  patchChatSessionBodySchema,
  patchResumeBodySchema,
  resumeDocumentSchema,
  sendChatMessageBodySchema,
  type ChatIntent,
  type FormField,
  type ResumeDocument,
} from '../../contracts/index';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { LlmGatewayService } from '../../common/llm/llm-gateway.service';
import type { LlmDebugPayload } from '../../common/llm/llm-debug';
import { parseEnv } from '../../config/env.schema';
import { ResumesRepository } from '../resumes/resumes.repository';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ChatSessionsRepository } from './chat-sessions.repository';
import { IntentDispatcherService } from './intent-dispatcher.service';

const BASIC_INFO_FIELDS: FormField[] = [
  { name: 'fullName', label: '姓名', required: true },
  { name: 'email', label: '邮箱', required: true },
  { name: 'phone', label: '手机', required: true },
  { name: 'location', label: '工作城市' },
  { name: 'headline', label: '期望职位' },
  { name: 'summary', label: '简介' },
];

const EXPERIENCE_FIELDS: FormField[] = [
  { name: 'company', label: '公司名称', required: true },
  { name: 'title', label: '职位', required: true },
  { name: 'startDate', label: '开始日期' },
  { name: 'endDate', label: '结束日期' },
  { name: 'description', label: '工作描述' },
];

const EDUCATION_FIELDS: FormField[] = [
  { name: 'school', label: '学校名称', required: true },
  { name: 'degree', label: '学位/学历', required: true },
  { name: 'major', label: '专业' },
  { name: 'startDate', label: '入学日期' },
  { name: 'endDate', label: '毕业日期' },
  { name: 'description', label: '在校经历' },
];

const PROJECT_FIELDS: FormField[] = [
  { name: 'projectName', label: '项目名称', required: true },
  { name: 'role', label: '担任角色' },
  { name: 'startDate', label: '开始日期' },
  { name: 'endDate', label: '结束日期' },
  { name: 'description', label: '项目描述', required: true },
];

const SKILL_FIELDS: FormField[] = [
  { name: 'category', label: '技能类别', required: true },
  { name: 'description', label: '技能描述（多项用换行分隔）', required: true },
];

const DEFAULT_SUGGESTIONS = ['填写基础信息', '添加工作经历', '查看简历预览'];

type FormType = 'basic_info' | 'experience' | 'education' | 'project' | 'skill';

const FORM_FIELDS_MAP: Record<FormType, FormField[]> = {
  basic_info: BASIC_INFO_FIELDS,
  experience: EXPERIENCE_FIELDS,
  education: EDUCATION_FIELDS,
  project: PROJECT_FIELDS,
  skill: SKILL_FIELDS,
};

function intentToFormType(
  intent: ChatIntent,
  extractedFields?: Record<string, string>,
): FormType | null {
  if (intent === 'CREATE_RESUME' || intent === 'EDIT_BASIC_INFO')
    return 'basic_info';
  if (intent === 'ADD_EXPERIENCE') {
    const hint = extractedFields?.moduleType;
    if (hint === 'education') return 'education';
    if (hint === 'project') return 'project';
    if (hint === 'skill') return 'skill';
    return 'experience';
  }
  return null;
}

function buildDefaultFields(
  formType: FormType,
  extractedFields?: Record<string, string>,
): FormField[] {
  const base = FORM_FIELDS_MAP[formType];
  if (!extractedFields) return base.map((f) => ({ ...f }));
  return base.map((f) => ({
    ...f,
    value: extractedFields[f.name] ?? f.value,
  }));
}

@Injectable()
export class ChatSessionsService {
  private readonly logger = new Logger(ChatSessionsService.name);
  private readonly confidenceThreshold: number;
  private readonly llmDebug: boolean;

  constructor(
    private readonly chatSessionsRepository: ChatSessionsRepository,
    private readonly chatMessagesRepository: ChatMessagesRepository,
    private readonly intentDispatcher: IntentDispatcherService,
    private readonly resumesRepository: ResumesRepository,
    private readonly llmGateway: LlmGatewayService,
  ) {
    const env = parseEnv(process.env);
    this.confidenceThreshold = env.LLM_CONFIDENCE_THRESHOLD;
    this.llmDebug = env.LLM_DEBUG;
  }

  private emitLlmDebug(
    writeEvent: (event: string, data: Record<string, unknown>) => boolean,
    payload: LlmDebugPayload,
  ) {
    this.logger.log({ msg: 'llm_debug', ...payload });
    if (!this.llmDebug) return;
    writeEvent('debug', payload);
  }

  async listSessions(userId: string) {
    const rows = await this.chatSessionsRepository.listByUser(userId);
    return {
      sessions: rows.map((r) => ({
        sessionId: r.id,
        resumeId: r.resume_id,
        title: r.title,
        lastMessageSummary: r.last_message_summary,
        updatedAt: r.updated_at.toISOString(),
      })),
    };
  }

  async createSession(userId: string, body: unknown) {
    let parsed;
    try {
      parsed = createChatSessionBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    try {
      const row = await this.chatSessionsRepository.createForResume(
        userId,
        parsed.resumeId,
        parsed.title ?? '未命名简历',
      );
      if (!row) {
        throw new NotFoundException({
          code: ERROR_CODES.RESUME_NOT_FOUND,
          message: '简历不存在',
        });
      }
      return {
        sessionId: row.id,
        resumeId: row.resume_id,
        title: row.title,
        lastMessageSummary: row.last_message_summary,
        updatedAt: row.updated_at.toISOString(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const isUnique =
        (typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code: string }).code === '23505') ||
        msg.includes('UNIQUE constraint failed');
      if (isUnique) {
        throw new ConflictException({
          code: ERROR_CODES.CHAT_SESSION_RESUME_CONFLICT,
          message: '该简历已有活跃会话',
        });
      }
      throw e;
    }
  }

  async patchSession(userId: string, sessionId: string, body: unknown) {
    let parsed;
    try {
      parsed = patchChatSessionBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const result = await this.chatSessionsRepository.patchTitle(
      sessionId,
      userId,
      parsed.title,
    );

    if (!result.ok) {
      if ('error' in result && result.error === 'NOT_FOUND') {
        throw new NotFoundException({
          code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
          message: '会话不存在',
        });
      }
      throw new ForbiddenException({
        code: ERROR_CODES.CHAT_SESSION_FORBIDDEN,
        message: '无权访问该会话',
      });
    }

    return {
      sessionId: result.session.id,
      resumeId: result.session.resume_id,
      title: result.session.title,
      lastMessageSummary: result.session.last_message_summary,
      updatedAt: result.session.updated_at.toISOString(),
    };
  }

  async deleteSession(userId: string, sessionId: string) {
    const result = await this.chatSessionsRepository.softDelete(
      sessionId,
      userId,
    );

    if (!result.ok) {
      if ('error' in result && result.error === 'NOT_FOUND') {
        throw new NotFoundException({
          code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
          message: '会话不存在',
        });
      }
      throw new ForbiddenException({
        code: ERROR_CODES.CHAT_SESSION_FORBIDDEN,
        message: '无权访问该会话',
      });
    }
  }

  async listMessages(userId: string, sessionId: string) {
    await this.assertSessionOwnership(userId, sessionId);

    const rows = await this.chatMessagesRepository.listBySession(sessionId);
    return {
      messages: rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        contentType: r.content_type,
        contentJson: r.content_json,
        intent: r.intent,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async patchFormCardMessage(
    userId: string,
    sessionId: string,
    messageId: string,
    body: unknown,
  ) {
    let parsed;
    try {
      parsed = patchChatFormCardMessageBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    await this.assertSessionOwnership(userId, sessionId);

    const row = await this.chatMessagesRepository.findBySessionAndId(
      sessionId,
      messageId,
    );
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
        message: '消息不存在',
      });
    }
    if (row.content_type !== 'form_card' || row.role !== 'assistant') {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '仅支持更新助手表单消息',
      });
    }

    const existing = row.content_json as Record<string, unknown>;
    if (existing.type !== 'form_card') {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '消息内容类型无效',
      });
    }

    const fieldsRaw = existing.fields;
    if (!Array.isArray(fieldsRaw)) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '表单字段无效',
      });
    }

    const fields = fieldsRaw as FormField[];
    const priorSubmitted =
      (existing.submittedData as Record<string, string> | undefined) ?? {};
    const mergedSubmitted = { ...priorSubmitted, ...parsed.submittedData };
    const mergedFields = fields.map((f) => ({
      ...f,
      value: mergedSubmitted[f.name] ?? f.value,
    }));

    const contentJson: Record<string, unknown> = {
      ...existing,
      type: 'form_card',
      role: 'assistant',
      fields: mergedFields,
      submittedData: mergedSubmitted,
    };

    const updated = await this.chatMessagesRepository.updateContentJson(
      sessionId,
      messageId,
      contentJson,
    );
    if (!updated) {
      throw new NotFoundException({
        code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
        message: '消息不存在',
      });
    }

    return {
      id: updated.id,
      sessionId: updated.session_id,
      role: updated.role,
      contentType: updated.content_type,
      contentJson: updated.content_json,
      intent: updated.intent,
      createdAt: updated.created_at.toISOString(),
    };
  }

  async sendMessageStream(
    userId: string,
    sessionId: string,
    body: unknown,
    res: Response,
    requestId: string,
  ) {
    let parsed;
    try {
      parsed = sendChatMessageBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    await this.assertSessionOwnership(userId, sessionId);

    const isSystemEvent = parsed.source === 'system_event';

    await this.chatMessagesRepository.insertMessage({
      sessionId,
      role: isSystemEvent ? 'system' : 'user',
      contentType: 'text',
      contentJson: {
        type: 'text',
        role: isSystemEvent ? 'system' : 'user',
        text: parsed.content,
      },
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const writeEvent = (event: string, data: Record<string, unknown>) => {
      if (res.writableEnded || res.destroyed) {
        return false;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    };

    try {
      let resumeSummary: string | undefined;
      try {
        const session = await this.chatSessionsRepository.findById(sessionId);
        if (session) {
          const resume = await this.resumesRepository.findByIdForOwner(
            session.resume_id,
            userId,
          );
          if (resume?.document_json) {
            const doc = resumeDocumentSchema.safeParse(resume.document_json);
            if (doc.success) {
              resumeSummary = buildResumeSummary(doc.data as ResumeDocument);
            }
          }
        }
      } catch (e) {
        this.logger.warn({
          msg: 'resume_summary_build_failed',
          requestId,
          sessionId,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const dispatchUserMessage = isSystemEvent
        ? `[系统事件] ${parsed.content}\n请简要确认保存结果与简历进度；具体下一步由界面快捷按钮提供，回复中不要列举操作建议。`
        : parsed.content;

      this.emitLlmDebug(writeEvent, {
        step: 'chat_pipeline_start',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
        userMessagePreview: parsed.content.slice(0, 80),
        isSystemEvent,
      });

      this.emitLlmDebug(writeEvent, {
        step: 'intent_dispatch_start',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
      });

      let dispatchResult;
      try {
        dispatchResult = await this.intentDispatcher.dispatch({
          userMessage: dispatchUserMessage,
          sessionId,
          requestId,
          confidenceThreshold: this.confidenceThreshold,
          resumeSummary,
        });
      } catch (err) {
        this.logger.error({
          msg: 'intent_dispatch_catastrophic',
          requestId,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        this.emitLlmDebug(writeEvent, {
          step: 'intent_dispatch_catastrophic',
          provider: this.llmGateway.providerName,
          requestId,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        dispatchResult = {
          intentResult: {
            intent: 'GENERAL_CHAT' as const,
            confidence: 0,
            responseText: '你好！我是你的简历助手，有什么可以帮你的吗？',
          },
          isLowConfidence: true,
          suggestions: [...DEFAULT_SUGGESTIONS],
        };
      }

      const { intentResult, isLowConfidence, suggestions } = dispatchResult;

      this.emitLlmDebug(writeEvent, {
        step: 'intent_dispatch_done',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        isLowConfidence,
        responseTextPreview: intentResult.responseText?.slice(0, 80),
      });

      if (
        !writeEvent('intent', {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
        })
      )
        return;

      const responseType = INTENT_RESPONSE_TYPE[intentResult.intent];
      let contentType: 'text' | 'form_card' | 'layout_command' | 'patch' =
        'text';
      let contentJson: Record<string, unknown>;

      if (responseType === 'patch') {
        const patchFields = intentResult.extractedFields ?? {};
        const patchableBasicsKeys = [
          'fullName',
          'email',
          'phone',
          'location',
          'headline',
          'summary',
        ];
        const basicsPatch: Record<string, string> = {};
        for (const [k, v] of Object.entries(patchFields)) {
          if (patchableBasicsKeys.includes(k)) {
            basicsPatch[k] = typeof v === 'string' ? v : String(v ?? '');
          }
        }

        let patchApplied = false;
        if (Object.keys(basicsPatch).length > 0) {
          try {
            const session = await this.chatSessionsRepository.findById(
              sessionId,
            );
            if (session) {
              const resume = await this.resumesRepository.findByIdForOwner(
                session.resume_id,
                userId,
              );
              if (resume?.document_json) {
                const doc = resumeDocumentSchema.safeParse(
                  resume.document_json,
                );
                if (doc.success) {
                  const updated = {
                    ...doc.data,
                    basics: { ...doc.data.basics, ...basicsPatch },
                  };
                  const validated = patchResumeBodySchema.safeParse({
                    document: updated,
                  });
                  if (validated.success) {
                    await this.resumesRepository.updateDocumentForOwner(
                      session.resume_id,
                      userId,
                      validated.data.document,
                    );
                    patchApplied = true;
                  }
                }
              }
            }
          } catch (e) {
            this.logger.warn({
              msg: 'patch_field_failed',
              requestId,
              sessionId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (patchApplied) {
          if (
            !writeEvent('document_patched', {
              patchedFields: basicsPatch,
            })
          )
            return;
        }

        const replyText =
          intentResult.responseText ??
          (patchApplied ? '已为你更新。' : '未能识别要修改的字段。');
        if (!writeEvent('token', { text: replyText })) return;

        contentType = 'text';
        contentJson = {
          type: 'text',
          role: 'assistant',
          text: replyText,
        };
      } else if (responseType === 'form_card') {
        const formType = intentToFormType(
          intentResult.intent as ChatIntent,
          intentResult.extractedFields,
        );
        if (!formType) {
          throw new Error('invalid form intent mapping');
        }
        const fields = buildDefaultFields(
          formType,
          intentResult.extractedFields,
        );

        const formLeadIn = buildFormCardLeadIn({
          formType,
          modelResponseText: intentResult.responseText,
          resumeSummary,
        });

        if (
          !writeEvent('form', {
            formType,
            fields,
            leadIn: formLeadIn,
            extractedFields: intentResult.extractedFields ?? {},
          })
        )
          return;

        contentType = 'form_card';
        contentJson = {
          type: 'form_card',
          role: 'assistant',
          formType,
          fields,
          leadIn: formLeadIn,
        };
      } else if (responseType === 'layout_command') {
        if (!writeEvent('command', { command: 'show_preview', params: {} }))
          return;

        contentType = 'layout_command';
        contentJson = {
          type: 'layout_command',
          role: 'assistant',
          command: 'show_preview',
          params: {},
        };
      } else {
        let fullText = '';
        let responseSource: 'stream' | 'intent_responseText' | 'empty' = 'empty';
        const systemPromptLines = [
          '你是一个专业的简历辅导顾问。请用中文回复，保持友好和专业。',
        ];
        if (resumeSummary) {
          systemPromptLines.push(`\n当前简历状态：\n${resumeSummary}`);
        }
        if (isSystemEvent) {
          systemPromptLines.push(
            `\n当前输入是一条「表单/模块保存成功」的系统事件。请用 2～4 句中文简短回复：\n` +
              `1）确认刚保存的模块；\n` +
              `2）结合「当前简历状态」概括整体进度（还缺哪些模块即可，避免与状态矛盾）；\n` +
              `3）**不要**写「猜你想做」、不要用「·」列举下一步（对话区底部已有快捷按钮，勿重复其文案）；\n` +
              `4）全文约 60～120 字；可用一句提示用户点击下方快捷按钮继续。`,
          );
        }
        if (intentResult.responseText) {
          systemPromptLines.push(
            `\n参考意图分析结果，请据此展开回答：${intentResult.responseText}`,
          );
        }

        this.emitLlmDebug(writeEvent, {
          step: 'stream_chat_start',
          provider: this.llmGateway.providerName,
          requestId,
          sessionId,
          responseType,
        });

        try {
          await this.llmGateway.streamChat({
            messages: [
              { role: 'system', content: systemPromptLines.join('\n') },
              {
                role: 'user',
                content: isSystemEvent ? dispatchUserMessage : parsed.content,
              },
            ],
            sessionId,
            requestId,
            onToken: async (text) => {
              fullText += text;
              writeEvent('token', { text });
            },
            onDone: async () => {
              return;
            },
          });
          responseSource = 'stream';
          this.emitLlmDebug(writeEvent, {
            step: 'stream_chat_done',
            provider: this.llmGateway.providerName,
            requestId,
            sessionId,
            fullTextLength: fullText.length,
            fullTextPreview: fullText.slice(0, 80),
          });
        } catch (streamErr) {
          const streamError =
            streamErr instanceof Error ? streamErr.message : String(streamErr);
          this.logger.warn({
            msg: 'stream_chat_fallback',
            requestId,
            sessionId,
            error: streamError,
          });
          this.emitLlmDebug(writeEvent, {
            step: 'stream_chat_fallback',
            provider: this.llmGateway.providerName,
            requestId,
            sessionId,
            error: streamError,
            hadPartialStream: fullText.length > 0,
            partialTextPreview: fullText.slice(0, 80),
          });
          if (!fullText) {
            fullText = intentResult.responseText ?? '';
            responseSource = 'intent_responseText';
            if (!writeEvent('token', { text: fullText })) return;
          }
        }

        this.emitLlmDebug(writeEvent, {
          step: 'response_ready',
          provider: this.llmGateway.providerName,
          requestId,
          sessionId,
          responseSource,
          finalTextPreview: fullText.slice(0, 80),
        });

        contentType = 'text';
        contentJson = {
          type: 'text',
          role: 'assistant',
          text: fullText,
        };
      }

      if (isLowConfidence && suggestions.length > 0) {
        if (!writeEvent('suggestions', { items: suggestions })) return;
      }

      const assistantRow = await this.chatMessagesRepository.insertMessage({
        sessionId,
        role: 'assistant',
        contentType,
        contentJson,
        intent: intentResult.intent,
      });

      if (!writeEvent('done', { messageId: assistantRow.id, usage: {} })) {
        return;
      }
      res.end();
    } catch (err) {
      this.logger.error({
        msg: 'chat_message_stream_failed',
        requestId,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (!res.writableEnded && !res.destroyed) {
        writeEvent('error', {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: '消息流处理失败',
          requestId,
        });
        res.end();
      }
    }
  }

  private async assertSessionOwnership(userId: string, sessionId: string) {
    const session = await this.chatSessionsRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException({
        code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
        message: '会话不存在',
      });
    }
    if (session.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.CHAT_SESSION_FORBIDDEN,
        message: '无权访问该会话',
      });
    }
  }
}
