import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { MarketDataProvider } from '../market-data/market-data.provider';

const BASE_URL = 'https://open-api.fhsc.com.vn';
const quoteSchema = z.object({
  symbol: z.string(),
  currency: z.literal('VND'),
  price: z.number().finite().positive().nullable(),
  updated_at: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)))
    .nullish(),
  change: z.number().finite().nullish(),
  change_percent: z.number().finite().nullish(),
});
const envelope = z.object({ error_code: z.literal('0'), data: z.unknown() });
const object = z.record(z.unknown());

function stockSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(symbol))
    throw new BadRequestException('Invalid stock symbol');
  return symbol;
}

@Injectable()
export class FinhayService implements MarketDataProvider {
  private rateLimitedUntil = 0;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('finhay.apiKey')?.trim());
  }

  private async request(path: string, params: Record<string, string> = {}) {
    const key = this.config.get<string>('finhay.apiKey')?.trim();
    if (!key)
      throw new ServiceUnavailableException('Market data is not configured');
    if (Date.now() < this.rateLimitedUntil)
      throw new Error('Finhay rate limited');
    const url = new URL(path, BASE_URL);
    for (const [name, value] of Object.entries(params))
      url.searchParams.set(name, value);
    const response = await fetch(url, {
      headers: { 'X-FH-APIKEY': key },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      this.rateLimitedUntil =
        Number.isFinite(reset) && reset > Date.now()
          ? reset
          : Date.now() + 60000;
    }
    if (!response.ok) throw new Error('Finhay request failed');
    const length = Number(response.headers.get('content-length'));
    if (length > 250000) throw new Error('Finhay response too large');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 250000)
      throw new Error('Finhay response too large');
    return envelope.parse(JSON.parse(text) as unknown).data;
  }

  private validateQuote(data: unknown, symbol: string) {
    const quote = quoteSchema.parse(data);
    if (quote.symbol.toUpperCase() !== symbol)
      throw new Error('Incorrect symbol');
    return quote;
  }

  async quote(value: string) {
    const symbol = stockSymbol(value);
    if (!this.isConfigured())
      throw new ServiceUnavailableException('Market data is not configured');
    try {
      const quote = this.validateQuote(
        await this.request(`/market/quotes/stocks/${symbol}`),
        symbol,
      );
      return {
        source: 'Finhay',
        symbol,
        priceVnd: quote.price,
        currency: quote.currency,
        updatedAt: quote.updated_at ?? null,
        change: quote.change ?? null,
        changePercent: quote.change_percent ?? null,
      };
    } catch {
      throw new ServiceUnavailableException('Finhay quote unavailable');
    }
  }

  async researchSnapshot(value: string) {
    const symbol = stockSymbol(value);
    if (!this.isConfigured())
      throw new ServiceUnavailableException('Market data is not configured');
    const now = Math.floor(Date.now() / 1000);
    const calls: Array<{
      key: string;
      path: string;
      params?: Record<string, string>;
    }> = [
      { key: 'quote', path: `/market/quotes/stocks/${symbol}` },
      {
        key: 'overview',
        path: '/market/company-financial/overview',
        params: { symbol },
      },
      ...['income-statement', 'balance-sheet', 'cash-flow'].map((type) => ({
        key: type,
        path: '/market/v2/financial-statement/statement',
        params: { symbol, type, period: 'quarterly', limit: '5' },
      })),
      {
        key: 'history',
        path: `/market/quotes/stocks/${symbol}/history`,
        params: {
          from: String(now - 366 * 86400),
          to: String(now),
          resolution: '1D',
        },
      },
      {
        key: 'news',
        path: '/market/market-news',
        params: { symbol, topic: 'stock', page: '1', page_size: '10' },
      },
    ];
    const evidence: Record<string, unknown> = {};
    const unavailable: string[] = [];
    for (const call of calls) {
      try {
        const data = await this.request(call.path, call.params);
        if (
          ['income-statement', 'balance-sheet', 'cash-flow'].includes(call.key)
        ) {
          evidence[call.key] = { items: z.array(object).parse(data) };
          continue;
        }
        const value = object.parse(data);
        if (call.key === 'quote') this.validateQuote(value, symbol);
        if (
          typeof value.symbol === 'string' &&
          value.symbol.toUpperCase() !== symbol
        )
          throw new Error('Incorrect symbol');
        if (call.key === 'history') z.array(z.unknown()).parse(value.series);
        if (call.key === 'news') z.array(z.unknown()).parse(value.results);
        evidence[call.key] = value;
      } catch {
        unavailable.push(call.key);
      }
    }
    return {
      source: 'Finhay',
      symbol,
      retrievedAt: new Date().toISOString(),
      evidence,
      unavailable,
    };
  }
}
