import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '@repositories/base/base.repository';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import {
  IngestionJobStatus,
  IngestionJobUpdate,
} from '@modules/ingestion/ingestion.types';

@Injectable()
export class IngestionJobRepository extends BaseRepository<IngestionJob> {
  constructor(
    @InjectRepository(IngestionJob)
    repository: Repository<IngestionJob>,
  ) {
    super(repository);
  }

  async updateStatus(
    id: string,
    status: IngestionJobStatus,
    patch: IngestionJobUpdate = {},
  ) {
    const job = await this.findById(id);
    if (!job) {
      return null;
    }

    Object.assign(job, patch, { status });
    return this.save(job);
  }
}
