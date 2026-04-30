import { Injectable, OnModuleInit } from '@nestjs/common';
import { type Channel } from 'amqplib';
import {
  MESSAGE_QUEUE_BINDINGS,
  MESSAGE_QUEUE_EXCHANGE,
} from '@modules/message-queue/message-queue.constants';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MessageQueueTransportService } from '@modules/message-queue/consumer/transport.service';

@Injectable()
export class MessageQueueConsumer implements OnModuleInit {
  private channel?: Channel;

  constructor(
    private readonly broker: MessageQueueBrokerService,
    private readonly transport: MessageQueueTransportService,
  ) {}
  async onModuleInit(): Promise<void> {
    const broker = await this.broker.connect();
    this.channel = broker.channel;
    await this.consumeBindings();
  }

  private async consumeBindings(): Promise<void> {
    if (!this.channel) {
      return;
    }

    for (const binding of MESSAGE_QUEUE_BINDINGS) {
      await this.channel.assertQueue(binding.queue, { durable: true });
      await this.channel.bindQueue(
        binding.queue,
        MESSAGE_QUEUE_EXCHANGE,
        binding.routingKey,
      );
      await this.channel.consume(
        binding.queue,
        (msg) =>
          this.transport.handleMessage(
            this.channel as Channel,
            msg,
            binding.queue.includes('pdf') ? 'pdf' : 'image',
          ),
        { noAck: false },
      );
    }
  }
}
