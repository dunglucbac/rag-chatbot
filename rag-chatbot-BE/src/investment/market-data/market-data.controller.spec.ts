import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { GoogleAuthGuard } from '../../auth/google-auth.guard';
import { MarketDataProvider } from './market-data.provider';
import { MarketDataController } from './market-data.controller';
import { ValuationService } from './valuation.service';

describe('market data strategy routes', () => {
  let app: INestApplication;
  const provider = {
    isConfigured: () => true,
    quote: jest.fn().mockResolvedValue({ source: 'Other', symbol: 'VCB' }),
    researchSnapshot: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        { provide: MarketDataProvider, useValue: provider },
        { provide: ValuationService, useValue: {} },
      ],
    })
      .overrideGuard(GoogleAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('uses the injected provider on both the current and legacy routes', async () => {
    const server = app.getHttpServer() as Server;
    for (const path of [
      '/investments/market-data/quote/VCB',
      '/investments/finhay/quote/VCB',
    ]) {
      await request(server)
        .get(path)
        .expect(200)
        .expect({ source: 'Other', symbol: 'VCB' });
    }
    expect(provider.quote).toHaveBeenCalledTimes(2);
  });
});
