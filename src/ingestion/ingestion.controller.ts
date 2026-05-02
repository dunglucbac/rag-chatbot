import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { IngestionService } from '@modules/ingestion/ingestion.service';

const uploadDir = path.join(process.cwd(), 'storage', 'uploads');

@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) =>
          cb(
            null,
            `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
          ),
      }),
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-correlation-id') correlationIdHeader?: string,
  ) {
    const correlationId = this.normalizeCorrelationId(correlationIdHeader);
    return this.ingestionService.createJobFromUpload(
      file,
      'anonymous',
      correlationId,
    );
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.ingestionService.getJobById(id);
  }

  private normalizeCorrelationId(value?: string): string {
    const trimmed = value?.trim();
    if (trimmed && /^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
    return randomUUID();
  }
}
