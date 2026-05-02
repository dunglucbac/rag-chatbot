import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MessageQueueService } from '@modules/message-queue';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import {
  INGESTION_JOB_STATUSES,
  type IngestionClassification,
  type IngestionFileType,
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

  constructor(
    private readonly jobRepository: IngestionJobRepository,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async createJobFromUpload(
    file: Express.Multer.File,
    userId: string,
    correlationId: string,
    sourceContext?: Record<string, unknown> | null,
  ): Promise<{ job: IngestionJob; event: DispatchEnvelope }> {
    const fileType = this.detectFileType(file.mimetype, file.originalname);
    const classification: IngestionClassification = 'unknown';
    const checksumSha256 = this.computeChecksum(file.path);
    const fileId = this.deriveFileId(file.path);
    const eventType =
      fileType === 'pdf'
        ? 'doc.pdf.parse.requested'
        : 'image.classify.requested';

    const job = await this.jobRepository.create({
      userId,
      fileId,
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      fileType,
      classification,
      status: INGESTION_JOB_STATUSES[0],
      checksumSha256,
      correlationId,
      metadata: {
        size: file.size,
        mimetype: file.mimetype,
        originalExtension: path.extname(file.originalname).toLowerCase(),
        sourceContext: sourceContext ?? null,
      },
    });

    const event = await this.messageQueueService.publish(
      eventType,
      {
        jobId: job.id,
        fileId,
        userId,
        fileType,
        classification,
        originalFilename: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        fileExtension: path.extname(file.originalname).toLowerCase(),
        fileSize: file.size,
        checksumSha256,
        sourceContext: sourceContext ?? null,
      },
      correlationId,
    );

    return { job, event };
  }

  async getJobById(id: string): Promise<IngestionJob> {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundException('Ingestion job not found');
    }
    return job;
  }

  private detectFileType(
    mimeType: string,
    filename: string,
  ): IngestionFileType {
    const extension = path.extname(filename).toLowerCase();

    if (
      mimeType.startsWith('image/') ||
      IngestionService.imageExtensions.includes(extension)
    ) {
      return 'image';
    }

    if (extension === '.pdf' || mimeType === 'application/pdf') {
      return 'pdf';
    }

    throw new BadRequestException('Unsupported file type');
  }

  private computeChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  private deriveFileId(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }
}
