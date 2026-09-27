import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
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

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
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

  async createJobFromUpload(
    file: Express.Multer.File,
    userId: string,
    correlationId?: string | null,
    sourceContext?: Record<string, unknown> | null,
  ): Promise<{
    job: IngestionJob;
    event?: EventEnvelope;
    deduplicated: boolean;
  }> {
    const normalizedCorrelationId = this.normalizeCorrelationId(correlationId);
    const fileType = this.detectFileType(file.mimetype, file.originalname);
    const fileId = this.deriveFileId(file.path);
    const checksumSha256 = await this.computeChecksum(file.path);
    const storageKey = this.deriveStorageKey(userId, fileId, file.originalname);
    const classification = IngestionClassification.UNKNOWN;
    const eventType = this.resolveEventType(fileType);
    let uploaded = false;
    let jobCreated = false;

    try {
      await this.objectStorageService.upload(
        storageKey,
        file.path,
        file.mimetype,
      );
      uploaded = true;

      const { job, created } = await this.jobRepository.createOrGetByChecksum({
        fileId,
        userId,
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        fileType,
        classification,
        status: IngestionJobStatus.PENDING,
        checksumSha256,
        correlationId: normalizedCorrelationId,
        metadata: {
          size: file.size,
          mimetype: file.mimetype,
          originalExtension: path.extname(file.originalname).toLowerCase(),
          sourceContext: sourceContext ?? null,
        },
      });
      if (!created) {
        await this.removeObject(storageKey);
        return { job, deduplicated: true };
      }
      jobCreated = true;

      const payload = {
        jobId: job.id,
        fileId,
        userId,
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        fileType,
        classification,
        fileExtension: path.extname(file.originalname).toLowerCase(),
        fileSize: file.size,
        checksumSha256,
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
    } catch (error) {
      if (uploaded && !jobCreated) {
        await this.removeObject(storageKey);
      }
      throw error;
    } finally {
      await this.removeTemporaryUpload(file.path);
    }
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

  private deriveStorageKey(
    userId: string,
    fileId: string,
    filename: string,
  ): string {
    return `raw/${encodeURIComponent(userId)}/${fileId}${path
      .extname(filename)
      .toLowerCase()}`;
  }

  private async computeChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async removeTemporaryUpload(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not remove temporary upload at ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async removeObject(storageKey: string): Promise<void> {
    try {
      await this.objectStorageService.delete(storageKey);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not remove object ${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
