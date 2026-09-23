import { DataSource } from 'typeorm';
import { Receipt } from '../entities/receipt.entity';
import { ReceiptItem } from '../entities/receipt-item.entity';
import { ReceiptCategorizationStatus } from '../entities/receipt-item.entity';
import { DateRangeResolver } from './date-range-resolver';
import { ReceiptAnalyticsService } from './receipt-analytics.service';
import { PurchaseCursorCodec } from './purchase-cursor.codec';

describe('ReceiptAnalyticsService', () => {
  let dataSource: DataSource;
  let analytics: ReceiptAnalyticsService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Receipt, ReceiptItem],
      synchronize: true,
    });
    await dataSource.initialize();
    analytics = new ReceiptAnalyticsService(
      dataSource,
      new DateRangeResolver(),
      new PurchaseCursorCodec(
        'receipt-search-test-secret',
        () => new Date('2026-09-22T05:30:00.000Z'),
      ),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it("summarizes only the authenticated user's receipts in last week", async () => {
    await saveReceipt({
      userId: 'user-1',
      merchant: 'Local Market',
      purchasedAt: '2026-09-15T03:00:00.000Z',
      total: 120_000,
      currency: 'VND',
      items: [
        {
          name: 'Milk',
          quantity: 2,
          totalPrice: 60_000,
          category: 'food',
          categorizationStatus: ReceiptCategorizationStatus.COMPLETED,
        },
        {
          name: 'Bread',
          quantity: null,
          totalPrice: 60_000,
          category: 'shopping',
          categorizationStatus: ReceiptCategorizationStatus.PENDING,
        },
      ],
    });
    await saveReceipt({
      userId: 'user-1',
      merchant: 'Book Shop',
      purchasedAt: '2026-09-18T03:00:00.000Z',
      total: 10,
      currency: 'USD',
      items: [
        {
          name: 'Notebook',
          quantity: 3,
          totalPrice: 10,
          category: 'education',
          categorizationStatus: ReceiptCategorizationStatus.COMPLETED,
        },
      ],
    });
    await saveReceipt({
      userId: 'user-2',
      merchant: 'Other User Store',
      purchasedAt: '2026-09-16T03:00:00.000Z',
      total: 999_999,
      currency: 'VND',
      items: [{ name: 'Private item', quantity: 99, totalPrice: 999_999 }],
    });
    await saveReceipt({
      userId: 'user-1',
      merchant: 'Old Store',
      purchasedAt: '2026-09-10T03:00:00.000Z',
      total: 50_000,
      currency: 'VND',
      items: [{ name: 'Old item', quantity: 5, totalPrice: 50_000 }],
    });

    const summary = await analytics.getPurchaseSummary(
      'user-1',
      { rangeType: 'relative', period: 'last_week' },
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(summary).toMatchObject({
      receiptCount: 2,
      lineItemCount: 3,
      purchasedUnitCount: 6,
      totalsByCurrency: [
        { currency: 'USD', total: 10 },
        { currency: 'VND', total: 120_000 },
      ],
      categoryTotals: [
        { category: 'education', currency: 'USD', total: 10 },
        { category: 'food', currency: 'VND', total: 60_000 },
      ],
      categorizationCoverage: {
        categorizedItemCount: 2,
        uncategorizedItemCount: 1,
        ratio: 2 / 3,
      },
      range: {
        start: new Date('2026-09-13T17:00:00.000Z'),
        end: new Date('2026-09-20T17:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });
    expect(summary.receiptReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merchant: 'Local Market',
          purchasedAt: new Date('2026-09-15T03:00:00.000Z'),
          currency: 'VND',
          total: 120_000,
        }),
        expect.objectContaining({
          merchant: 'Book Shop',
          purchasedAt: new Date('2026-09-18T03:00:00.000Z'),
          currency: 'USD',
          total: 10,
        }),
      ]),
    );
  });

  it('searches user-scoped items with stable keyset pagination', async () => {
    await saveReceipt({
      userId: 'user-1',
      merchant: 'Local Market',
      purchasedAt: '2026-09-15T03:00:00.000Z',
      total: 250,
      currency: 'USD',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          name: 'Coffee',
          quantity: 1,
          totalPrice: 100,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Tea',
          quantity: 1,
          totalPrice: 100,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Bread',
          quantity: 1,
          totalPrice: 50,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    });
    await saveReceipt({
      userId: 'user-2',
      merchant: 'Private Store',
      purchasedAt: '2026-09-15T03:00:00.000Z',
      total: 999,
      currency: 'USD',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000099',
          name: 'Private item',
          quantity: 1,
          totalPrice: 999,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    });
    const input = {
      rangeType: 'absolute' as const,
      startDate: '2026-09-01',
      endDate: '2026-10-01',
      pageSize: 2,
    };
    const now = new Date('2026-09-22T05:30:00.000Z');

    const firstPage = await analytics.searchPurchaseItems('user-1', input, now);
    expect(firstPage.items.map((item) => item.name)).toEqual(['Coffee', 'Tea']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    await saveReceipt({
      userId: 'user-1',
      merchant: 'Later Store',
      purchasedAt: '2026-09-16T03:00:00.000Z',
      total: 75,
      currency: 'USD',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          name: 'Inserted later',
          quantity: 1,
          totalPrice: 75,
          createdAt: '2026-09-22T05:31:00.000Z',
        },
      ],
    });

    const secondPage = await analytics.searchPurchaseItems(
      'user-1',
      { ...input, cursor: firstPage.nextCursor! },
      now,
    );
    expect(secondPage.items.map((item) => item.name)).toEqual(['Bread']);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.items[0]).not.toHaveProperty('rawText');
  });

  async function saveReceipt(input: {
    userId: string;
    merchant: string;
    purchasedAt: string;
    total: number;
    currency: string;
    items: Array<{
      id?: string;
      name: string;
      quantity: number | null;
      totalPrice: number;
      category?: string | null;
      categorizationStatus?: ReceiptCategorizationStatus;
      createdAt?: string;
    }>;
  }): Promise<void> {
    const repository = dataSource.getRepository(Receipt);
    await repository.save(
      repository.create({
        userId: input.userId,
        ingestionJobId: null,
        merchant: input.merchant,
        purchasedAt: new Date(input.purchasedAt),
        total: input.total,
        tax: null,
        currency: input.currency,
        source: 'test',
        rawText: null,
        checksumSha256: `${input.userId}-${input.merchant}`,
        items: input.items.map((item) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          unitPrice: null,
          category: item.category ?? null,
          categorizationStatus:
            item.categorizationStatus ?? ReceiptCategorizationStatus.PENDING,
        })),
      }),
    );
  }
});
