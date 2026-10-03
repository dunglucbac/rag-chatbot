import { z } from 'zod';
import { receiptDataSchema } from '../common/event-payloads.schemas';
import type { ReceiptData } from '../common/event-payloads.types';

export const NEEDS_REVIEW_METADATA_KEY = 'needsReview';

export const needsReviewRecordSchema = z
  .object({
    receipt: receiptDataSchema,
    rawText: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    status: z.enum(['pending', 'approved', 'rejected']),
    requestedAt: z.string().datetime(),
    resolvedAt: z.string().datetime().optional(),
  })
  .strict();

export type NeedsReviewRecord = z.infer<typeof needsReviewRecordSchema>;

export type ResolveNeedsReviewInput = {
  action: 'approve' | 'reject';
  receipt?: ReceiptData;
};

const resolveNeedsReviewInputSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    receipt: receiptDataSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'reject' && value.receipt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejected review cannot include receipt data',
        path: ['receipt'],
      });
    }
  });

export function parseResolveNeedsReviewInput(
  input: unknown,
): ResolveNeedsReviewInput | null {
  const result = resolveNeedsReviewInputSchema.safeParse(input);
  return result.success ? result.data : null;
}
