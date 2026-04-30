import { Injectable, Logger } from '@nestjs/common';
import { ConsumeMessage, type Channel } from 'amqplib';
import { MessageQueueRoutingService } from '@modules/message-queue/routing/routing.service';

export interface ValidatedMessageEnvelope {
  eventType: string;
  payload: unknown;
  source: 'image' | 'pdf';
}

@Injectable()
export class MessageQueueTransportService {
  private readonly logger = new Logger(MessageQueueTransportService.name);

  constructor(private readonly routing: MessageQueueRoutingService) {}

  handleMessage(
    channel: Channel,
    msg: ConsumeMessage | null,
    source: 'image' | 'pdf',
  ): void {
    if (!msg) {
      return;
    }

    try {
      const envelope = this.parseEnvelope(msg.content.toString('utf8'), source);
      const destination = this.routing.route(envelope.eventType);

      this.logger.log(
        `Received ${source} message ${envelope.eventType} -> ${destination}`,
      );
      // TODO: hand off to OCR / extraction pipeline
      channel.ack(msg);
    } catch (error) {
      this.logger.error(`Failed to process ${source} message`, error as Error);
      channel.nack(msg, false, false);
    }
  }

  private parseEnvelope(
    raw: string,
    source: 'image' | 'pdf',
  ): ValidatedMessageEnvelope {
    const parsed = JSON.parse(raw) as Partial<ValidatedMessageEnvelope>;
    if (typeof parsed.eventType !== 'string') {
      throw new Error(`Invalid ${source} message envelope`);
    }

    return {
      eventType: parsed.eventType,
      payload: parsed.payload,
      source,
    };
  }
}
