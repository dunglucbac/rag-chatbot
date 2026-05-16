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
import { IngestionJobDto } from '@modules/ingestion/dto/ingestion-job.dto';
import { ApiResponse } from '@modules/ingestion/dto/api-response.dto';

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
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-user-id') userId?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<
    ApiResponse<{
      job: IngestionJobDto;
      accepted: true;
    }>
  > {
    const result = await this.ingestionService.createJobFromUpload(
      file,
      userId ?? 'demo-user',
      correlationId,
    );

    return {
      status: 'success',
      message: 'File accepted for ingestion',
      data: {
        job: IngestionJobDto.fromEntity(result.job),
        accepted: true,
      },
    };
  }

  @Get('jobs/:id')
  async getJob(
    @Param('id') id: string,
  ): Promise<ApiResponse<{ job: IngestionJobDto }>> {
    const job = await this.ingestionService.getJob(id);
    return {
      status: 'success',
      message: 'Ingestion job fetched',
      data: {
        job: IngestionJobDto.fromEntity(job),
      },
    };
  }
}
