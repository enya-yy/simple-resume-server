import { Logger } from '@nestjs/common';
import type { IntentResult } from '../../../contracts/index';
import type {
  ILlmGateway,
  IntentDispatchInput,
  StreamChatInput,
} from '../llm-gateway.interface';

export class StubProvider implements ILlmGateway {
  private readonly logger = new Logger(StubProvider.name);

  async dispatchIntent(input: IntentDispatchInput): Promise<IntentResult> {
    this.logger.log({
      msg: 'stub_dispatch_intent',
      requestId: input.requestId,
      sessionId: input.sessionId,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 600);
      input.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('intent dispatch aborted'));
        },
        { once: true },
      );
    });
    return {
      intent: 'GENERAL_CHAT',
      confidence: 0.9,
      responseText: '你好！我是你的简历助手，有什么可以帮你的吗？',
    };
  }

  async streamChat(input: StreamChatInput): Promise<void> {
    this.logger.log({
      msg: 'stub_stream_chat',
      requestId: input.requestId,
      sessionId: input.sessionId,
    });
    const text = '你好！我是你的简历助手。让我来帮你完善简历吧！';

    await new Promise<void>((r) => setTimeout(r, 600));

    for (const char of text) {
      if (input.signal?.aborted) break;
      await input.onToken(char);
      await new Promise<void>((r) => setTimeout(r, 30));
    }

    await input.onDone();
  }
}
