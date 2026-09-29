import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { EventType } from '@modules/common/event-types';
import { NeedsReviewPayload } from '../common/event-payloads.types';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { EventHandler } from '../message-queue/message-queue.types';
import {
  IngestionClassification,
  IngestionJobStatus,
} from '../ingestion/ingestion.types';

@Injectable()
export class ReceiptReviewConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiptReviewConsumer.name);

  constructor(
    private readonly router: MessageRouter,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  onModuleInit() {
    this.router.register(
      EventType.RECEIPT_NEEDS_REVIEW,
      this.handleNeedsReview.bind(this) as EventHandler,
    );
  }

  async handleNeedsReview(envelope: EventEnvelope<NeedsReviewPayload>) {
    if (!envelope.payload) return;
    const { jobId, rawText } = envelope.payload;
    this.logger.warn(
      `handleNeedsReview [correlationId=${envelope.correlationId} jobId=${jobId}] confidence=${envelope.payload.confidence}`,
    );

    const job = await this.jobRepository.findById(jobId);
    if (job) {
      job.status = IngestionJobStatus.NEEDS_REVIEW;
      job.classification = IngestionClassification.RECEIPT;
      job.extractedText = rawText ?? job.extractedText;
      await this.jobRepository.save(job);
    }
  }
}
