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
import {
  NEEDS_REVIEW_METADATA_KEY,
  NeedsReviewRecord,
  needsReviewRecordSchema,
} from '../ingestion/needs-review.types';

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
    const { jobId, userId, rawText, receipt, confidence } = envelope.payload;
    this.logger.warn(
      `handleNeedsReview [correlationId=${envelope.correlationId} jobId=${jobId}] confidence=${envelope.payload.confidence}`,
    );

    const job = await this.jobRepository.findById(jobId);
    if (!job || job.userId !== userId) {
      this.logger.warn(
        `Ignoring receipt review for missing or mismatched job [jobId=${jobId}]`,
      );
      return;
    }

    const existingReview = needsReviewRecordSchema.safeParse(
      job.metadata?.[NEEDS_REVIEW_METADATA_KEY],
    );
    if (existingReview.success && existingReview.data.status !== 'pending') {
      this.logger.warn(
        `Ignoring duplicate resolved receipt review [jobId=${jobId}]`,
      );
      return;
    }

    const review: NeedsReviewRecord = {
      receipt,
      rawText: rawText ?? null,
      confidence,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    job.status = IngestionJobStatus.NEEDS_REVIEW;
    job.classification = IngestionClassification.RECEIPT;
    job.extractedText = rawText ?? job.extractedText;
    job.metadata = {
      ...(job.metadata ?? {}),
      [NEEDS_REVIEW_METADATA_KEY]: review,
    };
    await this.jobRepository.save(job);
  }
}
