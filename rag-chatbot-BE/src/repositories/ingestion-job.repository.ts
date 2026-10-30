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

  async listForUser(userId: string, offset: number) {
    const jobs = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: 31,
    });
    return {
      jobs: jobs.slice(0, 30),
      nextOffset: jobs.length > 30 ? offset + 30 : null,
    };
  }

  async claimRetry(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.update(
      { id, userId, status: IngestionJobStatus.FAILED },
      {
        status: IngestionJobStatus.PENDING,
        errorMessage: null,
        completedAt: null,
      },
    );
    return result.affected === 1;
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
      checksumSha256?: string | null;
    },
  ): Promise<{ job: IngestionJob; created: boolean }> {
    if (!data.checksumSha256) {
      return { job: await this.create(data), created: true };
    }
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
