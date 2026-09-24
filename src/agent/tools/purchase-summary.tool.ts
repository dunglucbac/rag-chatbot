import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  DateRangeInput,
  InvalidDateRangeError,
} from '../../receipt/analytics/date-range-resolver';
import { ReceiptAnalyticsService } from '../../receipt/analytics/receipt-analytics.service';
import { MAX_RECEIPT_TOOL_CALLS, ToolCallBudget } from '../tool-call-budget';

const purchaseSummarySchema = z
  .object({
    rangeType: z.enum(['relative', 'absolute']),
    period: z.enum(['last_week', 'last_month']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .strict();

export function createPurchaseSummaryTool(
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
      try {
        const summary = await analytics.getPurchaseSummary(
          userId,
          range,
          clock(),
        );
        if (summary.receiptCount === 0) {
          return {
            status: 'error' as const,
            error: {
              code: 'NO_DATA',
              message: 'No receipt data matched the requested period',
            },
          };
        }
        const uncategorizedItemCount =
          summary.categorizationCoverage?.uncategorizedItemCount ?? 0;
        return {
          status: 'success' as const,
          data: summary,
          ...(uncategorizedItemCount > 0
            ? {
                warnings: [
                  {
                    code: 'CATEGORIZATION_INCOMPLETE',
                    message: `Category totals exclude ${uncategorizedItemCount} uncategorized receipt items`,
                  },
                ],
              }
            : {}),
        };
      } catch (error: unknown) {
        if (error instanceof InvalidDateRangeError) {
          return {
            status: 'error' as const,
            error: { code: error.code, message: error.message },
          };
        }
        throw error;
      }
    },
    {
      name: 'get_purchase_summary',
      description:
        "Get deterministic counts and spending totals from the authenticated user's parsed receipts. Use relative last_week or last_month by default, or provide an absolute startDate and exclusive endDate in YYYY-MM-DD format.",
      schema: purchaseSummarySchema,
    },
  );
}
