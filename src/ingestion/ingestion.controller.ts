import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { IngestionJobDto } from '@modules/ingestion/dto/ingestion-job.dto';
import { ApiResponse } from '@modules/ingestion/dto/api-response.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateIngestionJobDto } from './dto/create-ingestion-job.dto';
import type { NeedsReviewRecord } from './needs-review.types';

@Controller('ingest')
@UseGuards(GoogleAuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  async createJob(
    @Body() dto: CreateIngestionJobDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<
    ApiResponse<{
      job: IngestionJobDto;
      accepted: true;
      deduplicated: boolean;
    }>
  > {
    const result = await this.ingestionService.createJobFromObject(
      dto,
      user.id,
      correlationId,
    );

    return {
      status: 'success',
      message: result.deduplicated
        ? 'Duplicate file matched an existing ingestion job'
        : 'Object accepted for ingestion',
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

  @Get('jobs/:id/review')
  async getNeedsReview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<{ job: IngestionJobDto; review: NeedsReviewRecord }>> {
    const { job, review } = await this.ingestionService.getNeedsReview(
      id,
      user.id,
    );
    return {
      status: 'success',
      message: 'Receipt review fetched',
      data: { job: IngestionJobDto.fromEntity(job), review },
    };
  }

  @Post('jobs/:id/review')
  async resolveNeedsReview(
    @Param('id') id: string,
    @Body() input: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<{ job: IngestionJobDto; review: NeedsReviewRecord }>> {
    const { job, review } = await this.ingestionService.resolveNeedsReview(
      id,
      user.id,
      input,
    );
    return {
      status: 'success',
      message:
        review.status === 'approved'
          ? 'Receipt review approved and queued for processing'
          : 'Receipt review rejected',
      data: { job: IngestionJobDto.fromEntity(job), review },
    };
  }
}
