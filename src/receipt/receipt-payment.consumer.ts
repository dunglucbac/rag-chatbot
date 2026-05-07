import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

@Injectable()
export class ReceiptPaymentConsumer {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async handlePaymentDetected(event: any) {
    const { userId, extractedText } = event;

    const amountMatch = extractedText?.match(/\$[\d,.]+/);
    const amount = amountMatch ? amountMatch[0] : 'this';

    await this.telegramService.bot.telegram.sendMessage(
      userId,
      `I detected a payment of ${amount}. What did you buy? Please describe the items and merchant.`,
    );
  }

  async handleUserResponse(paymentContext: any, userMessage: string) {
    const merchantMatch = userMessage.match(/at\s+(.+)$/i);
    const merchant = merchantMatch ? merchantMatch[1].trim() : 'Unknown';

    const event = {
      jobId: paymentContext.jobId,
      userId: paymentContext.userId,
      receipt: {
        merchant,
        purchasedAt: paymentContext.paymentDate || new Date().toISOString(),
        total: paymentContext.paymentAmount || 0,
        currency: 'USD',
      },
      lineItems: [{ name: userMessage, totalPrice: paymentContext.paymentAmount || 0 }],
    };

    await this.messageQueueService.publish('receipt.parsed', event);
  }
}
