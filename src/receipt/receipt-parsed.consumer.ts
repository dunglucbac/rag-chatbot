import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { ReceiptParsedPayload } from '../common/event-payloads.types';
import { ReceiptService } from './receipt.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';

@Injectable()
export class ReceiptParsedConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReceiptParsedConsumer.name);

  constructor(
    private readonly receiptService: ReceiptService,
    private readonly router: MessageRouter,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  onModuleInit() {
    this.router.register('receipt.parsed', this.handleReceiptParsed.bind(this));
  }

  async handleReceiptParsed(envelope: EventEnvelope<ReceiptParsedPayload>) {
    if (!envelope.payload) return;
    this.logger.log(`handleReceiptParsed [correlationId=${envelope.correlationId} jobId=${envelope.payload.jobId}]`);
    await this.receiptService.saveFromEvent(envelope.payload);

    const job = await this.jobRepository.findById(envelope.payload.jobId);
    if (job) {
      job.status = 'completed';
      job.classification = 'receipt';
      job.completedAt = new Date();
      await this.jobRepository.save(job);
    }
  }
}
