import { ReceiptAnalyticsService } from '../../receipt/analytics/receipt-analytics.service';
import { InvalidPurchaseCursorError } from '../../receipt/analytics/purchase-cursor.codec';
import { ToolCallBudget } from '../tool-call-budget';
import { createSearchPurchaseItemsTool } from './search-purchase-items.tool';

describe('search_purchase_items tool', () => {
  it('returns structured items for the server-scoped user', async () => {
    const result = {
      range: {
        start: new Date('2026-09-13T17:00:00.000Z'),
        end: new Date('2026-09-20T17:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh' as const,
      },
      asOf: new Date('2026-09-22T05:30:00.000Z'),
      items: [{ name: 'Coffee', totalPrice: 50_000 }],
      nextCursor: 'signed-cursor',
    };
    const searchPurchaseItems = jest.fn().mockResolvedValue(result);
    const tool = createSearchPurchaseItemsTool(
      { searchPurchaseItems } as unknown as ReceiptAnalyticsService,
      'authenticated-user',
      () => new Date('2026-09-22T05:30:00.000Z'),
      new ToolCallBudget(5),
    );

    const output = await tool.invoke({
      rangeType: 'relative',
      period: 'last_week',
      query: 'coffee',
      pageSize: 20,
    });

    expect(output).toEqual({ status: 'success', data: result });
    expect(searchPurchaseItems).toHaveBeenCalledWith(
      'authenticated-user',
      {
        rangeType: 'relative',
        period: 'last_week',
        query: 'coffee',
        merchant: undefined,
        category: undefined,
        pageSize: 20,
        cursor: undefined,
      },
      new Date('2026-09-22T05:30:00.000Z'),
    );
  });

  it('returns a structured error for an invalid cursor', async () => {
    const searchPurchaseItems = jest
      .fn()
      .mockRejectedValue(
        new InvalidPurchaseCursorError(
          'CURSOR_EXPIRED',
          'Purchase item cursor has expired',
        ),
      );
    const tool = createSearchPurchaseItemsTool(
      { searchPurchaseItems } as unknown as ReceiptAnalyticsService,
      'authenticated-user',
    );

    const output = await tool.invoke({
      rangeType: 'relative',
      period: 'last_week',
      cursor: 'expired-cursor',
    });

    expect(output).toEqual({
      status: 'error',
      error: {
        code: 'CURSOR_EXPIRED',
        message: 'Purchase item cursor has expired',
      },
    });
  });

  it('rejects a model-supplied user identifier', async () => {
    const tool = createSearchPurchaseItemsTool(
      {} as ReceiptAnalyticsService,
      'authenticated-user',
    );

    await expect(
      tool.invoke({
        rangeType: 'relative',
        period: 'last_week',
        userId: 'another-user',
      }),
    ).rejects.toBeDefined();
  });
});
