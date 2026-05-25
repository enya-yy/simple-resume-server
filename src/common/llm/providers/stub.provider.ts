import { Logger } from '@nestjs/common';
import type { ResumeAgentTurn } from '../resume-agent-response-parse';
import { CHAT_INTENTS } from '../../../contracts/constants/chat-intents';
import { TURN_OUTCOMES } from '../../../contracts/llm/resume-agent-meta';
import type {
  ILlmGateway,
  ResumeAgentDispatchInput,
} from '../llm-gateway.interface';

export class StubProvider implements ILlmGateway {
  private readonly logger = new Logger(StubProvider.name);

  async dispatchResumeAgent(
    input: ResumeAgentDispatchInput,
  ): Promise<ResumeAgentTurn> {
    this.logger.log({
      msg: 'stub_dispatch_resume_agent',
      requestId: input.requestId,
      sessionId: input.sessionId,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 400);
      input.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('resume agent dispatch aborted'));
        },
        { once: true },
      );
    });
    return {
      responseText: '',
      meta: {
        outcome: TURN_OUTCOMES.CHAT_ONLY,
        intent: CHAT_INTENTS.GENERAL_CHAT,
        confidence: 1,
      },
      mutationCalls: [],
      uiActions: [],
    };
  }
}
