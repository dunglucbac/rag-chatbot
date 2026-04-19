import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { LlmModule } from '../llm/llm.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { WebSearchModule } from '../web-search/web-search.module';

@Module({
  imports: [LlmModule, VectorStoreModule, WebSearchModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
