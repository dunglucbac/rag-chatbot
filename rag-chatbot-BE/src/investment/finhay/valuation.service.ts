import { Injectable } from '@nestjs/common';
import { InvestmentService } from '../investment.service';
import { MarketDataProvider } from '../market-data/market-data.provider';

function units(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
function decimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const positive = value < 0n ? -value : value;
  return `${sign}${positive / 10000n}.${(positive % 10000n).toString().padStart(4, '0')}`;
}

@Injectable()
export class ValuationService {
  constructor(
    private readonly investments: InvestmentService,
    private readonly marketData: MarketDataProvider,
  ) {}

  async get(userId: string, symbol: string) {
    const stock = await this.investments.get(userId, symbol);
    const quote = await this.marketData.quote(stock.symbol);
    const price =
      quote.priceVnd === null ? null : units(String(quote.priceVnd));
    const shares =
      stock.position.shares === null ? null : BigInt(stock.position.shares);
    const cost =
      stock.position.investedVnd === null
        ? null
        : units(stock.position.investedVnd);
    const market = price === null || shares === null ? null : price * shares;
    const quoteTime = quote.updatedAt ? Date.parse(quote.updatedAt) : NaN;
    const ageMs = Date.now() - quoteTime;
    return {
      quote,
      marketValueVnd: market === null ? null : decimal(market),
      unrealizedProfitVnd:
        market === null || cost === null ? null : decimal(market - cost),
      quoteStale:
        !Number.isFinite(quoteTime) ||
        ageMs > 15 * 60 * 1000 ||
        ageMs < -5 * 60 * 1000,
      positionWarnings: stock.position.warnings,
    };
  }
}
