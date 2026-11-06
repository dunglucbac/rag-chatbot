import { Injectable } from '@nestjs/common';
import { InvestmentService } from '../investment.service';
import { FinhayService } from './finhay.service';

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
    private readonly finhay: FinhayService,
  ) {}

  async get(userId: string, symbol: string) {
    const stock = await this.investments.get(userId, symbol);
    const quote = await this.finhay.quote(userId, stock.symbol);
    const price =
      quote.priceVnd === null ? null : units(String(quote.priceVnd));
    const shares =
      stock.position.shares === null ? null : BigInt(stock.position.shares);
    const cost =
      stock.position.investedVnd === null
        ? null
        : units(stock.position.investedVnd);
    const market = price === null || shares === null ? null : price * shares;
    const quoteTime = Date.parse(quote.updatedAt);
    const ageMs = Date.now() - quoteTime;
    return {
      quote,
      marketValueVnd: market === null ? null : decimal(market),
      unrealizedProfitVnd:
        market === null || cost === null ? null : decimal(market - cost),
      quoteStale: ageMs > 15 * 60 * 1000 || ageMs < -5 * 60 * 1000,
      positionWarnings: stock.position.warnings,
    };
  }
}
