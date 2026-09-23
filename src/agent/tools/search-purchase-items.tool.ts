import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  DateRangeInput,
  InvalidDateRangeError,
} from '../../receipt/analytics/date-range-resolver';
import { InvalidPurchaseCursorError } from '../../receipt/analytics/purchase-cursor.codec';
import {
  ReceiptAnalyticsService,
  SearchPurchaseItemsInput,
} from '../../receipt/analytics/receipt-analytics.service';
import { MAX_RECEIPT_TOOL_CALLS, ToolCallBudget } from '../tool-call-budget';

const searchPurchaseItemsSchema = z
  .object({
    rangeType: z.enum(['relative', 'absolute']),
    period: z.literal('last_week').optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    query: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
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
        input.rangeType === 'relative'
          ? { rangeType: 'relative', period: input.period ?? 'last_week' }
          : {
              rangeType: 'absolute',
              startDate: input.startDate ?? '',
              endDate: input.endDate ?? '',
            };
      const searchInput: SearchPurchaseItemsInput = {
        ...range,
        query: input.query,
        merchant: input.merchant,
        category: input.category,
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
        "Search the authenticated user's parsed receipt items with optional item-name, merchant, and category filters. Results are ordered by item total descending and paginated with an opaque cursor. Repeat the same filters and date range when continuing with nextCursor.",
      schema: searchPurchaseItemsSchema,
    },
  );
}
