import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvestmentEvent } from './entities/investment-event.entity';
import { InvestmentStock } from './entities/investment-stock.entity';
import { InvestmentService } from './investment.service';

const requestId = '4e15685b-de2e-41e5-ab98-6091c8512a40';

describe('InvestmentService', () => {
  let db: DataSource;
  let service: InvestmentService;

  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [InvestmentStock, InvestmentEvent],
      synchronize: true,
    }).initialize();
    service = new InvestmentService(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('records trades and positions separately from decisions and isolates users', async () => {
    await service.record('alice', 'vcb', {
      requestId,
      type: 'buy',
      occurredOn: '2026-11-06',
      shares: 500,
      priceVnd: '54000',
    });
    await service.record('alice', 'VCB', {
      requestId: 'ad669b72-75d4-4fd1-b546-f700f0c4d620',
      type: 'decision',
      occurredOn: '2026-11-07',
      decision: 'wait',
    });
    await service.record('bob', 'VCB', {
      requestId,
      type: 'position',
      occurredOn: '2026-11-06',
      shares: 30,
    });
    const alice = await service.get('alice', 'VCB');
    expect(alice.events.map((event) => event.type)).toEqual([
      'decision',
      'buy',
    ]);
    expect(alice.events[1]).toMatchObject({ shares: 500, priceVnd: '54000' });
    expect((await service.get('bob', 'VCB')).events).toHaveLength(1);
    expect(await service.list('alice')).toHaveLength(1);
    await expect(service.get('charlie', 'VCB')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deduplicates an identical request and rejects request ID reuse with different data or symbol', async () => {
    const buy = {
      requestId,
      type: 'buy',
      occurredOn: '2026-11-06',
      shares: 500,
      priceVnd: '54000',
    };
    expect((await service.record('alice', 'VCB', buy)).deduplicated).toBe(
      false,
    );
    expect((await service.record('alice', 'vcb', buy)).deduplicated).toBe(true);
    expect(
      (
        await service.record('alice', 'vcb', {
          ...buy,
          requestId: requestId.toUpperCase(),
        })
      ).deduplicated,
    ).toBe(true);
    await expect(
      service.record('alice', 'VCB', { ...buy, shares: 501 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.record('alice', 'MWG', buy)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await service.list('alice')).toHaveLength(1);
    expect((await service.get('alice', 'VCB')).events).toHaveLength(1);
  });

  it('rejects invalid dates, ambiguous prices and invented fields before saving', async () => {
    const buy = {
      requestId,
      type: 'buy',
      occurredOn: '2026-02-30',
      shares: 500,
      priceVnd: '54000',
    };
    await expect(service.record('alice', 'VCB', buy)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.record('alice', 'VCB', {
        ...buy,
        occurredOn: '2026-11-06',
        priceVnd: 54000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.record('alice', 'VCB', {
        ...buy,
        occurredOn: '2026-11-06',
        placedOrder: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.record('alice', '../VCB', buy)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await service.list('alice')).toEqual([]);
  });
});
