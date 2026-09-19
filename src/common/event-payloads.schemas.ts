import { z } from 'zod';

export const receiptLineItemSchema = z
  .object({
    name: z.string().min(1),
    quantity: z.number().nonnegative().optional(),
    unitPrice: z.number().nonnegative().optional(),
    totalPrice: z.number().nonnegative(),
    category: z.string().min(1).optional(),
  })
  .strict();

export const receiptDiscrepancySchema = z
  .object({
    lineItemsSum: z.number(),
    statedTotal: z.number(),
    difference: z.number(),
    likelyExplanation: z.string().min(1).optional(),
  })
  .strict();

export const receiptDataSchema = z
  .object({
    merchant: z.string().min(1),
    purchasedAt: z.string().datetime(),
    total: z.number().nonnegative(),
    tax: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3),
    lineItems: z.array(receiptLineItemSchema),
    confidence: z.number().min(0).max(1),
    discrepancy: receiptDiscrepancySchema.nullable(),
  })
  .strict();

const receiptParsedPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    userId: z.string().min(1),
    receipt: receiptDataSchema,
    rawText: z.string().optional(),
  })
  .strict();

const needsReviewPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    userId: z.string().min(1),
    confidence: z.number().min(0).max(1),
    receipt: receiptDataSchema,
  })
  .strict();

const paymentDetectedPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    userId: z.string().min(1).optional(),
    extractedText: z.string(),
  })
  .strict();

const parseCompletedPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    extractedText: z.string(),
  })
  .strict();

const classifyCompletedPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    extractedText: z.string(),
    classification: z.string().min(1),
  })
  .strict();

const jobFailedPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    error: z.string().min(1),
  })
  .strict();

const embedRequestPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    userId: z.string().min(1),
    chunks: z.array(
      z
        .object({
          content: z.string(),
          metadata: z.record(z.string(), z.unknown()),
        })
        .strict(),
    ),
  })
  .strict();

export const eventPayloadSchemas = {
  'receipt.parsed': receiptParsedPayloadSchema,
  'receipt.needs_review': needsReviewPayloadSchema,
  'payment.detected': paymentDetectedPayloadSchema,
  'doc.pdf.parse.completed': parseCompletedPayloadSchema,
  'image.classify.completed': classifyCompletedPayloadSchema,
  'job.failed': jobFailedPayloadSchema,
  'doc.chunks.embed.requested': embedRequestPayloadSchema,
};
