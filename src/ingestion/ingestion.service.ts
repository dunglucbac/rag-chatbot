import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { MessageQueueService } from '@modules/message-queue';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import {
  INGESTION_JOB_STATUSES,
  IngestionSourceType,
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

  private static readonly sourceTypeUploadEvents: Record<
    IngestionSourceType,
    string
  > = {
    image: 'ingest.image.uploaded',
    pdf: 'ingest.pdf.uploaded',
    receipt: 'ingest.file.uploaded',
  };

  constructor(
    private readonly jobRepository: IngestionJobRepository,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async createJobFromUpload(
    file: Express.Multer.File,
  ): Promise<{ job: IngestionJob; event: DispatchEnvelope }> {
    const sourceType = this.detectSourceType(file.mimetype, file.originalname);
    const job = await this.jobRepository.create({
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sourceType,
      status: INGESTION_JOB_STATUSES[0],
      metadata: {
        size: file.size,
        mimetype: file.mimetype,
        originalExtension: path.extname(file.originalname).toLowerCase(),
      },
    });

    const eventType = IngestionService.sourceTypeUploadEvents[sourceType];
    const dispatched = await this.messageQueueService.publish(eventType, {
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sourceType,
      fileExtension: path.extname(file.originalname).toLowerCase(),
      fileSize: file.size,
    });

    return { job, event: dispatched };
  }

  private detectSourceType(
    mimeType: string,
    filename: string,
  ): IngestionSourceType {
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

    return 'receipt';
  }
}
