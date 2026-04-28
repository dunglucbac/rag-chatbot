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
import * as fs from 'fs';
import * as path from 'path';
import { diskStorage } from 'multer';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { IngestionJobDto } from '@modules/ingestion/dto/ingestion-job.dto';
import { ApiResponse } from '@modules/ingestion/dto/api-response.dto';

const uploadDir = path.join(process.cwd(), 'storage', 'uploads');

@Controller('ingest')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly jobRepository: IngestionJobRepository,
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
  async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<
    ApiResponse<{
      job: IngestionJobDto;
      event: Awaited<
        ReturnType<IngestionService['createJobFromUpload']>
      >['event'];
    }>
  > {
    const result = await this.ingestionService.createJobFromUpload(file);

    return {
      status: 'success',
      message: 'File uploaded and detected',
      data: {
        job: IngestionJobDto.fromEntity(result.job),
        event: result.event,
      },
    };
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobRepository.findById(id);
    if (!job) throw new NotFoundException('Ingestion job not found');
    return IngestionJobDto.fromEntity(job);
  }
}
