import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { MAX_RECEIPT_TOOL_CALLS } from './tool-call-budget';

export const TOOL_CALL_LIMIT_RESPONSE =
  'I have reached the receipt lookup limit for this question. Please narrow the date range or filters.';

export function enforceToolCallBudget(state: { messages: BaseMessage[] }): {
  messages?: AIMessage[];
} {
  const currentTurnStart = state.messages.findLastIndex(
    (message) => message.getType() === 'human',
  );
  const currentTurnMessages = state.messages.slice(currentTurnStart + 1);
  const completedToolCallCount = currentTurnMessages.filter(
    (message) => message.getType() === 'tool',
  ).length;
  const lastMessage = state.messages.at(-1);

  if (
    completedToolCallCount >= MAX_RECEIPT_TOOL_CALLS &&
    lastMessage?.getType() === 'ai' &&
    (lastMessage as AIMessage).tool_calls?.length
  ) {
    return { messages: [new AIMessage(TOOL_CALL_LIMIT_RESPONSE)] };
  }
  return {};
}
