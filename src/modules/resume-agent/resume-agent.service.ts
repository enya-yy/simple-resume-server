import { Injectable, Logger } from '@nestjs/common';
import type { ResumeDocument, ResumeAgentChatTurn } from '../../contracts/index';
import { LlmGatewayService } from '../../common/llm/llm-gateway.service';
import type { ResumeAgentTurn } from '../../common/llm/resume-agent-response-parse';
import {
  ResumeToolExecutorService,
  type ResumeToolExecutionResult,
} from './resume-tool-executor.service';

export type ResumeAgentRunInput = {
  userMessage: string;
  resumeAgentContext?: string;
  chatHistory?: ResumeAgentChatTurn[];
  document: ResumeDocument;
  sessionId: string;
  requestId: string;
  isSystemEvent?: boolean;
};

export type ResumeAgentRunResult = {
  turn: ResumeAgentTurn;
  document: ResumeDocument;
  documentChanged: boolean;
  toolResults: ResumeToolExecutionResult[];
};

@Injectable()
export class ResumeAgentService {
  private readonly logger = new Logger(ResumeAgentService.name);

  constructor(
    private readonly llmGateway: LlmGatewayService,
    private readonly toolExecutor: ResumeToolExecutorService,
  ) {}

  async runTurn(input: ResumeAgentRunInput): Promise<ResumeAgentRunResult> {
    const userContent = input.isSystemEvent
      ? `${input.userMessage}\n请调用 report_turn_meta(outcome: system_ack)；message 正文留空；勿列举界面快捷按钮。`
      : input.userMessage;

    const turn = await this.llmGateway.dispatchResumeAgent({
      userMessage: userContent,
      resumeAgentContext: input.resumeAgentContext,
      chatHistory: input.chatHistory,
      sessionId: input.sessionId,
      requestId: input.requestId,
    });

    if (turn.mutationCalls.length === 0) {
      return {
        turn,
        document: input.document,
        documentChanged: false,
        toolResults: [],
      };
    }

    const { document, results } = this.toolExecutor.executeAll(
      input.document,
      turn.mutationCalls,
    );

    const documentChanged = results.some((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      this.logger.warn({
        msg: 'resume_agent_tool_partial_failure',
        requestId: input.requestId,
        sessionId: input.sessionId,
        errors: failed.map((f) => f.error),
      });
    }

    return {
      turn,
      document,
      documentChanged,
      toolResults: results,
    };
  }
}
