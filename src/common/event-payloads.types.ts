export type ReceiptLineItem = {
  name: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  category?: string;
};

export type ReceiptData = {
  merchant: string;
  purchasedAt: string;
  total: number;
  tax?: number;
  currency: string;
  lineItems?: Array<ReceiptLineItem>;
};

export type ReceiptParsedPayload = {
  jobId: string;
  userId: string;
  receipt: ReceiptData;
  lineItems?: Array<ReceiptLineItem>;
  rawText?: string;
};

export type PaymentDetectedPayload = {
  jobId: string;
  userId?: string;
  extractedText: string;
};

export type NeedsReviewPayload = {
  jobId: string;
  userId: string;
  confidence: number;
  receipt: ReceiptData;
};

export type ParseCompletedPayload = {
  jobId: string;
  extractedText: string;
};

export type ClassifyCompletedPayload = {
  jobId: string;
  extractedText: string;
  classification: string;
};

export type JobFailedPayload = {
  jobId: string;
  error: string;
};

export type EmbedRequestPayload = {
  jobId: string;
  userId: string;
  chunks: Array<{
    content: string;
    metadata: Record<string, unknown>;
  }>;
};
