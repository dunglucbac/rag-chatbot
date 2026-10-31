import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MessageQueueConsumer } from '@modules/message-queue/consumer/consumer.service';
import { MessageQueueService } from '@modules/message-queue/publisher/publisher.service';
import { MessageRouter } from '@modules/message-queue/router/message-router.service';

@Module({
  imports: [ConfigModule],
  providers: [
    MessageQueueBrokerService,
    MessageQueueService,
    MessageQueueConsumer,
    MessageRouter,
  ],
  exports: [MessageQueueService, MessageRouter],
})
export class MessageQueueModule {}
