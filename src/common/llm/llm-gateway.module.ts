import { Global, Module } from '@nestjs/common';
import { parseEnv } from '../../config/env.schema';
import { LLM_GATEWAY } from './llm-gateway.interface';
import { LlmGatewayService } from './llm-gateway.service';
import { OpenAiCompatibleLlmProvider } from './providers/openai.provider';
import { StubProvider } from './providers/stub.provider';

@Global()
@Module({
  providers: [
    {
      provide: LLM_GATEWAY,
      useFactory: () => {
        const env = parseEnv(process.env);
        if (env.LLM_PROVIDER === 'dashscope') {
          return new OpenAiCompatibleLlmProvider(env, {
            apiKey: env.DASHSCOPE_API_KEY!,
            baseURL: env.DASHSCOPE_BASE_URL,
            intentModel: env.DASHSCOPE_INTENT_MODEL,
            chatModel: env.DASHSCOPE_MODEL,
          });
        }
        if (env.LLM_PROVIDER === 'deepseek') {
          return new OpenAiCompatibleLlmProvider(env, {
            apiKey: env.DEEPSEEK_API_KEY!,
            baseURL: env.DEEPSEEK_BASE_URL,
            intentModel: env.DEEPSEEK_INTENT_MODEL,
            chatModel: env.DEEPSEEK_MODEL,
          });
        }
        return new StubProvider();
      },
    },
    LlmGatewayService,
  ],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}
