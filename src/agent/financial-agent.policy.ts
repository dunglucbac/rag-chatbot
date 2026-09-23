import { BaseMessage, ToolMessage } from '@langchain/core/messages';

const PERSONAL_LANGUAGE = /\b(i|me|my|mine|we|us|our|ours)\b/i;
const RECEIPT_FINANCIAL_LANGUAGE =
  /\b(receipts?|purchases?|purchased|buy|bought|items?|spend|spending|spent|payments?|paid|pay|costs?|totals?|merchants?|categories|category)\b/i;
const APPROVED_RECEIPT_TOOLS = new Set([
  'get_purchase_summary',
  'search_purchase_items',
]);

export const RECEIPT_EVIDENCE_UNAVAILABLE_RESPONSE =
  "I couldn't verify that from your receipt data, so I won't guess. Please try again.";

export const RECEIPT_DATA_UNAVAILABLE_RESPONSE =
  "I couldn't access your receipt data right now, so I won't guess. Please try again.";

export function requiresReceiptEvidence(message: string): boolean {
  return (
    PERSONAL_LANGUAGE.test(message) && RECEIPT_FINANCIAL_LANGUAGE.test(message)
  );
}

export function hasCurrentTurnReceiptEvidence(
  messages: BaseMessage[],
): boolean {
  const currentTurnStart = messages.findLastIndex(
    (message) => message.getType() === 'human',
  );
  if (currentTurnStart < 0) {
    return false;
  }

  return messages.slice(currentTurnStart + 1).some((message) => {
    if (message.getType() !== 'tool') {
      return false;
    }
    const toolName = (message as ToolMessage).name;
    return typeof toolName === 'string' && APPROVED_RECEIPT_TOOLS.has(toolName);
  });
}
