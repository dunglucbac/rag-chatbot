import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import amqp, { type Channel, type Connection } from 'amqplib';
import { DispatchEnvelope } from '@modules/common/common.types';

@Injectable()
export class MessageQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageQueueService.name);
  private connection?: Connection;
  private channel?: Channel;
  private readonly exchange: string;
  private readonly url: string;

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>(
      'rabbitmq.url',
      'amqp://localhost',
    );
    this.exchange = this.configService.get<string>(
      'rabbitmq.exchange',
      'ingest.topic',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async publish<TPayload extends Record<string, unknown>>(
    eventType: string,
    payload?: TPayload,
  ): Promise<DispatchEnvelope<TPayload>> {
    const envelope: DispatchEnvelope<TPayload> = {
      eventId: randomUUID(),
      eventType,
      createdAt: new Date().toISOString(),
      payload,
    };

    await this.sendToBroker(envelope);

    return envelope;
  }

  private async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }

    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    this.logger.log(`Connected to RabbitMQ exchange ${this.exchange}`);
  }

  private async sendToBroker<TPayload extends Record<string, unknown>>(
    envelope: DispatchEnvelope<TPayload>,
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const payloadBuffer = Buffer.from(JSON.stringify(envelope));
    const published = this.channel?.publish(
      this.exchange,
      envelope.eventType,
      payloadBuffer,
      {
        contentType: 'application/json',
        messageId: envelope.eventId,
        timestamp: Date.now(),
        persistent: true,
      },
    );

    if (!published) {
      this.logger.warn(
        `RabbitMQ publish returned false for ${envelope.eventType}`,
      );
    }
  }

  private async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
  }
}
