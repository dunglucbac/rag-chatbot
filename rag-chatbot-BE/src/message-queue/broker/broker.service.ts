import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { type Channel, type Connection } from 'amqplib';
import {
  MESSAGE_QUEUE_BROKER_BINDINGS,
  MESSAGE_QUEUE_DEAD_LETTER_EXCHANGE,
  MESSAGE_QUEUE_DEAD_LETTER_QUEUE,
  MESSAGE_QUEUE_EXCHANGE,
  MESSAGE_QUEUE_IMAGE_QUEUE,
  MESSAGE_QUEUE_PDF_QUEUE,
  MESSAGE_QUEUE_RAG_APP_QUEUES,
  MESSAGE_QUEUE_RESULTS_QUEUE,
  MESSAGE_QUEUE_STATUS_QUEUE,
} from '@modules/message-queue/message-queue.constants';

@Injectable()
export class MessageQueueBrokerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessageQueueBrokerService.name);
  private connection?: Connection;
  private channel?: Channel;
  private readonly exchange: string;
  private readonly url: string;
  private readonly queueNames: Readonly<Record<string, string>>;
  private readonly deadLetterExchange: string;
  private readonly deadLetterQueue: string;
  readonly appQueues: readonly string[];

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>(
      'rabbitmq.url',
      'amqp://localhost',
    );
    this.exchange = this.configService.get<string>(
      'rabbitmq.exchange',
      MESSAGE_QUEUE_EXCHANGE,
    );
    const configured = (key: string, fallback: string) =>
      this.configService.get<string>(`rabbitmq.${key}`, fallback);
    this.queueNames = {
      [MESSAGE_QUEUE_IMAGE_QUEUE]: configured(
        'imageQueue',
        MESSAGE_QUEUE_IMAGE_QUEUE,
      ),
      [MESSAGE_QUEUE_PDF_QUEUE]: configured(
        'pdfQueue',
        MESSAGE_QUEUE_PDF_QUEUE,
      ),
      [MESSAGE_QUEUE_STATUS_QUEUE]: configured(
        'statusQueue',
        MESSAGE_QUEUE_STATUS_QUEUE,
      ),
      [MESSAGE_QUEUE_RESULTS_QUEUE]: configured(
        'resultsQueue',
        MESSAGE_QUEUE_RESULTS_QUEUE,
      ),
    };
    this.appQueues = MESSAGE_QUEUE_RAG_APP_QUEUES.map(
      (queue) => this.queueNames[queue],
    );
    this.deadLetterExchange = configured(
      'deadLetterExchange',
      MESSAGE_QUEUE_DEAD_LETTER_EXCHANGE,
    );
    this.deadLetterQueue = configured(
      'deadLetterQueue',
      MESSAGE_QUEUE_DEAD_LETTER_QUEUE,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async connect(): Promise<{ channel: Channel; exchange: string }> {
    if (this.connection && this.channel) {
      return { channel: this.channel, exchange: this.exchange };
    }

    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    await this.channel.assertExchange(this.deadLetterExchange, 'topic', {
      durable: true,
    });
    await this.channel.assertQueue(this.deadLetterQueue, {
      durable: true,
    });
    await this.channel.bindQueue(
      this.deadLetterQueue,
      this.deadLetterExchange,
      '#',
    );

    for (const binding of MESSAGE_QUEUE_BROKER_BINDINGS) {
      const queue = this.queueNames[binding.queue];
      await this.channel.assertQueue(queue, {
        durable: true,
        ...(this.appQueues.includes(queue)
          ? {
              arguments: {
                'x-dead-letter-exchange': this.deadLetterExchange,
              },
            }
          : {}),
      });
      await this.channel.bindQueue(queue, this.exchange, binding.routingKey);
    }

    this.logger.log(`Connected to RabbitMQ exchange ${this.exchange}`);
    return { channel: this.channel, exchange: this.exchange };
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
  }
}
