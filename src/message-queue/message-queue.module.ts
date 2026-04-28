import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessageQueueConsumer } from '@modules/message-queue/message-queue.consumer';
import { MessageQueueService } from '@modules/message-queue/message-queue.service';

@Module({
  imports: [ConfigModule],
  providers: [MessageQueueService, MessageQueueConsumer],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
