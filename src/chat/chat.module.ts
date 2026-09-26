import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatSessionRetentionService } from './chat-session-retention.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatSession]), AgentModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatSessionRepository, ChatSessionRetentionService],
})
export class ChatModule {}
