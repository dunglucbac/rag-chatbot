import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import {
  PaymentDetectedPayload,
  ReceiptParsedPayload,
} from '../common/event-payloads.types';
import { TelegramService } from '../telegram/telegram.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { EventHandler } from '../message-queue/message-queue.types';

@Injectable()
export class ReceiptPaymentConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiptPaymentConsumer.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly messageQueueService: MessageQueueService,
    private readonly router: MessageRouter,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  onModuleInit() {
    this.router.register(
      'payment.detected',
      this.handlePaymentDetected.bind(this) as EventHandler,
    );
  }

  async handlePaymentDetected(envelope: EventEnvelope<PaymentDetectedPayload>) {
    if (!envelope.payload) return;
    const { userId, extractedText, jobId } = envelope.payload;
    this.logger.log(
      `handlePaymentDetected [correlationId=${envelope.correlationId} jobId=${jobId}]`,
    );

    const job = await this.jobRepository.findById(jobId);
    if (job) {
      job.status = 'needs_review';
      job.classification = 'payment';
      await this.jobRepository.save(job);
    }

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
    paymentContext: {
      jobId: string;
      userId: string;
      paymentAmount: number;
      paymentDate: string;
    },
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
