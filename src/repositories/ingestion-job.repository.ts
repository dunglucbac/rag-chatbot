import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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

  async createOrGetByChecksum(
    data: DeepPartial<IngestionJob> & {
      userId: string;
      checksumSha256: string;
    },
  ): Promise<{ job: IngestionJob; created: boolean }> {
    const existing = await this.repository.findOneBy({
      userId: data.userId,
      checksumSha256: data.checksumSha256,
    });
    if (existing) {
      return { job: existing, created: false };
    }

    try {
      const job = await this.create(data);
      return { job, created: true };
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const concurrentJob = await this.repository.findOneBy({
        userId: data.userId,
        checksumSha256: data.checksumSha256,
      });
      if (concurrentJob) {
        return { job: concurrentJob, created: false };
      }

      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
