import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { type Channel, type Connection } from 'amqplib';
import {
  MESSAGE_QUEUE_BINDINGS,
  MESSAGE_QUEUE_EXCHANGE,
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

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>(
      'rabbitmq.url',
      'amqp://localhost',
    );
    this.exchange = this.configService.get<string>(
      'rabbitmq.exchange',
      MESSAGE_QUEUE_EXCHANGE,
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

    for (const binding of MESSAGE_QUEUE_BINDINGS) {
      await this.channel.assertQueue(binding.queue, { durable: true });
      await this.channel.bindQueue(
        binding.queue,
        this.exchange,
        binding.routingKey,
      );
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
