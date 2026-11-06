import { ConfigService } from '@nestjs/config';
import { BudgetService } from '../budget/budget.service';
import { InvestmentEmbeddingService } from './embedding.service';

describe('investment embeddings', () => {
  const reserve = jest.fn();
  const finish = jest.fn();
  let service: InvestmentEmbeddingService;
  beforeEach(() => {
    reserve.mockReset().mockResolvedValue({ created: true });
    finish.mockReset().mockResolvedValue({ status: 'settled' });
    service = new InvestmentEmbeddingService(
      new ConfigService({
        llm: { openaiApiKey: 'test-key' },
        investment: { embeddingRate: '20000' },
      }),
      { reserve, finish } as unknown as BudgetService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('reserves before the request, settles reported usage and orders vectors', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        expect(reserve).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        return new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: Array(1536).fill(2) },
              { index: 0, embedding: Array(1536).fill(1) },
            ],
            usage: { total_tokens: 100 },
          }),
          { status: 200 },
        );
      });
    const result = await service.embed('alice', ['abc', 'def']);
    expect(result[0][0]).toBe(1);
    expect(result[1][0]).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith('alice', expect.any(String), '2');
  });

  it('does not start a paid request when budget reservation fails', async () => {
    reserve.mockRejectedValue(new Error('budget exhausted'));
    const fetch = jest.spyOn(globalThis, 'fetch');
    await expect(service.embed('alice', ['abc'])).rejects.toThrow(
      'budget exhausted',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it('keeps the reservation pending when billing outcome is unknown', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    await expect(service.embed('alice', ['abc'])).rejects.toThrow(
      'reservation remains pending',
    );
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
  });
});
