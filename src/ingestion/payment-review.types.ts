import { z } from 'zod';
import { paymentDataSchema } from '../common/event-payloads.schemas';
import type { PaymentData } from '../common/event-payloads.types';

export const PAYMENT_REVIEW_METADATA_KEY = 'paymentReview';

export const paymentReviewRecordSchema = z
  .object({
    payment: paymentDataSchema,
    rawText: z.string().nullable(),
    status: z.enum(['pending', 'approved', 'rejected']),
    requestedAt: z.string().datetime(),
    resolvedAt: z.string().datetime().optional(),
  })
  .strict();

export type PaymentReviewRecord = z.infer<typeof paymentReviewRecordSchema>;

export type ResolvePaymentReviewInput = {
  action: 'approve' | 'reject';
  itemName?: string;
};

const resolvePaymentReviewInputSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    itemName: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'approve' && !value.itemName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Approving a payment review requires an item name',
        path: ['itemName'],
      });
    }
    if (value.action === 'reject' && value.itemName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejected payment review cannot include an item name',
        path: ['itemName'],
      });
    }
  });

export function parseResolvePaymentReviewInput(
  input: unknown,
): ResolvePaymentReviewInput | null {
  const result = resolvePaymentReviewInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function receiptDataFromConfirmedPayment(
  payment: PaymentData,
  itemName: string,
) {
  return {
    merchant: payment.merchant,
    purchasedAt: payment.purchasedAt,
    total: payment.total,
    tax: null,
    currency: payment.currency,
    lineItems: [
      {
        name: itemName,
        quantity: 1,
        unitPrice: payment.total,
        totalPrice: payment.total,
      },
    ],
    confidence: payment.confidence,
    discrepancy: null,
  };
}
