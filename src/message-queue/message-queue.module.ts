import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MessageQueueConsumer } from '@modules/message-queue/consumer/consumer.service';
import { MessageQueueTransportService } from '@modules/message-queue/consumer/transport.service';
import { MessageQueueService } from '@modules/message-queue/publisher/publisher.service';
import { MessageQueueRoutingModule } from '@modules/message-queue/routing/message-queue-routing.module';

@Module({
  imports: [ConfigModule, MessageQueueRoutingModule],
  providers: [
    MessageQueueBrokerService,
    MessageQueueService,
    MessageQueueConsumer,
    MessageQueueTransportService,
  ],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
