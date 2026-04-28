import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type Channel,
  type Connection,
  type ConsumeMessage,
} from 'amqplib';
import {
  MESSAGE_QUEUE_EXCHANGE,
  MESSAGE_QUEUE_IMAGE_QUEUE,
  MESSAGE_QUEUE_PDF_QUEUE,
} from '@modules/message-queue/message-queue.constants';

@Injectable()
export class MessageQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(MessageQueueConsumer.name);
  private connection?: Connection;
  private channel?: Channel;

  constructor(private readonly configService: ConfigService) {}
  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.consumeImageQueue();
    await this.consumePdfQueue();
  }

  private async connect(): Promise<void> {
    const url = this.configService.get<string>(
      'rabbitmq.url',
      'amqp://localhost',
    );

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(MESSAGE_QUEUE_EXCHANGE, 'topic', {
      durable: true,
    });
    this.logger.log('RabbitMQ consumer connected');
  }

  private async consumeImageQueue(): Promise<void> {
    if (!this.channel) {
      return;
    }

    await this.channel.assertQueue(MESSAGE_QUEUE_IMAGE_QUEUE, {
      durable: true,
    });
    await this.channel.bindQueue(
      MESSAGE_QUEUE_IMAGE_QUEUE,
      MESSAGE_QUEUE_EXCHANGE,
      'ingest.image.uploaded',
    );

    await this.channel.consume(
      MESSAGE_QUEUE_IMAGE_QUEUE,
      (msg) => this.handleMessage(msg, 'image'),
      { noAck: false },
    );
  }

  private async consumePdfQueue(): Promise<void> {
    if (!this.channel) {
      return;
    }

    await this.channel.assertQueue(MESSAGE_QUEUE_PDF_QUEUE, { durable: true });
    await this.channel.bindQueue(
      MESSAGE_QUEUE_PDF_QUEUE,
      MESSAGE_QUEUE_EXCHANGE,
      'ingest.pdf.uploaded',
    );

    await this.channel.consume(
      MESSAGE_QUEUE_PDF_QUEUE,
      (msg) => this.handleMessage(msg, 'pdf'),
      { noAck: false },
    );
  }

  private handleMessage(
    msg: ConsumeMessage | null,
    source: 'image' | 'pdf',
  ): void {
    if (!msg || !this.channel) {
      return;
    }

    try {
      const payload = JSON.parse(msg.content.toString('utf8')) as {
        eventType?: string;
        payload?: unknown;
      };

      this.logger.log(
        `Received ${source} message ${payload.eventType ?? 'unknown'}`,
      );
      // TODO: hand off to OCR / extraction pipeline
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(`Failed to process ${source} message`, error as Error);
      this.channel.nack(msg, false, false);
    }
  }
}
