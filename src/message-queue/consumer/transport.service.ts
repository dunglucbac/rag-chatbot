import { Injectable, Logger } from '@nestjs/common';
import { ConsumeMessage, type Channel } from 'amqplib';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { MessageQueueRoutingService } from '@modules/message-queue/routing/routing.service';

type MessageEnvelope = {
  eventType?: string;
  event_type?: string;
  payload?: {
    jobId?: string;
    status?: 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed';
    errorMessage?: string | null;
    completedAt?: string | null;
    classification?: string;
  };
  schemaVersion?: number;
  schema_version?: number;
};

export interface ValidatedMessageEnvelope {
  eventType: string;
  payload: NonNullable<MessageEnvelope['payload']>;
  source: 'image' | 'pdf' | 'status';
}

@Injectable()
export class MessageQueueTransportService {
  private readonly logger = new Logger(MessageQueueTransportService.name);

  constructor(
    private readonly routing: MessageQueueRoutingService,
    private readonly jobRepository: IngestionJobRepository,
  ) {}

  handleMessage(
    channel: Channel,
    msg: ConsumeMessage | null,
    source: 'image' | 'pdf' | 'status',
  ): void {
    if (!msg) {
      return;
    }

    try {
      const envelope = this.parseEnvelope(msg.content.toString('utf8'), source);
      const destination = this.routing.route(envelope.eventType);

      if (destination === 'status') {
        void this.applyStatusEnvelope(envelope);
      }

      this.logger.log(
        `Received ${source} message ${envelope.eventType} -> ${destination}`,
      );
      channel.ack(msg);
    } catch (error) {
      this.logger.error(`Failed to process ${source} message`, error as Error);
      channel.nack(msg, false, false);
    }
  }

  private async applyStatusEnvelope(
    envelope: ValidatedMessageEnvelope,
  ): Promise<void> {
    const jobId = envelope.payload.jobId;
    if (!jobId) {
      throw new Error('Status envelope missing jobId');
    }

    if (envelope.eventType === 'job.processing.started') {
      await this.jobRepository.updateStatus(jobId, 'processing');
      return;
    }

    if (envelope.eventType === 'job.failed') {
      await this.jobRepository.updateStatus(jobId, 'failed', {
        errorMessage:
          envelope.payload.errorMessage ?? 'Worker reported failure',
      });
      return;
    }

    if (envelope.eventType === 'doc.pdf.parse.completed') {
      await this.jobRepository.updateStatus(jobId, 'completed', {
        completedAt: envelope.payload.completedAt
          ? new Date(envelope.payload.completedAt)
          : new Date(),
      });
      return;
    }

    if (envelope.eventType === 'image.classify.completed') {
      await this.jobRepository.updateStatus(jobId, 'completed', {
        completedAt: envelope.payload.completedAt
          ? new Date(envelope.payload.completedAt)
          : new Date(),
        metadata: {
          classification: envelope.payload.classification ?? 'unknown',
        },
      });
    }
  }

  private parseEnvelope(
    raw: string,
    source: 'image' | 'pdf' | 'status',
  ): ValidatedMessageEnvelope {
    const parsed = JSON.parse(raw) as MessageEnvelope;
    const eventType = parsed.eventType ?? parsed.event_type;

    if (typeof eventType !== 'string') {
      throw new Error(`Invalid ${source} message envelope`);
    }

    if (
      typeof parsed.schemaVersion !== 'number' &&
      typeof parsed.schema_version !== 'number'
    ) {
      throw new Error(`Invalid ${source} message envelope schema`);
    }

    return {
      eventType,
      payload: parsed.payload ?? {},
      source,
    };
  }
}
