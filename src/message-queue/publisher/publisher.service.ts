import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEnvelope } from '@modules/common/common.types';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';

@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  constructor(private readonly broker: MessageQueueBrokerService) {}

  async publish<TPayload extends Record<string, unknown>>(
    eventType: string,
    payload: TPayload,
    correlationId: string,
    schemaVersion: number,
    attempt: number,
  ): Promise<EventEnvelope<TPayload>> {
    const envelope: EventEnvelope<TPayload> = {
      schemaVersion: schemaVersion,
      eventId: randomUUID(),
      eventType,
      correlationId,
      attempt: attempt,
      createdAt: new Date().toISOString(),
      payload,
    };

    this.logger.log(`Publishing ${eventType} [correlationId=${correlationId} eventId=${envelope.eventId}]`);

    const { channel, exchange } = await this.broker.connect();
    const published = channel.publish(
      exchange,
      envelope.eventType,
      Buffer.from(JSON.stringify(envelope)),
      {
        contentType: 'application/json',
        messageId: envelope.eventId,
        timestamp: Date.now(),
        persistent: true,
      },
    );

    if (!published) {
      this.logger.error(`Failed to publish ${eventType} [correlationId=${correlationId}]`);
      throw new Error(`Failed to publish event ${eventType}`);
    }

    return envelope;
  }
}
