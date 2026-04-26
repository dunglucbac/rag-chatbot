import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { IngestionService } from './ingestion.service';
import { IngestionJobService } from './ingestion-job.service';

const uploadDir = path.join(process.cwd(), 'storage', 'uploads');

@Controller('ingest')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly jobService: IngestionJobService,
  ) {}

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const job = await this.ingestionService.createJobFromUpload(file);
    return { message: 'File queued for ingestion', job };
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobService.findById(id);
    if (!job) throw new NotFoundException('Ingestion job not found');
    return job;
  }
}
