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
    expect(alice.position).toMatchObject({
      shares: '500',
      averageCostVnd: '54000.0000',
      investedVnd: '27000000.0000',
    });
    expect(alice.position.warnings).toContain('purchase_fees_not_provided');
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

  it('corrects an owned event without losing history and prevents conflicting corrections', async () => {
    const buy = {
      requestId,
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 500,
      priceVnd: '54000',
    };
    const original = await service.record('alice', 'VCB', buy);
    const correction = {
      ...buy,
      requestId: '095278a6-2f63-46ba-b5a7-cc6d58b6876e',
      supersedesId: original.event.id,
      shares: 600,
    };
    await expect(
      service.record('bob', 'VCB', correction),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await service.record('alice', 'VCB', correction)).deduplicated,
    ).toBe(false);
    expect(
      (await service.record('alice', 'VCB', correction)).deduplicated,
    ).toBe(true);
    const result = await service.get('alice', 'VCB');
    expect(result.position.shares).toBe('600');
    expect(result.events).toHaveLength(2);
    expect(
      result.events.find((event) => event.id === original.event.id)
        ?.supersededById,
    ).toBeTruthy();
    await expect(
      service.record('alice', 'VCB', {
        ...correction,
        requestId: '11af413b-264c-44e7-a79b-8e093dc9f3f2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a corrected trade in its original position among same-day trades', async () => {
    const buy = await service.record('alice', 'VCB', {
      requestId,
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 100,
      priceVnd: '10',
    });
    const sell = await service.record('alice', 'VCB', {
      requestId: 'ad669b72-75d4-4fd1-b546-f700f0c4d620',
      type: 'sell',
      occurredOn: '2025-11-06',
      shares: 80,
      priceVnd: '11',
    });
    await db
      .getRepository(InvestmentEvent)
      .update(
        { id: buy.event.id },
        { createdAt: new Date('2025-11-06T01:00:00Z') },
      );
    await db
      .getRepository(InvestmentEvent)
      .update(
        { id: sell.event.id },
        { createdAt: new Date('2025-11-06T02:00:00Z') },
      );
    await service.record('alice', 'VCB', {
      requestId: '095278a6-2f63-46ba-b5a7-cc6d58b6876e',
      supersedesId: buy.event.id,
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 90,
      priceVnd: '10',
    });
    const result = await service.get('alice', 'VCB');
    expect(result.position.shares).toBe('10');
    expect(result.position.warnings).toContain('same_day_order_assumed');
  });
});
