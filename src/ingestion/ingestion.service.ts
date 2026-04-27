import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { IngestionJobService } from './ingestion-job.service';
import { IngestionSourceType, INGESTION_JOB_STATUSES } from './ingestion.types';

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

  constructor(private readonly jobService: IngestionJobService) {}

  async createJobFromUpload(file: Express.Multer.File) {
    const sourceType = this.detectSourceType(file.mimetype, file.originalname);
    const job = await this.jobService.create({
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sourceType,
      status: INGESTION_JOB_STATUSES[0], //Pending
      metadata: {
        size: file.size,
        mimetype: file.mimetype,
      },
    });

    return job;
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
