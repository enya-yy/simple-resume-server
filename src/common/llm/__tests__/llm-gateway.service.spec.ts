import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { LlmGatewayService } from '../llm-gateway.service';
import { LLM_GATEWAY } from '../llm-gateway.interface';
import type { ILlmGateway } from '../llm-gateway.interface';

describe('LlmGatewayService', () => {
  let service: LlmGatewayService;
  let mockProvider: jest.Mocked<ILlmGateway>;

  beforeEach(async () => {
    mockProvider = {
      dispatchResumeAgent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmGatewayService,
        { provide: LLM_GATEWAY, useValue: mockProvider },
      ],
    }).compile();

    service = module.get(LlmGatewayService);
  });

  describe('dispatchResumeAgent', () => {
    it('returns parsed turn on success', async () => {
      mockProvider.dispatchResumeAgent.mockResolvedValue({
        responseText: '',
        meta: {
          outcome: 'chat_only',
          intent: 'GENERAL_CHAT',
          confidence: 0.9,
        },
        mutationCalls: [],
        uiActions: [],
      });

      const result = await service.dispatchResumeAgent({
        userMessage: '你好',
        sessionId: 's1',
        requestId: 'r1',
      });

      expect(result.meta?.intent).toBe('GENERAL_CHAT');
    });

    it('falls back after retries exhausted', async () => {
      mockProvider.dispatchResumeAgent
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout again'));

      const result = await service.dispatchResumeAgent({
        userMessage: 'test',
        sessionId: 's1',
        requestId: 'r1',
      });

      expect(result.meta?.intent).toBe('GENERAL_CHAT');
      expect(mockProvider.dispatchResumeAgent).toHaveBeenCalledTimes(2);
    });

    it('never logs raw userMessage on retry/fallback logs', async () => {
      const sensitiveInput = 'my raw resume text: 张三 13800000000';
      mockProvider.dispatchResumeAgent
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout again'));

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.dispatchResumeAgent({
        userMessage: sensitiveInput,
        sessionId: 's1',
        requestId: 'r1',
      });

      const logged = JSON.stringify([
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(logged).not.toContain(sensitiveInput);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
