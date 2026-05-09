import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import {
  PaymentDetectedPayload,
  ReceiptParsedPayload,
} from '../common/event-payloads.types';
import { TelegramService } from '../telegram/telegram.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

@Injectable()
export class ReceiptPaymentConsumer {
  private readonly logger = new Logger(ReceiptPaymentConsumer.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async handlePaymentDetected(envelope: EventEnvelope<PaymentDetectedPayload>) {
    if (!envelope.payload) return;
    const { userId, extractedText } = envelope.payload;
    this.logger.log(`handlePaymentDetected [correlationId=${envelope.correlationId} jobId=${envelope.payload.jobId}]`);

    const amountMatch = extractedText.match(/\$[\d,.]+/);
    const amount = amountMatch ? amountMatch[0] : 'this';

    if (userId) {
      await this.telegramService.bot.telegram.sendMessage(
        userId,
        `I detected a payment of ${amount}. What did you buy? Please describe the items and merchant.`,
      );
    }
  }

  async handleUserResponse(
    paymentContext: { jobId: string; userId: string; paymentAmount: number; paymentDate: string },
    userMessage: string,
  ) {
    const merchantMatch = userMessage.match(/at\s+(.+)$/i);
    const merchant = merchantMatch ? merchantMatch[1].trim() : 'Unknown';

    const payload: ReceiptParsedPayload = {
      jobId: paymentContext.jobId,
      userId: paymentContext.userId,
      receipt: {
        merchant,
        purchasedAt: paymentContext.paymentDate || new Date().toISOString(),
        total: paymentContext.paymentAmount || 0,
        currency: 'USD',
      },
      lineItems: [
        { name: userMessage, totalPrice: paymentContext.paymentAmount || 0 },
      ],
    };

    await this.messageQueueService.publish(
      'receipt.parsed',
      payload,
      paymentContext.jobId,
      1,
      1,
    );
  }
}
