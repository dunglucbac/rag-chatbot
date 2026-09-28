import {
  Injectable,
  BadRequestException,
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
    if (
      storedObject.contentType &&
      storedObject.contentType !== input.mimeType
    ) {
      throw new BadRequestException(
        'Object content type does not match the ingestion request',
      );
    }

    const fileType = this.detectFileType(
      input.mimeType,
      input.originalFilename,
    );
    const fileId = this.deriveFileId(input.storageKey);
    const classification = IngestionClassification.UNKNOWN;
    const eventType = this.resolveEventType(fileType);
    const { job, created } = await this.jobRepository.createOrGetByChecksum({
      fileId,
      userId,
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      fileType,
      classification,
      status: IngestionJobStatus.PENDING,
      checksumSha256: input.checksumSha256 ?? null,
      correlationId: normalizedCorrelationId,
      metadata: {
        size: storedObject.size ?? null,
        mimetype: input.mimeType,
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
      mimeType: input.mimeType,
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
