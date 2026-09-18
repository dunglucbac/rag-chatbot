import { Injectable, OnModuleInit } from '@nestjs/common';
import { type Channel, type ConsumeMessage } from 'amqplib';
import { MESSAGE_QUEUE_RAG_APP_QUEUES } from '@modules/message-queue/message-queue.constants';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import {
  MessageRouter,
  UnknownEventTypeError,
} from '@modules/message-queue/router/message-router.service';
import { EventEnvelope } from '@modules/common/common.types';

@Injectable()
export class MessageQueueConsumer implements OnModuleInit {
  private channel?: Channel;

  constructor(
    private readonly broker: MessageQueueBrokerService,
    private readonly router: MessageRouter,
  ) {}

  async onModuleInit(): Promise<void> {
    const broker = await this.broker.connect();
    this.channel = broker.channel;
    await this.consumeOwnedQueues();
  }

  private async consumeOwnedQueues(): Promise<void> {
    if (!this.channel) {
      return;
    }

    for (const queue of MESSAGE_QUEUE_RAG_APP_QUEUES) {
      await this.channel.consume(
        queue,
        async (msg) => {
          await this.handleMessage(msg, queue);
        },
        { noAck: false },
      );
    }
  }

  private async handleMessage(
    msg: ConsumeMessage | null,
    queue: string,
  ): Promise<void> {
    if (!this.channel || !msg) {
      return;
    }

    try {
      const envelope: EventEnvelope = JSON.parse(
        msg.content.toString(),
      ) as EventEnvelope;
      console.log(
        `Received ${envelope.eventType} from ${queue} [correlationId=${envelope.correlationId}]`,
      );
      await this.router.dispatch(envelope);
      this.channel.ack(msg);
    } catch (error: unknown) {
      if (error instanceof UnknownEventTypeError) {
        console.error(
          `Rejecting unknown event type from ${queue}: ${error.message}`,
        );
        this.channel.nack(msg, false, false);
        return;
      }

      console.error(`Failed to process message from ${queue}:`, error);
      this.channel.nack(msg, false, true);
    }
  }
}
