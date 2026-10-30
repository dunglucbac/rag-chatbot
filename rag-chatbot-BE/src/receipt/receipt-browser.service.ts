import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Receipt } from './entities/receipt.entity';
import {
  ReceiptCategorizationStatus,
  ReceiptItem,
} from './entities/receipt-item.entity';
import { receiptDataSchema } from '../common/event-payloads.schemas';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

const updateSchema = z
  .object({ revision: z.number().int().positive(), receipt: receiptDataSchema })
  .strict();

function publicReceipt(receipt: Receipt) {
  return {
    id: receipt.id,
    ingestionJobId: receipt.ingestionJobId,
    merchant: receipt.merchant,
    purchasedAt: receipt.purchasedAt,
    total: Number(receipt.total),
    tax: receipt.tax === null ? null : Number(receipt.tax),
    currency: receipt.currency,
    updatedAt: receipt.updatedAt,
    revision: receipt.revision,
    lineItems: (receipt.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity === null ? null : Number(item.quantity),
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      category: item.category,
      categorizationStatus: item.categorizationStatus,
    })),
  };
}

function localDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException('Use dates in YYYY-MM-DD format');
  const utc = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(utc.getTime()) ||
    utc.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Invalid date');
  return new Date(`${value}T00:00:00+07:00`);
}

@Injectable()
export class ReceiptBrowserService {
  private readonly logger = new Logger(ReceiptBrowserService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly queue: MessageQueueService,
  ) {}

  async list(
    userId: string,
    filters: {
      q?: string;
      from?: string;
      to?: string;
      ingestionJobId?: string;
    },
    offset: number,
  ) {
    const query = this.dataSource
      .getRepository(Receipt)
      .createQueryBuilder('receipt')
      .where('receipt.userId = :userId', { userId });
    if (filters.q?.trim()) {
      if (filters.q.length > 200)
        throw new BadRequestException('Search is too long');
      const pattern = `%${filters.q
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
      query.andWhere(
        `(LOWER(receipt.merchant) LIKE :pattern ESCAPE '\\' OR EXISTS (SELECT 1 FROM receipt_items item WHERE item.receipt_id = receipt.id AND LOWER(item.name) LIKE :pattern ESCAPE '\\'))`,
        { pattern },
      );
    }
    const start = filters.from ? localDate(filters.from) : null;
    const end = filters.to
      ? new Date(localDate(filters.to).getTime() + 86400000)
      : null;
    if (start && end && start >= end)
      throw new BadRequestException('End date must be on or after start date');
    if (start) query.andWhere('receipt.purchasedAt >= :start', { start });
    if (end) query.andWhere('receipt.purchasedAt < :end', { end });
    if (filters.ingestionJobId)
      query.andWhere('receipt.ingestionJobId = :jobId', {
        jobId: filters.ingestionJobId,
      });
    const rows = await query
      .orderBy('receipt.purchasedAt', 'DESC')
      .addOrderBy('receipt.id', 'DESC')
      .skip(offset)
      .take(31)
      .getMany();
    return {
      receipts: rows.slice(0, 30).map(publicReceipt),
      nextOffset: rows.length > 30 ? offset + 30 : null,
    };
  }

  async get(userId: string, id: string) {
    const receipt = await this.dataSource.getRepository(Receipt).findOne({
      where: { id, userId },
      relations: ['items'],
      order: { items: { createdAt: 'ASC', id: 'ASC' } },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return publicReceipt(receipt);
  }

  async update(userId: string, id: string, input: unknown) {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid receipt details');
    const { revision, receipt } = parsed.data;
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Receipt);
      if (!(await repository.findOneBy({ id, userId })))
        throw new NotFoundException('Receipt not found');
      const result = await repository.update(
        { id, userId, revision },
        {
          merchant: receipt.merchant,
          purchasedAt: new Date(receipt.purchasedAt),
          total: receipt.total,
          tax: receipt.tax ?? null,
          currency: receipt.currency.toUpperCase(),
          revision: revision + 1,
        },
      );
      if (result.affected !== 1)
        throw new ConflictException(
          'This receipt changed on another device. Reload it before editing again.',
        );
      const items = manager.getRepository(ReceiptItem);
      await items.delete({ receiptId: id });
      await items.save(
        receipt.lineItems.map((item) =>
          items.create({
            receiptId: id,
            name: item.name,
            quantity: item.quantity ?? null,
            unitPrice: item.unitPrice ?? null,
            totalPrice: item.totalPrice,
            category: null,
            subcategory: null,
            categorizationStatus: ReceiptCategorizationStatus.PENDING,
            categoryConfidence: null,
            taxonomyVersion: null,
            classificationMetadata: null,
          }),
        ),
      );
    });
    let categorizationQueued = true;
    try {
      await this.queue.publish(
        'receipt.items.categorize',
        { receiptId: id, userId },
        id,
        1,
        1,
      );
    } catch {
      categorizationQueued = false;
      await this.dataSource.getRepository(ReceiptItem).update(
        {
          receiptId: id,
          categorizationStatus: ReceiptCategorizationStatus.PENDING,
        },
        { categorizationStatus: ReceiptCategorizationStatus.FAILED },
      );
      this.logger.error(
        `Unable to queue edited receipt categorization [receiptId=${id}]`,
      );
    }
    return { receipt: await this.get(userId, id), categorizationQueued };
  }
}
