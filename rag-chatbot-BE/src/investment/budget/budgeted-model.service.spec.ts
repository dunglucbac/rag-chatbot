import { ConfigService } from '@nestjs/config';
import { AIMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import { BudgetService } from './budget.service';
import { BudgetedModelService } from './budgeted-model.service';

describe('budgeted investment model', () => {
  const reserve = jest.fn();
  const finish = jest.fn();
  const invoke = jest.fn();
  const getModel = jest.fn();
  let service: BudgetedModelService;
  beforeEach(() => {
    reserve.mockReset().mockResolvedValue({ created: true });
    finish.mockReset().mockResolvedValue({ status: 'settled' });
    invoke.mockReset();
    getModel.mockReset().mockReturnValue({ invoke });
    service = new BudgetedModelService(
      new ConfigService({
        investment: { inputRate: '1000000', outputRate: '2000000' },
      }),
      { getModel } as unknown as LlmService,
      { reserve, finish } as unknown as BudgetService,
    );
  });
  it('reserves before inference and reconciles measured usage', async () => {
    invoke.mockResolvedValue(
      new AIMessage({
        content: 'Grounded report',
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 40,
          total_tokens: 140,
        },
      }),
    );
    const result = await service.invoke(
      'alice',
      '4e15685b-de2e-41e5-ab98-6091c8512a40',
      'system',
      'facts',
    );
    expect(result).toMatchObject({
      text: 'Grounded report',
      costMicros: '180',
    });
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
      invoke.mock.invocationCallOrder[0],
    );
    expect(getModel).toHaveBeenCalledWith({ maxTokens: 1200, maxRetries: 0 });
    expect(finish).toHaveBeenCalledWith('alice', expect.any(String), '180');
  });
  it('blocks calls over budget and keeps uncertain usage reserved', async () => {
    reserve.mockRejectedValueOnce(new Error('budget exhausted'));
    await expect(
      service.invoke(
        'alice',
        '4e15685b-de2e-41e5-ab98-6091c8512a40',
        'system',
        'facts',
      ),
    ).rejects.toThrow('budget exhausted');
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce(new AIMessage({ content: 'Unknown usage' }));
    await expect(
      service.invoke(
        'alice',
        '4e15685b-de2e-41e5-ab98-6091c8512a40',
        'system',
        'facts',
      ),
    ).rejects.toThrow('reservation remains pending');
    expect(finish).not.toHaveBeenCalled();
  });
});
