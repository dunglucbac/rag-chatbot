import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import {
  ParseCompletedPayload,
  ClassifyCompletedPayload,
  JobFailedPayload,
} from '../common/event-payloads.types';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';

@Injectable()
export class IngestionEventConsumer {
  constructor(private readonly jobRepository: IngestionJobRepository) {}

  async handleParseCompleted(envelope: EventEnvelope<ParseCompletedPayload>) {
    if (!envelope.payload) return;
    await this.completeJob(envelope.payload.jobId, envelope.payload.extractedText);
  }

  async handleClassifyCompleted(envelope: EventEnvelope<ClassifyCompletedPayload>) {
    if (!envelope.payload) return;
    await this.completeJob(envelope.payload.jobId, envelope.payload.extractedText);
  }

  async handleJobFailed(envelope: EventEnvelope<JobFailedPayload>) {
    if (!envelope.payload) return;
    const job = await this.jobRepository.findById(envelope.payload.jobId);
    if (!job) return;

    job.status = 'failed';
    job.errorMessage = envelope.payload.error ?? null;
    await this.jobRepository.save(job);
  }

  private async completeJob(jobId: string, extractedText?: string) {
    const job = await this.jobRepository.findById(jobId);
    if (!job) return;

    job.status = 'completed';
    job.extractedText = extractedText ?? null;
    job.completedAt = new Date();
    await this.jobRepository.save(job);
  }
}
