import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { EventType } from '@modules/common/event-types';
import { PaymentDetectedPayload } from '../common/event-payloads.types';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { EventHandler } from '../message-queue/message-queue.types';
import {
  IngestionClassification,
  IngestionJobStatus,
} from '../ingestion/ingestion.types';
import {
  PAYMENT_REVIEW_METADATA_KEY,
  PaymentReviewRecord,
} from '../ingestion/payment-review.types';

@Injectable()
export class ReceiptPaymentConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiptPaymentConsumer.name);

  constructor(
    private readonly router: MessageRouter,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  onModuleInit() {
    this.router.register(
      EventType.PAYMENT_DETECTED,
      this.handlePaymentDetected.bind(this) as EventHandler,
    );
  }

  async handlePaymentDetected(envelope: EventEnvelope<PaymentDetectedPayload>) {
    if (!envelope.payload) return;
    const { jobId, extractedText, payment } = envelope.payload;
    this.logger.log(
      `handlePaymentDetected [correlationId=${envelope.correlationId} jobId=${jobId}]`,
    );

    const job = await this.jobRepository.findById(jobId);
    if (job) {
      job.status = IngestionJobStatus.NEEDS_REVIEW;
      job.classification = IngestionClassification.PAYMENT;
      job.extractedText = extractedText;
      if (payment) {
        const review: PaymentReviewRecord = {
          payment,
          rawText: extractedText,
          status: 'pending',
          requestedAt: new Date().toISOString(),
        };
        job.metadata = {
          ...(job.metadata ?? {}),
          [PAYMENT_REVIEW_METADATA_KEY]: review,
        };
      }
      await this.jobRepository.save(job);
    }
  }
}
