import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';
import { MessageQueueService } from '@modules/message-queue';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import {
  IngestionClassification,
  IngestionFileType,
  IngestionJobStatus,
} from '@modules/ingestion/ingestion.types';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import { EventEnvelope } from '@modules/common/common.types';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CreateIngestionJobDto } from './dto/create-ingestion-job.dto';
import { EventType } from '../common/event-types';
import {
  NEEDS_REVIEW_METADATA_KEY,
  NeedsReviewRecord,
  needsReviewRecordSchema,
  parseResolveNeedsReviewInput,
  ResolveNeedsReviewInput,
} from './needs-review.types';
import {
  PAYMENT_REVIEW_METADATA_KEY,
  parseResolvePaymentReviewInput,
  PaymentReviewRecord,
  paymentReviewRecordSchema,
  receiptDataFromConfirmedPayment,
  ResolvePaymentReviewInput,
} from './payment-review.types';

@Injectable()
export class IngestionService {
  private static readonly imageExtensions: ReadonlyArray<string> = [
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.tif',
    '.tiff',
    '.heic',
    '.heif',
    '.heifs',
  ];

  private static readonly imageMimeTypes: ReadonlyArray<string> = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/heif-sequence',
  ];

  constructor(
    private readonly jobRepository: IngestionJobRepository,
    private readonly messageQueueService: MessageQueueService,
    private readonly objectStorageService: ObjectStorageService,
  ) {}

  async createJobFromObject(
    input: CreateIngestionJobDto,
    userId: string,
    correlationId?: string | null,
    sourceContext?: Record<string, unknown> | null,
  ): Promise<{
    job: IngestionJob;
    event?: EventEnvelope;
    deduplicated: boolean;
  }> {
    const normalizedCorrelationId = this.normalizeCorrelationId(correlationId);
    this.assertObjectOwnership(input.storageKey, userId);
    const storedObject = await this.objectStorageService.getObjectMetadata(
      input.storageKey,
    );
    const mimeType = storedObject.contentType?.trim();
    if (!mimeType) {
      throw new BadRequestException(
        'Uploaded object is missing a content type',
      );
    }
    if (/^multipart\//i.test(mimeType)) {
      throw new BadRequestException(
        'Uploaded object contains multipart data; upload raw file bytes with the file Content-Type',
      );
    }

    const fileType = this.detectFileType(mimeType, input.originalFilename);
    const fileId = this.deriveFileId(input.storageKey);
    const classification = IngestionClassification.UNKNOWN;
    const eventType = this.resolveEventType(fileType);
    const { job, created } = await this.jobRepository.createOrGetByChecksum({
      fileId,
      userId,
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      mimeType,
      fileType,
      classification,
      status: IngestionJobStatus.PENDING,
      checksumSha256: input.checksumSha256 ?? null,
      correlationId: normalizedCorrelationId,
      metadata: {
        size: storedObject.size ?? null,
        mimetype: mimeType,
        originalExtension: path.extname(input.originalFilename).toLowerCase(),
        sourceContext: sourceContext ?? null,
      },
    });
    if (!created) {
      return { job, deduplicated: true };
    }

    const payload = {
      jobId: job.id,
      fileId,
      userId,
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      mimeType,
      fileType,
      classification,
      fileExtension: path.extname(input.originalFilename).toLowerCase(),
      fileSize: storedObject.size ?? 0,
      checksumSha256: input.checksumSha256 ?? '',
      sourceContext: sourceContext ?? null,
      correlationId: normalizedCorrelationId,
    };
    const dispatched = await this.messageQueueService.publish(
      eventType,
      payload,
      normalizedCorrelationId,
      1,
      1,
    );
    return { job, event: dispatched, deduplicated: false };
  }

  async getJob(id: string, userId: string): Promise<IngestionJob> {
    const job = await this.jobRepository.findById(id);
    if (!job || job.userId !== userId) {
      throw new NotFoundException('Ingestion job not found');
    }

    return job;
  }

  async getNeedsReview(
    id: string,
    userId: string,
  ): Promise<{ job: IngestionJob; review: NeedsReviewRecord }> {
    const job = await this.getJob(id, userId);
    const review = this.getStoredReview(job);
    if (!review) {
      throw new NotFoundException(
        'No receipt review found for this ingestion job',
      );
    }

    return { job, review };
  }

  async resolveNeedsReview(
    id: string,
    userId: string,
    input: unknown,
  ): Promise<{ job: IngestionJob; review: NeedsReviewRecord }> {
    const decision = parseResolveNeedsReviewInput(input);
    if (!decision) {
      throw new BadRequestException('Invalid receipt review decision');
    }

    const job = await this.getJob(id, userId);
    const review = this.getStoredReview(job);
    if (!review) {
      throw new NotFoundException(
        'No receipt review found for this ingestion job',
      );
    }
    if (
      job.status !== IngestionJobStatus.NEEDS_REVIEW ||
      review.status !== 'pending'
    ) {
      throw new ConflictException(
        'This receipt review has already been resolved',
      );
    }

    return decision.action === 'approve'
      ? this.approveNeedsReview(job, review, decision)
      : this.rejectNeedsReview(job, review);
  }

  async getPaymentReview(
    id: string,
    userId: string,
  ): Promise<{ job: IngestionJob; review: PaymentReviewRecord }> {
    const job = await this.getJob(id, userId);
    const review = this.getStoredPaymentReview(job);
    if (!review) {
      throw new NotFoundException(
        'No payment review found for this ingestion job',
      );
    }

    return { job, review };
  }

  async resolvePaymentReview(
    id: string,
    userId: string,
    input: unknown,
  ): Promise<{ job: IngestionJob; review: PaymentReviewRecord }> {
    const decision = parseResolvePaymentReviewInput(input);
    if (!decision) {
      throw new BadRequestException('Invalid payment review decision');
    }

    const job = await this.getJob(id, userId);
    const review = this.getStoredPaymentReview(job);
    if (!review) {
      throw new NotFoundException(
        'No payment review found for this ingestion job',
      );
    }
    if (
      job.status !== IngestionJobStatus.NEEDS_REVIEW ||
      review.status !== 'pending'
    ) {
      throw new ConflictException(
        'This payment review has already been resolved',
      );
    }

    return decision.action === 'approve'
      ? this.approvePaymentReview(job, review, decision)
      : this.rejectPaymentReview(job, review);
  }

  private async approveNeedsReview(
    job: IngestionJob,
    review: NeedsReviewRecord,
    decision: ResolveNeedsReviewInput,
  ): Promise<{ job: IngestionJob; review: NeedsReviewRecord }> {
    const resolvedAt = new Date().toISOString();
    const approvedReview: NeedsReviewRecord = {
      ...review,
      receipt: decision.receipt ?? review.receipt,
      status: 'approved',
      resolvedAt,
    };
    job.status = IngestionJobStatus.PROCESSING;
    job.metadata = this.withReview(job, approvedReview);
    await this.jobRepository.save(job);

    try {
      await this.messageQueueService.publish(
        EventType.RECEIPT_PARSED,
        {
          jobId: job.id,
          userId: job.userId,
          receipt: approvedReview.receipt,
          ...(approvedReview.rawText
            ? { rawText: approvedReview.rawText }
            : {}),
        },
        job.correlationId ?? job.id,
        1,
        1,
      );
    } catch (error) {
      job.status = IngestionJobStatus.NEEDS_REVIEW;
      job.metadata = this.withReview(job, review);
      await this.jobRepository.save(job);
      throw error;
    }

    return { job, review: approvedReview };
  }

  private async rejectNeedsReview(
    job: IngestionJob,
    review: NeedsReviewRecord,
  ): Promise<{ job: IngestionJob; review: NeedsReviewRecord }> {
    const rejectedReview: NeedsReviewRecord = {
      ...review,
      status: 'rejected',
      resolvedAt: new Date().toISOString(),
    };
    job.status = IngestionJobStatus.REJECTED;
    job.completedAt = new Date();
    job.metadata = this.withReview(job, rejectedReview);
    await this.jobRepository.save(job);

    return { job, review: rejectedReview };
  }

  private async approvePaymentReview(
    job: IngestionJob,
    review: PaymentReviewRecord,
    decision: ResolvePaymentReviewInput,
  ): Promise<{ job: IngestionJob; review: PaymentReviewRecord }> {
    const itemName = decision.itemName;
    if (!itemName) {
      throw new BadRequestException('A payment item name is required');
    }

    const resolvedAt = new Date().toISOString();
    const approvedReview: PaymentReviewRecord = {
      ...review,
      status: 'approved',
      resolvedAt,
    };
    job.status = IngestionJobStatus.PROCESSING;
    job.metadata = this.withPaymentReview(job, approvedReview);
    await this.jobRepository.save(job);

    try {
      await this.messageQueueService.publish(
        EventType.RECEIPT_PARSED,
        {
          jobId: job.id,
          userId: job.userId,
          receipt: receiptDataFromConfirmedPayment(review.payment, itemName),
          ...(review.rawText ? { rawText: review.rawText } : {}),
        },
        job.correlationId ?? job.id,
        1,
        1,
      );
    } catch (error) {
      job.status = IngestionJobStatus.NEEDS_REVIEW;
      job.metadata = this.withPaymentReview(job, review);
      await this.jobRepository.save(job);
      throw error;
    }

    return { job, review: approvedReview };
  }

  private async rejectPaymentReview(
    job: IngestionJob,
    review: PaymentReviewRecord,
  ): Promise<{ job: IngestionJob; review: PaymentReviewRecord }> {
    const rejectedReview: PaymentReviewRecord = {
      ...review,
      status: 'rejected',
      resolvedAt: new Date().toISOString(),
    };
    job.status = IngestionJobStatus.REJECTED;
    job.completedAt = new Date();
    job.metadata = this.withPaymentReview(job, rejectedReview);
    await this.jobRepository.save(job);

    return { job, review: rejectedReview };
  }

  private getStoredReview(job: IngestionJob): NeedsReviewRecord | null {
    const candidate = job.metadata?.[NEEDS_REVIEW_METADATA_KEY];
    const parsed =
      typeof candidate === 'object' && candidate !== null ? candidate : null;
    if (!parsed) {
      return null;
    }

    const review = needsReviewRecordSchema.safeParse(parsed);
    return review.success ? review.data : null;
  }

  private getStoredPaymentReview(
    job: IngestionJob,
  ): PaymentReviewRecord | null {
    const candidate = job.metadata?.[PAYMENT_REVIEW_METADATA_KEY];
    const parsed =
      typeof candidate === 'object' && candidate !== null ? candidate : null;
    if (!parsed) {
      return null;
    }

    const review = paymentReviewRecordSchema.safeParse(parsed);
    return review.success ? review.data : null;
  }

  private withReview(
    job: IngestionJob,
    review: NeedsReviewRecord,
  ): Record<string, unknown> {
    return {
      ...(job.metadata ?? {}),
      [NEEDS_REVIEW_METADATA_KEY]: review,
    };
  }

  private withPaymentReview(
    job: IngestionJob,
    review: PaymentReviewRecord,
  ): Record<string, unknown> {
    return {
      ...(job.metadata ?? {}),
      [PAYMENT_REVIEW_METADATA_KEY]: review,
    };
  }

  private normalizeCorrelationId(correlationId?: string | null): string {
    const trimmed = correlationId?.trim();
    if (!trimmed) {
      return crypto.randomUUID();
    }

    if (trimmed.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(trimmed)) {
      return crypto.randomUUID();
    }

    return trimmed;
  }

  private detectFileType(
    mimeType: string,
    filename: string,
  ): IngestionFileType {
    const extension = path.extname(filename).toLowerCase();

    if (mimeType === 'application/pdf' || extension === '.pdf') {
      return 'pdf';
    }

    if (
      IngestionService.imageMimeTypes.includes(mimeType) ||
      IngestionService.imageExtensions.includes(extension)
    ) {
      return 'image';
    }

    throw new BadRequestException('Unsupported file type');
  }

  private resolveEventType(fileType: IngestionFileType): string {
    return fileType === 'pdf'
      ? 'doc.pdf.parse.requested'
      : 'image.classify.requested';
  }

  private deriveFileId(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }

  private assertObjectOwnership(storageKey: string, userId: string): void {
    const prefix = `raw/${encodeURIComponent(userId)}/`;
    if (!storageKey.startsWith(prefix)) {
      throw new BadRequestException(
        'Object does not belong to the current user',
      );
    }
  }
}
