import { Injectable } from '@nestjs/common';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { LlmService } from '../llm/llm.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { WebSearchService } from '../web-search/web-search.service';
import { createKnowledgeBaseTool } from './tools/knowledge-base.tool';
import { createWebSearchTool } from './tools/web-search.tool';

@Injectable()
export class AgentService {
  constructor(
    private readonly llmService: LlmService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly webSearchService: WebSearchService,
  ) {}

  async invoke(userId: string, message: string): Promise<string> {
    const agent = createReactAgent({
      llm: this.llmService.getModel(),
      tools: [
        createKnowledgeBaseTool(this.vectorStoreService),
        createWebSearchTool(this.webSearchService, userId),
      ],
    });

    const result = await agent.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: userId } },
    );

    const lastMessage = result.messages[result.messages.length - 1];
    return typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  }
}
