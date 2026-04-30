import { Module } from '@nestjs/common';
import { MessageQueueRoutingService } from '@modules/message-queue/routing/routing.service';

@Module({
  providers: [MessageQueueRoutingService],
  exports: [MessageQueueRoutingService],
})
export class MessageQueueRoutingModule {}
