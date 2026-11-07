import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FinhayService } from './finhay.service';

const success = (data: unknown) =>
  new Response(JSON.stringify({ error_code: '0', message: 'success', data }), {
    status: 200,
  });
const quote = {
  symbol: 'VCB',
  currency: 'VND',
  price: 54000,
  updated_at: '2026-11-06T09:00:00+07:00',
};

describe('Finhay REST market-data strategy', () => {
  let service: FinhayService;
  beforeEach(() => {
    service = new FinhayService(
      new ConfigService({ finhay: { apiKey: 'test-api-key' } }),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the server key and maps the documented quote envelope', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(success(quote));
    expect(await service.quote('vcb')).toMatchObject({
      source: 'Finhay',
      symbol: 'VCB',
      priceVnd: 54000,
      updatedAt: quote.updated_at,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(
      'https://open-api.fhsc.com.vn/market/quotes/stocks/VCB',
    );
    expect(init).toMatchObject({
      headers: { 'X-FH-APIKEY': 'test-api-key' },
      redirect: 'error',
    });
  });

  it('preserves an unknown quote timestamp and rejects invalid symbols and mismatched data', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(success({ ...quote, updated_at: undefined }))
      .mockResolvedValueOnce(success({ ...quote, symbol: 'FPT' }));
    expect((await service.quote('VCB')).updatedAt).toBeNull();
    await expect(service.quote('VCB')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.quote('../VCB')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails closed without a key and does not reveal upstream errors', async () => {
    const missing = new FinhayService(new ConfigService());
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('secret', { status: 401 }));
    expect(missing.isConfigured()).toBe(false);
    await expect(missing.quote('VCB')).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
    await expect(service.quote('VCB')).rejects.toThrow(
      'Finhay quote unavailable',
    );
  });

  it('maps documented REST data into the existing research snapshot', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/market/quotes/stocks/VCB') return success(quote);
        if (url.pathname === '/market/company-financial/overview')
          return success({ pe: 10 });
        if (url.pathname === '/market/v2/financial-statement/statement')
          return success([{ year: 2026, quarter: 2, revenue: 10 }]);
        if (url.pathname.endsWith('/history'))
          return success({ symbol: 'VCB', series: [{ c: 54000 }] });
        if (url.pathname === '/market/market-news')
          return success({ results: [] });
        throw new Error('Unexpected endpoint');
      });
    const result = await service.researchSnapshot('vcb');
    expect(result).toMatchObject({
      symbol: 'VCB',
      unavailable: [],
      evidence: {
        quote,
        overview: { pe: 10 },
        'income-statement': { items: [{ year: 2026, revenue: 10 }] },
        history: { symbol: 'VCB' },
        news: { results: [] },
      },
    });
    const calls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(calls).toHaveLength(7);
    expect(calls[2].searchParams.get('type')).toBe('income-statement');
    expect(calls[2].searchParams.get('limit')).toBe('5');
    expect(calls[5].searchParams.get('resolution')).toBe('1D');
    expect(calls[6].searchParams.get('topic')).toBe('stock');
  });

  it('marks malformed, failed and mismatched evidence unavailable', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/market/market-news')
        return new Response('', { status: 429 });
      if (url.pathname.endsWith('/history'))
        return success({ symbol: 'FPT', series: [] });
      if (url.searchParams.get('type') === 'cash-flow')
        return success({ items: [] });
      if (url.pathname === '/market/quotes/stocks/VCB') return success(quote);
      if (url.pathname === '/market/company-financial/overview')
        return success({ pe: 10 });
      return success([{ year: 2026, revenue: 10 }]);
    });
    const result = await service.researchSnapshot('VCB');
    expect(result.unavailable).toEqual(['cash-flow', 'history', 'news']);
    expect(result.evidence).not.toHaveProperty('cash-flow');
  });
  it('stops requests after rate limiting until the provider reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 60;
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('', {
          status: 429,
          headers: { 'X-RateLimit-Reset': String(reset) },
        }),
      );
    const result = await service.researchSnapshot('VCB');
    expect(result.unavailable).toEqual([
      'quote',
      'overview',
      'income-statement',
      'balance-sheet',
      'cash-flow',
      'history',
      'news',
    ]);
    await expect(service.quote('VCB')).rejects.toThrow(
      'Finhay quote unavailable',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
