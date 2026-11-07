import { InvestmentService } from '../investment.service';
import { MarketDataProvider } from '../market-data/market-data.provider';
import { ValuationService } from './valuation.service';

describe('valuation', () => {
  it('uses exact decimals and leaves profit unknown when cost is missing', async () => {
    const investments = {
      get: jest.fn().mockResolvedValue({
        symbol: 'VCB',
        position: {
          shares: '500',
          investedVnd: '27000000.0000',
          warnings: [],
        },
      }),
    } as unknown as InvestmentService;
    const finhay = {
      quote: jest.fn().mockResolvedValue({
        priceVnd: 54000.25,
        updatedAt: new Date().toISOString(),
      }),
    } as unknown as MarketDataProvider;
    const service = new ValuationService(investments, finhay);
    expect(await service.get('alice', 'VCB')).toMatchObject({
      marketValueVnd: '27000125.0000',
      unrealizedProfitVnd: '125.0000',
      quoteStale: false,
    });
    jest.spyOn(investments, 'get').mockResolvedValueOnce({
      symbol: 'VCB',
      position: {
        shares: '500',
        investedVnd: null,
        warnings: ['cost_basis_unknown'],
      },
    } as never);
    expect(await service.get('alice', 'VCB')).toMatchObject({
      marketValueVnd: '27000125.0000',
      unrealizedProfitVnd: null,
    });
  });
  it('works with another market-data strategy and flags a missing timestamp', async () => {
    const investments = {
      get: jest
        .fn()
        .mockResolvedValue({
          symbol: 'VCB',
          position: { shares: '2', investedVnd: '100.0000', warnings: [] },
        }),
    } as unknown as InvestmentService;
    const provider = {
      quote: jest
        .fn()
        .mockResolvedValue({ source: 'Other', priceVnd: 60, updatedAt: null }),
    } as unknown as MarketDataProvider;
    const result = await new ValuationService(investments, provider).get(
      'alice',
      'VCB',
    );
    expect(result).toMatchObject({
      quote: { source: 'Other' },
      marketValueVnd: '120.0000',
      quoteStale: true,
    });
    expect(provider.quote).toHaveBeenCalledWith('VCB');
  });
});
