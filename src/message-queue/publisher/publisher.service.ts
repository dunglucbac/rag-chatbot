import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DispatchEnvelope } from '@modules/common/common.types';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';

@Injectable()
export class MessageQueueService {
  constructor(private readonly broker: MessageQueueBrokerService) {}

  async publish<TPayload extends Record<string, unknown>>(
    eventType: string,
    payload: TPayload,
    correlationId: string,
    schemaVersion: number,
    attempt: number,
  ): Promise<DispatchEnvelope<TPayload>> {
    const envelope: DispatchEnvelope<TPayload> = {
      schemaVersion: schemaVersion,
      eventId: randomUUID(),
      eventType,
      correlationId,
      attempt: attempt,
      createdAt: new Date().toISOString(),
      payload,
    };

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
      throw new Error(`Failed to publish event ${eventType}`);
    }

    return envelope;
  }
}
