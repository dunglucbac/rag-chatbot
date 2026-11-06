import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';
import { InvestmentEvent } from './entities/investment-event.entity';
import { InvestmentStock } from './entities/investment-stock.entity';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Invalid date');
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/);
const price = amount.refine(
  (value) => /[1-9]/.test(value),
  'Price must be positive',
);
const shares = z.number().int().nonnegative().max(1_000_000_000);
const common = {
  requestId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  occurredOn: date,
  note: z.string().trim().max(2000).optional(),
};
const inputSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...common,
      type: z.literal('interest'),
      level: z.enum(['low', 'medium', 'high']),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('decision'),
      decision: z.enum(['buy', 'hold', 'reduce', 'avoid', 'wait']),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('buy'),
      shares: shares.positive(),
      priceVnd: price,
      feesVnd: amount.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('sell'),
      shares: shares.positive(),
      priceVnd: price,
      feesVnd: amount.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('position'),
      shares,
      averageCostVnd: price.optional(),
    })
    .strict(),
]);
type EventInput = z.infer<typeof inputSchema>;

function stockSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(symbol))
    throw new BadRequestException('Invalid stock symbol');
  return symbol;
}

function eventResult(event: InvestmentEvent) {
  return {
    id: event.id,
    requestId: event.requestId,
    type: event.type,
    occurredOn: event.occurredOn,
    ...event.details,
    createdAt: event.createdAt,
  };
}

@Injectable()
export class InvestmentService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string) {
    const stocks = await this.dataSource.getRepository(InvestmentStock).find({
      where: { userId },
      order: { symbol: 'ASC' },
    });
    return stocks.map(({ id, symbol, createdAt }) => ({
      id,
      symbol,
      createdAt,
    }));
  }

  async get(userId: string, value: string) {
    const symbol = stockSymbol(value);
    const stock = await this.dataSource
      .getRepository(InvestmentStock)
      .findOneBy({ userId, symbol });
    if (!stock) throw new NotFoundException('Stock not found');
    const events = await this.dataSource.getRepository(InvestmentEvent).find({
      where: { userId, stockId: stock.id },
      order: { occurredOn: 'DESC', createdAt: 'DESC', id: 'DESC' },
    });
    return { id: stock.id, symbol, events: events.map(eventResult) };
  }

  async record(userId: string, value: string, raw: unknown) {
    const symbol = stockSymbol(value);
    const result = inputSchema.safeParse(raw);
    if (!result.success)
      throw new BadRequestException({
        message: 'Invalid investment event',
        issues: result.error.issues,
      });
    const input = result.data;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager
          .getRepository(InvestmentEvent)
          .findOneBy({ userId, requestId: input.requestId });
        if (existing)
          return this.existingResult(manager, userId, symbol, input, existing);
        await manager
          .createQueryBuilder()
          .insert()
          .into(InvestmentStock)
          .values({ userId, symbol })
          .orIgnore()
          .execute();
        const stock = await manager
          .getRepository(InvestmentStock)
          .findOneByOrFail({ userId, symbol });
        const { requestId, type, occurredOn, ...details } = input;
        const event = manager.getRepository(InvestmentEvent).create({
          userId,
          stockId: stock.id,
          requestId,
          type,
          occurredOn,
          details,
        });
        await manager.getRepository(InvestmentEvent).save(event);
        return { symbol, event: eventResult(event), deduplicated: false };
      });
    } catch (error: unknown) {
      // A concurrent retry can win the unique request ID race after our first lookup.
      const existing = await this.dataSource
        .getRepository(InvestmentEvent)
        .findOneBy({ userId, requestId: input.requestId });
      if (existing)
        return this.existingResult(
          this.dataSource.manager,
          userId,
          symbol,
          input,
          existing,
        );
      throw error;
    }
  }

  private async existingResult(
    manager: EntityManager,
    userId: string,
    symbol: string,
    input: EventInput,
    event: InvestmentEvent,
  ) {
    const stock = await manager
      .getRepository(InvestmentStock)
      .findOneBy({ id: event.stockId, userId });
    const { requestId: _requestId, type, occurredOn, ...details } = input;
    void _requestId;
    if (
      !stock ||
      stock.symbol !== symbol ||
      event.type !== type ||
      event.occurredOn !== occurredOn ||
      JSON.stringify(event.details) !== JSON.stringify(details)
    ) {
      throw new ConflictException(
        'Request ID was already used for a different investment event',
      );
    }
    return { symbol, event: eventResult(event), deduplicated: true };
  }
}
