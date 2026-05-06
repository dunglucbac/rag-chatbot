import { Injectable } from '@nestjs/common';
import { ReceiptRepository } from './repositories/receipt.repository';

@Injectable()
export class ReceiptService {
  constructor(private readonly receiptRepository: ReceiptRepository) {}

  async saveFromEvent(eventData: any) {
    const { userId, receipt, lineItems } = eventData;

    const receiptData = {
      userId,
      merchant: receipt.merchant,
      purchasedAt: new Date(receipt.purchasedAt),
      total: receipt.total,
      tax: receipt.tax,
      currency: receipt.currency,
      source: 'telegram',
      checksumSha256: eventData.jobId,
      items: lineItems?.map((item: any) => ({
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
