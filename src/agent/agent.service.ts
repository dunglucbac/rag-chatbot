import { Inject, Injectable } from '@nestjs/common';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { BaseCheckpointSaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { LlmService } from '../llm/llm.service';
import { AGENT_CHECKPOINTER } from './agent.constants';
import { ReceiptAnalyticsService } from '../receipt/analytics/receipt-analytics.service';
import { createPurchaseSummaryTool } from './tools/purchase-summary.tool';
import { createSearchPurchaseItemsTool } from './tools/search-purchase-items.tool';
import { createFinancialAgentPrompt } from './financial-agent.prompt';
import {
  hasCurrentTurnReceiptEvidence,
  RECEIPT_DATA_UNAVAILABLE_RESPONSE,
  RECEIPT_EVIDENCE_UNAVAILABLE_RESPONSE,
  requiresReceiptEvidence,
} from './financial-agent.policy';
import { MAX_RECEIPT_TOOL_CALLS, ToolCallBudget } from './tool-call-budget';
import { enforceToolCallBudget } from './tool-call-budget-hook';

@Injectable()
export class AgentService {
  constructor(
    private readonly llmService: LlmService,
    @Inject(AGENT_CHECKPOINTER)
    private readonly checkpointer: BaseCheckpointSaver,
    private readonly receiptAnalyticsService: ReceiptAnalyticsService,
  ) {}

  async invoke(
    userId: string,
    message: string,
    threadId?: string,
  ): Promise<string> {
    const financialClaim = requiresReceiptEvidence(message);
    const now = new Date();
    const toolCallBudget = new ToolCallBudget(MAX_RECEIPT_TOOL_CALLS);
    const clock = () => now;
    const invokeAgent = (policyRetry: boolean) => {
      const agent = createReactAgent({
        llm: this.llmService.getModel(),
        tools: [
          createPurchaseSummaryTool(
            this.receiptAnalyticsService,
            userId,
            clock,
            toolCallBudget,
          ),
          createSearchPurchaseItemsTool(
            this.receiptAnalyticsService,
            userId,
            clock,
            toolCallBudget,
          ),
        ],
        checkpointSaver: this.checkpointer,
        prompt: createFinancialAgentPrompt(now, policyRetry),
        postModelHook: enforceToolCallBudget,
      });
      return agent.invoke(
        { messages: [new HumanMessage(message)] },
        { configurable: { thread_id: threadId ?? userId } },
      );
    };

    try {
      let result = await invokeAgent(false);
      if (financialClaim && !hasCurrentTurnReceiptEvidence(result.messages)) {
        result = await invokeAgent(true);
        if (!hasCurrentTurnReceiptEvidence(result.messages)) {
          return RECEIPT_EVIDENCE_UNAVAILABLE_RESPONSE;
        }
      }

      const lastMessage = result.messages[result.messages.length - 1];
      return typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
    } catch (error: unknown) {
      if (financialClaim) {
        return RECEIPT_DATA_UNAVAILABLE_RESPONSE;
      }
      throw error;
    }
  }

  deleteThread(threadId: string): Promise<void> {
    return this.checkpointer.deleteThread(threadId);
  }
}
