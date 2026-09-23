import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { LlmModule } from '../llm/llm.module';
import { AGENT_CHECKPOINTER } from './agent.constants';
import { AgentCheckpointerService } from './agent-checkpointer.service';
import { ReceiptAnalyticsModule } from '../receipt/receipt-analytics.module';

@Module({
  imports: [LlmModule, ReceiptAnalyticsModule],
  providers: [
    AgentService,
    AgentCheckpointerService,
    {
      provide: AGENT_CHECKPOINTER,
      inject: [AgentCheckpointerService],
      useFactory: (service: AgentCheckpointerService) => service.checkpointer,
    },
  ],
  exports: [AgentService],
})
export class AgentModule {}
