import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { NeedsReviewPayload } from '../common/event-payloads.types';
import { TelegramService } from '../telegram/telegram.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { EventHandler } from '../message-queue/message-queue.types';

@Injectable()
export class ReceiptReviewConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiptReviewConsumer.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly router: MessageRouter,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  onModuleInit() {
    this.router.register(
      'receipt.needs_review',
      this.handleNeedsReview.bind(this) as EventHandler,
    );
  }

  async handleNeedsReview(envelope: EventEnvelope<NeedsReviewPayload>) {
    if (!envelope.payload) return;
    const { userId, receipt, lineItems, jobId } = envelope.payload;
    this.logger.warn(
      `handleNeedsReview [correlationId=${envelope.correlationId} jobId=${jobId}] confidence=${envelope.payload.confidence}`,
    );

    const job = await this.jobRepository.findById(jobId);
    if (job) {
      job.status = 'needs_review';
      job.classification = 'receipt';
      await this.jobRepository.save(job);
    }

    const lines = [
      `I parsed this receipt but I'm not 100% sure. Can you confirm?`,
      ``,
      `Merchant: ${receipt.merchant}`,
      `Total: $${receipt.total.toFixed(2)}`,
      lineItems?.length ? `Items:` : '',
      ...(lineItems || []).map(
        (item) => `  - ${item.name}: $${item.totalPrice.toFixed(2)}`,
      ),
    ].filter(Boolean);

    await this.telegramService.bot.telegram.sendMessage(
      userId,
      lines.join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Looks good', callback_data: `review:approve:${jobId}` },
              { text: 'Edit', callback_data: `review:edit:${jobId}` },
              { text: 'Reject', callback_data: `review:reject:${jobId}` },
            ],
          ],
        },
      },
    );
  }
}
