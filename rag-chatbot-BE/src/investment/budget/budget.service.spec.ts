import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvestmentBudget } from '../entities/investment-budget.entity';
import { InvestmentReservation } from '../entities/investment-reservation.entity';
import { BudgetService } from './budget.service';

const id = '4e15685b-de2e-41e5-ab98-6091c8512a40';
const other = '4e15685b-de2e-41e5-ab98-6091c8512a41';
const now = new Date('2026-11-05T18:00:00Z');

describe('investment budget', () => {
  let db: DataSource;
  let budget: BudgetService;
  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [InvestmentBudget, InvestmentReservation],
      synchronize: true,
    }).initialize();
    budget = new BudgetService(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('reserves before work, rejects overspending and reconciles actual usage', async () => {
    expect((await budget.status('alice', now)).month).toBe('2026-11');
    expect((await budget.reserve('alice', id, '8000000', now)).created).toBe(
      true,
    );
    expect((await budget.reserve('alice', id, '8000000', now)).created).toBe(
      false,
    );
    await expect(
      budget.reserve('alice', other, '3000000', now),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await budget.finish('alice', id, '5000000')).toEqual({
      status: 'settled',
      overrun: false,
    });
    expect(await budget.status('alice', now)).toMatchObject({
      spentMicros: '5000000',
      reservedMicros: '0',
      remainingMicros: '5000000',
    });
    expect(await budget.finish('alice', id, '5000000')).toEqual({
      status: 'settled',
      overrun: false,
    });
    await expect(
      budget.reserve('alice', id, '8000000', now),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await budget.status('bob', now)).toMatchObject({
      remainingMicros: '10000000',
    });
  });

  it('preserves uncertain reservations and records overruns accurately', async () => {
    await budget.reserve('alice', id, '9000000', now);
    expect(await budget.status('alice', now)).toMatchObject({
      reservedMicros: '9000000',
      remainingMicros: '1000000',
    });
    expect(await budget.finish('alice', id, '11000000')).toEqual({
      status: 'settled',
      overrun: true,
    });
    expect(await budget.status('alice', now)).toMatchObject({
      spentMicros: '11000000',
      remainingMicros: '0',
    });
    await expect(
      budget.reserve('alice', other, '1', now),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses Vietnam month boundaries and releases unused reservations', async () => {
    const before = new Date('2026-10-31T16:59:59Z');
    const after = new Date('2026-10-31T17:00:00Z');
    expect((await budget.status('alice', before)).month).toBe('2026-10');
    expect((await budget.status('alice', after)).month).toBe('2026-11');
    await budget.reserve('alice', id, '1000000', before);
    expect(await budget.finish('alice', id, null)).toEqual({
      status: 'released',
      overrun: false,
    });
    expect((await budget.status('alice', before)).remainingMicros).toBe(
      '10000000',
    );
  });
});
