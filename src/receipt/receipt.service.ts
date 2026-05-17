import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ReceiptRepository } from './repositories/receipt.repository';
import type {
  ReceiptParsedPayload,
  ReceiptLineItem,
} from '@modules/common/event-payloads.types';

@Injectable()
export class ReceiptService {
  constructor(private readonly receiptRepository: ReceiptRepository) {}

  async saveFromEvent(eventData: ReceiptParsedPayload) {
    const { userId, receipt, rawText } = eventData;
    const lineItems = receipt.lineItems;

    const checksumContent =
      rawText || JSON.stringify({ userId, receipt, lineItems });
    const checksumSha256 = createHash('sha256')
      .update(checksumContent)
      .digest('hex');

    const receiptData = {
      userId,
      merchant: receipt.merchant,
      purchasedAt: new Date(receipt.purchasedAt),
      total: receipt.total,
      tax: receipt.tax,
      currency: receipt.currency,
      source: 'telegram',
      rawText,
      checksumSha256,
      items: lineItems?.map((item: ReceiptLineItem) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        category: item.category,
      })),
    };

    return this.receiptRepository.create(receiptData);
  }
}
