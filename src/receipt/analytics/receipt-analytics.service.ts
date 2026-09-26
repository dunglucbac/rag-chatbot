import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Receipt } from '../entities/receipt.entity';
import { ReceiptItem } from '../entities/receipt-item.entity';
import { ReceiptCategorizationStatus } from '../entities/receipt-item.entity';
import {
  DateRangeInput,
  DateRangeResolver,
  ResolvedDateRange,
} from './date-range-resolver';
import {
  InvalidPurchaseCursorError,
  PurchaseCursorBinding,
  PurchaseCursorCodec,
} from './purchase-cursor.codec';

export interface PurchaseSummary {
  range: ResolvedDateRange;
  asOf: Date;
  receiptCount: number;
  lineItemCount: number;
  purchasedUnitCount: number;
  totalsByCurrency: Array<{ currency: string; total: number }>;
  categoryTotals: Array<{
    category: string;
    currency: string;
    total: number;
  }>;
  categorizationCoverage: {
    categorizedItemCount: number;
    uncategorizedItemCount: number;
    ratio: number;
  };
  receiptReferences: Array<{
    receiptRef: string;
    merchant: string;
    purchasedAt: Date;
    currency: string;
    total: number;
  }>;
}

export type SearchPurchaseItemsInput = DateRangeInput & {
  query?: string;
  merchant?: string;
  category?: string;
  sortBy?: 'totalPrice' | 'purchasedAt';
  pageSize?: number;
  cursor?: string;
};

export interface PurchaseItemSearchResult {
  range: ResolvedDateRange;
  asOf: Date;
  items: Array<{
    itemRef: string;
    receiptRef: string;
    name: string;
    quantity: number | null;
    unitPrice: number | null;
    totalPrice: number;
    category: string | null;
    merchant: string;
    purchasedAt: Date;
    currency: string;
  }>;
  nextCursor: string | null;
}

@Injectable()
export class ReceiptAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dateRangeResolver: DateRangeResolver,
    private readonly purchaseCursorCodec: PurchaseCursorCodec,
  ) {}

  async getPurchaseSummary(
    userId: string,
    input: DateRangeInput,
    now = new Date(),
  ): Promise<PurchaseSummary> {
    const range = this.dateRangeResolver.resolve(input, now);
    const receipts = await this.dataSource
      .getRepository(Receipt)
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.items', 'item')
      .where('receipt.user_id = :userId', { userId })
      .andWhere('receipt.purchased_at >= :start', { start: range.start })
      .andWhere('receipt.purchased_at < :end', { end: range.end })
      .getMany();
    const totalsByCurrency = new Map<string, number>();
    const categoryTotals = new Map<string, number>();
    let lineItemCount = 0;
    let purchasedUnitCount = 0;
    let categorizedItemCount = 0;

    for (const receipt of receipts) {
      totalsByCurrency.set(
        receipt.currency,
        (totalsByCurrency.get(receipt.currency) ?? 0) + Number(receipt.total),
      );
      for (const item of receipt.items ?? []) {
        lineItemCount += 1;
        purchasedUnitCount +=
          item.quantity === null ? 1 : Number(item.quantity);
        const category = item.category?.trim().toLocaleLowerCase('en-US');
        if (
          item.categorizationStatus === ReceiptCategorizationStatus.COMPLETED &&
          category &&
          category !== 'unknown'
        ) {
          categorizedItemCount += 1;
          const key = `${category}\u0000${receipt.currency}`;
          categoryTotals.set(
            key,
            (categoryTotals.get(key) ?? 0) + Number(item.totalPrice),
          );
        }
      }
    }
    const uncategorizedItemCount = lineItemCount - categorizedItemCount;

    return {
      range,
      asOf: now,
      receiptCount: receipts.length,
      lineItemCount,
      purchasedUnitCount,
      totalsByCurrency: [...totalsByCurrency.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, total]) => ({ currency, total })),
      categoryTotals: [...categoryTotals.entries()]
        .map(([key, total]) => {
          const [category, currency] = key.split('\u0000');
          return { category, currency, total };
        })
        .sort((left, right) =>
          left.category === right.category
            ? left.currency.localeCompare(right.currency)
            : left.category.localeCompare(right.category),
        ),
      categorizationCoverage: {
        categorizedItemCount,
        uncategorizedItemCount,
        ratio: lineItemCount === 0 ? 0 : categorizedItemCount / lineItemCount,
      },
      receiptReferences: receipts
        .slice()
        .sort(
          (left, right) =>
            right.purchasedAt.getTime() - left.purchasedAt.getTime() ||
            right.id.localeCompare(left.id),
        )
        .slice(0, 5)
        .map((receipt) => ({
          receiptRef: receipt.id,
          merchant: receipt.merchant,
          purchasedAt: receipt.purchasedAt,
          currency: receipt.currency,
          total: Number(receipt.total),
        })),
    };
  }

  async searchPurchaseItems(
    userId: string,
    input: SearchPurchaseItemsInput,
    now = new Date(),
  ): Promise<PurchaseItemSearchResult> {
    const range = this.dateRangeResolver.resolve(input, now);
    const filters = {
      query: this.normalizeFilter(input.query),
      merchant: this.normalizeFilter(input.merchant),
      category: this.normalizeFilter(input.category),
    };
    const sortBy = input.sortBy ?? 'totalPrice';
    const binding: PurchaseCursorBinding = {
      userId,
      filterFingerprint: createHash('sha256')
        .update(JSON.stringify(filters))
        .digest('base64url'),
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      sortBy,
    };
    const cursorPosition = input.cursor
      ? this.purchaseCursorCodec.decode(input.cursor, binding)
      : null;
    const asOf = cursorPosition ? new Date(cursorPosition.asOf) : now;
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 50);
    const query = this.dataSource
      .getRepository(ReceiptItem)
      .createQueryBuilder('item')
      .innerJoinAndSelect('item.receipt', 'receipt')
      .where('receipt.user_id = :userId', { userId })
      .andWhere('receipt.purchased_at >= :start', { start: range.start })
      .andWhere('receipt.purchased_at < :end', { end: range.end })
      .andWhere('item.created_at <= :asOf', { asOf });

    if (filters.query) {
      query.andWhere('LOWER(item.name) LIKE :itemQuery', {
        itemQuery: `%${filters.query}%`,
      });
    }
    if (filters.merchant) {
      query.andWhere('LOWER(receipt.merchant) LIKE :merchant', {
        merchant: `%${filters.merchant}%`,
      });
    }
    if (filters.category) {
      query.andWhere('LOWER(item.category) = :category', {
        category: filters.category,
      });
    }
    if (cursorPosition) {
      if (sortBy === 'purchasedAt') {
        if (!cursorPosition.purchasedAt) {
          throw new InvalidPurchaseCursorError(
            'CURSOR_INVALID',
            'Purchase item cursor is invalid for this request',
          );
        }
        query.andWhere(
          '(receipt.purchased_at < :cursorPurchasedAt OR (receipt.purchased_at = :cursorPurchasedAt AND item.id < :cursorItemId))',
          {
            cursorPurchasedAt: new Date(cursorPosition.purchasedAt),
            cursorItemId: cursorPosition.itemId,
          },
        );
      } else {
        if (!cursorPosition.totalPrice) {
          throw new InvalidPurchaseCursorError(
            'CURSOR_INVALID',
            'Purchase item cursor is invalid for this request',
          );
        }
        query.andWhere(
          '(item.totalPrice < :cursorTotalPrice OR (item.totalPrice = :cursorTotalPrice AND item.id < :cursorItemId))',
          {
            cursorTotalPrice: cursorPosition.totalPrice,
            cursorItemId: cursorPosition.itemId,
          },
        );
      }
    }

    const orderedQuery =
      sortBy === 'purchasedAt'
        ? query.orderBy('receipt.purchasedAt', 'DESC')
        : query.orderBy('item.totalPrice', 'DESC');
    const rows = await orderedQuery
      .addOrderBy('item.id', 'DESC')
      .take(pageSize + 1)
      .getMany();
    const hasNextPage = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const lastItem = page.at(-1);

    return {
      range,
      asOf,
      items: page.map((item) => ({
        itemRef: item.id,
        receiptRef: item.receipt.id,
        name: item.name,
        quantity: item.quantity === null ? null : Number(item.quantity),
        unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        category: item.category,
        merchant: item.receipt.merchant,
        purchasedAt: item.receipt.purchasedAt,
        currency: item.receipt.currency,
      })),
      nextCursor:
        hasNextPage && lastItem
          ? this.purchaseCursorCodec.encode(
              sortBy === 'purchasedAt'
                ? {
                    purchasedAt: lastItem.receipt.purchasedAt.toISOString(),
                    itemId: lastItem.id,
                    asOf: asOf.toISOString(),
                  }
                : {
                    totalPrice: String(lastItem.totalPrice),
                    itemId: lastItem.id,
                    asOf: asOf.toISOString(),
                  },
              binding,
            )
          : null,
    };
  }

  private normalizeFilter(value?: string): string | null {
    const normalized = value?.trim().toLocaleLowerCase('en-US');
    return normalized || null;
  }
}
