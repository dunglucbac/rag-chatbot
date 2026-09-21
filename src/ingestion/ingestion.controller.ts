import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseGuards,
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
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';

const uploadDir = path.join(process.cwd(), 'storage', 'uploads');

@Controller('ingest')
@UseGuards(GoogleAuthGuard)
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
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<
    ApiResponse<{
      job: IngestionJobDto;
      accepted: true;
      deduplicated: boolean;
    }>
  > {
    const result = await this.ingestionService.createJobFromUpload(
      file,
      user.id,
      correlationId,
    );

    return {
      status: 'success',
      message: result.deduplicated
        ? 'Duplicate file matched an existing ingestion job'
        : 'File accepted for ingestion',
      data: {
        job: IngestionJobDto.fromEntity(result.job),
        accepted: true,
        deduplicated: result.deduplicated,
      },
    };
  }

  @Get('jobs/:id')
  async getJob(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<{ job: IngestionJobDto }>> {
    const job = await this.ingestionService.getJob(id, user.id);
    return {
      status: 'success',
      message: 'Ingestion job fetched',
      data: {
        job: IngestionJobDto.fromEntity(job),
      },
    };
  }
}
