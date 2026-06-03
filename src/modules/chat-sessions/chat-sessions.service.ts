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
  buildAgentReply,
  analyzeResumeCompletion,
  buildResumeAgentContext,
  resolveResumeAgentTurnMeta,
  buildResumeCatalog,
  buildResumeSummary,
  buildChatHistoryForAgent,
  CHAT_HISTORY_MAX_MESSAGES,
  estimateChatHistoryTokens,
  EMPTY_RESUME_DOCUMENT,
  findResumeItemLocation,
  createChatSessionBodySchema,
  CREDIT_ACTIONS,
  ERROR_CODES,
  patchChatFormCardMessageBodySchema,
  patchChatSessionBodySchema,
  resumeDocumentSchema,
  sendChatMessageBodySchema,
  RESUME_TITLE_MAX,
  type FormField,
  type ResumeDocument,
} from '../../contracts/index';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { LlmGatewayService } from '../../common/llm/llm-gateway.service';
import type { LlmDebugPayload } from '../../common/llm/llm-debug';
import { parseEnv } from '../../config/env.schema';
import { CreditsService } from '../credits/credits.service';
import { PolishJobsService } from '../polish-jobs/polish-jobs.service';
import { ResumesRepository } from '../resumes/resumes.repository';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ChatSessionsRepository } from './chat-sessions.repository';
import { ResumeAgentService } from '../resume-agent/resume-agent.service';
import { LlmTokenUsageService } from '../llm-token-usage/llm-token-usage.service';
import { LLM_USAGE_SOURCES } from '../../contracts/llm/llm-token-usage';

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

type FormType = 'basic_info' | 'experience' | 'education' | 'project' | 'skill';

const FORM_FIELDS_MAP: Record<FormType, FormField[]> = {
  basic_info: BASIC_INFO_FIELDS,
  experience: EXPERIENCE_FIELDS,
  education: EDUCATION_FIELDS,
  project: PROJECT_FIELDS,
  skill: SKILL_FIELDS,
};

function agentFormTypeToFormType(formType: string): FormType | null {
  if (
    formType === 'basic_info' ||
    formType === 'experience' ||
    formType === 'education' ||
    formType === 'project' ||
    formType === 'skill'
  ) {
    return formType;
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
  private readonly llmDebug: boolean;

  constructor(
    private readonly chatSessionsRepository: ChatSessionsRepository,
    private readonly chatMessagesRepository: ChatMessagesRepository,
    private readonly resumeAgentService: ResumeAgentService,
    private readonly polishJobsService: PolishJobsService,
    private readonly resumesRepository: ResumesRepository,
    private readonly llmGateway: LlmGatewayService,
    private readonly creditsService: CreditsService,
    private readonly llmTokenUsage: LlmTokenUsageService,
  ) {
    const env = parseEnv(process.env);
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
        resumeImported: Boolean(r.resume_imported),
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
        resumeImported: false,
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

    const resumeTitle =
      parsed.title.length > RESUME_TITLE_MAX
        ? parsed.title.slice(0, RESUME_TITLE_MAX)
        : parsed.title;
    await this.resumesRepository.setTitleForOwner(
      result.session.resume_id,
      userId,
      resumeTitle,
      true,
    );

    const resumeImported =
      await this.chatSessionsRepository.hasResumeImport(sessionId);

    return {
      sessionId: result.session.id,
      resumeId: result.session.resume_id,
      title: result.session.title,
      lastMessageSummary: result.session.last_message_summary,
      updatedAt: result.session.updated_at.toISOString(),
      resumeImported,
    };
  }

  async deleteSession(userId: string, sessionId: string) {
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

    const deleted = await this.resumesRepository.deleteByIdForUser(
      session.resume_id,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
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

    if (!isSystemEvent) {
      await this.creditsService.spend(
        userId,
        CREDIT_ACTIONS.CHAT_MESSAGE,
        sessionId,
      );
    }

    const userRow = await this.chatMessagesRepository.insertMessage({
      sessionId,
      role: isSystemEvent ? 'system' : 'user',
      contentType: 'text',
      contentJson: {
        type: 'text',
        role: isSystemEvent ? 'system' : 'user',
        text: parsed.content,
      },
    });

    const historyRows = await this.chatMessagesRepository.listRecentBySession(
      sessionId,
      CHAT_HISTORY_MAX_MESSAGES,
      userRow.id,
    );
    const chatHistory = buildChatHistoryForAgent(historyRows);

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
      const session = await this.chatSessionsRepository.findById(sessionId);
      if (!session) {
        throw new NotFoundException({
          code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
          message: '会话不存在',
        });
      }

      let currentDocument: ResumeDocument | null = null;
      let resumeAgentContext: string | undefined;
      let resumeSummary: string | undefined;
      const resume = await this.resumesRepository.findByIdForOwner(
        session.resume_id,
        userId,
      );
      if (resume?.document_json) {
        const doc = resumeDocumentSchema.safeParse(resume.document_json);
        if (doc.success) {
          currentDocument = doc.data as ResumeDocument;
          resumeAgentContext = buildResumeAgentContext(
            currentDocument,
            buildResumeCatalog(currentDocument),
          );
          resumeSummary = buildResumeSummary(currentDocument);
        }
      }

      if (!currentDocument) {
        currentDocument = EMPTY_RESUME_DOCUMENT as ResumeDocument;
        resumeAgentContext = buildResumeAgentContext(
          currentDocument,
          buildResumeCatalog(currentDocument),
        );
        resumeSummary = buildResumeSummary(currentDocument);
      }

      const agentUserMessage = isSystemEvent
        ? `[系统事件] ${parsed.content}`
        : parsed.content;

      this.emitLlmDebug(writeEvent, {
        step: 'chat_pipeline_start',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
        userMessagePreview: parsed.content.slice(0, 80),
        isSystemEvent,
        historyMessageCount: chatHistory.length,
        historyEstTokens: estimateChatHistoryTokens(chatHistory),
      });

      this.emitLlmDebug(writeEvent, {
        step: 'resume_agent_dispatch_start',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
      });

      const agentRun = await this.resumeAgentService.runTurn({
        userMessage: agentUserMessage,
        resumeAgentContext,
        chatHistory,
        document: currentDocument,
        sessionId,
        requestId,
        isSystemEvent,
      });

      const { turn, document, documentChanged, toolResults } = agentRun;

      if (turn.tokenUsage) {
        this.llmTokenUsage.record({
          userId,
          source: LLM_USAGE_SOURCES.CHAT_AGENT,
          model: turn.model,
          usage: turn.tokenUsage,
          requestId,
          refId: sessionId,
        });
      }

      const resolvedMeta = resolveResumeAgentTurnMeta({
        meta: turn.meta,
        mutationCalls: turn.mutationCalls,
        uiActions: turn.uiActions,
        isSystemEvent,
      });

      this.emitLlmDebug(writeEvent, {
        step: 'resume_agent_dispatch_done',
        provider: this.llmGateway.providerName,
        requestId,
        sessionId,
        mutationToolCount: turn.mutationCalls.length,
        uiActionCount: turn.uiActions.length,
        documentChanged,
        turnOutcome: resolvedMeta.outcome,
        turnIntent: resolvedMeta.intent,
        responseTextPreview: turn.responseText.slice(0, 80),
      });

      if (
        !writeEvent('intent', {
          intent: resolvedMeta.intent,
          confidence: resolvedMeta.confidence,
        })
      )
        return;

      if (documentChanged) {
        await this.resumesRepository.updateDocumentForOwner(
          session.resume_id,
          userId,
          document,
        );
        await this.resumesRepository.applyAutoTitleFromBasicsIfUnlocked(
          session.resume_id,
          userId,
          document,
        );
        if (!writeEvent('document_updated', { document })) return;
      }

      let contentType: 'text' | 'form_card' | 'layout_command' = 'text';
      let contentJson: Record<string, unknown>;

      const formAction = turn.uiActions.find((a) => a.type === 'form');
      const previewAction = turn.uiActions.find((a) => a.type === 'preview');
      const polishAction = turn.uiActions.find((a) => a.type === 'polish');

      if (polishAction && polishAction.type === 'polish') {
        const loc = findResumeItemLocation(document, polishAction.itemId);
        if (loc) {
          try {
            const created = await this.polishJobsService.createPolishJob(
              userId,
              {
                resumeId: session.resume_id,
                target: {
                  moduleId: loc.moduleId,
                  itemId: loc.itemId,
                  bulletIndex: polishAction.bulletIndex,
                },
              },
              requestId,
            );
            if (
              !writeEvent('polish_job', {
                jobId: created.jobId,
                target: {
                  moduleId: loc.moduleId,
                  itemId: loc.itemId,
                  bulletIndex: polishAction.bulletIndex,
                },
              })
            )
              return;
          } catch (e) {
            this.logger.warn({
              msg: 'resume_agent_polish_job_failed',
              requestId,
              sessionId,
              itemId: polishAction.itemId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      if (formAction && formAction.type === 'form') {
        const formType = agentFormTypeToFormType(formAction.formType);
        if (!formType) {
          throw new Error('invalid form type from resume agent');
        }
        const fields = buildDefaultFields(
          formType,
          formAction.prefilledFields,
        );
        const formLeadIn =
          formAction.leadIn ??
          buildFormCardLeadIn({
            formType,
            resumeSummary,
          });

        if (
          !writeEvent('form', {
            formType,
            fields,
            leadIn: formLeadIn,
            extractedFields: formAction.prefilledFields ?? {},
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
      } else if (previewAction) {
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
        contentType = 'text';
        contentJson = {
          type: 'text',
          role: 'assistant',
          text: '',
        };
      }

      const toolErrors = toolResults
        .filter((r) => !r.ok && r.error)
        .map((r) => r.error as string);
      const polishStarted =
        polishAction?.type === 'polish' &&
        !!findResumeItemLocation(document, polishAction.itemId);

      let replyText = buildAgentReply({
        meta: resolvedMeta,
        documentChanged,
        mutationCalls: turn.mutationCalls,
        toolErrors,
        hasFormCard: !!formAction,
        hasPreview: !!previewAction,
        hasPolishJob: polishStarted,
      });
      const legacyText = turn.responseText.trim();
      if (legacyText.length > 0 && legacyText.length <= 60) {
        replyText = legacyText;
      }

      if (!writeEvent('token', { text: replyText })) return;
      if (contentJson.type === 'text') {
        (contentJson as { text: string }).text = replyText;
      }

      const completion = analyzeResumeCompletion(document);
      // 已弹出表单时不再推送「猜你想做」，避免与「请先填表」这一主任务抢注意力
      if (
        contentType !== 'form_card' &&
        completion.suggestionPhrases.length > 0
      ) {
        if (
          !writeEvent('suggestions', {
            items: completion.suggestionPhrases,
          })
        )
          return;
      }

      const assistantRow = await this.chatMessagesRepository.insertMessage({
        sessionId,
        role: 'assistant',
        contentType,
        contentJson,
        intent: resolvedMeta.intent,
      });

      if (
        !writeEvent('done', {
          messageId: assistantRow.id,
          usage: turn.tokenUsage
            ? {
                promptTokens: turn.tokenUsage.promptTokens,
                completionTokens: turn.tokenUsage.completionTokens,
                totalTokens: turn.tokenUsage.totalTokens,
              }
            : {},
        })
      ) {
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
