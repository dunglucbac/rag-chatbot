import { ReceiptAnalyticsService } from '../../receipt/analytics/receipt-analytics.service';
import { DateRangeResolver } from '../../receipt/analytics/date-range-resolver';
import { createPurchaseSummaryTool } from './purchase-summary.tool';
import { ToolCallBudget } from '../tool-call-budget';
import { PurchaseCursorCodec } from '../../receipt/analytics/purchase-cursor.codec';

describe('get_purchase_summary tool', () => {
  it('returns a structured summary for the server-scoped user', async () => {
    const summary = {
      range: {
        start: new Date('2026-09-13T17:00:00.000Z'),
        end: new Date('2026-09-20T17:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh' as const,
      },
      asOf: new Date('2026-09-22T12:00:00.000Z'),
      receiptCount: 2,
      lineItemCount: 3,
      purchasedUnitCount: 6,
      totalsByCurrency: [{ currency: 'VND', total: 120_000 }],
    };
    const getPurchaseSummary = jest.fn().mockResolvedValue(summary);
    const analytics = {
      getPurchaseSummary,
    } as unknown as ReceiptAnalyticsService;
    const now = new Date('2026-09-22T12:00:00.000Z');
    const purchaseSummaryTool = createPurchaseSummaryTool(
      analytics,
      'authenticated-user',
      () => now,
    );

    const result = await purchaseSummaryTool.invoke({
      rangeType: 'relative',
      period: 'last_week',
    });

    expect(result).toEqual({ status: 'success', data: summary });
    expect(getPurchaseSummary).toHaveBeenCalledWith(
      'authenticated-user',
      { rangeType: 'relative', period: 'last_week' },
      now,
    );
  });

  it('returns a structured error for an invalid date range', async () => {
    const analytics = new ReceiptAnalyticsService(
      {} as never,
      new DateRangeResolver(),
      new PurchaseCursorCodec('receipt-tool-test-secret'),
    );
    const purchaseSummaryTool = createPurchaseSummaryTool(
      analytics,
      'authenticated-user',
    );

    const result = await purchaseSummaryTool.invoke({
      rangeType: 'absolute',
      startDate: '2026-09-22',
      endDate: '2026-09-22',
    });

    expect(result).toEqual({
      status: 'error',
      error: {
        code: 'INVALID_DATE_RANGE',
        message: 'End date must be after start date',
      },
    });
  });

  it('does not query receipt analytics after the tool-call budget is exhausted', async () => {
    const getPurchaseSummary = jest.fn().mockResolvedValue({});
    const purchaseSummaryTool = createPurchaseSummaryTool(
      { getPurchaseSummary } as unknown as ReceiptAnalyticsService,
      'authenticated-user',
      () => new Date('2026-09-22T12:00:00.000Z'),
      new ToolCallBudget(5),
    );

    let result: unknown;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      result = await purchaseSummaryTool.invoke({
        rangeType: 'relative',
        period: 'last_week',
      });
    }

    expect(getPurchaseSummary).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      status: 'error',
      error: {
        code: 'TOOL_CALL_LIMIT_EXCEEDED',
        message:
          'Receipt tool call limit reached; summarize available results or narrow the request',
      },
    });
  });

  it('returns NO_DATA when no receipts match the period', async () => {
    const getPurchaseSummary = jest.fn().mockResolvedValue({
      receiptCount: 0,
      lineItemCount: 0,
      purchasedUnitCount: 0,
      totalsByCurrency: [],
      categoryTotals: [],
      categorizationCoverage: {
        categorizedItemCount: 0,
        uncategorizedItemCount: 0,
        ratio: 0,
      },
      receiptReferences: [],
    });
    const tool = createPurchaseSummaryTool(
      { getPurchaseSummary } as unknown as ReceiptAnalyticsService,
      'authenticated-user',
    );

    const result = await tool.invoke({
      rangeType: 'relative',
      period: 'last_week',
    });

    expect(result).toEqual({
      status: 'error',
      error: {
        code: 'NO_DATA',
        message: 'No receipt data matched the requested period',
      },
    });
  });

  it('warns when category totals omit uncategorized receipt items', async () => {
    const summary = {
      receiptCount: 1,
      lineItemCount: 3,
      purchasedUnitCount: 3,
      totalsByCurrency: [{ currency: 'VND', total: 120_000 }],
      categoryTotals: [{ category: 'food', currency: 'VND', total: 60_000 }],
      categorizationCoverage: {
        categorizedItemCount: 1,
        uncategorizedItemCount: 2,
        ratio: 1 / 3,
      },
      receiptReferences: [],
    };
    const tool = createPurchaseSummaryTool(
      {
        getPurchaseSummary: jest.fn().mockResolvedValue(summary),
      } as unknown as ReceiptAnalyticsService,
      'authenticated-user',
    );

    const result = await tool.invoke({
      rangeType: 'relative',
      period: 'last_week',
    });

    expect(result).toEqual({
      status: 'success',
      data: summary,
      warnings: [
        {
          code: 'CATEGORIZATION_INCOMPLETE',
          message: 'Category totals exclude 2 uncategorized receipt items',
        },
      ],
    });
  });
});
