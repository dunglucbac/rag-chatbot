import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { VectorStoreModule } from '@modules/vector-store/vector-store.module';
import { LlmModule } from '@modules/llm/llm.module';
import { MessageQueueModule } from '@modules/message-queue/message-queue.module';
import { IngestionModule } from '@modules/ingestion/ingestion.module';
import { WebSearchModule } from '@modules/web-search/web-search.module';
import { AgentModule } from './agent/agent.module';
import { TelegramModule } from './telegram/telegram.module';
import { ScraperModule } from './scraper/scraper.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    VectorStoreModule,
    LlmModule,
    MessageQueueModule,
    IngestionModule,
    WebSearchModule,
    AgentModule,
    TelegramModule,
    ScraperModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
