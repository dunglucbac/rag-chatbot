import { Injectable, OnModuleInit } from '@nestjs/common';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { LlmService } from '../llm/llm.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { WebSearchService } from '../web-search/web-search.service';
import { createKnowledgeBaseTool } from './tools/knowledge-base.tool';
import { createWebSearchTool } from './tools/web-search.tool';

@Injectable()
export class AgentService implements OnModuleInit {
  private agentExecutor: ReturnType<typeof createReactAgent>;

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly webSearchService: WebSearchService,
  ) {}

  onModuleInit() {
    const knowledgeBaseTool = createKnowledgeBaseTool(this.vectorStoreService);

    // web search tool is created per-invoke to capture userId
    this.agentExecutor = createReactAgent({
      llm: this.llmService.getModel(),
      tools: [knowledgeBaseTool],
    });
  }

  async invoke(userId: string, message: string): Promise<string> {
    const webSearchTool = createWebSearchTool(this.webSearchService, userId);

    const agent = createReactAgent({
      llm: this.llmService.getModel(),
      tools: [createKnowledgeBaseTool(this.vectorStoreService), webSearchTool],
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
