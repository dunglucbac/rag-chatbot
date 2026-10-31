import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
  hasCurrentTurnReceiptEvidence,
  requiresReceiptEvidence,
} from './financial-agent.policy';

describe('financial agent policy', () => {
  it('requires receipt evidence for personal financial questions', () => {
    expect(
      requiresReceiptEvidence('How much did I spend on items last week?'),
    ).toBe(true);
    expect(requiresReceiptEvidence('Hello, how are you?')).toBe(false);
  });

  it('does not treat receipt evidence from an earlier turn as current evidence', () => {
    const oldEvidence = new ToolMessage({
      content: '{"status":"success"}',
      tool_call_id: 'old-call',
      name: 'get_purchase_summary',
    });
    const currentQuestion = new HumanMessage('How much did I spend today?');

    expect(hasCurrentTurnReceiptEvidence([oldEvidence, currentQuestion])).toBe(
      false,
    );
    expect(
      hasCurrentTurnReceiptEvidence([
        oldEvidence,
        currentQuestion,
        new ToolMessage({
          content: '{"status":"success"}',
          tool_call_id: 'current-call',
          name: 'get_purchase_summary',
        }),
      ]),
    ).toBe(true);
  });
});
