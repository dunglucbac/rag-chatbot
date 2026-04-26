import { Injectable } from '@nestjs/common';
import { IngestionJobService } from './ingestion-job.service';
import { IngestionQueueService } from './ingestion-queue.service';
import { IngestionSourceType } from './ingestion.types';
import * as path from 'path';

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
    private readonly jobService: IngestionJobService,
    private readonly queueService: IngestionQueueService,
  ) {}

  async createJobFromUpload(file: Express.Multer.File) {
    const sourceType = this.detectSourceType(file.mimetype, file.originalname);
    const job = await this.jobService.create({
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sourceType,
      status: 'pending',
      metadata: {
        size: file.size,
        mimetype: file.mimetype,
      },
    });

    await this.queueService.enqueue({
      jobId: job.id,
      storagePath: job.storagePath,
      mimeType: job.mimeType,
      originalFilename: job.originalFilename,
      sourceType: job.sourceType,
    });

    return job;
  }

  private detectSourceType(mimeType: string, filename: string): IngestionSourceType {
    const extension = path.extname(filename).toLowerCase();

    if (mimeType.startsWith('image/') || IngestionService.imageExtensions.includes(extension)) {
      return 'image';
    }

    if (extension === '.pdf' || mimeType === 'application/pdf') {
      return 'pdf';
    }

    return 'receipt';
  }
}
