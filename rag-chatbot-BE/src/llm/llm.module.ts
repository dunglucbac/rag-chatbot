import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LangfuseObservabilityService } from './langfuse-observability.service';

@Module({
  providers: [LlmService, LangfuseObservabilityService],
  exports: [LlmService, LangfuseObservabilityService],
})
export class LlmModule {}
