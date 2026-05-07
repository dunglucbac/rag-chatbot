import { Injectable } from '@nestjs/common';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';

@Injectable()
export class IngestionEventConsumer {
  constructor(private readonly jobRepository: IngestionJobRepository) {}

  async handleParseCompleted(event: any) {
    await this.completeJob(event.jobId, event.extractedText);
  }

  async handleClassifyCompleted(event: any) {
    await this.completeJob(event.jobId, event.extractedText);
  }

  async handleJobFailed(event: any) {
    const job = await this.jobRepository.findById(event.jobId);
    if (!job) return;

    job.status = 'failed';
    job.errorMessage = event.error ?? null;
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
