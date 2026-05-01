import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { MessageQueueService } from '@modules/message-queue';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import {
  INGESTION_JOB_STATUSES,
  IngestionClassification,
  IngestionFileType,
} from '@modules/ingestion/ingestion.types';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import { DispatchEnvelope } from '@modules/common/common.types';

@Injectable()
export class IngestionService {
  private static readonly imageExtensions: ReadonlyArray<string> = [
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.tif',
    '.tiff',
  ];

  private static readonly imageMimeTypes: ReadonlyArray<string> = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
  ];

  constructor(
    private readonly jobRepository: IngestionJobRepository,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async createJobFromUpload(
    file: Express.Multer.File,
    userId: string,
    correlationId?: string | null,
    sourceContext?: Record<string, unknown> | null,
  ): Promise<{ job: IngestionJob; event: DispatchEnvelope }> {
    const normalizedCorrelationId = this.normalizeCorrelationId(correlationId);
    const fileType = this.detectFileType(file.mimetype, file.originalname);
    const fileId = this.deriveFileId(file.path);
    const checksumSha256 = await this.computeChecksum(file.path);
    const classification: IngestionClassification = 'unknown';
    const eventType = this.resolveEventType(fileType);

    const job = await this.jobRepository.create({
      fileId,
      userId,
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      fileType,
      classification,
      status: INGESTION_JOB_STATUSES[0],
      checksumSha256,
      correlationId: normalizedCorrelationId,
      metadata: {
        size: file.size,
        mimetype: file.mimetype,
        originalExtension: path.extname(file.originalname).toLowerCase(),
        sourceContext: sourceContext ?? null,
      },
    });
    const payload = {
      jobId: job.id,
      fileId,
      userId,
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      fileType,
      classification,
      fileExtension: path.extname(file.originalname).toLowerCase(),
      fileSize: file.size,
      checksumSha256,
      sourceContext: sourceContext ?? null,
      correlationId: normalizedCorrelationId,
    };
    // for now we can fire and forget the event, we will add a retry mechanism later
    const dispatched = await this.messageQueueService.publish(
      eventType,
      normalizedCorrelationId,
      1, // schema version now it is being hardcoded but later can be use to version the event
      1, // number attempt we first start with 1
      payload,
    );
    return { job, event: dispatched };
  }

  async getJob(id: string): Promise<IngestionJob> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
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

  private async computeChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
