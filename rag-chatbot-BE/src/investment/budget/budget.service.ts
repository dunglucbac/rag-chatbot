import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InvestmentBudget } from '../entities/investment-budget.entity';
import { InvestmentReservation } from '../entities/investment-reservation.entity';

const LIMIT = 10_000_000n;
const MAX_INT64 = 9_223_372_036_854_775_807n;
const requestPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function monthInVietnam(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
function micros(value: string, positive: boolean): bigint {
  if (!/^\d{1,19}$/.test(value))
    throw new BadRequestException('Invalid budget amount');
  const amount = BigInt(value);
  if (amount > MAX_INT64 || (positive && amount === 0n))
    throw new BadRequestException('Invalid budget amount');
  return amount;
}
function requestId(value: string): string {
  if (!requestPattern.test(value))
    throw new BadRequestException('Invalid reservation ID');
  return value.toLowerCase();
}
function publicBudget(month: string, spent: bigint, reserved: bigint) {
  const remainder = LIMIT - spent - reserved;
  return {
    month,
    currency: 'USD',
    limitMicros: LIMIT.toString(),
    spentMicros: spent.toString(),
    reservedMicros: reserved.toString(),
    remainingMicros: (remainder > 0n ? remainder : 0n).toString(),
  };
}

@Injectable()
export class BudgetService {
  constructor(private readonly dataSource: DataSource) {}

  private async lock(manager: EntityManager, userId: string, month: string) {
    const query = manager
      .getRepository(InvestmentBudget)
      .createQueryBuilder('budget')
      .where('budget.userId = :userId AND budget.month = :month', {
        userId,
        month,
      });
    if (this.dataSource.options.type === 'postgres')
      query.setLock('pessimistic_write');
    return query.getOne();
  }

  async status(userId: string, now = new Date()) {
    const month = monthInVietnam(now);
    const budget = await this.dataSource
      .getRepository(InvestmentBudget)
      .findOneBy({ userId, month });
    return publicBudget(
      month,
      BigInt(budget?.spentMicros ?? 0),
      BigInt(budget?.reservedMicros ?? 0),
    );
  }

  async reserve(
    userId: string,
    id: string,
    estimateMicros: string,
    now = new Date(),
  ) {
    const normalizedId = requestId(id);
    const estimate = micros(estimateMicros, true);
    const month = monthInVietnam(now);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .insert()
          .into(InvestmentBudget)
          .values({ userId, month, spentMicros: '0', reservedMicros: '0' })
          .orIgnore()
          .execute();
        const budget = await this.lock(manager, userId, month);
        if (!budget) throw new Error('Budget row unavailable');
        const prior = await manager
          .getRepository(InvestmentReservation)
          .findOneBy({ userId, requestId: normalizedId });
        if (prior) {
          if (
            prior.budgetId !== budget.id ||
            BigInt(prior.reservedMicros) !== estimate ||
            prior.status !== 'pending'
          )
            throw new ConflictException('Reservation ID already used');
          return { id: prior.id, created: false };
        }
        const spent = BigInt(budget.spentMicros);
        const reserved = BigInt(budget.reservedMicros);
        if (spent + reserved + estimate > LIMIT)
          throw new ConflictException('Monthly investment AI budget exhausted');
        const reservation = manager
          .getRepository(InvestmentReservation)
          .create({
            userId,
            budgetId: budget.id,
            requestId: normalizedId,
            reservedMicros: estimate.toString(),
            actualMicros: null,
            status: 'pending',
          });
        await manager.getRepository(InvestmentReservation).save(reservation);
        budget.reservedMicros = (reserved + estimate).toString();
        await manager.getRepository(InvestmentBudget).save(budget);
        return { id: reservation.id, created: true };
      });
    } catch (error: unknown) {
      const prior = await this.dataSource
        .getRepository(InvestmentReservation)
        .findOneBy({ userId, requestId: normalizedId });
      if (prior) {
        const budget = await this.dataSource
          .getRepository(InvestmentBudget)
          .findOneBy({ id: prior.budgetId, userId });
        if (
          budget?.month === month &&
          BigInt(prior.reservedMicros) === estimate &&
          prior.status === 'pending'
        )
          return { id: prior.id, created: false };
        throw new ConflictException('Reservation ID already used');
      }
      throw error;
    }
  }

  async finish(userId: string, id: string, actualMicros: string | null) {
    const normalizedId = requestId(id);
    const actual = actualMicros === null ? null : micros(actualMicros, false);
    const existing = await this.dataSource
      .getRepository(InvestmentReservation)
      .findOneBy({ userId, requestId: normalizedId });
    if (!existing) throw new NotFoundException('Reservation not found');
    return this.dataSource.transaction(async (manager) => {
      const oldBudget = await manager
        .getRepository(InvestmentBudget)
        .findOneByOrFail({ id: existing.budgetId, userId });
      const budget = await this.lock(manager, userId, oldBudget.month);
      if (!budget) throw new NotFoundException('Budget not found');
      const reservation = await manager
        .getRepository(InvestmentReservation)
        .findOneByOrFail({ userId, requestId: normalizedId });
      const expectedStatus = actual === null ? 'released' : 'settled';
      if (reservation.status !== 'pending') {
        if (
          reservation.status === expectedStatus &&
          (actual === null || BigInt(reservation.actualMicros!) === actual)
        )
          return {
            status: reservation.status,
            overrun:
              actual !== null && actual > BigInt(reservation.reservedMicros),
          };
        throw new ConflictException('Reservation already finalized');
      }
      const spent = BigInt(budget.spentMicros) + (actual ?? 0n);
      if (spent > MAX_INT64)
        throw new BadRequestException('Budget amount exceeds storage limits');
      budget.spentMicros = spent.toString();
      budget.reservedMicros = (
        BigInt(budget.reservedMicros) - BigInt(reservation.reservedMicros)
      ).toString();
      reservation.status = expectedStatus;
      reservation.actualMicros = actual?.toString() ?? null;
      await manager.getRepository(InvestmentBudget).save(budget);
      await manager.getRepository(InvestmentReservation).save(reservation);
      return {
        status: expectedStatus,
        overrun: actual !== null && actual > BigInt(reservation.reservedMicros),
      };
    });
  }
}
