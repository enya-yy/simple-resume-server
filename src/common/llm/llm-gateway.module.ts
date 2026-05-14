import { Global, Module } from '@nestjs/common';
import { parseEnv } from '../../config/env.schema';
import { LLM_GATEWAY } from './llm-gateway.interface';
import { LlmGatewayService } from './llm-gateway.service';
import { DashScopeProvider } from './providers/openai.provider';
import { StubProvider } from './providers/stub.provider';

@Global()
@Module({
  providers: [
    {
      provide: LLM_GATEWAY,
      useFactory: () => {
        const env = parseEnv(process.env);
        if (env.LLM_PROVIDER === 'dashscope') return new DashScopeProvider(env);
        return new StubProvider();
      },
    },
    LlmGatewayService,
  ],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}
