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
      dispatchIntent: jest.fn(),
      streamChat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmGatewayService,
        { provide: LLM_GATEWAY, useValue: mockProvider },
      ],
    }).compile();

    service = module.get(LlmGatewayService);
  });

  describe('dispatchIntent', () => {
    it('returns parsed result on success', async () => {
      const validResult = {
        intent: 'CREATE_RESUME' as const,
        confidence: 0.95,
        responseText: '好的，帮你创建简历',
      };
      mockProvider.dispatchIntent.mockResolvedValue(validResult);

      const result = await service.dispatchIntent({
        userMessage: '创建简历',
        sessionId: 's1',
        requestId: 'r1',
      });

      expect(result.intent).toBe('CREATE_RESUME');
      expect(result.confidence).toBe(0.95);
    });

    it('retries once on failure then falls back to GENERAL_CHAT', async () => {
      mockProvider.dispatchIntent
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout again'));

      const result = await service.dispatchIntent({
        userMessage: 'test',
        sessionId: 's1',
        requestId: 'r1',
      });

      expect(result.intent).toBe('GENERAL_CHAT');
      expect(mockProvider.dispatchIntent).toHaveBeenCalledTimes(2);
    });

    it('succeeds on retry after first failure', async () => {
      const validResult = {
        intent: 'SHOW_PREVIEW' as const,
        confidence: 0.8,
        responseText: '展示预览',
      };
      mockProvider.dispatchIntent
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(validResult);

      const result = await service.dispatchIntent({
        userMessage: '看看',
        sessionId: 's1',
        requestId: 'r1',
      });

      expect(result.intent).toBe('SHOW_PREVIEW');
      expect(mockProvider.dispatchIntent).toHaveBeenCalledTimes(2);
    });

    it('never logs raw userMessage on retry/fallback logs', async () => {
      const sensitiveInput = 'my raw resume text: 张三 13800000000';
      mockProvider.dispatchIntent
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout again'));

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.dispatchIntent({
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
