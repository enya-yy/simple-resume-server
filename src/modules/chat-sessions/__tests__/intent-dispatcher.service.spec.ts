import { Test, TestingModule } from '@nestjs/testing';
import { IntentDispatcherService } from '../intent-dispatcher.service';
import { LlmGatewayService } from '../../../common/llm/llm-gateway.service';

describe('IntentDispatcherService', () => {
  let service: IntentDispatcherService;
  let mockLlmGateway: jest.Mocked<LlmGatewayService>;

  beforeEach(async () => {
    mockLlmGateway = {
      dispatchIntent: jest.fn(),
      streamChat: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentDispatcherService,
        { provide: LlmGatewayService, useValue: mockLlmGateway },
      ],
    }).compile();

    service = module.get(IntentDispatcherService);
  });

  it('returns no suggestions for high-confidence intent', async () => {
    mockLlmGateway.dispatchIntent.mockResolvedValue({
      intent: 'CREATE_RESUME',
      confidence: 0.95,
      responseText: '让我帮你创建简历',
    });

    const result = await service.dispatch({
      userMessage: '我想创建简历',
      sessionId: 's1',
      requestId: 'r1',
      confidenceThreshold: 0.6,
    });

    expect(result.isLowConfidence).toBe(false);
    expect(result.suggestions).toEqual([]);
    expect(result.intentResult.intent).toBe('CREATE_RESUME');
  });

  it('returns >= 3 suggestions for low-confidence intent', async () => {
    mockLlmGateway.dispatchIntent.mockResolvedValue({
      intent: 'GENERAL_CHAT',
      confidence: 0.3,
      responseText: '不太确定你想做什么',
    });

    const result = await service.dispatch({
      userMessage: '嗯...',
      sessionId: 's1',
      requestId: 'r1',
      confidenceThreshold: 0.6,
    });

    expect(result.isLowConfidence).toBe(true);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('propagates error when LlmGatewayService throws (handled by caller)', async () => {
    mockLlmGateway.dispatchIntent.mockRejectedValue(new Error('LLM timeout'));

    await expect(
      service.dispatch({
        userMessage: 'test',
        sessionId: 's1',
        requestId: 'r1',
        confidenceThreshold: 0.6,
      }),
    ).rejects.toThrow('LLM timeout');
  });
});
