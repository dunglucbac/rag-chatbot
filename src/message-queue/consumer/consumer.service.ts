import { Injectable, OnModuleInit } from '@nestjs/common';
import { type Channel, type ConsumeMessage } from 'amqplib';
import {
  MESSAGE_QUEUE_BINDINGS,
  MESSAGE_QUEUE_EXCHANGE,
} from '@modules/message-queue/message-queue.constants';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';

@Injectable()
export class MessageQueueConsumer implements OnModuleInit {
  private channel?: Channel;

  constructor(private readonly broker: MessageQueueBrokerService) {}

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
        (msg) => {
          this.handleMessage(msg, binding.queue);
        },
        { noAck: false },
      );
    }
  }

  private handleMessage(msg: ConsumeMessage | null, queue: string): void {
    if (!this.channel || !msg) {
      return;
    }

    const messageType = queue.includes('pdf')
      ? 'pdf'
      : queue.includes('image')
        ? 'image'
        : 'status';

    try {
      console.log(`Received ${messageType} message from ${queue}`);
      this.channel.ack(msg);
    } catch (error) {
      this.channel.nack(msg, false, false);
      throw error;
    }
  }
}
