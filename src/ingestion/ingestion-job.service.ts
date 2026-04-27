import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionJob } from './ingestion-job.entity';
import { IngestionJobStatus, IngestionJobUpdate } from './ingestion.types';

@Injectable()
export class IngestionJobService {
  constructor(
    @InjectRepository(IngestionJob)
    private readonly jobRepository: Repository<IngestionJob>,
  ) {}

  create(data: IngestionJobUpdate) {
    const job = this.jobRepository.create(data);
    return this.jobRepository.save(job);
  }

  findById(id: string) {
    return this.jobRepository.findOneBy({ id });
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
    return this.jobRepository.save(job);
  }
}
