import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatResponseInterceptor } from './chat-response.interceptor';
import { ChatExceptionFilter } from './chat-exception.filter';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [ChatController],
  providers: [ChatService, ChatResponseInterceptor, ChatExceptionFilter],
})
export class ChatModule {}
