import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  providers: [TelegramService],
  controllers: [TelegramUpdate],
})
export class TelegramModule {}
