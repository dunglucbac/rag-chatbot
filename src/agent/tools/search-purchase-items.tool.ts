import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  DateRangeType,
  DateRangeInput,
  InvalidDateRangeError,
  RelativePeriod,
} from '../../receipt/analytics/date-range-resolver';
import { InvalidPurchaseCursorError } from '../../receipt/analytics/purchase-cursor.codec';
import {
  ReceiptAnalyticsService,
  PurchaseItemSortBy,
  SearchPurchaseItemsInput,
} from '../../receipt/analytics/receipt-analytics.service';
import { MAX_RECEIPT_TOOL_CALLS, ToolCallBudget } from '../tool-call-budget';

const searchPurchaseItemsSchema = z
  .object({
    rangeType: z.nativeEnum(DateRangeType),
    period: z.nativeEnum(RelativePeriod).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    query: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    sortBy: z
      .nativeEnum(PurchaseItemSortBy)
      .default(PurchaseItemSortBy.TOTAL_PRICE),
    pageSize: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export function createSearchPurchaseItemsTool(
  analytics: ReceiptAnalyticsService,
  userId: string,
  clock: () => Date = () => new Date(),
  budget: ToolCallBudget = new ToolCallBudget(MAX_RECEIPT_TOOL_CALLS),
) {
  return tool(
    async (input) => {
      if (!budget.tryConsume()) {
        return {
          status: 'error' as const,
          error: {
            code: 'TOOL_CALL_LIMIT_EXCEEDED',
            message:
              'Receipt tool call limit reached; summarize available results or narrow the request',
          },
        };
      }
      const range: DateRangeInput =
        input.rangeType === DateRangeType.RELATIVE
          ? {
              rangeType: DateRangeType.RELATIVE,
              period: input.period ?? RelativePeriod.LAST_WEEK,
            }
          : {
              rangeType: DateRangeType.ABSOLUTE,
              startDate: input.startDate ?? '',
              endDate: input.endDate ?? '',
            };
      const searchInput: SearchPurchaseItemsInput = {
        ...range,
        query: input.query,
        merchant: input.merchant,
        category: input.category,
        sortBy: input.sortBy,
        pageSize: input.pageSize,
        cursor: input.cursor,
      };

      try {
        const result = await analytics.searchPurchaseItems(
          userId,
          searchInput,
          clock(),
        );
        return { status: 'success' as const, data: result };
      } catch (error: unknown) {
        if (
          error instanceof InvalidDateRangeError ||
          error instanceof InvalidPurchaseCursorError
        ) {
          return {
            status: 'error' as const,
            error: { code: error.code, message: error.message },
          };
        }
        throw error;
      }
    },
    {
      name: 'search_purchase_items',
      description:
        "Search the authenticated user's parsed receipt items with optional item-name, merchant, and category filters. Results default to highest item total first (sortBy totalPrice). For a question about the latest or most recent purchases, use sortBy purchasedAt. Results are paginated with an opaque cursor; repeat the same filters, date range, and sortBy when continuing with nextCursor.",
      schema: searchPurchaseItemsSchema,
    },
  );
}
