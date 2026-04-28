import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { CommonDispatchService } from '@modules/common/common-dispatch.service';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import {
  INGESTION_JOB_STATUSES,
  IngestionSourceType,
} from '@modules/ingestion/ingestion.types';

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
    private readonly dispatchService: CommonDispatchService,
  ) {}

  async createJobFromUpload(file: Express.Multer.File) {
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

    const dispatched = this.dispatchService.dispatch('ingest.file.detected', {
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
